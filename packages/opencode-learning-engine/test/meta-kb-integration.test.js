'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// LearningEngine needs to be required after we set up the temp index
const { LearningEngine } = require('../src/index');

/**
 * Create a temporary meta-knowledge index file for testing.
 */
function createTempIndex(data) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-kb-integ-'));
  const indexPath = path.join(tmpDir, 'meta-knowledge-index.json');
  fs.writeFileSync(indexPath, JSON.stringify(data), 'utf-8');
  return { indexPath, tmpDir };
}

function makeIndex(overrides = {}) {
  return {
    generated_at: new Date().toISOString(),
    schema_version: 1,
    total_records: 2,
    source_files: { learning_updates: 2, agents_md: 1 },
    by_category: {
      configuration: [
        { id: 'entry-1', summary: 'Fixed namespace drift', risk_level: 'low', affected_paths: ['packages/opencode-learning-engine/src/index.js'], timestamp: new Date().toISOString() },
      ],
    },
    by_risk_level: { low: [], medium: [], high: [] },
    by_affected_path: {
      'packages/opencode-learning-engine': [
        { id: 'entry-1', summary: 'Fixed namespace drift', risk_level: 'low', timestamp: new Date().toISOString() },
      ],
    },
    anti_patterns: [
      { source: 'agents.md', file: 'AGENTS.md', pattern: 'Shotgun Debugging', severity: 'high', description: 'ALWAYS use systematic-debugging skill.' },
    ],
    conventions: [
      { source: 'agents.md', file: 'AGENTS.md', convention: 'Bun-First', description: 'bunfig.toml, NOT npm/yarn compatible' },
    ],
    commands: [],
    ...overrides,
  };
}

function cleanup(tmpDir) {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

describe('LearningEngine meta-KB integration', () => {
  it('advise() output includes meta_context field', async () => {
    const { indexPath, tmpDir } = createTempIndex(makeIndex());
    try {
      const engine = new LearningEngine({ autoLoad: false, metaKBPath: indexPath });
      const advice = await engine.advise({
        task_type: 'debug',
        files: ['packages/opencode-learning-engine/src/index.js'],
      });
      assert.ok('meta_context' in advice, 'advice should have meta_context field');
      assert.ok(Array.isArray(advice.meta_context.warnings), 'meta_context should have warnings array');
      assert.ok(Array.isArray(advice.meta_context.suggestions), 'meta_context should have suggestions array');
      assert.ok(Array.isArray(advice.meta_context.conventions), 'meta_context should have conventions array');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('meta_context is empty arrays when no index loaded', async () => {
    const engine = new LearningEngine({ autoLoad: false, metaKBPath: '/nonexistent/index.json' });
    const advice = await engine.advise({ task_type: 'debug' });
    assert.deepStrictEqual(advice.meta_context, { warnings: [], suggestions: [], conventions: [] });
  });

  it('meta_context contains path-matched suggestions', async () => {
    const { indexPath, tmpDir } = createTempIndex(makeIndex());
    try {
      const engine = new LearningEngine({ autoLoad: false, metaKBPath: indexPath });
      const advice = await engine.advise({
        task_type: 'refactor',
        files: ['packages/opencode-learning-engine/src/index.js'],
      });
      assert.ok(advice.meta_context.suggestions.length > 0, 'should have path-matched suggestions');
      const matched = advice.meta_context.suggestions.find(s => s.id === 'entry-1');
      assert.ok(matched, 'should find entry-1 via path match');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('meta_context_stale is set when index is older than 24h', async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const { indexPath, tmpDir } = createTempIndex(makeIndex({ generated_at: oldDate }));
    try {
      const engine = new LearningEngine({ autoLoad: false, metaKBPath: indexPath });
      const advice = await engine.advise({ task_type: 'debug' });
      assert.equal(advice.meta_context_stale, true, 'should flag stale index');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('meta_context_stale is absent when index is fresh', async () => {
    const { indexPath, tmpDir } = createTempIndex(makeIndex());
    try {
      const engine = new LearningEngine({ autoLoad: false, metaKBPath: indexPath });
      const advice = await engine.advise({ task_type: 'debug' });
      assert.equal(advice.meta_context_stale, undefined, 'should not flag fresh index as stale');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('MetaKBReader is exported from the package', () => {
    const { MetaKBReader } = require('../src/index');
    assert.ok(MetaKBReader, 'MetaKBReader should be exported');
    assert.equal(typeof MetaKBReader, 'function', 'MetaKBReader should be a constructor');
  });
});
