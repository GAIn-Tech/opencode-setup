// @ts-nocheck
'use strict';

const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const { StateMachine } = require('../src/lifecycle/state-machine');

describe('StateMachine predictive performance metadata', () => {
  let tmpDir;
  let dbPath;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'state-machine-predictive-'));
    dbPath = path.join(tmpDir, 'lifecycle.db');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  test('stores predictivePerformance metadata when numeric assessment signals exist', async () => {
    const machine = new StateMachine({ dbPath });

    await machine.setState('model-a', 'detected', { timestamp: 1000 });
    await machine.transition('model-a', 'assessed', {
      timestamp: 2000,
      assessmentResults: {
        successRate: 0.92,
        latencyMs: 1200,
      },
    });

    const row = machine.db.get(
      'SELECT metadata_json FROM model_lifecycle_states WHERE model_id = ? LIMIT 1',
      ['model-a']
    );

    const metadata = JSON.parse(row.metadata_json);
    expect(metadata.predictivePerformance).toBeDefined();
    expect(metadata.predictivePerformance.strategy).toBe('predictive_performance_v1');
    expect(metadata.predictivePerformance.weight).toBeGreaterThan(0);

    machine.close();
  });

  test('does not create predictivePerformance metadata when signals are non-numeric', async () => {
    const machine = new StateMachine({ dbPath });

    await machine.setState('model-b', 'detected', { timestamp: 1000 });
    await machine.transition('model-b', 'assessed', {
      timestamp: 2000,
      assessmentResults: {
        note: 'manual review pending',
      },
    });

    const row = machine.db.get(
      'SELECT metadata_json FROM model_lifecycle_states WHERE model_id = ? LIMIT 1',
      ['model-b']
    );

    const metadata = JSON.parse(row.metadata_json);
    expect(metadata.predictivePerformance).toBeUndefined();

    machine.close();
  });
});
