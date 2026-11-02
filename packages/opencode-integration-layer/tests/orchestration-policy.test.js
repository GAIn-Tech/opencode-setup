'use strict';

const { describe, test, expect } = require('bun:test');
const {
  computeCombinedBudgetScore,
  resolveOrchestrationPolicy,
} = require('../src/orchestration-policy.js');

describe('orchestration-policy contract', () => {
  test('computes combined budget score from context and cost pressure', () => {
    const combined = computeCombinedBudgetScore({
      contextPressure: 0.8,
      costPressure: 0.2,
    });

    expect(combined.score).toBe(0.62);
    expect(combined.contextPressure).toBe(0.8);
    expect(combined.costPressure).toBe(0.2);
    expect(combined.weights).toEqual({ context: 0.7, cost: 0.3 });
    expect(combined.band).toBe('medium');
  });

  test('fails open for missing or invalid budget inputs', () => {
    const combined = computeCombinedBudgetScore({
      contextPressure: null,
      costPressure: 'not-a-number',
    });

    expect(combined.score).toBe(0);
    expect(combined.contextPressure).toBe(0);
    expect(combined.costPressure).toBe(0);
    expect(combined.band).toBe('healthy');
  });

  test('returns explicit policy inputs and outputs with adaptive parallel caps', () => {
    const healthy = resolveOrchestrationPolicy({
      taskClassification: {
        category: 'deep',
        complexity: 'high',
      },
      budgetSignals: {
        contextPressure: 0.1,
        costPressure: 0.1,
      },
    });

    const pressured = resolveOrchestrationPolicy({
      taskClassification: {
        category: 'deep',
        complexity: 'high',
      },
      budgetSignals: {
        contextPressure: 0.95,
        costPressure: 0.9,
      },
    });

    expect(healthy.inputs.taskClassification.category).toBe('deep');
    expect(healthy.outputs.parallel.maxFanout).toBeGreaterThan(pressured.outputs.parallel.maxFanout);
    expect(healthy.outputs.parallel.maxConcurrency).toBeGreaterThan(pressured.outputs.parallel.maxConcurrency);
    expect(healthy.outputs.routing.weightHints.quality).toBeGreaterThan(pressured.outputs.routing.weightHints.quality);
    expect(healthy.outputs.routing.weightHints.cost).toBeLessThan(pressured.outputs.routing.weightHints.cost);
    expect(healthy.outputs.routing.fallback.allowFailOpen).toBe(true);
  });

  test('enforces deterministic precedence with force-serial override', () => {
    const policy = resolveOrchestrationPolicy({
      runtimeContext: {
        parallel: {
          forceSerial: true,
          requestedFanout: 12,
          requestedConcurrency: 8,
        },
      },
      taskClassification: {
        category: 'deep',
        complexity: 'high',
      },
      budgetSignals: {
        contextPressure: 0,
        costPressure: 0,
      },
    });

    expect(policy.outputs.parallel.maxFanout).toBe(1);
    expect(policy.outputs.parallel.maxConcurrency).toBe(1);
    expect(policy.explain.precedence.appliedRule).toBe('runtime.forceSerial');
    expect(policy.explain.precedence.orderedRules).toEqual([
      'runtime.forceSerial',
      'runtime.parallel.disabled',
      'task.baseCaps',
      'runtime.parallel.requestedCaps',
      'budget.adaptiveScale',
    ]);
  });

  test('returns deterministic defaults when advisory signals are absent', () => {
    const policy = resolveOrchestrationPolicy();

    expect(policy.contractVersion).toBe('1.0');
    expect(policy.inputs.runtimeContext).toEqual({});
    expect(policy.inputs.budgetSignals).toEqual({});
    expect(policy.inputs.taskClassification).toEqual({});
    expect(policy.outputs.parallel.maxFanout).toBeGreaterThanOrEqual(1);
    expect(policy.outputs.parallel.maxConcurrency).toBeGreaterThanOrEqual(1);
    expect(policy.outputs.routing.fallback.reason).toBe('advisory-inputs-missing');
    expect(policy.outputs.routing.fallback.allowFailOpen).toBe(true);
  });
});
