'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { LearningEngine } = require('../src/index');

/**
 * Task 6: Meta-KB routing enrichment via adviceGenerated hook.
 *
 * When the meta-KB has anti-patterns matching the task context,
 * routing confidence should be adjusted downward and a warning count added.
 */
describe('Meta-KB routing enrichment (adviceGenerated hook)', () => {
  let tmpDir;
  let indexPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-kb-routing-'));
    indexPath = path.join(tmpDir, 'meta-knowledge-index.json');
  });

  it('reduces routing confidence when meta-KB has matching anti-patterns', async () => {
    // Create an index with anti-patterns that match "debug" task type
    const index = {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      total_records: 1,
      by_category: {},
      by_affected_path: {},
      anti_patterns: [
        {
          pattern: 'shotgun_debug',
          severity: 'high',
          description: 'Random edits without understanding root cause',
          file: 'AGENTS.md',
        },
      ],
      conventions: [],
      commands: [],
    };
    fs.writeFileSync(indexPath, JSON.stringify(index));

    const engine = new LearningEngine({ autoLoad: false, metaKBPath: indexPath });
    const advice = await engine.advise({ task_type: 'debug', files: [] });

    // Confidence should be reduced when anti-patterns match
    assert.ok(advice.routing.meta_kb_warnings > 0, 'should have meta_kb_warnings count');
    // Confidence should be reduced from original (base confidence without meta-KB reduction would be higher)
    // With 1 warning, confidence should be reduced by 10%
    assert.ok(advice.routing.confidence < 0.6, 'confidence should be reduced from base (0.6 with patterns)');
  });

  it('does not adjust routing confidence when meta-KB has no matching anti-patterns', async () => {
    // Create an index with anti-patterns that do NOT match "feature" task type
    const index = {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      total_records: 1,
      by_category: {},
      by_affected_path: {},
      anti_patterns: [
        {
          pattern: 'deployment_failure',
          severity: 'medium',
          description: 'Deployment pipeline broke',
          file: 'AGENTS.md',
        },
      ],
      conventions: [],
      commands: [],
    };
    fs.writeFileSync(indexPath, JSON.stringify(index));

    const engine = new LearningEngine({ autoLoad: false, metaKBPath: indexPath });
    const advice = await engine.advise({ task_type: 'feature', files: [] });

    // No matching anti-patterns → no meta_kb_warnings field or 0
    const warnCount = advice.routing.meta_kb_warnings || 0;
    assert.equal(warnCount, 0, 'should have no meta_kb_warnings');
  });

  it('still works when meta-KB is unavailable (fail-open)', async () => {
    const engine = new LearningEngine({ autoLoad: false, metaKBPath: '/nonexistent/path.json' });
    const advice = await engine.advise({ task_type: 'debug', files: [] });

    // Should still produce valid advice without meta_kb_warnings
    assert.ok(advice.advice_id, 'should have advice_id');
    assert.ok(advice.routing, 'should have routing');
    assert.ok(typeof advice.routing.confidence === 'number', 'should have numeric confidence');
    const warnCount = advice.routing.meta_kb_warnings || 0;
    assert.equal(warnCount, 0, 'should have no meta_kb_warnings when meta-KB unavailable');
  });

  it('adds meta_kb_evidence field to routing when positive suggestions exist', async () => {
    // Create an index with path-matched entries (positive signal)
    const index = {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      total_records: 1,
      by_category: {},
      by_affected_path: {
        'packages/opencode-learning-engine': [
          {
            id: 'wave9-test-123',
            summary: 'Successfully refactored learning engine',
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

    const engine = new LearningEngine({ autoLoad: false, metaKBPath: indexPath });
    const advice = await engine.advise({
      task_type: 'refactor',
      files: ['packages/opencode-learning-engine/src/index.js'],
    });

    // Should have meta_kb_evidence indicating positive signals
    assert.ok(typeof advice.routing.meta_kb_evidence === 'number', 'should have meta_kb_evidence count');
    assert.ok(advice.routing.meta_kb_evidence > 0, 'should have positive evidence');
  });
});
