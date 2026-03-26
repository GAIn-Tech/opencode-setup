'use strict';

const { describe, it, expect } = require('bun:test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { IntegrationLayer } = require('../src/index.js');

function writeIndex(index) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-kb-skillrl-'));
  const indexPath = path.join(tmpDir, 'meta-knowledge-index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index), 'utf8');
  return indexPath;
}

async function runWithCapturedSkills(layer, taskContext) {
  let capturedSkills = null;
  let capturedOptions = null;

  await layer.executeTaskWithEvidence(taskContext, async (_ctx, skills, adaptiveOptions) => {
    capturedSkills = skills;
    capturedOptions = adaptiveOptions;
    return { success: true, modelId: 'meta-kb-test-model' };
  });

  return { capturedSkills, capturedOptions };
}

function makeSkillRL(skills) {
  return {
    selectSkills: () => skills,
    learnFromOutcome: () => {},
    evolutionEngine: { learnFromFailure: () => {} },
    skillBank: {
      getSkillPerformance: () => ({ is_uncertain: false }),
      generalSkills: new Map(),
    },
  };
}

describe('IntegrationLayer meta-KB SkillRL score integration', () => {
  it('skills with anti-patterns in meta-KB get lower promotion scores', async () => {
    const indexPath = writeIndex({
      schema_version: 1,
      generated_at: new Date().toISOString(),
      by_category: {},
      by_affected_path: {},
      anti_patterns: [
        {
          pattern: 'systematic-debugging repeatedly caused retry storms',
          description: 'Avoid systematic-debugging in this scenario',
          severity: 'high',
        },
      ],
      conventions: [],
      commands: [],
    });

    const layer = new IntegrationLayer({
      skillRL: makeSkillRL([
        { name: 'systematic-debugging', success_rate: 0.9, usage_count: 10 },
        { name: 'test-driven-development', success_rate: 0.75, usage_count: 6 },
      ]),
      metaKBIndexPath: indexPath,
    });

    const { capturedSkills, capturedOptions } = await runWithCapturedSkills(layer, {
      task: 'debug',
      task_type: 'debug',
      files: ['packages/opencode-integration-layer/src/index.js'],
    });

    expect(capturedSkills[0].name).toBe('test-driven-development');
    expect(capturedSkills[1].name).toBe('systematic-debugging');
    expect(capturedSkills[1].adjusted_promotion_score).toBeLessThan(capturedSkills[1].promotion_score);
    expect(capturedOptions.metaKBSkillAdjustments.anti_pattern_penalty).toBeGreaterThan(0);
  });

  it('skills with positive patterns in meta-KB get higher promotion scores', async () => {
    const indexPath = writeIndex({
      schema_version: 1,
      generated_at: new Date().toISOString(),
      by_category: {},
      by_affected_path: {
        'packages/opencode-learning-engine': [
          {
            summary: 'test-driven-development improved confidence and reduced regressions',
            risk_level: 'low',
          },
        ],
      },
      anti_patterns: [],
      conventions: [],
      commands: [],
    });

    const layer = new IntegrationLayer({
      skillRL: makeSkillRL([
        { name: 'test-driven-development', success_rate: 0.6, usage_count: 2 },
        { name: 'systematic-debugging', success_rate: 0.85, usage_count: 9 },
      ]),
      metaKBIndexPath: indexPath,
    });

    const { capturedSkills, capturedOptions } = await runWithCapturedSkills(layer, {
      task: 'refactor',
      task_type: 'refactor',
      files: ['packages/opencode-learning-engine/src/index.js'],
    });

    const tddSkill = capturedSkills.find((skill) => skill.name === 'test-driven-development');
    expect(tddSkill.adjusted_promotion_score).toBeGreaterThan(tddSkill.promotion_score);
    expect(capturedOptions.metaKBSkillAdjustments.positive_evidence).toBeGreaterThan(0);
  });

  it('SkillRL works unchanged when meta-KB is unavailable (fail-open)', async () => {
    const layer = new IntegrationLayer({
      skillRL: makeSkillRL([
        { name: 'systematic-debugging', success_rate: 0.8, usage_count: 3 },
        { name: 'test-driven-development', success_rate: 0.7, usage_count: 2 },
      ]),
    });

    const { capturedSkills, capturedOptions } = await runWithCapturedSkills(layer, {
      task: 'debug',
      task_type: 'debug',
      files: [],
    });

    expect(capturedSkills.map((skill) => skill.name)).toEqual([
      'systematic-debugging',
      'test-driven-development',
    ]);
    expect(capturedSkills[0].adjusted_promotion_score).toBeUndefined();
    expect(capturedOptions.metaKBSkillAdjustments).toBeNull();
  });
});
