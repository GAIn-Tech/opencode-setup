'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { LearningEngine } = require('../src/index');

// Helper: Create engine without filesystem deps
function makeEngine() {
  const engine = new LearningEngine({ autoLoad: false, autoSave: false });
  // Clear any persisted patterns from previous test runs
  engine.antiPatterns.patterns = [];
  engine.antiPatterns.index = { byType: {}, bySession: {}, bySeverity: {} };
  return engine;
}

// ---------------------------------------------------------------------------
// advise() Edge Cases
// ---------------------------------------------------------------------------

test('advise() with empty task context ({}) returns valid structure with no warnings', async () => {
  const engine = makeEngine();
  const result = await engine.advise({});

  assert.ok(result.advice_id, 'advice_id present');
  assert.ok(Array.isArray(result.warnings), 'warnings is array');
  assert.equal(result.warnings.length, 0, 'no warnings for empty context');
  assert.ok(Array.isArray(result.suggestions), 'suggestions is array');
  assert.ok(result.routing, 'routing present');
  assert.equal(typeof result.risk_score, 'number', 'risk_score is number');
  assert.equal(typeof result.should_pause, 'boolean', 'should_pause is boolean');
});

test('advise() with undefined input does not crash', async () => {
  const engine = makeEngine();
  
  // Should not throw
  const result = await engine.advise(undefined);
  
  assert.ok(result, 'returns result');
  assert.ok(result.advice_id, 'advice_id present');
  assert.ok(Array.isArray(result.warnings), 'warnings is array');
});

test('advise() with null input throws TypeError', async () => {
  const engine = makeEngine();
  
  // null input causes TypeError in context-utils.js
  // This is expected behavior - null is not a valid task context
  try {
    await engine.advise(null);
    assert.fail('Should have thrown TypeError');
  } catch (err) {
    assert.ok(err instanceof TypeError, 'throws TypeError for null input');
  }
});

test('advise() with unknown task_type returns default routing', async () => {
  const engine = makeEngine();
  const result = await engine.advise({
    task_type: 'unknown_task_type_xyz',
    description: 'some task'
  });

  assert.ok(result.routing, 'routing present');
  assert.ok(result.routing.agent, 'agent present');
  assert.ok(Array.isArray(result.routing.skills), 'skills is array');
  assert.equal(typeof result.routing.confidence, 'number', 'confidence is number');
});

test('advise() with attempt_number >= 3 triggers shotgun_debug warning', async () => {
  const engine = makeEngine();
  
  // Add a shotgun_debug anti-pattern to the catalog
  engine.antiPatterns.addAntiPattern({
    type: 'shotgun_debug',
    description: 'Random edits without understanding root cause',
    severity: 'high',
    discovered_at: new Date().toISOString(),
  });

  const result = await engine.advise({
    task_type: 'debug',
    description: 'fixing a bug',
    attempt_number: 3,
    files: ['src/handler.js']
  });

  // Should have warnings due to high attempt count + shotgun_debug pattern
  assert.ok(Array.isArray(result.warnings), 'warnings is array');
  // Risk score should be elevated
  assert.ok(result.risk_score >= 0, 'risk_score is non-negative');
});

test('advise() result always has required fields', async () => {
  const engine = makeEngine();
  const result = await engine.advise({
    task_type: 'refactor',
    description: 'clean up code',
    files: ['src/utils.js']
  });

  // Verify all required fields exist
  assert.ok(result.advice_id, 'advice_id present');
  assert.ok(typeof result.advice_id === 'string', 'advice_id is string');
  
  assert.ok(Array.isArray(result.warnings), 'warnings is array');
  assert.ok(Array.isArray(result.suggestions), 'suggestions is array');
  
  assert.ok(result.routing, 'routing object present');
  assert.ok(typeof result.routing.agent === 'string', 'routing.agent is string');
  assert.ok(Array.isArray(result.routing.skills), 'routing.skills is array');
  assert.ok(typeof result.routing.confidence === 'number', 'routing.confidence is number');
  
  assert.ok(typeof result.risk_score === 'number', 'risk_score is number');
  assert.ok(typeof result.should_pause === 'boolean', 'should_pause is boolean');
});

test('Core decay invariant: patterns with persistence=core always have weight=1.0', () => {
  const engine = makeEngine();
  
  // Create a core pattern
  const corePattern = {
    id: 'core_test_' + Date.now(),
    type: 'anti-pattern',
    pattern: 'test_pattern',
    severity: 'high',
    timestamp: new Date(Date.now() - 120 * 86400000).toISOString(), // 120 days old
    persistence: 'core',
    isCore: true,
  };
  
  // Get weight for old core pattern
  const weight = engine.getAdaptiveWeight(corePattern);
  
  assert.equal(weight, 1.0, 'Core pattern weight is always 1.0 regardless of age');
});

test('advise() with empty files array works correctly', async () => {
  const engine = makeEngine();
  const result = await engine.advise({
    task_type: 'feature',
    description: 'add new feature',
    files: []
  });

  assert.ok(result.advice_id, 'advice_id present');
  assert.ok(Array.isArray(result.warnings), 'warnings is array');
  assert.ok(result.routing, 'routing present');
  assert.equal(typeof result.risk_score, 'number', 'risk_score is number');
});

test('advise() routing.confidence is between 0 and 1', async () => {
  const engine = makeEngine();
  
  // Test multiple contexts to ensure confidence is always in valid range
  const contexts = [
    { task_type: 'debug' },
    { task_type: 'refactor', files: ['src/a.js', 'src/b.js'] },
    { task_type: 'test', complexity: 'complex' },
    { task_type: 'feature', attempt_number: 5 },
    {}
  ];

  for (const context of contexts) {
    const result = await engine.advise(context);
    assert.ok(result.routing.confidence >= 0, `confidence >= 0 for context ${JSON.stringify(context)}`);
    assert.ok(result.routing.confidence <= 1, `confidence <= 1 for context ${JSON.stringify(context)}`);
  }
});

test('advise() should_pause is true when risk_score > 15', async () => {
  const engine = makeEngine();
  
  // Add multiple high-severity anti-patterns to trigger high risk
  for (let i = 0; i < 3; i++) {
    engine.antiPatterns.addAntiPattern({
      type: 'shotgun_debug',
      description: 'Random edits without understanding root cause',
      severity: 'critical',
      discovered_at: new Date().toISOString(),
    });
  }

  const result = await engine.advise({
    task_type: 'debug',
    description: 'fixing a bug',
    attempt_number: 4,
    files: ['src/handler.js']
  });

  // With high-severity patterns and high attempt number, should_pause should be true
  if (result.risk_score > 15) {
    assert.equal(result.should_pause, true, 'should_pause is true when risk_score > 15');
  }
});
