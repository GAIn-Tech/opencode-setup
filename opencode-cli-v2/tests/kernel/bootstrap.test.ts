import { describe, expect, test } from 'bun:test';

import {
  CapabilityInitializationError,
  CapabilityLoadError,
  HealthCheckError,
  MissingRequiredCapabilitiesError
} from '../../src/kernel/errors';
import { KernelBootstrap } from '../../src/kernel/bootstrap';
import { KernelHealth } from '../../src/kernel/health';
import { CapabilityRegistry } from '../../src/kernel/registry';
import { KernelState } from '../../src/kernel/state';
import { createCapability, createProvider } from './helpers';

async function expectRejectedWith(
  candidate: Promise<unknown>,
  expectedType: abstract new (...args: never[]) => object
): Promise<void> {
  try {
    await candidate;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(expectedType);

    return;
  }

  throw new Error('Expected promise to reject');
}

describe('KernelBootstrap', () => {
  test('fails fast in strict mode when required capability provider is missing', async () => {
    const registry = new CapabilityRegistry({ required: ['orchestration', 'routing'], optional: [] });
    const bootstrap = new KernelBootstrap({
      registry,
      providers: {
        orchestration: createProvider(createCapability('orchestration'))
      },
      state: new KernelState(),
      health: new KernelHealth(registry)
    });

    await expectRejectedWith(bootstrap.bootstrap(), MissingRequiredCapabilitiesError);
  });

  test('allows partial startup in degraded mode', async () => {
    const registry = new CapabilityRegistry({ required: ['orchestration', 'routing'], optional: [] });
    const bootstrap = new KernelBootstrap({
      registry,
      providers: {
        orchestration: createProvider(createCapability('orchestration'))
      },
      state: new KernelState(),
      health: new KernelHealth(registry)
    });

    const result = await bootstrap.bootstrap({ degradedMode: true });

    expect(result.mode).toBe('degraded');
    expect(result.state.phase).toBe('degraded');
    expect(result.state.activeCapabilities).toEqual(['orchestration']);
    expect(result.state.missingRequiredCapabilities).toEqual(['routing']);
  });

  test('initializes all available capabilities and runs health checks', async () => {
    const registry = new CapabilityRegistry({ required: ['orchestration', 'routing'], optional: [] });
    let initializeCount = 0;

    const bootstrap = new KernelBootstrap({
      registry,
      providers: {
        orchestration: createProvider(
          createCapability('orchestration', {
            initialize: () => {
              initializeCount += 1;
            },
            healthCheck: () => 'healthy'
          })
        ),
        routing: createProvider(
          createCapability('routing', {
            initialize: () => {
              initializeCount += 1;
            },
            healthCheck: () => 'healthy'
          })
        )
      },
      state: new KernelState(),
      health: new KernelHealth(registry)
    });

    const result = await bootstrap.bootstrap();

    expect(initializeCount).toBe(2);
    expect(result.state.phase).toBe('running');
    expect(result.health.status).toBe('healthy');
  });

  test('does not fail strict mode when optional capability initialization fails', async () => {
    const registry = new CapabilityRegistry({
      required: ['orchestration'],
      optional: ['plugins']
    });

    const bootstrap = new KernelBootstrap({
      registry,
      providers: {
        orchestration: createProvider(
          createCapability('orchestration', {
            healthCheck: () => 'healthy'
          })
        ),
        plugins: createProvider(
          createCapability('plugins', {
            initialize: () => {
              throw new Error('optional init failed');
            }
          })
        )
      },
      state: new KernelState(),
      health: new KernelHealth(registry)
    });

    const result = await bootstrap.bootstrap();

    expect(result.state.phase).toBe('degraded');
    expect(result.state.missingOptionalCapabilities).toEqual(['plugins']);
  });

  test('fails strict mode when required capability initialization fails', async () => {
    const registry = new CapabilityRegistry({ required: ['orchestration'], optional: [] });

    const bootstrap = new KernelBootstrap({
      registry,
      providers: {
        orchestration: createProvider(
          createCapability('orchestration', {
            initialize: () => {
              throw new Error('required init failed');
            }
          })
        )
      },
      state: new KernelState(),
      health: new KernelHealth(registry)
    });

    await expectRejectedWith(bootstrap.bootstrap(), CapabilityInitializationError);
  });

  test('fails strict mode when required capability provider throws', async () => {
    const registry = new CapabilityRegistry({ required: ['orchestration'], optional: [] });

    const bootstrap = new KernelBootstrap({
      registry,
      providers: {
        orchestration: () => {
          throw new Error('provider failed');
        }
      },
      state: new KernelState(),
      health: new KernelHealth(registry)
    });

    await expectRejectedWith(bootstrap.bootstrap(), CapabilityLoadError);
  });

  test('fails strict mode when provider returns mismatched capability', async () => {
    const registry = new CapabilityRegistry({ required: ['orchestration'], optional: [] });

    const bootstrap = new KernelBootstrap({
      registry,
      providers: {
        orchestration: createProvider(createCapability('routing'))
      },
      state: new KernelState(),
      health: new KernelHealth(registry)
    });

    await expectRejectedWith(bootstrap.bootstrap(), CapabilityLoadError);
  });

  test('fails strict mode on required health-check failure', async () => {
    const registry = new CapabilityRegistry({ required: ['orchestration'], optional: [] });

    const bootstrap = new KernelBootstrap({
      registry,
      providers: {
        orchestration: createProvider(
          createCapability('orchestration', {
            healthCheck: () => ({
              status: 'unhealthy',
              details: 'unavailable'
            })
          })
        )
      },
      state: new KernelState(),
      health: new KernelHealth(registry)
    });

    await expectRejectedWith(bootstrap.bootstrap(), HealthCheckError);
  });
});
