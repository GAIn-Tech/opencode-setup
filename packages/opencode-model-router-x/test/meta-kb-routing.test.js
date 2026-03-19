'use strict';

const { describe, test, expect } = require('bun:test');
const { ModelRouter } = require('../src/index.js');

class FakeCircuitBreaker {
  getState() {
    return 'closed';
  }
}

class FakeIntegrationLayer {
  constructor() {
    this.advisor = {
      advise: () => ({ warnings: [], suggestions: [], antiPatterns: [] }),
    };
  }

  normalizeTaskContext(ctx = {}) {
    return {
      task_type: ctx.taskType || ctx.task || 'general',
      description: ctx.description || '',
      required_strengths: ctx.requiredStrengths || [],
    };
  }
}

function createRouter(metaKB) {
  const router = new ModelRouter({
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    learningEngine: { advise: () => ({}) },
    circuitBreakerClass: FakeCircuitBreaker,
    healthCheck: { registerSubsystem: () => {} },
    integrationLayerClass: FakeIntegrationLayer,
    metaKB,
  });

  router.explorationController = { selectModelForTaskSync: () => null };
  router._filterByConstraints = () => ['model-a', 'model-b'];
  router._filterByHealth = (candidateIds) => candidateIds;
  router._scoreModel = (modelId) => ({
    score: modelId === 'model-a' ? 1.0 : 0.95,
    reason: 'base-score',
  });

  router.models = {
    'model-a': { id: 'model-a', provider: 'provider-a' },
    'model-b': { id: 'model-b', provider: 'provider-b' },
  };

  router.rotators = {
    'provider-a': { getNextKey: () => ({ id: 'key-a', value: 'k-a' }) },
    'provider-b': { getNextKey: () => ({ id: 'key-b', value: 'k-b' }) },
  };

  return router;
}

describe('meta-KB informed model routing', () => {
  test('adjusts model score when meta-KB has model-specific anti-patterns', () => {
    const metaKB = {
      index: {
        anti_patterns: [
          {
            pattern: 'long-context',
            description: 'model-a fails on long-context tasks',
            severity: 'high',
            affected_models: ['model-a'],
          },
        ],
      },
      query: () => ({
        warnings: [{ pattern: 'long-context' }],
        suggestions: [],
        conventions: [],
      }),
    };

    const router = createRouter(metaKB);

    const result = router.route({
      taskType: 'feature',
      description: 'Implement long-context summarization',
      requiredStrengths: ['long-context'],
    });

    expect(result.modelId).toBe('model-b');
    expect(result.score).toBeCloseTo(0.95, 5);
  });

  test('keeps model score unchanged when meta-KB has no relevant entries', () => {
    const metaKB = {
      index: {
        anti_patterns: [
          {
            pattern: 'sql-injection',
            description: 'model-a has SQL prompt construction issues',
            severity: 'high',
            affected_models: ['model-a'],
          },
        ],
      },
      query: () => ({ warnings: [], suggestions: [], conventions: [] }),
    };

    const router = createRouter(metaKB);

    const result = router.route({
      taskType: 'feature',
      description: 'Implement long-context summarization',
      requiredStrengths: ['long-context'],
    });

    expect(result.modelId).toBe('model-a');
    expect(result.score).toBeCloseTo(1.0, 5);
  });

  test('fails open when meta-KB is unavailable', () => {
    const metaKB = {
      query: () => {
        throw new Error('meta-kb unavailable');
      },
      get index() {
        throw new Error('meta-kb unavailable');
      },
    };

    const router = createRouter(metaKB);

    const result = router.route({
      taskType: 'feature',
      description: 'Implement long-context summarization',
      requiredStrengths: ['long-context'],
    });

    expect(result.modelId).toBe('model-a');
    expect(result.score).toBeCloseTo(1.0, 5);
  });
});
