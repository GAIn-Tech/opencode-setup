'use strict';

const { describe, test, expect, afterEach } = require('bun:test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadCentralConfig, mergeCentralConfig } = require('../src/central-config');

// ── Helpers ──────────────────────────────────────────────────────────────────

function tmpFile(name) {
  return path.join(os.tmpdir(), `opencode-test-${name}-${Date.now()}.json`);
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

function makeCentral(sections, threshold = 0.85) {
  return {
    schema_version: '1.0.0',
    config_version: 1,
    rl: { override_min_confidence: threshold },
    sections,
  };
}

// ── loadCentralConfig ────────────────────────────────────────────────────────

describe('loadCentralConfig', () => {
  let tmpPath;

  afterEach(() => {
    try { if (tmpPath) fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  });

  test('loads valid file successfully', () => {
    tmpPath = tmpFile('valid');
    const validConfig = {
      schema_version: '1.0.0',
      config_version: 1,
      rl: { override_min_confidence: 0.85 },
      sections: {
        routing: {
          timeout_ms: {
            value: 5000,
            soft: { min: 1000, max: 10000 },
            hard: { min: 500, max: 30000 },
            locked: false,
            rl_allowed: true,
          },
        },
      },
    };
    writeJson(tmpPath, validConfig);

    const result = loadCentralConfig(tmpPath);

    expect(result.schema_version).toBe('1.0.0');
    expect(result.config_version).toBe(1);
    expect(result.rl.override_min_confidence).toBe(0.85);
    expect(result.sections.routing.timeout_ms.value).toBe(5000);
  });

  test('throws on missing required fields', () => {
    tmpPath = tmpFile('invalid');

    // Missing schema_version
    writeJson(tmpPath, {
      config_version: 1,
      rl: { override_min_confidence: 0.85 },
      sections: {},
    });
    expect(() => loadCentralConfig(tmpPath)).toThrow(/schema_version/);

    // Missing config_version
    writeJson(tmpPath, {
      schema_version: '1.0.0',
      rl: { override_min_confidence: 0.85 },
      sections: {},
    });
    expect(() => loadCentralConfig(tmpPath)).toThrow(/config_version/);

    // Missing rl.override_min_confidence
    writeJson(tmpPath, {
      schema_version: '1.0.0',
      config_version: 1,
      rl: {},
      sections: {},
    });
    expect(() => loadCentralConfig(tmpPath)).toThrow(/override_min_confidence/);

    // Missing sections
    writeJson(tmpPath, {
      schema_version: '1.0.0',
      config_version: 1,
      rl: { override_min_confidence: 0.85 },
    });
    expect(() => loadCentralConfig(tmpPath)).toThrow(/sections/);
  });
});

// ── mergeCentralConfig ───────────────────────────────────────────────────────

describe('mergeCentralConfig', () => {
  test('hard bounds clamp RL and dashboard values', () => {
    const central = makeCentral({
      routing: {
        timeout_ms: {
          value: 60000,
          soft: { min: 5000, max: 60000 },
          hard: { min: 1000, max: 120000 },
          locked: false,
          rl_allowed: true,
        },
      },
    });

    // RL value 200000 exceeds hard max 120000 → clamped to 120000
    const result = mergeCentralConfig({
      defaults: {},
      central,
      rlState: { 'routing.timeout_ms': { value: 200000, confidence: 0.9 } },
    });

    expect(result.effective.routing.timeout_ms).toBe(120000);

    // Dashboard value itself exceeds hard max → also clamped
    const central2 = makeCentral({
      routing: {
        timeout_ms: {
          value: 200000,
          soft: { min: 5000, max: 60000 },
          hard: { min: 1000, max: 120000 },
          locked: false,
          rl_allowed: true,
        },
      },
    });

    const result2 = mergeCentralConfig({
      defaults: {},
      central: central2,
      rlState: {},
    });

    expect(result2.effective.routing.timeout_ms).toBe(120000);
  });

  test('RL overrides only at confidence threshold', () => {
    const central = makeCentral({
      routing: {
        timeout_ms: {
          value: 60000,
          soft: { min: 5000, max: 60000 },
          hard: { min: 1000, max: 120000 },
          locked: false,
          rl_allowed: true,
        },
      },
    });

    // confidence 0.9 > threshold 0.85 → applies
    const result1 = mergeCentralConfig({
      defaults: {},
      central,
      rlState: { 'routing.timeout_ms': { value: 45000, confidence: 0.9 } },
    });
    expect(result1.effective.routing.timeout_ms).toBe(45000);

    // confidence 0.8 < threshold 0.85 → does NOT apply
    const result2 = mergeCentralConfig({
      defaults: {},
      central,
      rlState: { 'routing.timeout_ms': { value: 45000, confidence: 0.8 } },
    });
    expect(result2.effective.routing.timeout_ms).toBe(60000);
  });

  test('locked values ignore RL proposals', () => {
    const central = makeCentral({
      providers: {
        api_key_env: {
          value: 'GOOGLE_API_KEYS',
          soft: null,
          hard: null,
          locked: true,
          rl_allowed: true,
        },
      },
    });

    const result = mergeCentralConfig({
      defaults: {},
      central,
      rlState: { 'providers.api_key_env': { value: 'HACKED', confidence: 0.99 } },
    });

    expect(result.effective.providers.api_key_env).toBe('GOOGLE_API_KEYS');
    expect(result.metadata.locked_count).toBe(1);
  });

  test('returns correct diff entries', () => {
    const central = makeCentral({
      routing: {
        timeout_ms: {
          value: 60000,
          soft: { min: 5000, max: 60000 },
          hard: { min: 1000, max: 120000 },
          locked: false,
          rl_allowed: true,
        },
        retry_max: {
          value: 3,
          soft: { min: 1, max: 5 },
          hard: { min: 0, max: 10 },
          locked: true,
          rl_allowed: true,
        },
      },
    });

    const rlState = {
      'routing.timeout_ms': { value: 45000, confidence: 0.9 },
      'routing.retry_max': { value: 7, confidence: 0.95 },
    };

    const result = mergeCentralConfig({ defaults: {}, central, rlState });

    // diff should have entry for timeout_ms (RL applied, changed from 60000 to 45000)
    const timeoutDiff = result.diff.find(d => d.path === 'routing.timeout_ms');
    expect(timeoutDiff).toBeDefined();
    expect(timeoutDiff.from).toBe(60000);
    expect(timeoutDiff.to).toBe(45000);
    expect(timeoutDiff.reason).toContain('rl');

    // retry_max is locked → no diff (value unchanged)
    const retryDiff = result.diff.find(d => d.path === 'routing.retry_max');
    expect(retryDiff).toBeUndefined();

    // metadata counts
    expect(result.metadata.rl_applied_count).toBe(1);
    expect(result.metadata.locked_count).toBe(1);
    expect(typeof result.metadata.merged_at).toBe('string');
  });

  test('rl_allowed=false ignores RL even at high confidence', () => {
    const central = makeCentral({
      routing: {
        strategy: {
          value: 'exponential',
          soft: null,
          hard: null,
          locked: false,
          rl_allowed: false,
        },
      },
    });

    const result = mergeCentralConfig({
      defaults: {},
      central,
      rlState: { 'routing.strategy': { value: 'linear', confidence: 0.99 } },
    });

    expect(result.effective.routing.strategy).toBe('exponential');
    expect(result.metadata.rl_applied_count).toBe(0);
  });

  test('effective contains all section values', () => {
    const central = makeCentral({
      routing: {
        timeout_ms: {
          value: 60000,
          soft: { min: 5000, max: 60000 },
          hard: { min: 1000, max: 120000 },
          locked: false,
          rl_allowed: true,
        },
      },
      fallback: {
        enabled: {
          value: true,
          soft: null,
          hard: null,
          locked: false,
          rl_allowed: false,
        },
      },
    });

    const result = mergeCentralConfig({ defaults: {}, central, rlState: {} });

    expect(result.effective.routing.timeout_ms).toBe(60000);
    expect(result.effective.fallback.enabled).toBe(true);
    expect(Array.isArray(result.diff)).toBe(true);
    expect(typeof result.metadata).toBe('object');
  });
});
