'use strict';

const { describe, test, expect, afterEach } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  HyperParameterRegistry,
  PARAMETER_NAME_RE,
} = require('../src/index');

const tmpFiles = new Set();

function createTmpPath(tag) {
  const random = Math.random().toString(16).slice(2);
  const filePath = path.join(
    os.tmpdir(),
    `opencode-hyper-param-registry-${tag}-${Date.now()}-${random}.json`
  );

  tmpFiles.add(filePath);
  return filePath;
}

function makeParameter(name = 'request_timeout_ms', currentValue = 60000) {
  return {
    name,
    current_value: currentValue,
    learning_config: {
      adaptation_strategy: 'ema',
      triggers: {
        outcome_type: 'success_rate',
        min_samples: 10,
        confidence_threshold: 0.85,
      },
      bounds: {
        soft: {
          min: 0,
          max: 100000,
        },
        hard: {
          min: 0,
          max: 200000,
        },
      },
      exploration_policy: {
        enabled: true,
        epsilon: 0.1,
        annealing_rate: 0.95,
      },
    },
    grouping: {
      group_by_task_type: true,
      group_by_complexity: true,
      aggregate_function: 'mean',
    },
    individual_tracking: {
      per_session: true,
      per_task: false,
    },
  };
}

afterEach(() => {
  for (const filePath of tmpFiles) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore cleanup errors in tests.
    }

    try {
      const tmpPath = `${filePath}.tmp`;
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch {
      // Ignore cleanup errors in tests.
    }
  }

  tmpFiles.clear();
});

describe('HyperParameterRegistry', () => {
  test('exposes the expected parameter-name regex', () => {
    expect(PARAMETER_NAME_RE.test('valid_name_1')).toBe(true);
    expect(PARAMETER_NAME_RE.test('invalid-name')).toBe(false);
    expect(PARAMETER_NAME_RE.test('9starts_with_number')).toBe(false);
  });

  test('supports create/read/update/delete CRUD operations', () => {
    const registry = new HyperParameterRegistry({ autoLoad: false, governance: false });
    const timeout = makeParameter('request_timeout_ms', 50000);

    const created = registry.create(timeout);
    expect(created.name).toBe('request_timeout_ms');
    expect(registry.has('request_timeout_ms')).toBe(true);

    const fetched = registry.get('request_timeout_ms');
    expect(fetched.current_value).toBe(50000);

    const updated = registry.update('request_timeout_ms', {
      current_value: 75000,
      learning_config: {
        exploration_policy: {
          epsilon: 0.05,
        },
      },
    });

    expect(updated.current_value).toBe(75000);
    expect(updated.learning_config.exploration_policy.epsilon).toBe(0.05);

    expect(registry.list().length).toBe(1);
    expect(registry.delete('request_timeout_ms')).toBe(true);
    expect(registry.get('request_timeout_ms')).toBeNull();
  });

  test('rejects unsafe parameter names', () => {
    const registry = new HyperParameterRegistry({ autoLoad: false, governance: false });

    expect(() => registry.create(makeParameter('Invalid-Name', 10))).toThrow(
      /does not match/
    );
    expect(() => registry.create(makeParameter('unsafe name', 10))).toThrow(
      /does not match/
    );
    expect(() => registry.get('INVALID')).toThrow(/does not match/);
  });

  test('rejects missing schema fields (no validation bypass)', () => {
    const registry = new HyperParameterRegistry({ autoLoad: false, governance: false });

    const missingTracking = makeParameter('retry_max_attempts', 3);
    delete missingTracking.individual_tracking;

    expect(() => registry.create(missingTracking)).toThrow(
      /missing required field\(s\): individual_tracking/
    );
  });

  test('rejects values outside hard bounds', () => {
    const registry = new HyperParameterRegistry({ autoLoad: false, governance: false });
    const parameter = makeParameter('cooldown_ms', 45000);
    registry.create(parameter);

    expect(() =>
      registry.update('cooldown_ms', {
        current_value: 999999,
      })
    ).toThrow(/within hard bounds/);
  });

  test('save() persists to JSON and constructor load() restores values', () => {
    const filePath = createTmpPath('persist');

    const writer = new HyperParameterRegistry({
      persistPath: filePath,
      autoLoad: false,
      governance: false,
    });

    writer.create(makeParameter('request_timeout_ms', 60000));
    writer.create(makeParameter('retry_max_attempts', 3));
    writer.save();

    const reader = new HyperParameterRegistry({
      persistPath: filePath,
      autoLoad: true,
      governance: false,
    });

    expect(reader.has('request_timeout_ms')).toBe(true);
    expect(reader.has('retry_max_attempts')).toBe(true);
    expect(reader.get('retry_max_attempts').current_value).toBe(3);
    expect(reader.list().length).toBe(2);
  });

  test('fail-open: corrupt persisted file falls back to defaults', () => {
    const filePath = createTmpPath('corrupt');
    fs.writeFileSync(filePath, '{ broken-json', 'utf8');

    const defaults = [makeParameter('default_timeout_ms', 30000)];

    const registry = new HyperParameterRegistry({
      persistPath: filePath,
      defaults,
      autoLoad: true,
      governance: false,
    });

    expect(registry.has('default_timeout_ms')).toBe(true);
    expect(registry.get('default_timeout_ms').current_value).toBe(30000);
    expect(registry.list().length).toBe(1);
  });

  test('fail-open: schema-invalid persisted payload falls back to defaults', () => {
    const filePath = createTmpPath('invalid-schema');
    const invalidPayload = {
      parameters: [
        {
          name: 'bad_param',
          current_value: 10,
          // Missing required learning_config/grouping/individual_tracking
        },
      ],
    };

    fs.writeFileSync(filePath, JSON.stringify(invalidPayload, null, 2), 'utf8');

    const defaults = [makeParameter('safe_default', 42)];

    const registry = new HyperParameterRegistry({
      persistPath: filePath,
      defaults,
      autoLoad: true,
      governance: false,
    });

    expect(registry.has('safe_default')).toBe(true);
    expect(registry.get('safe_default').current_value).toBe(42);
    expect(registry.list().length).toBe(1);
  });

  test('load() returns false and preserves state when file is missing', () => {
    const filePath = createTmpPath('missing');
    const registry = new HyperParameterRegistry({
      autoLoad: false,
      defaults: [makeParameter('fallback_param', 17)],
      governance: false,
    });

    const loaded = registry.load(filePath);

    expect(loaded).toBe(false);
    expect(registry.has('fallback_param')).toBe(true);
  });
});
