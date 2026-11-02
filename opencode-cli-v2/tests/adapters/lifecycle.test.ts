import { describe, expect, test } from 'bun:test';

import { RequiredAdapterError } from '../../src/adapters/errors';
import { AdapterLifecycleManager } from '../../src/adapters/lifecycle';
import { AdapterRegistry } from '../../src/adapters/registry';
import { TestAdapter, expectRejectedWith } from './helpers';

describe('AdapterLifecycleManager', () => {
  test('fails fast when required adapter cannot load', async () => {
    const registry = new AdapterRegistry();
    registry.register(
      new TestAdapter('orchestration', {
        load: () => {
          throw new Error('required load failure');
        }
      })
    );

    const manager = new AdapterLifecycleManager(registry);

    await expectRejectedWith(manager.loadAll(), RequiredAdapterError);
  });

  test('gracefully degrades optional adapters on load/init failures', async () => {
    const registry = new AdapterRegistry();

    registry.register(new TestAdapter('routing'));
    registry.register(
      new TestAdapter('plugins', {
        required: false,
        load: () => {
          throw new Error('optional load failure');
        }
      })
    );

    const manager = new AdapterLifecycleManager(registry);

    const loadResults = await manager.loadAll();
    const initResults = await manager.initializeAll();

    expect(loadResults).toHaveLength(2);
    expect(loadResults.find((result) => result.adapter === 'plugins')?.status).toBe('failed');

    expect(initResults).toHaveLength(1);
    expect(initResults[0]?.adapter).toBe('routing');
  });

  test('throws when required adapter health is unhealthy', async () => {
    const registry = new AdapterRegistry();

    registry.register(
      new TestAdapter('orchestration', {
        healthCheck: () => ({
          status: 'unhealthy',
          details: 'required dependency down'
        })
      })
    );

    const manager = new AdapterLifecycleManager(registry);

    await manager.loadAll();
    await manager.initializeAll();

    await expectRejectedWith(manager.healthCheckAll(), RequiredAdapterError);
  });

  test('bootstraps and shuts down adapters in reverse order', async () => {
    const events: string[] = [];
    const registry = new AdapterRegistry();

    registry.register(
      new TestAdapter('orchestration', {
        load: () => {
          events.push('load:orchestration');
        },
        initialize: () => {
          events.push('init:orchestration');
        },
        shutdown: () => {
          events.push('shutdown:orchestration');
        }
      })
    );
    registry.register(
      new TestAdapter('plugins', {
        required: false,
        load: () => {
          events.push('load:plugins');
        },
        initialize: () => {
          events.push('init:plugins');
        },
        shutdown: () => {
          events.push('shutdown:plugins');
        }
      })
    );

    const manager = new AdapterLifecycleManager(registry);

    const summary = await manager.bootstrap();
    expect(summary.health.status).toBe('healthy');

    const shutdownResults = await manager.shutdownAll();
    expect(shutdownResults.map((result) => result.adapter)).toEqual(['plugins', 'orchestration']);
    expect(events).toEqual([
      'load:orchestration',
      'load:plugins',
      'init:orchestration',
      'init:plugins',
      'shutdown:plugins',
      'shutdown:orchestration'
    ]);
  });
});
