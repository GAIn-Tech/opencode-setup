'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { generateMetaContext, MAX_META_CONTEXT_CHARS, MAX_ENTRIES } = require('../src/meta-context-injector');

describe('generateMetaContext', () => {
  it('returns empty string when metaKBIndex is null', () => {
    const result = generateMetaContext(null, { taskType: 'debug' });
    assert.equal(result, '');
  });

  it('returns empty string when taskContext is null', () => {
    const result = generateMetaContext({ anti_patterns: [] }, null);
    assert.equal(result, '');
  });

  it('returns empty string when no entries match', () => {
    const index = {
      anti_patterns: [{ pattern: 'deployment_failure', severity: 'high', description: 'deploy broke' }],
      by_affected_path: {},
      conventions: [],
    };
    const result = generateMetaContext(index, { taskType: 'feature', files: [] });
    assert.equal(result, '');
  });

  it('returns formatted markdown block when anti-patterns match task type', () => {
    const index = {
      anti_patterns: [
        { pattern: 'shotgun_debug', severity: 'high', description: 'Random edits without understanding root cause' },
      ],
      by_affected_path: {},
      conventions: [],
    };
    const result = generateMetaContext(index, { taskType: 'debug', files: [] });

    assert.ok(result.startsWith('<!-- META-KB CONTEXT -->'), 'should start with opening comment');
    assert.ok(result.endsWith('<!-- /META-KB CONTEXT -->'), 'should end with closing comment');
    assert.ok(result.includes('shotgun_debug'), 'should include the anti-pattern name');
    assert.ok(result.includes('HIGH'), 'should include severity');
  });

  it('returns formatted block when path matches', () => {
    const index = {
      anti_patterns: [],
      by_affected_path: {
        'packages/opencode-dashboard': [
          {
            id: 'wave8-dashboard-fix',
            summary: 'Fixed dashboard build errors',
            risk_level: 'low',
            timestamp: new Date().toISOString(),
          },
        ],
      },
      conventions: [],
    };
    const result = generateMetaContext(index, {
      taskType: 'feature',
      files: ['packages/opencode-dashboard/src/app/page.tsx'],
    });

    assert.ok(result.includes('Fixed dashboard build errors'), 'should include the path-matched entry');
  });

  it('includes conventions when files match', () => {
    const index = {
      anti_patterns: [],
      by_affected_path: {},
      conventions: [
        { convention: 'Bun-First: use bunfig.toml', description: 'NOT npm/yarn compatible', file: 'AGENTS.md' },
      ],
    };
    const result = generateMetaContext(index, {
      taskType: 'feature',
      files: ['packages/opencode-learning-engine/src/index.js'],
    });

    assert.ok(result.includes('Bun-First'), 'should include convention from root AGENTS.md');
  });

  it('respects maxChars cap', () => {
    const index = {
      anti_patterns: [
        { pattern: 'debug_issue_1', severity: 'high', description: 'A'.repeat(500) },
        { pattern: 'debug_issue_2', severity: 'medium', description: 'B'.repeat(500) },
        { pattern: 'debug_issue_3', severity: 'low', description: 'C'.repeat(500) },
      ],
      by_affected_path: {},
      conventions: [],
    };
    const result = generateMetaContext(index, { taskType: 'debug', files: [] }, 200);

    assert.ok(result.length <= 200, `should be under 200 chars, got ${result.length}`);
    assert.ok(result.endsWith('<!-- /META-KB CONTEXT -->'), 'should end with closing comment even when truncated');
  });

  it('limits to MAX_ENTRIES entries', () => {
    const antiPatterns = [];
    for (let i = 0; i < 10; i++) {
      antiPatterns.push({
        pattern: `debug_pattern_${i}`,
        severity: 'medium',
        description: `Issue number ${i}`,
      });
    }
    const index = {
      anti_patterns: antiPatterns,
      by_affected_path: {},
      conventions: [],
    };
    const result = generateMetaContext(index, { taskType: 'debug', files: [] });

    // Count the number of entry lines (lines starting with ⚠ or ℹ or 📏)
    const entryLines = result.split('\n').filter(line =>
      line.startsWith('⚠') || line.startsWith('ℹ') || line.startsWith('📏')
    );
    assert.ok(entryLines.length <= MAX_ENTRIES, `should have at most ${MAX_ENTRIES} entries, got ${entryLines.length}`);
  });

  it('defaults MAX_META_CONTEXT_CHARS to 800', () => {
    assert.equal(MAX_META_CONTEXT_CHARS, 800);
  });
});
