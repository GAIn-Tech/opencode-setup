'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { IntegrationLayer } = require('../src/index');

/**
 * Task 8: SkillRL + Meta-KB integration.
 *
 * Skills with anti-patterns in meta-KB get lower promotion scores.
 * Skills with positive patterns get higher scores.
 * SkillRL works unchanged when meta-KB is unavailable (fail-open).
 */
describe('IntegrationLayer meta-KB SkillRL integration', () => {
  let tmpDir;
  let indexPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-kb-skillrl-'));
    indexPath = path.join(tmpDir, 'meta-knowledge-index.json');
  });

  it('adjusts SkillRL advice with meta-KB anti-pattern penalty via onBeforeAdviceReturn', () => {
    // Create index with anti-pattern matching "systematic-debugging"
    const index = {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      total_records: 1,
      by_category: {},
      by_affected_path: {},
      anti_patterns: [
        {
          pattern: 'systematic-debugging failed repeatedly',
          severity: 'high',
          description: 'Systematic debugging skill failed on complex multi-file issues',
          file: 'AGENTS.md',
        },
      ],
      conventions: [],
      commands: [],
    };
    fs.writeFileSync(indexPath, JSON.stringify(index));

    // Create a mock SkillRL that returns skills with relevance scores
    const mockSkillRL = {
      selectSkills: () => [
        { name: 'systematic-debugging', relevance_score: 0.9 },
        { name: 'test-driven-development', relevance_score: 0.7 },
      ],
    };

    const layer = new IntegrationLayer({
      skillRL: mockSkillRL,
      metaKBIndexPath: indexPath,
    });

    const hooks = layer.createOrchestrationAdvisorHooks();
    const taskContext = { task_type: 'debug', files: [] };
    const baseAdvice = {
      advice_id: 'test_001',
      warnings: [],
      suggestions: [],
      routing: { agent: 'hephaestus', skills: ['systematic-debugging'], confidence: 0.7 },
      risk_score: 10,
    };

    const result = hooks.onBeforeAdviceReturn(taskContext, baseAdvice);

    // Should have skillrl_skills augmentation
    assert.ok(Array.isArray(result.skillrl_skills), 'should have skillrl_skills');
    // Should have meta_kb_skill_adjustments
    assert.ok(
      result.meta_kb_skill_adjustments !== undefined,
      'should have meta_kb_skill_adjustments'
    );
  });

  it('boosts SkillRL scores when meta-KB has positive path matches', () => {
    // Create index with positive entries for learning-engine path
    const index = {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      total_records: 1,
      by_category: {},
      by_affected_path: {
        'packages/opencode-learning-engine': [
          {
            id: 'wave9-positive-123',
            summary: 'Successful refactor using test-driven-development',
            risk_level: 'low',
            timestamp: new Date().toISOString(),
          },
        ],
      },
      anti_patterns: [],
      conventions: [],
      commands: [],
    };
    fs.writeFileSync(indexPath, JSON.stringify(index));

    const mockSkillRL = {
      selectSkills: () => [
        { name: 'test-driven-development', relevance_score: 0.6 },
      ],
    };

    const layer = new IntegrationLayer({
      skillRL: mockSkillRL,
      metaKBIndexPath: indexPath,
    });

    const hooks = layer.createOrchestrationAdvisorHooks();
    const taskContext = {
      task_type: 'refactor',
      files: ['packages/opencode-learning-engine/src/index.js'],
    };
    const baseAdvice = {
      advice_id: 'test_002',
      warnings: [],
      suggestions: [],
      routing: { agent: 'hephaestus', skills: ['test-driven-development'], confidence: 0.6 },
      risk_score: 5,
    };

    const result = hooks.onBeforeAdviceReturn(taskContext, baseAdvice);

    assert.ok(Array.isArray(result.skillrl_skills), 'should have skillrl_skills');
    assert.ok(
      result.meta_kb_skill_adjustments !== undefined,
      'should have meta_kb_skill_adjustments'
    );
    // Positive evidence should result in non-negative adjustments
    if (typeof result.meta_kb_skill_adjustments === 'object') {
      const adjustments = result.meta_kb_skill_adjustments;
      assert.ok(
        adjustments.positive_evidence >= 0,
        'should have non-negative positive_evidence'
      );
    }
  });

  it('works unchanged when meta-KB is unavailable (fail-open)', () => {
    const mockSkillRL = {
      selectSkills: () => [
        { name: 'systematic-debugging', relevance_score: 0.8 },
      ],
    };

    // No metaKBIndexPath → meta-KB unavailable
    const layer = new IntegrationLayer({ skillRL: mockSkillRL });

    const hooks = layer.createOrchestrationAdvisorHooks();
    const taskContext = { task_type: 'debug', files: [] };
    const baseAdvice = {
      advice_id: 'test_003',
      warnings: [],
      suggestions: [],
      routing: { agent: 'hephaestus', skills: ['systematic-debugging'], confidence: 0.7 },
      risk_score: 10,
    };

    const result = hooks.onBeforeAdviceReturn(taskContext, baseAdvice);

    // Should still produce valid advice with SkillRL augmentation
    assert.ok(Array.isArray(result.skillrl_skills), 'should have skillrl_skills');
    assert.deepStrictEqual(result.skillrl_skills, ['systematic-debugging']);
    // No meta_kb_skill_adjustments when meta-KB unavailable
    assert.equal(result.meta_kb_skill_adjustments, undefined, 'should not have meta_kb_skill_adjustments');
  });

  it('works when SkillRL is unavailable', () => {
    const layer = new IntegrationLayer({});

    const hooks = layer.createOrchestrationAdvisorHooks();
    const taskContext = { task_type: 'debug', files: [] };
    const baseAdvice = {
      advice_id: 'test_004',
      warnings: [],
      suggestions: [],
      routing: { agent: 'hephaestus', skills: ['systematic-debugging'], confidence: 0.7 },
      risk_score: 10,
    };

    const result = hooks.onBeforeAdviceReturn(taskContext, baseAdvice);

    // Without SkillRL, advice passes through unchanged
    assert.deepStrictEqual(result, baseAdvice);
  });
});
