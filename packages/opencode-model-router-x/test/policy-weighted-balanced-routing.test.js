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
  router._filterByConstraints = () => ['quality-max', 'budget-safe'];
  router._filterByHealth = (candidateIds) => candidateIds;
  router._applyBenchmarkBonus = () => ({ bonus: 0, reason: null });
  router._applyCostEfficiency = () => ({ bonus: 0, reason: null });
  router._applyBudgetPenalty = () => ({ penalty: 0, reason: null });
  router._applyLearningPenalties = () => ({ scorePenalty: 0, reasons: [] });

  router.models = {
    'quality-max': {
      id: 'quality-max',
      provider: 'quality-provider',
      default_success_rate: 0.9,
      default_latency_ms: 1900,
      cost_per_1k_tokens: 0.2,
      task_types: ['analysis'],
      strengths: ['reasoning'],
    },
    'budget-safe': {
      id: 'budget-safe',
      provider: 'budget-provider',
      default_success_rate: 0.83,
      default_latency_ms: 500,
      cost_per_1k_tokens: 0.02,
      task_types: ['analysis'],
      strengths: ['reasoning'],
    },
  };

  router.stats = {
    'quality-max': { calls: 0, successes: 0, failures: 0, total_latency_ms: 0 },
    'budget-safe': { calls: 0, successes: 0, failures: 0, total_latency_ms: 0 },
  };

  router.rotators = {
    'quality-provider': { getNextKey: () => ({ id: 'k-q', value: 'q' }) },
    'budget-provider': { getNextKey: () => ({ id: 'k-b', value: 'b' }) },
  };

  return router;
}

function baseContext() {
  return {
    taskType: 'analysis',
    requiredStrengths: ['reasoning'],
  };
}

describe('policy-weighted balanced routing objective', () => {
  test('quality-priority policy prefers stronger model under healthy budget', () => {
    const router = createRouter();

    const result = router.route({
      ...baseContext(),
      policyDecision: {
        outputs: {
          routing: {
            weightHints: {
              quality: 0.76,
              cost: 0.14,
              latency: 0.1,
            },
            fallback: {
              metadata: {
                combinedBudgetBand: 'healthy',
              },
            },
          },
        },
      },
    });

    expect(result.modelId).toBe('quality-max');
    expect(result.reason).toContain('policy-hints');
  });

  test('high budget-pressure policy shifts selection to lower-cost acceptable model', () => {
    const router = createRouter();

    const result = router.route({
      ...baseContext(),
      policyDecision: {
        outputs: {
          routing: {
            weightHints: {
              quality: 0.22,
              cost: 0.56,
              latency: 0.22,
            },
            fallback: {
              metadata: {
                combinedBudgetBand: 'critical',
              },
            },
          },
        },
      },
    });

    expect(result.modelId).toBe('budget-safe');
    expect(result.reason).toContain('policy-hints');
  });

  test('missing policy hints preserves baseline scoring behavior parity', () => {
    const router = createRouter();

    const baseline = router.route(baseContext());
    const withoutHints = router.route({
      ...baseContext(),
      policyDecision: {
        outputs: {
          routing: {},
        },
      },
    });

    expect(withoutHints.modelId).toBe(baseline.modelId);
    expect(withoutHints.score).toBeCloseTo(baseline.score, 6);
  });

  test('policy parsing errors fail open and remain deterministic', () => {
    const router = createRouter();

    const baseline = router.route(baseContext());
    const throwingDecision = {
      outputs: {
        routing: {
          get weightHints() {
            throw new Error('policy adapter unavailable');
          },
        },
      },
    };

    const result = router.route({
      ...baseContext(),
      policyDecision: throwingDecision,
    });

    expect(result.modelId).toBe(baseline.modelId);
    expect(result.score).toBeCloseTo(baseline.score, 6);
  });
});
