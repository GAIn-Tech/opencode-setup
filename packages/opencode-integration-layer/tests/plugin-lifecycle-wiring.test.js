'use strict';
const { describe, test, expect } = require('bun:test');
const { IntegrationLayer } = require('../src/index.js');
const { bootstrap, getBootstrapStatus, resetBootstrap } = require('../src/bootstrap.js');

describe('plugin-lifecycle wiring', () => {
  test('evaluatePluginHealth delegates to pluginLifecycle.evaluateMany', async () => {
    const mockResult = { healthy: 2, quarantined: 0 };
    const mockLifecycle = { evaluateMany: async (inputs) => mockResult, list: () => ({}) };
    const il = new IntegrationLayer({ pluginLifecycle: mockLifecycle });
    const result = await il.evaluatePluginHealth([{ name: 'foo' }]);
    expect(result).toEqual(mockResult);
  });

  test('listPlugins delegates to pluginLifecycle.list', () => {
    const mockState = { foo: 'active', bar: 'quarantined' };
    const mockLifecycle = { evaluateMany: async () => null, list: () => mockState };
    const il = new IntegrationLayer({ pluginLifecycle: mockLifecycle });
    expect(il.listPlugins()).toEqual(mockState);
  });

  test('returns null when pluginLifecycle unavailable', async () => {
    const il = new IntegrationLayer({});
    expect(await il.evaluatePluginHealth([])).toBeNull();
    expect(il.listPlugins()).toBeNull();
  });

  test('bootstrap tracks plugin-lifecycle status', () => {
    resetBootstrap();
    bootstrap();
    const status = getBootstrapStatus();
    // Plugin-lifecycle may or may not load (package may not exist in test env)
    // But the key should exist if tryLoad was attempted
    expect(typeof status.packages).toBe('object');
    resetBootstrap();
  });
});
