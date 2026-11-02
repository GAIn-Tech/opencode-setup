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

// Helper: Create a learning object with specified age in days
function makeLearning(days = 0, persistence = 'adaptive') {
  const timestamp = new Date(Date.now() - days * 86400000).toISOString();
  return {
    id: `test_${Date.now()}`,
    type: 'anti-pattern',
    pattern: 'test_pattern',
    severity: 'high',
    timestamp,
    persistence,
    isCore: persistence === 'core',
  };
}

// ---------------------------------------------------------------------------
// getAdaptiveWeight() — Core Persistence Invariant
// ---------------------------------------------------------------------------

test('getAdaptiveWeight: core persistence always returns 1.0', () => {
  const engine = makeEngine();
  const learning = makeLearning(0, 'core');
  
  const weight = engine.getAdaptiveWeight(learning);
  assert.equal(weight, 1.0, 'Fresh core learning should have weight 1.0');
});

test('getAdaptiveWeight: core with 60-day-old timestamp still returns 1.0', () => {
  const engine = makeEngine();
  const learning = makeLearning(60, 'core');
  
  const weight = engine.getAdaptiveWeight(learning);
  assert.equal(weight, 1.0, 'Core learning should never decay, even at 60 days');
});

test('getAdaptiveWeight: core with 120-day-old timestamp still returns 1.0', () => {
  const engine = makeEngine();
  const learning = makeLearning(120, 'core');
  
  const weight = engine.getAdaptiveWeight(learning);
  assert.equal(weight, 1.0, 'Core learning should never decay, even at 120 days');
});

// ---------------------------------------------------------------------------
// getAdaptiveWeight() — Adaptive Decay Schedule
// ---------------------------------------------------------------------------

test('getAdaptiveWeight: fresh adaptive learning (< 7 days) returns 1.0', () => {
  const engine = makeEngine();
  const learning = makeLearning(3, 'adaptive');
  
  const weight = engine.getAdaptiveWeight(learning);
  assert.equal(weight, 1.0, 'Fresh adaptive learning should have full weight');
});

test('getAdaptiveWeight: 14-day-old adaptive learning decays to mid-range', () => {
  const engine = makeEngine();
  const learning = makeLearning(14, 'adaptive');
  
  const weight = engine.getAdaptiveWeight(learning);
  assert.ok(weight > 0.3 && weight < 1.0, `14-day weight ${weight} should be between 0.3 and 1.0`);
});

test('getAdaptiveWeight: 60-day-old adaptive learning decays to reduced range', () => {
  const engine = makeEngine();
  const learning = makeLearning(60, 'adaptive');
  
  const weight = engine.getAdaptiveWeight(learning);
  assert.ok(weight >= 0.1 && weight <= 0.3, `60-day weight ${weight} should be between 0.1 and 0.3`);
});

test('getAdaptiveWeight: 120-day-old adaptive learning reaches minimum floor', () => {
  const engine = makeEngine();
  const learning = makeLearning(120, 'adaptive');
  
  const weight = engine.getAdaptiveWeight(learning);
  assert.equal(weight, 0.1, '120-day weight should be at minimum floor of 0.1');
});

test('getAdaptiveWeight: decay is monotonic (older = lower weight)', () => {
  const engine = makeEngine();
  
  const w0 = engine.getAdaptiveWeight(makeLearning(0, 'adaptive'));
  const w7 = engine.getAdaptiveWeight(makeLearning(7, 'adaptive'));
  const w30 = engine.getAdaptiveWeight(makeLearning(30, 'adaptive'));
  const w90 = engine.getAdaptiveWeight(makeLearning(90, 'adaptive'));
  
  assert.ok(w0 >= w7, 'Weight at 0 days should be >= 7 days');
  assert.ok(w7 >= w30, 'Weight at 7 days should be >= 30 days');
  assert.ok(w30 >= w90, 'Weight at 30 days should be >= 90 days');
});

// ---------------------------------------------------------------------------
// markAsCore() — Marking Patterns as Core
// ---------------------------------------------------------------------------

test('markAsCore: adds anti-pattern and marks it as core', () => {
  const engine = makeEngine();
  
  // Add an anti-pattern first
  const pattern = engine.antiPatterns.addAntiPattern({
    type: 'failed_debug',
    description: 'Debug attempt did not resolve issue',
    severity: 'high',
  });
  
  const id = pattern.id;
  const result = engine.markAsCore(id);
  
  assert.equal(result, true, 'markAsCore should return true for existing pattern');
  
  // Verify the pattern is now core
  const updated = engine.antiPatterns.patterns.find(p => p.id === id);
  assert.equal(updated.persistence, 'core', 'Pattern should have persistence=core');
  assert.equal(updated.isCore, true, 'Pattern should have isCore=true');
});

test('markAsCore: returns false for nonexistent pattern id', () => {
  const engine = makeEngine();
  
  const result = engine.markAsCore('nonexistent-id-12345');
  
  assert.equal(result, false, 'markAsCore should return false for nonexistent id');
});

test('markAsCore: marked pattern has weight 1.0 regardless of age', () => {
  const engine = makeEngine();
  
  // Add a pattern with old timestamp
  const pattern = engine.antiPatterns.addAntiPattern({
    type: 'repeated_mistake',
    description: 'Same error across sessions',
    severity: 'critical',
    context: { timestamp: new Date(Date.now() - 120 * 86400000).toISOString() },
  });
  
  engine.markAsCore(pattern.id);
  
  // Verify weight is 1.0
  const updated = engine.antiPatterns.patterns.find(p => p.id === pattern.id);
  const weight = engine.getAdaptiveWeight(updated);
  assert.equal(weight, 1.0, 'Core pattern should always have weight 1.0');
});

// ---------------------------------------------------------------------------
// updateCoreLearning() — Updating Core Patterns
// ---------------------------------------------------------------------------

test('updateCoreLearning: updates description while keeping core status', () => {
  const engine = makeEngine();
  
  // Add and mark as core
  const pattern = engine.antiPatterns.addAntiPattern({
    type: 'broken_state',
    description: 'Original description',
    severity: 'high',
  });
  
  engine.markAsCore(pattern.id);
  
  // Update the core learning
  const result = engine.updateCoreLearning(pattern.id, {
    description: 'Updated description with new evidence',
  });
  
  assert.equal(result, true, 'updateCoreLearning should return true');
  
  // Verify update applied and core status preserved
  const updated = engine.antiPatterns.patterns.find(p => p.id === pattern.id);
  assert.equal(updated.description, 'Updated description with new evidence', 'Description should be updated');
  assert.equal(updated.persistence, 'core', 'Persistence should still be core');
  assert.equal(updated.isCore, true, 'isCore should still be true');
});

test('updateCoreLearning: returns false for non-core pattern', () => {
  const engine = makeEngine();
  
  // Add a non-core pattern
  const pattern = engine.antiPatterns.addAntiPattern({
    type: 'inefficient_solution',
    description: 'Excessive tokens used',
    severity: 'medium',
  });
  
  // Try to update as core (should fail)
  const result = engine.updateCoreLearning(pattern.id, {
    description: 'New description',
  });
  
  assert.equal(result, false, 'updateCoreLearning should return false for non-core pattern');
});

test('updateCoreLearning: returns false for nonexistent pattern', () => {
  const engine = makeEngine();
  
  const result = engine.updateCoreLearning('nonexistent-id', {
    description: 'New description',
  });
  
  assert.equal(result, false, 'updateCoreLearning should return false for nonexistent id');
});

test('updateCoreLearning: sets updatedAt timestamp', () => {
  const engine = makeEngine();
  
  const pattern = engine.antiPatterns.addAntiPattern({
    type: 'wrong_tool',
    description: 'Used grep instead of LSP',
    severity: 'medium',
  });
  
  engine.markAsCore(pattern.id);
  
  const beforeUpdate = Date.now();
  engine.updateCoreLearning(pattern.id, { description: 'Updated' });
  const afterUpdate = Date.now();
  
  const updated = engine.antiPatterns.patterns.find(p => p.id === pattern.id);
  assert.ok(updated.updatedAt, 'updatedAt should be set');
  assert.ok(updated.updatedAt >= beforeUpdate && updated.updatedAt <= afterUpdate, 'updatedAt should be recent');
});

// ---------------------------------------------------------------------------
// getCoreLearnings() — Retrieving Core Patterns
// ---------------------------------------------------------------------------

test('getCoreLearnings: returns only core patterns', () => {
  const engine = makeEngine();
  
  // Add mixed patterns
  const p1 = engine.antiPatterns.addAntiPattern({
    type: 'failed_debug',
    description: 'Pattern 1',
    severity: 'high',
  });
  
  const p2 = engine.antiPatterns.addAntiPattern({
    type: 'repeated_mistake',
    description: 'Pattern 2',
    severity: 'critical',
  });
  
  const p3 = engine.antiPatterns.addAntiPattern({
    type: 'inefficient_solution',
    description: 'Pattern 3',
    severity: 'medium',
  });
  
  // Mark only p1 and p2 as core
  engine.markAsCore(p1.id);
  engine.markAsCore(p2.id);
  
  const corePatterns = engine.getCoreLearnings();
  
  assert.equal(corePatterns.length, 2, 'Should have 2 core patterns');
  assert.ok(corePatterns.some(p => p.id === p1.id), 'Should include p1');
  assert.ok(corePatterns.some(p => p.id === p2.id), 'Should include p2');
  assert.ok(!corePatterns.some(p => p.id === p3.id), 'Should not include p3');
});

// ---------------------------------------------------------------------------
// getAdaptiveLearnings() — Retrieving Adaptive Patterns
// ---------------------------------------------------------------------------

test('getAdaptiveLearnings: returns only adaptive patterns', () => {
  const engine = makeEngine();
  
  // Add mixed patterns
  const p1 = engine.antiPatterns.addAntiPattern({
    type: 'failed_debug',
    description: 'Pattern 1',
    severity: 'high',
  });
  
  const p2 = engine.antiPatterns.addAntiPattern({
    type: 'repeated_mistake',
    description: 'Pattern 2',
    severity: 'critical',
  });
  
  // Mark only p1 as core
  engine.markAsCore(p1.id);
  
  const adaptivePatterns = engine.getAdaptiveLearnings();
  
  assert.ok(adaptivePatterns.some(p => p.id === p2.id), 'Should include p2 (adaptive)');
  assert.ok(!adaptivePatterns.some(p => p.id === p1.id), 'Should not include p1 (core)');
});

// ---------------------------------------------------------------------------
// Integration: Core Decay Invariant Across Operations
// ---------------------------------------------------------------------------

test('integration: core pattern weight never changes across operations', () => {
  const engine = makeEngine();
  
  // Create a pattern and manually set its timestamp to 90 days ago
  const pattern = engine.antiPatterns.addAntiPattern({
    type: 'broken_state',
    description: 'Build failing',
    severity: 'critical',
  });
  
  // Manually set the timestamp to 90 days ago
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
  pattern.timestamp = ninetyDaysAgo;
  
  // Before marking as core: weight should be low
  const weightBefore = engine.getAdaptiveWeight(pattern);
  assert.ok(weightBefore < 1.0, 'Adaptive pattern at 90 days should have weight < 1.0');
  
  // Mark as core
  engine.markAsCore(pattern.id);
  
  // After marking as core: weight should be 1.0
  const updated = engine.antiPatterns.patterns.find(p => p.id === pattern.id);
  const weightAfter = engine.getAdaptiveWeight(updated);
  assert.equal(weightAfter, 1.0, 'Core pattern should have weight 1.0');
  
  // Update the core learning
  engine.updateCoreLearning(pattern.id, { description: 'Updated evidence' });
  
  // Weight should still be 1.0
  const final = engine.antiPatterns.patterns.find(p => p.id === pattern.id);
  const weightFinal = engine.getAdaptiveWeight(final);
  assert.equal(weightFinal, 1.0, 'Core pattern should maintain weight 1.0 after update');
});
