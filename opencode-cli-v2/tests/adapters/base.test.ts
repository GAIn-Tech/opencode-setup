import { describe, expect, test } from 'bun:test';

import { AdapterInitializationError, AdapterNotInitializedError } from '../../src/adapters/errors';
import { TestAdapter, expectRejectedWith } from './helpers';

describe('PackageAdapter (base)', () => {
  test('throws when port is requested before initialization', () => {
    const adapter = new TestAdapter('budget');

    expect(() => adapter.getPort()).toThrow(AdapterNotInitializedError);
  });

  test('transitions to ready after load and initialize', async () => {
    const adapter = new TestAdapter('routing');

    await adapter.runLoad();
    expect(adapter.getStatus()).toBe('loaded');

    await adapter.runInitialize();
    expect(adapter.getStatus()).toBe('ready');
    expect(adapter.getPort().adapterName).toBe('routing');
  });

  test('captures initialization failures', async () => {
    const adapter = new TestAdapter('skills', {
      initialize: () => {
        throw new Error('boom');
      }
    });

    await adapter.runLoad();
    await expectRejectedWith(adapter.runInitialize(), AdapterInitializationError);
    expect(adapter.getStatus()).toBe('failed');
  });

  test('maps health statuses to lifecycle states', async () => {
    const degraded = new TestAdapter('learning', {
      required: false,
      healthCheck: () => 'degraded'
    });

    await degraded.runLoad();
    await degraded.runInitialize();
    await degraded.runHealthCheck();
    expect(degraded.getStatus()).toBe('degraded');

    const unhealthy = new TestAdapter('plugins', {
      required: false,
      healthCheck: () => 'unhealthy'
    });

    await unhealthy.runLoad();
    await unhealthy.runInitialize();
    await unhealthy.runHealthCheck();
    expect(unhealthy.getStatus()).toBe('unhealthy');
  });
});
