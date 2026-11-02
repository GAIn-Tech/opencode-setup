'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  MetaKBReader,
  MAX_CHARS,
  MAX_QUERY_FILES,
  MAX_PATH_KEYS,
  MAX_PATH_ENTRIES_PER_MATCH,
  MAX_SUGGESTIONS,
  MAX_WARNINGS,
  MAX_CONVENTION_RESULTS,
} = require('../src/meta-kb-reader');

/**
 * Create a temporary meta-knowledge index file for testing.
 */
function createTempIndex(data) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-kb-test-'));
  const indexPath = path.join(tmpDir, 'meta-knowledge-index.json');
  fs.writeFileSync(indexPath, JSON.stringify(data), 'utf-8');
  return { indexPath, tmpDir };
}

/**
 * Build a minimal valid index for testing.
 */
function makeIndex(overrides = {}) {
  return {
    generated_at: new Date().toISOString(),
    schema_version: 1,
    total_records: 3,
    source_files: { learning_updates: 3, agents_md: 1 },
    by_category: {
      configuration: [
        { id: 'entry-1', summary: 'Fixed namespace drift', risk_level: 'low', affected_paths: ['packages/opencode-learning-engine/src/index.js'], timestamp: new Date().toISOString() },
      ],
      tooling: [
        { id: 'entry-2', summary: 'Added synthesis script', risk_level: 'medium', affected_paths: ['scripts/synthesize-meta-kb.mjs'], timestamp: new Date().toISOString() },
      ],
    },
    by_risk_level: {
      low: [{ id: 'entry-1', summary: 'Fixed namespace drift', risk_level: 'low', affected_paths: [], timestamp: new Date().toISOString() }],
      medium: [{ id: 'entry-2', summary: 'Added synthesis script', risk_level: 'medium', affected_paths: [], timestamp: new Date().toISOString() }],
      high: [],
    },
    by_affected_path: {
      'packages/opencode-learning-engine': [
        { id: 'entry-1', summary: 'Fixed namespace drift', risk_level: 'low', timestamp: new Date().toISOString() },
      ],
      'scripts': [
        { id: 'entry-2', summary: 'Added synthesis script', risk_level: 'medium', timestamp: new Date().toISOString() },
      ],
    },
    anti_patterns: [
      { source: 'agents.md', file: 'AGENTS.md', pattern: 'Shotgun Debugging', severity: 'high', description: 'ALWAYS use systematic-debugging skill. Read errors fully before editing.' },
      { source: 'agents.md', file: 'AGENTS.md', pattern: 'Bun ENOENT Segfault', severity: 'critical', description: 'spawn operations crash on ENOENT. Check command existence first.' },
    ],
    conventions: [
      { source: 'agents.md', file: 'AGENTS.md', convention: 'Bun-First', description: 'bunfig.toml, .bun-version, NOT npm/yarn compatible' },
    ],
    commands: [
      { source: 'agents.md', file: 'AGENTS.md', command: 'bun test', purpose: 'Run all tests' },
    ],
    ...overrides,
  };
}

function cleanup(tmpDir) {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

// ─── Tests ────────────────────────────────────────────────

describe('MetaKBReader', () => {
  describe('load()', () => {
    it('returns false when index file does not exist (fail-open)', () => {
      const reader = new MetaKBReader('/nonexistent/path/index.json');
      const result = reader.load();
      assert.equal(result, false);
      assert.equal(reader.index, null);
    });

    it('returns true when valid index file exists', () => {
      const { indexPath, tmpDir } = createTempIndex(makeIndex());
      try {
        const reader = new MetaKBReader(indexPath);
        const result = reader.load();
        assert.equal(result, true);
        assert.ok(reader.index !== null);
        assert.equal(reader.index.schema_version, 1);
        assert.ok(reader.loadedAt > 0);
      } finally {
        cleanup(tmpDir);
      }
    });

    it('returns false when file contains invalid JSON', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-kb-test-'));
      const indexPath = path.join(tmpDir, 'index.json');
      fs.writeFileSync(indexPath, 'not valid json{{{', 'utf-8');
      try {
        const reader = new MetaKBReader(indexPath);
        const result = reader.load();
        assert.equal(result, false);
        assert.equal(reader.index, null);
      } finally {
        cleanup(tmpDir);
      }
    });

    it('returns false when JSON lacks required fields', () => {
      const { indexPath, tmpDir } = createTempIndex({ some: 'data' });
      try {
        const reader = new MetaKBReader(indexPath);
        const result = reader.load();
        assert.equal(result, false);
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe('query()', () => {
    it('returns empty arrays when no index is loaded', () => {
      const reader = new MetaKBReader('/nonexistent');
      const result = reader.query({ task_type: 'debug', files: ['src/foo.js'] });
      assert.deepStrictEqual(result, { warnings: [], suggestions: [], conventions: [] });
    });

    it('returns matching entries for affected_path match', () => {
      const { indexPath, tmpDir } = createTempIndex(makeIndex());
      try {
        const reader = new MetaKBReader(indexPath);
        reader.load();
        const result = reader.query({
          task_type: 'debug',
          files: ['packages/opencode-learning-engine/src/index.js'],
        });

        // Should have suggestions from path match
        assert.ok(result.suggestions.length > 0, 'should have path-matched suggestions');
        const matched = result.suggestions.find(s => s.id === 'entry-1');
        assert.ok(matched, 'should find entry-1 via path match');
        assert.equal(matched.matched_path, 'packages/opencode-learning-engine');
      } finally {
        cleanup(tmpDir);
      }
    });

    it('returns matching anti-patterns for task_type match', () => {
      const { indexPath, tmpDir } = createTempIndex(makeIndex());
      try {
        const reader = new MetaKBReader(indexPath);
        reader.load();
        const result = reader.query({
          task_type: 'debug',
          description: 'fix shotgun debugging issue',
          files: [],
        });

        // Should match "Shotgun Debugging" anti-pattern via description overlap
        assert.ok(result.warnings.length > 0, 'should have warning from anti-pattern match');
        const matched = result.warnings.find(w => w.pattern === 'Shotgun Debugging');
        assert.ok(matched, 'should find Shotgun Debugging anti-pattern');
        assert.equal(matched.severity, 'high');
      } finally {
        cleanup(tmpDir);
      }
    });

    it('output is truncated to MAX_CHARS', () => {
      // Create an index with many entries to exceed token budget
      const manyEntries = [];
      for (let i = 0; i < 200; i++) {
        manyEntries.push({
          id: `entry-${i}`,
          summary: `This is a long summary for entry number ${i} which contains detailed information about changes made to the codebase including affected files and root causes`,
          risk_level: 'low',
          timestamp: new Date().toISOString(),
        });
      }
      const bigIndex = makeIndex({
        by_affected_path: {
          'packages/opencode-learning-engine': manyEntries,
        },
      });

      const { indexPath, tmpDir } = createTempIndex(bigIndex);
      try {
        const reader = new MetaKBReader(indexPath);
        reader.load();
        const result = reader.query({
          files: ['packages/opencode-learning-engine/src/index.js'],
        });

        const resultJson = JSON.stringify(result);
        assert.ok(resultJson.length <= MAX_CHARS, `output should be <= ${MAX_CHARS} chars, got ${resultJson.length}`);
      } finally {
        cleanup(tmpDir);
      }
    });

    it('returns conventions for root AGENTS.md (applies everywhere)', () => {
      const { indexPath, tmpDir } = createTempIndex(makeIndex());
      try {
        const reader = new MetaKBReader(indexPath);
        reader.load();
        const result = reader.query({
          files: ['packages/opencode-learning-engine/src/index.js'],
        });

        // Root conventions (file: 'AGENTS.md') should apply everywhere
        assert.ok(result.conventions.length > 0, 'should have conventions');
        const bunFirst = result.conventions.find(c => c.convention === 'Bun-First');
        assert.ok(bunFirst, 'should find Bun-First convention from root AGENTS.md');
      } finally {
        cleanup(tmpDir);
      }
    });

    it('applies iteration and result limits on large datasets', () => {
      const byAffectedPath = {};
      for (let i = 0; i < MAX_PATH_KEYS + 500; i++) {
        const entries = [];
        for (let j = 0; j < MAX_PATH_ENTRIES_PER_MATCH + 50; j++) {
          entries.push({
            id: `path-${i}-entry-${j}`,
            summary: `s-${i}-${j}`,
            risk_level: 'low',
            timestamp: new Date().toISOString(),
          });
        }
        byAffectedPath[`path-${i}`] = entries;
      }

      const antiPatterns = [];
      for (let i = 0; i < MAX_WARNINGS + 500; i++) {
        antiPatterns.push({
          source: 'agents.md',
          file: 'AGENTS.md',
          pattern: `debug-pattern-${i}`,
          severity: 'high',
          description: `debug issue ${i}`,
        });
      }

      const conventions = [];
      for (let i = 0; i < MAX_CONVENTION_RESULTS + 500; i++) {
        conventions.push({
          source: 'agents.md',
          file: 'AGENTS.md',
          convention: `Convention-${i}`,
          description: `Description ${i}`,
        });
      }

      const files = [];
      for (let i = 0; i < MAX_QUERY_FILES + 200; i++) {
        files.push(`root/path-${i}/target.js`);
      }

      const { indexPath, tmpDir } = createTempIndex(makeIndex({
        by_affected_path: byAffectedPath,
        anti_patterns: antiPatterns,
        conventions,
      }));

      try {
        const reader = new MetaKBReader(indexPath);
        reader.load();

        // Bypass token truncation to validate query loop/result safety bounds directly.
        reader._truncate = (result) => result;

        const result = reader.query({
          task_type: 'debug',
          description: 'debug nested loop issue',
          files,
        });

        assert.equal(result.suggestions.length, MAX_SUGGESTIONS, 'suggestions should stop at configured max');
        assert.equal(result.warnings.length, MAX_WARNINGS, 'warnings should stop at configured max');
        assert.equal(result.conventions.length, MAX_CONVENTION_RESULTS, 'conventions should stop at configured max');
      } finally {
        cleanup(tmpDir);
      }
    });

    it('handles malformed taskContext arrays fail-open', () => {
      const { indexPath, tmpDir } = createTempIndex(makeIndex());
      try {
        const reader = new MetaKBReader(indexPath);
        reader.load();

        assert.doesNotThrow(() => {
          const result = reader.query({
            task_type: { bad: true },
            description: { bad: true },
            files: [null, undefined, 42, { nope: true }, 'packages/opencode-learning-engine/src/index.js'],
          });

          assert.ok(Array.isArray(result.warnings));
          assert.ok(Array.isArray(result.suggestions));
          assert.ok(Array.isArray(result.conventions));
        });
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe('isStale()', () => {
    it('returns false when no index is loaded', () => {
      const reader = new MetaKBReader('/nonexistent');
      assert.equal(reader.isStale(), false);
    });

    it('returns true when index is older than 24 hours', () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const { indexPath, tmpDir } = createTempIndex(makeIndex({ generated_at: oldDate }));
      try {
        const reader = new MetaKBReader(indexPath);
        reader.load();
        assert.equal(reader.isStale(), true);
      } finally {
        cleanup(tmpDir);
      }
    });

    it('returns false when index is fresh (< 24 hours)', () => {
      const freshDate = new Date().toISOString();
      const { indexPath, tmpDir } = createTempIndex(makeIndex({ generated_at: freshDate }));
      try {
        const reader = new MetaKBReader(indexPath);
        reader.load();
        assert.equal(reader.isStale(), false);
      } finally {
        cleanup(tmpDir);
      }
    });
  });
});
