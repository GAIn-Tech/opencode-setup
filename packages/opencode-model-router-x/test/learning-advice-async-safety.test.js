'use strict';

const { describe, test, expect } = require('bun:test');
const { ModelRouter } = require('../src/index.js');

class FakeCircuitBreaker {
  getState() {
    return 'closed';
  }
}

function createRouter(learningEngine) {
  return new ModelRouter({
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    learningEngine,
    circuitBreakerClass: FakeCircuitBreaker,
    healthCheck: { registerSubsystem: () => {} },
  });
}

describe('ModelRouter legacy learning advice safety', () => {
  test('fails open when legacy path receives async advise() Promise', () => {
    const router = createRouter({
      advise: async () => ({ warnings: [{ severity: 'high' }] }),
    });

    const advice = router._getLearningAdvice({ taskType: 'debug' });

    expect(advice).toEqual({
      warnings: [],
      suggestions: [],
      shouldPause: false,
      riskScore: 0,
    });
  });

  test('returns synchronous advice object when available', () => {
    const router = createRouter({
      advise: () => ({ warnings: [{ severity: 'low' }], suggestions: ['x'], riskScore: 7 }),
    });

    const advice = router._getLearningAdvice({ taskType: 'debug' });

    expect(advice.riskScore).toBe(7);
    expect(advice.warnings).toHaveLength(1);
  });
});
