'use strict';

const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
let Database = null;
try {
  Database = require('better-sqlite3');
} catch (_) {
  ({ Database } = require('bun:sqlite'));
}
const { ExplorationRLAdapter } = require('../src/exploration-adapter');

describe('ExplorationRLAdapter', () => {
  let db;
  let comprehensionMemory;
  let outcomes;
  let skillRLManager;
  let adapter;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE model_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        intent_category TEXT NOT NULL,
        model_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        is_exploration INTEGER DEFAULT 0,
        accuracy REAL,
        latency_ms REAL,
        cost_usd REAL,
        success INTEGER,
        tool_usage_count INTEGER,
        context_tokens INTEGER,
        output_tokens INTEGER,
        reasoning_efficiency REAL,
        error_type TEXT
      );
    `);

    const insert = db.prepare(`
      INSERT INTO model_performance (
        task_id, intent_category, model_id, provider, timestamp, is_exploration,
        accuracy, latency_ms, cost_usd, success, tool_usage_count,
        context_tokens, output_tokens, reasoning_efficiency, error_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const rows = [
      ['t1', 'debug', 'model-a', 'anthropic', 1, 1, 0.92, 420, 0.08, 1, 2, 1200, 300, 0.84, null],
      ['t2', 'debug', 'model-a', 'anthropic', 2, 1, 0.88, 460, 0.09, 1, 2, 1300, 320, 0.8, null],
      ['t3', 'debug', 'model-b', 'openai', 3, 1, 0.65, 300, 0.03, 0, 1, 900, 220, 0.6, 'timeout'],
      ['t4', 'feature', 'model-c', 'openai', 4, 1, 0.95, 550, 0.14, 1, 3, 1600, 450, 0.9, null],
    ];

    for (const row of rows) {
      insert.run(...row);
    }

    comprehensionMemory = { db };
    outcomes = [];
    skillRLManager = {
      learnFromOutcome(payload) {
        outcomes.push(payload);
      },
    };

    adapter = new ExplorationRLAdapter({ comprehensionMemory, skillRLManager });
  });

  afterEach(() => {
    db.close();
  });

  test('getAllMetricsForTask returns aggregated model metrics', () => {
    const metrics = adapter.getAllMetricsForTask('debug');
    expect(metrics).toHaveLength(2);

    const modelA = metrics.find((row) => row.model_id === 'model-a');
    expect(modelA.total_samples).toBe(2);
    expect(Number(modelA.avg_quality.toFixed(2))).toBe(0.9);
    expect(Number(modelA.success_rate.toFixed(2))).toBe(1);
    expect(Number(modelA.avg_reasoning_efficiency.toFixed(2))).toBe(0.82);
  });

  test('updateFromExploration records outcomes and returns processed count', () => {
    const result = adapter.updateFromExploration('debug');

    expect(result).toEqual({ modelsProcessed: 2, taskCategory: 'debug' });
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0].context.source).toBe('exploration-adapter');
    expect(outcomes[0].context.task_category).toBe('debug');
    expect(outcomes[0].context.feature_vector).toHaveLength(5);
  });

  test('getBestModelRecommendation returns highest composite score model', () => {
    const recommendation = adapter.getBestModelRecommendation('debug');
    expect(recommendation).toBe('model-a');
  });

  test('getBestModelRecommendation returns null when no task data exists', () => {
    expect(adapter.getBestModelRecommendation('nonexistent-task')).toBeNull();
  });

  test('updateFromExploration passes skill_used as string (not skills array) to learnFromOutcome', () => {
    adapter.updateFromExploration('debug');

    expect(outcomes).toHaveLength(2);
    
    // Verify first outcome has skill_used (string), not skills (array)
    const firstOutcome = outcomes[0];
    expect(firstOutcome.skill_used).toBeDefined();
    expect(typeof firstOutcome.skill_used).toBe('string');
    expect(firstOutcome.skill_used).toMatch(/^model:/);
    expect(firstOutcome.skills).toBeUndefined();

    // Verify second outcome also has correct field
    const secondOutcome = outcomes[1];
    expect(secondOutcome.skill_used).toBeDefined();
    expect(typeof secondOutcome.skill_used).toBe('string');
    expect(secondOutcome.skills).toBeUndefined();
  });
});
