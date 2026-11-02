import { describe, expect, test } from 'bun:test';

import { CapabilityRegistry } from '../../src/kernel/registry';

describe('CapabilityRegistry', () => {
  test('returns default required and optional capabilities', () => {
    const registry = new CapabilityRegistry();

    expect(registry.getRequiredCapabilities()).toEqual([
      'orchestration',
      'routing',
      'budget',
      'skills'
    ]);
    expect(registry.getOptionalCapabilities()).toEqual(['learning', 'plugins', 'mcp']);
    expect(registry.getAllCapabilities()).toEqual([
      'orchestration',
      'routing',
      'budget',
      'skills',
      'learning',
      'plugins',
      'mcp'
    ]);
  });

  test('supports explicit capability configuration', () => {
    const registry = new CapabilityRegistry({
      required: ['orchestration'],
      optional: ['plugins']
    });

    expect(registry.getRequiredCapabilities()).toEqual(['orchestration']);
    expect(registry.getOptionalCapabilities()).toEqual(['plugins']);
    expect(registry.isRequired('orchestration')).toBe(true);
    expect(registry.isOptional('plugins')).toBe(true);
    expect(registry.isRequired('plugins')).toBe(false);
    expect(registry.isOptional('orchestration')).toBe(false);
  });

  test('rejects duplicate required capabilities', () => {
    expect(
      () =>
        new CapabilityRegistry({
          required: ['orchestration', 'orchestration'],
          optional: []
        })
    ).toThrow('Required capabilities must be unique');
  });

  test('rejects duplicate optional capabilities', () => {
    expect(
      () =>
        new CapabilityRegistry({
          required: ['orchestration'],
          optional: ['plugins', 'plugins']
        })
    ).toThrow('Optional capabilities must be unique');
  });
});
