'use strict';

const { describe, test, expect, afterEach } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { HyperParameterRegistry } = require('../src/index');

const tmpDirs = new Set();

function createTmpDir(tag) {
  const random = Math.random().toString(16).slice(2);
  const dir = path.join(os.tmpdir(), `opencode-hp-governance-${tag}-${Date.now()}-${random}`);
  fs.mkdirSync(dir, { recursive: true });
  tmpDirs.add(dir);
  return dir;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listFiles(dir) {
  try {
    return fs.readdirSync(dir).map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

function makeParameter(name, currentValue, hardMin, hardMax, extra = {}) {
  return {
    name,
    current_value: currentValue,
    learning_config: {
      adaptation_strategy: 'ema',
      triggers: {
        outcome_type: 'feedback',
        min_samples: 1,
        confidence_threshold: 0,
      },
      bounds: {
        soft: { min: hardMin, max: hardMax },
        hard: { min: hardMin, max: hardMax },
      },
      exploration_policy: {
        enabled: false,
        epsilon: 0,
        annealing_rate: 1,
      },
    },
    grouping: {
      group_by_task_type: false,
      group_by_complexity: false,
      aggregate_function: 'mean',
    },
    individual_tracking: {
      per_session: false,
      per_task: false,
    },
    ...extra,
  };
}

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
  tmpDirs.clear();
});

describe('GovernanceValidator integration (HyperParameterRegistry.update/rollback)', () => {
  test('magnitude limiting clamps large updates and emits learning-update entry', () => {
    const dir = createTmpDir('magnitude');
    const auditLogPath = path.join(dir, 'audit.jsonl');
    const updatesDir = path.join(dir, 'learning-updates');
    const persistPath = path.join(dir, 'registry.json');

    const registry = new HyperParameterRegistry({
      autoLoad: false,
      persistPath,
      governance: {
        auditLogPath,
        learningUpdatesDir: updatesDir,
        magnitude: {
          // hardRange=200 => maxDelta=20
          maxDeltaFractionOfHardRange: 0.1,
          maxDeltaAbsolute: Infinity,
        },
        rateLimits: { globalPerHour: 999, globalPerDay: 999, perParameterPerHour: 999, perParameterPerDay: 999 },
      },
    });

    registry.create(makeParameter('cooldown_ms', 10, 0, 200));
    const updated = registry.update('cooldown_ms', { current_value: 100 });
    expect(updated.current_value).toBe(30);

    const auditLines = fs.readFileSync(auditLogPath, 'utf8').trim().split('\n');
    expect(auditLines.length).toBe(1);
    const audit = JSON.parse(auditLines[0]);
    expect(audit.parameter).toBe('cooldown_ms');
    expect(audit.decision.clamped).toBe(true);

    const files = listFiles(updatesDir).filter((file) => file.endsWith('.json'));
    expect(files.length).toBe(1);
    const learningUpdate = readJson(files[0]);
    expect(learningUpdate.id).toMatch(/learning-/);
    expect(learningUpdate.validation.tests).toBe('not-run');
  });

  test('rate limiting blocks excess changes but still records an audit trail + learning update', () => {
    const dir = createTmpDir('rate');
    const auditLogPath = path.join(dir, 'audit.jsonl');
    const updatesDir = path.join(dir, 'learning-updates');
    const persistPath = path.join(dir, 'registry.json');

    const registry = new HyperParameterRegistry({
      autoLoad: false,
      persistPath,
      governance: {
        auditLogPath,
        learningUpdatesDir: updatesDir,
        rateLimits: { globalPerHour: 999, globalPerDay: 999, perParameterPerHour: 1, perParameterPerDay: 999 },
        magnitude: { maxDeltaFractionOfHardRange: 1 },
      },
    });

    registry.create(makeParameter('request_timeout_ms', 10, 0, 200));
    registry.update('request_timeout_ms', { current_value: 11 });

    expect(() => registry.update('request_timeout_ms', { current_value: 12 })).toThrow(
      /Governance blocked/
    );

    const auditLines = fs.readFileSync(auditLogPath, 'utf8').trim().split('\n');
    expect(auditLines.length).toBe(2);
    const second = JSON.parse(auditLines[1]);
    expect(second.decision.allowed).toBe(false);
    expect(second.decision.blocked_reason).toBe('rate_limit_per_parameter_per_hour');

    const files = listFiles(updatesDir).filter((file) => file.endsWith('.json'));
    expect(files.length).toBe(2);
  });

  test('correlation guard clamps when dependencies changed recently', () => {
    const dir = createTmpDir('corr');
    const auditLogPath = path.join(dir, 'audit.jsonl');
    const updatesDir = path.join(dir, 'learning-updates');
    const persistPath = path.join(dir, 'registry.json');

    const registry = new HyperParameterRegistry({
      autoLoad: false,
      persistPath,
      governance: {
        auditLogPath,
        learningUpdatesDir: updatesDir,
        magnitude: { maxDeltaFractionOfHardRange: 0.2 },
        correlation: { windowMs: 60 * 60 * 1000, dependencyMagnitudeMultiplier: 0.5 },
        rateLimits: { globalPerHour: 999, globalPerDay: 999, perParameterPerHour: 999, perParameterPerDay: 999 },
      },
    });

    registry.create(makeParameter('param_b', 0, 0, 200));
    registry.create(
      makeParameter('param_a', 0, 0, 200, {
        governance: {
          dependencies: ['param_b'],
        },
      })
    );

    registry.update('param_b', { current_value: 1 });
    const updatedA = registry.update('param_a', { current_value: 30 });

    // hardRange=200, maxDeltaBase=40, coupled maxDelta=20 => clamp to 20
    expect(updatedA.current_value).toBe(20);
  });

  test('rollback restores previous value and is audited', () => {
    const dir = createTmpDir('rollback');
    const auditLogPath = path.join(dir, 'audit.jsonl');
    const updatesDir = path.join(dir, 'learning-updates');
    const persistPath = path.join(dir, 'registry.json');

    const registry = new HyperParameterRegistry({
      autoLoad: false,
      persistPath,
      governance: {
        auditLogPath,
        learningUpdatesDir: updatesDir,
        magnitude: { maxDeltaFractionOfHardRange: 1 },
        rateLimits: { globalPerHour: 999, globalPerDay: 999, perParameterPerHour: 999, perParameterPerDay: 999 },
      },
    });

    registry.create(makeParameter('threshold', 10, 0, 200));
    registry.update('threshold', { current_value: 20 });
    const rolled = registry.rollback('threshold', 1);
    expect(rolled.current_value).toBe(10);

    const auditLines = fs.readFileSync(auditLogPath, 'utf8').trim().split('\n');
    expect(auditLines.length).toBe(2);
    const last = JSON.parse(auditLines[1]);
    expect(last.type).toBe('rollback');
    expect(last.previous.current_value).toBe(20);
    expect(last.next.current_value).toBe(10);
  });
});
