'use strict';

const { describe, test, expect } = require('bun:test');
const { ModelRouter } = require('../src/index.js');

class FakeCircuitBreaker {
  getState() {
    return 'closed';
  }
}

function createRouter() {
  const router = new ModelRouter({
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    circuitBreakerClass: FakeCircuitBreaker,
    healthCheck: { registerSubsystem: () => {} },
  });

  router.explorationController = { selectModelForTaskSync: () => null };
  return router;
}

describe('spread operator defensive checks', () => {
  test('does not throw when learning penalty reasons is null', () => {
    const router = createRouter();
    const modelId = Object.keys(router.models)[0];

    router._applyLearningPenalties = () => ({
      scorePenalty: 0.25,
      reasons: null,
    });

    expect(() => router._scoreModel(modelId, {})).not.toThrow();
  });

  test('provider pressure reasons remain safe with non-array inputs', () => {
    const router = createRouter();
    const provider = 'openai';

    router.providerPressures.set(provider, {
      until: Date.now() + 5000,
      reasons: 'existing-string-reason',
    });

    expect(() => {
      router._setProviderPressure(provider, {
        severity: 'high',
        reasons: { bad: true },
      });
    }).not.toThrow();

    const pressureReasons = router.providerPressures.get(provider).reasons;
    expect(Array.isArray(pressureReasons)).toBe(true);
    expect(pressureReasons).toContain('generic');
  });

  test('policy score adjustments fail open on non-array and empty candidates', () => {
    const router = createRouter();

    expect(() => router._computePolicyScoreAdjustments(null, {})).not.toThrow();
    expect(() => router._computePolicyScoreAdjustments([], {})).not.toThrow();

    const none = router._computePolicyScoreAdjustments(null, {});
    const empty = router._computePolicyScoreAdjustments([], {});
    expect(none).toEqual({ adjustments: {}, reason: null });
    expect(empty).toEqual({ adjustments: {}, reason: null });
  });

  test('context text ignores non-array strength inputs', () => {
    const router = createRouter();

    expect(() => {
      const text = router._adapter._buildContextText({
        taskType: 'debug',
        required_strengths: { invalid: true },
        requiredStrengths: 'not-an-array',
      });
      expect(text).toContain('debug');
    }).not.toThrow();
  });
});
