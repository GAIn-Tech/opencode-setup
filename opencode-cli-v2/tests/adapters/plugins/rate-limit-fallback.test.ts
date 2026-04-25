import { describe, expect, test } from 'bun:test';

import { PackageAdapter } from '../../../src/adapters/base';
import { RateLimitFallbackPluginAdapter } from '../../../src/adapters/plugins/rate-limit-fallback';

const HOOK_ON_RATE_LIMIT = 'fallback.on-rate-limit';
const HOOK_GET_NEXT_MODEL = 'fallback.get-next-model';
const HOOK_CHECK_CIRCUIT = 'fallback.check-circuit';
const HOOK_RESET_CIRCUIT = 'fallback.reset-circuit';

describe('RateLimitFallbackPluginAdapter', () => {
  test('extends package adapter and supports lifecycle', async () => {
    const adapter = createAdapter();
    expect(adapter).toBeInstanceOf(PackageAdapter);

    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();
    const plugins = await port.listPlugins();
    expect(plugins[0]?.manifest.id).toBe('rate-limit-fallback');

    const health = await adapter.runHealthCheck();
    expect(health.status).toBe('healthy');

    await adapter.runShutdown();
    expect(adapter.getStatus()).toBe('shutdown');
  });

  test('detects rate limits from status code and switches to fallback model', async () => {
    const adapter = createAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();
    const [result] = await port.runHook({
      name: HOOK_ON_RATE_LIMIT,
      payload: {
        sessionId: 's-1',
        model: 'gpt-primary',
        statusCode: 429
      }
    });

    expect(result?.handled).toBe(true);
    expect(result?.output).toMatchObject({
      model: 'gpt-primary',
      isRateLimit: true,
      switched: true,
      nextModel: 'gpt-fallback-1'
    });
  });

  test('walks fallback chain and skips open-circuit models', async () => {
    const adapter = createAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();

    const [firstNext] = await port.runHook({
      name: HOOK_GET_NEXT_MODEL,
      payload: { model: 'gpt-primary' }
    });
    expect(firstNext?.output).toMatchObject({ nextModel: 'gpt-fallback-1' });

    await port.runHook({
      name: HOOK_ON_RATE_LIMIT,
      payload: { model: 'gpt-fallback-1', statusCode: 503 }
    });

    const [secondNext] = await port.runHook({
      name: HOOK_GET_NEXT_MODEL,
      payload: { model: 'gpt-primary' }
    });
    expect(secondNext?.output).toMatchObject({ nextModel: 'gpt-fallback-2' });
  });

  test('opens circuit after repeated failures and supports manual reset', async () => {
    let now = 1000;
    const adapter = createAdapter({ now: () => now });
    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();

    await port.runHook({
      name: HOOK_ON_RATE_LIMIT,
      payload: { model: 'gpt-fallback-1', statusCode: 429 }
    });
    await port.runHook({
      name: HOOK_ON_RATE_LIMIT,
      payload: { model: 'gpt-fallback-1', statusCode: 429 }
    });

    const [checkOpen] = await port.runHook({
      name: HOOK_CHECK_CIRCUIT,
      payload: { model: 'gpt-fallback-1' }
    });
    expect(checkOpen?.output).toMatchObject({
      model: 'gpt-fallback-1',
      state: 'open',
      open: true
    });

    now += 30_000;
    const [checkStillOpen] = await port.runHook({
      name: HOOK_CHECK_CIRCUIT,
      payload: { model: 'gpt-fallback-1' }
    });
    expect(checkStillOpen?.output).toMatchObject({ open: true });

    const [reset] = await port.runHook({
      name: HOOK_RESET_CIRCUIT,
      payload: { model: 'gpt-fallback-1' }
    });
    expect(reset?.output).toMatchObject({
      model: 'gpt-fallback-1',
      reset: true,
      state: 'closed'
    });

    const [checkClosed] = await port.runHook({
      name: HOOK_CHECK_CIRCUIT,
      payload: { model: 'gpt-fallback-1' }
    });
    expect(checkClosed?.output).toMatchObject({ open: false, state: 'closed' });
  });

  test('applies exponential backoff with max cap', async () => {
    let now = 10_000;
    const adapter = createAdapter({ now: () => now });
    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();

    const [first] = await port.runHook({
      name: HOOK_ON_RATE_LIMIT,
      payload: {
        model: 'gpt-primary',
        statusCode: 429
      }
    });
    const [second] = await port.runHook({
      name: HOOK_ON_RATE_LIMIT,
      payload: {
        model: 'gpt-primary',
        statusCode: 429
      }
    });
    const [third] = await port.runHook({
      name: HOOK_ON_RATE_LIMIT,
      payload: {
        model: 'gpt-primary',
        statusCode: 429
      }
    });

    expect(first?.output).toMatchObject({ retryCount: 1, backoffSeconds: 2, rateLimitedUntil: now + 2_000 });
    expect(second?.output).toMatchObject({ retryCount: 2, backoffSeconds: 4, rateLimitedUntil: now + 4_000 });
    expect(third?.output).toMatchObject({ retryCount: 3, backoffSeconds: 8, rateLimitedUntil: now + 8_000 });

    now += 100_000;
    const [capped] = await port.runHook({
      name: HOOK_ON_RATE_LIMIT,
      payload: {
        model: 'gpt-primary',
        statusCode: 429
      }
    });

    expect(capped?.output).toMatchObject({ retryCount: 4, backoffSeconds: 10 });
  });

  test('does not switch models for sessions classified as main', async () => {
    const adapter = createAdapter({ isMainSession: (sessionId) => sessionId === 'main-session' });
    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();
    const [result] = await port.runHook({
      name: HOOK_ON_RATE_LIMIT,
      payload: {
        sessionId: 'main-session',
        model: 'gpt-primary',
        statusCode: 429
      }
    });

    expect(result?.output).toMatchObject({
      sessionId: 'main-session',
      switched: false,
      nextModel: 'gpt-fallback-1'
    });

    const [next] = await port.runHook({
      name: HOOK_GET_NEXT_MODEL,
      payload: {
        sessionId: 'main-session',
        model: 'gpt-primary'
      }
    });

    expect(next?.output).toMatchObject({
      model: 'gpt-primary',
      nextModel: 'gpt-fallback-1'
    });
  });
});

function createAdapter(options?: {
  isMainSession?: (sessionId: string | undefined) => boolean;
  now?: () => number;
}): RateLimitFallbackPluginAdapter {
  return new RateLimitFallbackPluginAdapter({
    isMainSession: options?.isMainSession,
    now: options?.now,
    loadConfig: () =>
      Promise.resolve({
        rateLimitStatusCodes: [429, 503],
        baseBackoffSeconds: 2,
        maxBackoffSeconds: 10,
        circuitBreakerThreshold: 2,
        circuitBreakerCooldownSeconds: 60,
        fallbackChains: {
          'gpt-primary': ['gpt-fallback-1', 'gpt-fallback-2'],
          'gpt-fallback-1': ['gpt-fallback-2'],
          'gpt-fallback-2': []
        }
      })
  });
}

// Keep constants referenced for typo-safe test coverage.
void HOOK_GET_NEXT_MODEL;
