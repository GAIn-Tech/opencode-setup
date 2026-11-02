'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { LearningEngine } = require('../src/index');

describe('LearningEngine meta-KB integration', () => {
  it('advise() output includes meta_context field', async () => {
    const engine = new LearningEngine({ autoLoad: false });
    const advice = await engine.advise({
      task_type: 'debug',
      files: ['packages/opencode-learning-engine/src/index.js'],
    });

    assert.ok('meta_context' in advice, 'advice should have meta_context field');
    assert.deepStrictEqual(Object.keys(advice.meta_context).sort(), ['conventions', 'suggestions', 'warnings']);
  });

  it('meta_context is empty object when no index loaded', async () => {
    const engine = new LearningEngine({ autoLoad: false, metaKBPath: '/nonexistent' });
    const advice = await engine.advise({ task_type: 'debug' });

    assert.deepStrictEqual(advice.meta_context, {
      warnings: [],
      suggestions: [],
      conventions: [],
    });
  });
});
