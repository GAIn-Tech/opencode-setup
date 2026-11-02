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
  router._filterByConstraints = () => ['model-a', 'model-b'];
  router._scoreModel = (modelId) => ({
    score: modelId === 'model-a' ? 0.95 : 0.7,
    reason: `score:${modelId}`,
  });
  router._applyBenchmarkBonus = () => ({ bonus: 0, reason: null });
  router._applyCostEfficiency = () => ({ bonus: 0, reason: null });
  router._applyBudgetPenalty = () => ({ penalty: 0, reason: null });
  router._applyLearningPenalties = () => ({ scorePenalty: 0, reasons: [] });

  router.models = {
    'model-a': { id: 'model-a', provider: 'provider-a', cost_per_1k_tokens: 0.22 },
    'model-b': { id: 'model-b', provider: 'provider-b', cost_per_1k_tokens: 0.03 },
  };

  router.stats = {
    'model-a': { calls: 0, successes: 0, failures: 0, total_latency_ms: 0 },
    'model-b': { calls: 0, successes: 0, failures: 0, total_latency_ms: 0 },
  };

  router.rotators = {
    'provider-a': { getNextKey: () => ({ id: 'k-a', value: 'a' }) },
    'provider-b': { getNextKey: () => ({ id: 'k-b', value: 'b' }) },
  };

  return router;
}

describe('provider pressure-aware routing', () => {
  test('applies provider quarantine from API pressure signals during pressure window', () => {
    const originalNow = Date.now;
    Date.now = () => 1_000;

    try {
      const router = createRouter();
      const baseline = router.route({ taskType: 'analysis' });
      expect(baseline.modelId).toBe('model-a');

      router.recordResult('model-a', false, {
        status: 429,
        message: 'Too many requests',
      });

      expect(router.providerPressures.get('provider-a')?.until).toBeGreaterThan(1_000);

      const rerouted = router.route({ taskType: 'analysis' });
      expect(rerouted.modelId).toBe('model-b');
    } finally {
      Date.now = originalNow;
    }
  });

  test('provider is eligible again after pressure expiry', () => {
    const originalNow = Date.now;
    let now = 5_000;
    Date.now = () => now;

    try {
      const router = createRouter();
      router.recordResult('model-a', false, {
        statusCode: 429,
        message: 'rate limit exceeded',
      });

      const duringCooldown = router.route({ taskType: 'analysis' });
      expect(duringCooldown.modelId).toBe('model-b');

      now = 200_000;
      const afterCooldown = router.route({ taskType: 'analysis' });
      expect(afterCooldown.modelId).toBe('model-a');
    } finally {
      Date.now = originalNow;
    }
  });

  test('budget/health pressure signals can trigger provider quarantine without API errors', () => {
    const router = createRouter();

    const result = router.route({
      taskType: 'analysis',
      budgetSignals: {
        contextBudget: { band: 'critical', pct: 0.91 },
      },
      providerHealthSignals: {
        'provider-a': { severity: 'high', reason: 'sustained overload' },
      },
    });

    expect(result.modelId).toBe('model-b');
    expect(router.providerPressures.get('provider-a')?.reasons || []).toContain('health');
    expect(router.providerPressures.get('provider-a')?.reasons || []).toContain('budget');
  });

  test('invalid or missing pressure signals fail open', () => {
    const router = createRouter();

    router.recordResult('model-a', false, {
      status: 'unknown',
      code: 1234,
      message: null,
    });
    router.recordResult('model-a', false, null);

    const result = router.route({
      taskType: 'analysis',
      budgetSignals: { contextBudget: { band: null, pct: 'NaN' } },
      providerHealthSignals: {
        'provider-a': { severity: 'tiny', reason: null },
      },
    });

    expect(router.providerPressures.size).toBe(0);
    expect(result.modelId).toBe('model-a');
  });
});
