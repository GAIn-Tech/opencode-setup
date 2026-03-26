'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { LearningEngine } = require('../src/index');

function makeStubAdvice() {
  return {
    advice_id: 'adv_test',
    warnings: [],
    suggestions: [],
    routing: {
      agent: 'hephaestus',
      skills: ['systematic-debugging'],
      confidence: 0.8,
      runner_up_skill: null,
      ambiguity_margin: null,
      skill_switch_count: 0,
    },
    risk_score: 0,
    riskScore: 0,
    quota_risk: 0,
    should_pause: false,
  };
}

describe('Meta-KB routing enrichment (adviceGenerated hook)', () => {
  it('reduces confidence by 10% when warnings match suggested skill', async () => {
    const engine = new LearningEngine({ autoLoad: false, metaKBPath: '/nonexistent' });
    engine.advisor.advise = () => makeStubAdvice();

    engine.metaKB.index = { loaded: true };
    engine.metaKB.query = () => ({
      warnings: [
        { pattern: 'systematic-debugging overused', description: 'systematic-debugging repeated' },
        { pattern: 'systematic-debugging loop', description: 'systematic-debugging without root cause' },
      ],
      suggestions: [],
      conventions: [],
    });

    const advice = await engine.advise({ task_type: 'debug' });

    assert.equal(advice.routing.confidence, 0.72);
    assert.equal(advice.routing.meta_kb_warnings, 2);
  });

  it('leaves confidence unchanged when meta-KB has no relevant entries', async () => {
    const engine = new LearningEngine({ autoLoad: false, metaKBPath: '/nonexistent' });
    engine.advisor.advise = () => makeStubAdvice();

    engine.metaKB.index = { loaded: true };
    engine.metaKB.query = () => ({
      warnings: [
        { pattern: 'brainstorming ambiguity', description: 'brainstorming mismatch' },
      ],
      suggestions: [],
      conventions: [],
    });

    const advice = await engine.advise({ task_type: 'debug' });

    assert.equal(advice.routing.confidence, 0.8);
    assert.equal(advice.routing.meta_kb_warnings || 0, 0);
  });

  it('augments recommendations with meta-KB evidence for suggested skills', async () => {
    const engine = new LearningEngine({ autoLoad: false, metaKBPath: '/nonexistent' });
    engine.advisor.advise = () => makeStubAdvice();

    engine.metaKB.index = { loaded: true };
    engine.metaKB.query = () => ({
      warnings: [],
      suggestions: [
        { id: 'entry-1', summary: 'Use systematic-debugging for repeated failures' },
        { id: 'entry-2', summary: 'Verification workflow prevented regressions' },
      ],
      conventions: [],
    });

    const advice = await engine.advise({ task_type: 'debug' });

    const evidence = advice.suggestions.find((item) => item.type === 'meta_kb_evidence');
    assert.ok(evidence, 'expected meta_kb_evidence recommendation to be present');
    assert.equal(evidence.evidence_count, 2);
    assert.equal(advice.routing.meta_kb_evidence, 2);
  });
});
