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

  it('exports PreloadSkillsPlugin constructor', () => {
    const mod = require('../packages/opencode-plugin-preload-skills/src/index.js');
    expect(typeof mod.PreloadSkillsPlugin).toBe('function');
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

  it('selectTools returns callable MCP tool IDs rather than abstract MCP names', () => {
    const { PreloadSkillsPlugin } = require('../packages/opencode-plugin-preload-skills/src/index.js');
    const plugin = new PreloadSkillsPlugin({ logLevel: 'error' });

    const libraryResult = plugin.selectTools({ prompt: 'What is the correct syntax for using the React useEffect API?' });
    const libraryNames = libraryResult.tools.map(tool => tool.name);
    expect(libraryNames).toContain('context7_query_docs');
    expect(libraryNames).not.toContain('context7');

    const compressionResult = plugin.selectTools({ prompt: 'Compress context because we are near the token limit' });
    const compressionNames = compressionResult.tools.map(tool => tool.name);
    expect(compressionNames).toContain('distill_run_tool');
    expect(compressionNames).not.toContain('distill');
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

// ─── Cross-package contract: integration-layer ↔ preload-skills ────────────

describe('cross-package contract: integration-layer ↔ preload-skills', () => {
  it('IntegrationLayer can accept an injected preloadSkills instance', () => {
    const { IntegrationLayer } = require('../packages/opencode-integration-layer/src/index.js');
    const { PreloadSkillsPlugin } = require('../packages/opencode-plugin-preload-skills/src/index.js');

    const preload = new PreloadSkillsPlugin({ logLevel: 'error' });
    const layer = new IntegrationLayer({ preloadSkills: preload });

    expect(layer.preloadSkills).toBe(preload);
  });

  it('selectToolsForTask returns the preload-skills selection shape when injected', () => {
    const { IntegrationLayer } = require('../packages/opencode-integration-layer/src/index.js');
    const { PreloadSkillsPlugin } = require('../packages/opencode-plugin-preload-skills/src/index.js');

    const preload = new PreloadSkillsPlugin({ logLevel: 'error' });
    const layer = new IntegrationLayer({ preloadSkills: preload });

    const result = layer.selectToolsForTask({ prompt: 'What is the correct syntax for using the React useEffect API?' });

    expect(result).toBeDefined();
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools.some(tool => tool.name === 'context7_query_docs')).toBe(true);
    expect('tier2Available' in result).toBe(true);
    expect('meta_context' in result).toBe(true);
  });

  it('resolveRuntimeContext turns budget pressure into actionable DCP and distill guidance', () => {
    const { IntegrationLayer } = require('../packages/opencode-integration-layer/src/index.js');
    const { PreloadSkillsPlugin } = require('../packages/opencode-plugin-preload-skills/src/index.js');

    const preload = new PreloadSkillsPlugin({ logLevel: 'error' });
    const layer = new IntegrationLayer({ preloadSkills: preload, sessionId: 'ses_ctx' });
    layer.contextBridge = {
      evaluateAndCompress: () => ({
        action: 'compress_urgent',
        reason: 'Budget at 82% — CRITICAL: compress immediately or wrap up',
        pct: 0.82,
      }),
    };

    const result = layer.resolveRuntimeContext({
      prompt: 'Remember this and compress context before the next long step',
      sessionId: 'ses_ctx',
      model: 'anthropic/claude-sonnet-4-5',
    });

    expect(result.budget.action).toBe('compress_urgent');
    expect(result.compression.active).toBe(true);
    expect(result.compression.recommendedSkills).toContain('dcp');
    expect(result.toolNames).toContain('distill_run_tool');
    expect(result.toolNames).toContain('supermemory_search');
  });

  it('selectToolsForTask returns null when preloadSkills is unavailable', () => {
    const { IntegrationLayer } = require('../packages/opencode-integration-layer/src/index.js');
    const layer = new IntegrationLayer({ preloadSkills: null });

    expect(layer.selectToolsForTask({ prompt: 'hello' })).toBeNull();
  });
});
