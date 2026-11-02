import { describe, expect, test } from 'bun:test';

import { PackageAdapter } from '../../../src/adapters/base';
import { TokenMonitorPluginAdapter } from '../../../src/adapters/plugins/token-monitor';

const HOOK_RECORD = 'tokens.record';
const HOOK_GET_USAGE = 'tokens.get-usage';
const HOOK_GET_REPORT = 'tokens.get-report';
const HOOK_CHECK_QUOTA = 'tokens.check-quota';

describe('TokenMonitorPluginAdapter', () => {
  test('extends package adapter and supports lifecycle', async () => {
    const adapter = createAdapter();
    expect(adapter).toBeInstanceOf(PackageAdapter);

    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();
    const plugins = await port.listPlugins();
    expect(plugins[0]?.manifest.id).toBe('token-monitor');

    const preUsageHealth = await adapter.runHealthCheck();
    expect(preUsageHealth.status).toBe('degraded');

    await port.runHook({
      name: HOOK_RECORD,
      payload: {
        sessionId: 'session-life',
        model: 'openai/gpt-5.3-codex',
        inputTokens: 10,
        outputTokens: 15
      }
    });

    const postUsageHealth = await adapter.runHealthCheck();
    expect(postUsageHealth.status).toBe('healthy');

    await adapter.runShutdown();
    expect(adapter.getStatus()).toBe('shutdown');
  });

  test('records token usage and returns aggregated usage', async () => {
    const adapter = createAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();
    const port = adapter.getPort();

    const [recordA] = await port.runHook({
      name: HOOK_RECORD,
      payload: {
        sessionId: 's-1',
        model: 'openai/gpt-5.3-codex',
        inputTokens: 50,
        outputTokens: 25
      }
    });
    expect(recordA?.handled).toBe(true);
    expect(recordA?.output).toMatchObject({
      recorded: true,
      totals: {
        sessionTokens: 75,
        modelTokens: 75,
        sessionModelTokens: 75
      }
    });

    const [recordB] = await port.runHook({
      name: HOOK_RECORD,
      payload: {
        sessionId: 's-1',
        model: 'openai/gpt-5.3-codex',
        tokensConsumed: 60
      }
    });
    expect(recordB?.handled).toBe(true);

    const [usage] = await port.runHook({
      name: HOOK_GET_USAGE,
      payload: {
        sessionId: 's-1',
        model: 'openai/gpt-5.3-codex'
      }
    });

    expect(usage?.handled).toBe(true);
    expect(usage?.output).toMatchObject({
      recordsCount: 2,
      usage: {
        totalCalls: 2,
        totalTokens: 135,
        inputTokens: 50,
        outputTokens: 25,
        averageTokensPerCall: 67.5
      }
    });
  });

  test('builds usage report and flags spikes', async () => {
    const adapter = createAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();
    const port = adapter.getPort();

    await port.runHook({
      name: HOOK_RECORD,
      payload: { sessionId: 's-a', model: 'm-primary', tokensConsumed: 20 }
    });
    await port.runHook({
      name: HOOK_RECORD,
      payload: { sessionId: 's-a', model: 'm-primary', tokensConsumed: 25 }
    });
    await port.runHook({
      name: HOOK_RECORD,
      payload: { sessionId: 's-b', model: 'm-fallback', tokensConsumed: 40 }
    });

    const [spike] = await port.runHook({
      name: HOOK_RECORD,
      payload: { sessionId: 's-a', model: 'm-primary', tokensConsumed: 120 }
    });

    expect(spike?.handled).toBe(true);
    expect(spike?.output).toMatchObject({
      pattern: {
        type: 'anomaly'
      }
    });

    const [report] = await port.runHook({
      name: HOOK_GET_REPORT,
      payload: { topN: 2 }
    });

    expect(report?.handled).toBe(true);
    expect(report?.output).toMatchObject({
      overall: {
        totalCalls: 4,
        totalTokens: 205
      },
      bySession: [
        { sessionId: 's-a', totalTokens: 165 },
        { sessionId: 's-b', totalTokens: 40 }
      ],
      byModel: [
        { model: 'm-primary', totalTokens: 165 },
        { model: 'm-fallback', totalTokens: 40 }
      ]
    });
    expect(Array.isArray((report?.output as { alerts?: unknown[] } | undefined)?.alerts)).toBe(true);
  });

  test('checks quota status with session, model, and custom limits', async () => {
    const adapter = createAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();
    const port = adapter.getPort();

    await port.runHook({
      name: HOOK_RECORD,
      payload: { sessionId: 'quota-session', model: 'm-primary', tokensConsumed: 60 }
    });
    await port.runHook({
      name: HOOK_RECORD,
      payload: { sessionId: 'quota-session', model: 'm-primary', tokensConsumed: 50 }
    });

    const [sessionQuota] = await port.runHook({
      name: HOOK_CHECK_QUOTA,
      payload: { sessionId: 'quota-session' }
    });
    expect(sessionQuota?.output).toMatchObject({
      scope: 'session',
      used: 110,
      limit: 100,
      exceeded: true,
      status: 'exceeded'
    });

    const [modelQuota] = await port.runHook({
      name: HOOK_CHECK_QUOTA,
      payload: { sessionId: 'quota-session', model: 'm-primary' }
    });
    expect(modelQuota?.output).toMatchObject({
      scope: 'model',
      used: 110,
      limit: 90,
      exceeded: true,
      status: 'exceeded'
    });

    const [customQuota] = await port.runHook({
      name: HOOK_CHECK_QUOTA,
      payload: { sessionId: 'quota-session', model: 'm-primary', quota: 200 }
    });
    expect(customQuota?.output).toMatchObject({
      scope: 'custom',
      used: 110,
      limit: 200,
      exceeded: false,
      status: 'ok'
    });
  });

  test('returns errors for unsupported hooks and invalid payloads', async () => {
    const adapter = createAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();
    const port = adapter.getPort();

    const [unsupported] = await port.runHook({
      name: 'tokens.unknown',
      payload: {}
    });
    expect(unsupported?.handled).toBe(false);
    expect(unsupported?.error).toContain('Unsupported hook');

    const [invalid] = await port.runHook({
      name: HOOK_RECORD,
      payload: {
        sessionId: 's-invalid',
        model: 'm-invalid',
        inputTokens: 0,
        outputTokens: 0
      }
    });
    expect(invalid?.handled).toBe(false);
    expect(invalid?.error).toContain('positive token count');
  });
});

function createAdapter(): TokenMonitorPluginAdapter {
  return new TokenMonitorPluginAdapter({
    loadConfig: () =>
      Promise.resolve({
        defaultSessionQuota: 100,
        modelQuotas: {
          'm-primary': 90,
          'm-fallback': 120
        },
        patternDetection: {
          spikeMultiplier: 2,
          minSamples: 3
        }
      })
  });
}

void HOOK_GET_USAGE;
void HOOK_GET_REPORT;
