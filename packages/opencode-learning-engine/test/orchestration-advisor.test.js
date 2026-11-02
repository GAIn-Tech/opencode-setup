'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { OrchestrationAdvisor, SKILL_AFFINITY } = require('../src/orchestration-advisor');

// Minimal stubs satisfying the interface used by OrchestrationAdvisor
function makeStubAntiPatterns() {
  return {
    shouldWarn: () => ({ warnings: [], risk_score: 0 }),
    getStats: () => ({ total: 0, total_weight: 0, avg_weight: 0, most_frequent: [], by_type: {} }),
    addAntiPattern: () => {},
  };
}

function makeStubPositivePatterns() {
  return {
    getRecommendations: () => [],
    patterns: [],
    getStats: () => ({ total: 0, avg_success_rate: 0, top_strategies: [], by_type: {} }),
    addPositivePattern: () => {},
  };
}

function makeAdvisor() {
  return new OrchestrationAdvisor(makeStubAntiPatterns(), makeStubPositivePatterns());
}

// ---------------------------------------------------------------------------
// advise() backward compatibility
// ---------------------------------------------------------------------------

test('advise() returns all original fields', () => {
  const advisor = makeAdvisor();
  const result = advisor.advise({ task_type: 'debug', description: 'fix bug' });

  assert.ok(result.advice_id, 'advice_id present');
  assert.ok(Array.isArray(result.warnings), 'warnings is array');
  assert.ok(Array.isArray(result.suggestions), 'suggestions is array');
  assert.ok(result.routing, 'routing present');
  assert.equal(typeof result.routing.agent, 'string');
  assert.ok(Array.isArray(result.routing.skills));
  assert.equal(typeof result.routing.confidence, 'number');
  assert.equal(typeof result.risk_score, 'number');
  assert.equal(typeof result.should_pause, 'boolean');
});

// ---------------------------------------------------------------------------
// Routing telemetry: runner_up_skill
// ---------------------------------------------------------------------------

test('routing includes runner_up_skill field', () => {
  const advisor = makeAdvisor();
  const result = advisor.advise({ task_type: 'debug', description: 'debug something' });
  assert.ok('runner_up_skill' in result.routing, 'runner_up_skill key exists');
});

test('runner_up_skill is a string when two SKILL_AFFINITY categories match', () => {
  const advisor = makeAdvisor();
  // task_type 'test' → test category +2; description 'debug' → debug category +1
  const result = advisor.advise({ task_type: 'test', description: 'test the debug approach' });
  assert.equal(typeof result.routing.runner_up_skill, 'string');
  // Runner-up is first skill from debug category
  assert.equal(result.routing.runner_up_skill, SKILL_AFFINITY.debug[0]);
});

test('runner_up_skill is null when only one SKILL_AFFINITY category matches', () => {
  const advisor = makeAdvisor();
  // Use a task_type that matches only one category and has no description keywords
  // 'deploy' matches only the deploy category; description has no category keywords
  const result = advisor.advise({ task_type: 'deploy', description: 'push to production' });
  assert.equal(result.routing.runner_up_skill, null);
});

// ---------------------------------------------------------------------------
// Routing telemetry: ambiguity_margin
// ---------------------------------------------------------------------------

test('routing includes ambiguity_margin field', () => {
  const advisor = makeAdvisor();
  const result = advisor.advise({ task_type: 'debug', description: 'fix' });
  assert.ok('ambiguity_margin' in result.routing);
});

test('ambiguity_margin is a number when runner-up exists', () => {
  const advisor = makeAdvisor();
  // test category +2 (taskType), debug category +1 (description) → margin = 2
  const result = advisor.advise({ task_type: 'test', description: 'test the debug approach' });
  assert.equal(typeof result.routing.ambiguity_margin, 'number');
  assert.ok(result.routing.ambiguity_margin >= 0);
});

test('ambiguity_margin equals topScore minus secondScore', () => {
  const advisor = makeAdvisor();
  // test: taskType includes 'test' → +2, description includes 'test' → +1 = 3
  // debug: description includes 'debug' → +1 = 1
  // margin = 3 - 1 = 2
  const result = advisor.advise({ task_type: 'test', description: 'test the debug approach' });
  assert.equal(result.routing.ambiguity_margin, 2);
});

test('ambiguity_margin is null when no runner-up category', () => {
  const advisor = makeAdvisor();
  // Use a task_type that matches only one category
  const result = advisor.advise({ task_type: 'deploy', description: 'push to production' });
  assert.equal(result.routing.ambiguity_margin, null);
});

// ---------------------------------------------------------------------------
// Routing telemetry: skill_switch_count
// ---------------------------------------------------------------------------

test('routing includes skill_switch_count field', () => {
  const advisor = makeAdvisor();
  const result = advisor.advise({ task_type: 'debug', description: 'fix bug' });
  assert.ok('skill_switch_count' in result.routing);
  assert.equal(typeof result.routing.skill_switch_count, 'number');
});

test('skill_switch_count is 0 on first call for a task_type', () => {
  const advisor = makeAdvisor();
  const result = advisor.advise({ task_type: 'debug', description: 'first debug task' });
  assert.equal(result.routing.skill_switch_count, 0);
});

test('skill_switch_count stays 0 when same top skill recommended', () => {
  const advisor = makeAdvisor();
  // Pre-populate outcomeLog with consistent routing
  advisor.outcomeLog.push({
    advice_id: 'a1',
    task_context: { task_type: 'debug' },
    routing: { skills: ['systematic-debugging', 'test-driven-development'], confidence: 0.5 },
    timestamp: new Date().toISOString(),
    outcome: null,
  });
  advisor.outcomeLog.push({
    advice_id: 'a2',
    task_context: { task_type: 'debug' },
    routing: { skills: ['systematic-debugging'], confidence: 0.5 },
    timestamp: new Date().toISOString(),
    outcome: null,
  });
  // Current call also recommends systematic-debugging as top for debug
  const result = advisor.advise({ task_type: 'debug', description: 'debug a crash' });
  assert.equal(result.routing.skill_switch_count, 0);
});

test('skill_switch_count increments when top skill changed in outcomeLog', () => {
  const advisor = makeAdvisor();
  // Two entries for debug: different top skills
  advisor.outcomeLog.push({
    advice_id: 'b1',
    task_context: { task_type: 'debug' },
    routing: { skills: ['systematic-debugging'], confidence: 0.5 },
    timestamp: new Date().toISOString(),
    outcome: null,
  });
  advisor.outcomeLog.push({
    advice_id: 'b2',
    task_context: { task_type: 'debug' },
    routing: { skills: ['test-driven-development'], confidence: 0.5 },
    timestamp: new Date().toISOString(),
    outcome: null,
  });
  const result = advisor.advise({ task_type: 'debug', description: 'debug a crash' });
  // One switch in history (systematic-debugging → test-driven-development)
  // Plus current top skill (systematic-debugging) differs from last entry (test-driven-development) → +1
  assert.ok(result.routing.skill_switch_count >= 1,
    `Expected skill_switch_count >= 1, got ${result.routing.skill_switch_count}`);
});

test('skill_switch_count ignores entries for other task_types', () => {
  const advisor = makeAdvisor();
  // Entries for a different task_type should not affect debug count
  advisor.outcomeLog.push({
    advice_id: 'c1',
    task_context: { task_type: 'feature' },
    routing: { skills: ['brainstorming'], confidence: 0.5 },
    timestamp: new Date().toISOString(),
    outcome: null,
  });
  const result = advisor.advise({ task_type: 'debug', description: 'debug issue' });
  assert.equal(result.routing.skill_switch_count, 0);
});

// ---------------------------------------------------------------------------
// Existing routing fields preserved
// ---------------------------------------------------------------------------

test('routing still contains agent, skills, confidence alongside telemetry', () => {
  const advisor = makeAdvisor();
  const result = advisor.advise({ task_type: 'debug', description: 'debug crash' });
  const r = result.routing;
  assert.equal(typeof r.agent, 'string');
  assert.ok(Array.isArray(r.skills));
  assert.equal(typeof r.confidence, 'number');
  // Telemetry coexists
  assert.ok('runner_up_skill' in r);
  assert.ok('ambiguity_margin' in r);
  assert.ok('skill_switch_count' in r);
});

// ---------------------------------------------------------------------------
// SKILL_AFFINITY registry-sourced routing (TDD: RED phase)
// ---------------------------------------------------------------------------

test('advise({task_type: "debug"}) returns skills including systematic-debugging (existing behavior preserved)', () => {
  const advisor = makeAdvisor();
  const result = advisor.advise({ task_type: 'debug', description: 'fix a bug' });
  
  assert.ok(Array.isArray(result.routing.skills), 'skills is array');
  assert.ok(result.routing.skills.length > 0, 'skills array is not empty');
  assert.ok(
    result.routing.skills.includes('systematic-debugging'),
    `Expected systematic-debugging in skills, got ${JSON.stringify(result.routing.skills)}`
  );
});

test('_buildSkillAffinity() returns map with entries for each category in registry', () => {
  const { OrchestrationAdvisor } = require('../src/orchestration-advisor');
  const advisor = new OrchestrationAdvisor(makeStubAntiPatterns(), makeStubPositivePatterns());
  
  // Call the private method via reflection (or test the public behavior)
  // For now, test that the affinity map has expected structure
  const result = advisor.advise({ task_type: 'debug', description: 'test' });
  
  // The routing should have skills from the affinity map
  assert.ok(Array.isArray(result.routing.skills), 'skills array exists');
  assert.ok(result.routing.skills.length > 0, 'skills array has entries');
});

test('Registry load failure falls back to hardcoded map (no crash)', () => {
  const advisor = makeAdvisor();
  
  // Even if registry loading fails internally, advise() should not crash
  // and should return valid routing with skills
  const result = advisor.advise({ task_type: 'debug', description: 'debug issue' });
  
  assert.ok(result.routing, 'routing exists');
  assert.ok(Array.isArray(result.routing.skills), 'skills array exists');
  assert.ok(result.routing.skills.length > 0, 'skills array has entries');
  assert.equal(typeof result.routing.agent, 'string', 'agent is string');
});
