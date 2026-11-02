'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { generateMetaContext, MAX_META_CONTEXT_CHARS } = require('../src/meta-context-injector');

describe('generateMetaContext', () => {
  it('returns empty string when no index is provided', () => {
    const result = generateMetaContext(null, {
      files: ['packages/opencode-plugin-preload-skills/src/index.js'],
    });
    assert.equal(result, '');
  });

  it('returns formatted block when by_affected_path matches and ranks top 3 by recency/risk', () => {
    const index = {
      by_affected_path: {
        'packages/opencode-plugin-preload-skills/src': [
          {
            id: 'recent-low',
            summary: 'Recent low risk item',
            risk_level: 'low',
            timestamp: '2026-03-20T10:00:00.000Z',
          },
          {
            id: 'older-high',
            summary: 'Older high risk item',
            risk_level: 'high',
            timestamp: '2026-03-10T10:00:00.000Z',
          },
          {
            id: 'recent-high',
            summary: 'Recent high risk item',
            risk_level: 'high',
            timestamp: '2026-03-20T11:00:00.000Z',
          },
          {
            id: 'older-low',
            summary: 'Older low risk item',
            risk_level: 'low',
            timestamp: '2026-03-09T10:00:00.000Z',
          },
        ],
      },
    };
    const result = generateMetaContext(index, {
      files: ['packages/opencode-plugin-preload-skills/src/index.js'],
    });

    assert.ok(result.startsWith('<!-- META-KB CONTEXT -->\n'));
    assert.ok(result.includes('recent-high'));
    assert.ok(result.includes('older-high'));
    assert.ok(result.includes('recent-low'));
    assert.equal(result.includes('older-low'), false, 'only top 3 entries should be included');

    const idxRecentHigh = result.indexOf('recent-high');
    const idxOlderHigh = result.indexOf('older-high');
    const idxRecentLow = result.indexOf('recent-low');
    assert.ok(idxRecentHigh < idxOlderHigh, 'high + recent should rank first');
    assert.ok(idxOlderHigh < idxRecentLow, 'high risk should outrank low risk');
  });

  it('respects maxChars cap', () => {
    const index = {
      by_affected_path: {
        'packages/opencode-plugin-preload-skills': [
          {
            id: 'very-long-entry',
            summary: 'X'.repeat(2000),
            risk_level: 'high',
            timestamp: '2026-03-20T10:00:00.000Z',
          },
        ],
      },
    };
    const result = generateMetaContext(index, {
      files: ['packages/opencode-plugin-preload-skills/src/index.js'],
    }, 160);

    assert.ok(result.length <= 160, `should be under 160 chars, got ${result.length}`);
  });

  it('returns empty string when there are no path matches', () => {
    const index = {
      anti_patterns: [
        { pattern: 'shotgun_debug', severity: 'high', description: 'Should not be used by injector' },
      ],
      by_affected_path: {
        scripts: [
          {
            id: 'scripts-only',
            summary: 'Only scripts path',
            risk_level: 'low',
            timestamp: '2026-03-20T10:00:00.000Z',
          },
        ],
      },
    };
    const result = generateMetaContext(index, {
      files: ['packages/opencode-plugin-preload-skills/src/index.js'],
      taskType: 'debug',
    });

    assert.equal(result, '');
  });

  it('defaults MAX_META_CONTEXT_CHARS to 800', () => {
    assert.equal(MAX_META_CONTEXT_CHARS, 800);
  });
});
