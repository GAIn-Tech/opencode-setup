const { test, expect, describe } = require('bun:test');
const { PluginLifecycleSupervisor } = require('../src/index.js');

describe('prototype pollution prevention', () => {
  test('rejects __proto__ injection attempts', () => {
    const supervisor = new PluginLifecycleSupervisor();

    expect(() => {
      supervisor.setPluginState('__proto__', { malicious: true });
    }).toThrow('Invalid plugin name');
  });

  test('rejects prototype injection', () => {
    const supervisor = new PluginLifecycleSupervisor();

    expect(() => {
      supervisor.setPluginState('prototype', { malicious: true });
    }).toThrow('Invalid plugin name');
  });

  test('rejects constructor injection', () => {
    const supervisor = new PluginLifecycleSupervisor();

    expect(() => {
      supervisor.setPluginState('constructor', { malicious: true });
    }).toThrow('Invalid plugin name');
  });

  test('state uses null prototype', () => {
    const supervisor = new PluginLifecycleSupervisor();
    expect(Object.getPrototypeOf(supervisor.state)).toBeNull();
  });

  test('accepts valid plugin names', () => {
    const supervisor = new PluginLifecycleSupervisor();

    expect(() => {
      supervisor.setPluginState('valid-plugin_123', { status: 'running' });
    }).not.toThrow();

    expect(supervisor.state['valid-plugin_123']).toEqual({ status: 'running' });
  });

  test('rejects empty plugin name', () => {
    const supervisor = new PluginLifecycleSupervisor();

    expect(() => {
      supervisor.setPluginState('', { status: 'running' });
    }).toThrow('Invalid plugin name format');
  });

  test('rejects non-string plugin name', () => {
    const supervisor = new PluginLifecycleSupervisor();

    expect(() => {
      supervisor.setPluginState(123, { status: 'running' });
    }).toThrow('Invalid plugin name format');
  });

  test('rejects plugin names with special characters', () => {
    const supervisor = new PluginLifecycleSupervisor();

    expect(() => {
      supervisor.setPluginState('plugin/../escape', { status: 'running' });
    }).toThrow('Plugin name contains invalid characters');
  });

  test('rejects plugin names exceeding 100 chars', () => {
    const supervisor = new PluginLifecycleSupervisor();
    const longName = 'a'.repeat(101);

    expect(() => {
      supervisor.setPluginState(longName, { status: 'running' });
    }).toThrow('Invalid plugin name format');
  });

  test('evaluatePlugin rejects __proto__ via name field', () => {
    const supervisor = new PluginLifecycleSupervisor();

    expect(() => {
      supervisor.evaluatePlugin({ name: '__proto__', configured: true, discovered: true });
    }).toThrow('Invalid plugin name');
  });

  test('__proto__ injection does not pollute Object prototype', () => {
    const supervisor = new PluginLifecycleSupervisor();

    expect(() => {
      supervisor.setPluginState('__proto__', { polluted: true });
    }).toThrow();

    // Verify Object prototype was NOT polluted
    const clean = {};
    expect(clean.polluted).toBeUndefined();
  });
});
