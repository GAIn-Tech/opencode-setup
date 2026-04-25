import { describe, expect, test } from 'bun:test';

import {
  CapabilityRegistry,
  Kernel,
  KernelHealth,
  KernelState,
  createKernel
} from '../../src/kernel';
import { createCapability, createProvider } from './helpers';

describe('Kernel composition root', () => {
  test('creates a kernel instance with dependency injection', async () => {
    const registry = new CapabilityRegistry({ required: ['orchestration'], optional: [] });

    const kernel = createKernel({
      providers: {
        orchestration: createProvider(createCapability('orchestration'))
      },
      registry,
      state: new KernelState(),
      health: new KernelHealth(registry)
    });

    const result = await kernel.bootstrap();

    expect(result.mode).toBe('strict');
    expect(result.state.phase).toBe('running');
  });

  test('exposes runtime state and health report', async () => {
    const kernel = new Kernel({
      providers: {
        orchestration: createProvider(createCapability('orchestration', { healthCheck: () => 'healthy' })),
        routing: createProvider(createCapability('routing')),
        budget: createProvider(createCapability('budget')),
        skills: createProvider(createCapability('skills'))
      }
    });

    await kernel.bootstrap();

    const snapshot = kernel.getState();
    const health = await kernel.healthCheck();

    expect(snapshot.phase).toBe('degraded');
    expect(snapshot.missingOptionalCapabilities).toEqual(['learning', 'plugins', 'mcp']);
    expect(health.status).toBe('degraded');
  });

  test('starts idle before bootstrap', () => {
    const kernel = createKernel({ providers: {} });

    expect(kernel.getState()).toEqual({
      phase: 'idle',
      mode: 'strict',
      activeCapabilities: [],
      missingRequiredCapabilities: [],
      missingOptionalCapabilities: [],
      lastError: undefined
    });
  });
});
