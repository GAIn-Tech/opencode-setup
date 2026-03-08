import { describe, it, expect } from 'bun:test';

/**
 * Integration tests for critical plugin contracts.
 *
 * Validates that core plugins (healthd, lifecycle, preload-skills) expose the
 * public API surface their consumers depend on. These are contract tests — they
 * verify shapes and basic behaviors, NOT deep logic (unit tests cover that).
 */

// ─── opencode-plugin-healthd ───────────────────────────────────────────────

describe('opencode-plugin-healthd contract', () => {
  let Healthd;

  it('exports Healthd constructor', () => {
    const mod = require('../packages/opencode-plugin-healthd/src/index.js');
    Healthd = mod.Healthd;
    expect(typeof Healthd).toBe('function');
  });

  it('instantiates without arguments', () => {
    const mod = require('../packages/opencode-plugin-healthd/src/index.js');
    const hd = new mod.Healthd();
    expect(hd).toBeDefined();
  });

  it('exposes runCheck method', () => {
    const mod = require('../packages/opencode-plugin-healthd/src/index.js');
    const hd = new mod.Healthd();
    expect(typeof hd.runCheck).toBe('function');
  });

  it('exposes event emitter interface (on/emit)', () => {
    const mod = require('../packages/opencode-plugin-healthd/src/index.js');
    const hd = new mod.Healthd();
    // EventEmitter-like: must have on() and emit()
    expect(typeof hd.on).toBe('function');
    expect(typeof hd.emit).toBe('function');
  });
});

// ─── opencode-plugin-lifecycle ─────────────────────────────────────────────

describe('opencode-plugin-lifecycle contract', () => {
  it('exports PluginLifecycleSupervisor constructor', () => {
    const mod = require('../packages/opencode-plugin-lifecycle/src/index.js');
    expect(typeof mod.PluginLifecycleSupervisor).toBe('function');
  });

  it('instantiates with custom statePath (no disk I/O)', () => {
    const path = require('path');
    const os = require('os');
    const mod = require('../packages/opencode-plugin-lifecycle/src/index.js');
    const sup = new mod.PluginLifecycleSupervisor({
      statePath: path.join(os.tmpdir(), `lifecycle-contract-${Date.now()}.json`),
    });
    expect(sup).toBeDefined();
  });

  it('evaluatePlugin returns object with required fields', () => {
    const path = require('path');
    const os = require('os');
    const mod = require('../packages/opencode-plugin-lifecycle/src/index.js');
    const sup = new mod.PluginLifecycleSupervisor({
      statePath: path.join(os.tmpdir(), `lifecycle-contract-${Date.now()}.json`),
    });
    const result = sup.evaluatePlugin({ name: 'test-plugin', configured: true, discovered: true });
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    // Must include at minimum a status/state indicator
    expect('status' in result || 'state' in result || 'quarantined' in result).toBe(true);
  });

  it('rejects empty plugin name', () => {
    const path = require('path');
    const os = require('os');
    const mod = require('../packages/opencode-plugin-lifecycle/src/index.js');
    const sup = new mod.PluginLifecycleSupervisor({
      statePath: path.join(os.tmpdir(), `lifecycle-contract-${Date.now()}.json`),
    });
    expect(() => sup.evaluatePlugin({ name: '' })).toThrow();
  });
});

// ─── opencode-plugin-preload-skills ────────────────────────────────────────

describe('opencode-plugin-preload-skills contract', () => {
  it('main module is loadable', () => {
    const mod = require('../packages/opencode-plugin-preload-skills/src/index.js');
    expect(mod).toBeDefined();
  });

  it('tier-resolver is loadable and exports a function or class', () => {
    const mod = require('../packages/opencode-plugin-preload-skills/src/tier-resolver.js');
    // Should export at least one callable
    const exports = Object.values(mod).filter(v => typeof v === 'function');
    expect(exports.length).toBeGreaterThanOrEqual(1);
  });

  it('meta-context-injector is loadable', () => {
    const mod = require('../packages/opencode-plugin-preload-skills/src/meta-context-injector.js');
    expect(mod).toBeDefined();
  });
});

// ─── Cross-plugin contract: lifecycle + healthd ────────────────────────────

describe('cross-plugin contract: lifecycle ↔ healthd', () => {
  it('healthd check result can drive lifecycle evaluation', () => {
    const path = require('path');
    const os = require('os');
    const lifecycleMod = require('../packages/opencode-plugin-lifecycle/src/index.js');
    const sup = new lifecycleMod.PluginLifecycleSupervisor({
      statePath: path.join(os.tmpdir(), `cross-contract-${Date.now()}.json`),
    });

    // Simulate a healthy plugin check feeding lifecycle
    const result = sup.evaluatePlugin({
      name: 'opencode-plugin-healthd',
      configured: true,
      discovered: true,
      heartbeat_ok: true,
      dependency_ok: true,
    });

    expect(result).toBeDefined();
    // Healthy plugin should NOT be quarantined
    if ('quarantined' in result) {
      expect(result.quarantined).toBe(false);
    }
  });

  it('crash-count exceeding threshold triggers quarantine', () => {
    const path = require('path');
    const os = require('os');
    const lifecycleMod = require('../packages/opencode-plugin-lifecycle/src/index.js');
    const sup = new lifecycleMod.PluginLifecycleSupervisor({
      statePath: path.join(os.tmpdir(), `cross-contract-crash-${Date.now()}.json`),
      quarantineCrashThreshold: 2,
    });

    // First evaluation below threshold — not quarantined
    const first = sup.evaluatePlugin({ name: 'crash-plugin', crash_count: 1, configured: true, discovered: true });
    expect(first.quarantined).toBe(false);

    // Second evaluation at threshold — quarantined
    const result = sup.evaluatePlugin({ name: 'crash-plugin', crash_count: 2, configured: true, discovered: true });
    expect(result.quarantined).toBe(true);
    expect(result.reason_code).toBe('crash-loop');
  });
});
