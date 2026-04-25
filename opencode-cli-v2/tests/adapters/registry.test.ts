import { describe, expect, test } from 'bun:test';

import { AdapterRegistrationError } from '../../src/adapters/errors';
import { AdapterRegistry } from '../../src/adapters/registry';
import { TestAdapter } from './helpers';

describe('AdapterRegistry', () => {
  test('registers and retrieves adapters', () => {
    const registry = new AdapterRegistry();
    const routing = new TestAdapter('routing');

    registry.register(routing);

    expect(registry.get('routing')).toBe(routing);
    expect(registry.has('routing')).toBe(true);
    expect(registry.size()).toBe(1);
  });

  test('throws on duplicate registration without overwrite', () => {
    const registry = new AdapterRegistry();

    registry.register(new TestAdapter('routing'));

    expect(() => registry.register(new TestAdapter('routing'))).toThrow(AdapterRegistrationError);
  });

  test('supports async discovery providers', async () => {
    const registry = new AdapterRegistry();

    const result = await registry.discover(async () => [
      new TestAdapter('orchestration'),
      new TestAdapter('plugins', {
        required: false
      })
    ]);

    expect(result.discovered).toBe(2);
    expect(result.registered).toBe(2);
    expect(registry.getRequiredAdapters().map((adapter) => adapter.name)).toEqual(['orchestration']);
    expect(registry.getOptionalAdapters().map((adapter) => adapter.name)).toEqual(['plugins']);
  });
});
