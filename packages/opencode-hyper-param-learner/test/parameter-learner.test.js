'use strict';

const { describe, test, expect } = require('bun:test');

const {
  ADAPTATION_STRATEGIES,
  ParameterLearner,
} = require('../src/parameter-learner');

function makeRandomSequence(values) {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return value;
  };
}

function makeParameter(options = {}) {
  return {
    name: options.name || 'risk_threshold_default',
    current_value: options.currentValue ?? 50,
    learning_config: {
      adaptation_strategy: options.strategy || ADAPTATION_STRATEGIES.EMA,
      alpha: options.alpha ?? 0.2,
      threshold: options.threshold ?? 5,
      triggers: {
        outcome_type: 'feedback',
        min_samples: options.minSamples ?? 10,
        confidence_threshold: options.confidenceThreshold ?? 0.5,
      },
      bounds: {
        soft: {
          min: options.softMin ?? 10,
          max: options.softMax ?? 90,
        },
        hard: {
          min: options.hardMin ?? 0,
          max: options.hardMax ?? 100,
        },
      },
      exploration_policy: {
        enabled: options.explorationEnabled ?? true,
        epsilon: options.epsilon ?? 0.2,
        annealing_rate: options.annealingRate ?? 0.9,
      },
    },
  };
}

describe('ParameterLearner', () => {
  test('computes confidence from sample count and min_samples', () => {
    const learner = new ParameterLearner();

    expect(learner.computeConfidence(0, 10)).toBe(0);
    expect(learner.computeConfidence(5, 10)).toBe(0.5);
    expect(learner.computeConfidence(10, 10)).toBe(1);
    expect(learner.computeConfidence(25, 10)).toBe(1);
  });

  test('blocks learning when confidence is below threshold', () => {
    const learner = new ParameterLearner();
    const parameter = makeParameter({ confidenceThreshold: 0.8, minSamples: 10 });

    const result = learner.learn(parameter, 100, 2);

    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('confidence_below_threshold');
    expect(result.value).toBe(parameter.current_value);
    expect(result.changed).toBe(false);
  });

  test('applies EMA strategy update formula', () => {
    const learner = new ParameterLearner();
    const parameter = makeParameter({
      strategy: ADAPTATION_STRATEGIES.EMA,
      alpha: 0.1,
      confidenceThreshold: 0,
    });

    const result = learner.learn(parameter, 100, 10);

    expect(result.blocked).toBe(false);
    expect(result.reason).toBe('ema_update');
    expect(result.value).toBe(55); // 50 * 0.9 + 100 * 0.1
  });

  test('bandit explores random value and anneals epsilon', () => {
    const learner = new ParameterLearner({
      random: makeRandomSequence([0.05, 0.8]),
    });
    const parameter = makeParameter({
      strategy: ADAPTATION_STRATEGIES.BANDIT,
      epsilon: 0.2,
      annealingRate: 0.5,
      confidenceThreshold: 0,
    });

    const result = learner.learn(parameter, 40, 10);

    expect(result.reason).toBe('bandit_explore');
    expect(result.exploration.explored).toBe(true);
    expect(result.exploration.epsilon_before).toBe(0.2);
    expect(result.exploration.epsilon_after).toBe(0.1);
    expect(result.value).toBe(80); // hard.min + random(0.8) * range(100)
  });

  test('bandit exploits current signal path when exploration does not trigger', () => {
    const learner = new ParameterLearner({
      random: makeRandomSequence([0.95]),
    });
    const parameter = makeParameter({
      strategy: ADAPTATION_STRATEGIES.BANDIT,
      alpha: 0.2,
      epsilon: 0.2,
      confidenceThreshold: 0,
    });

    const result = learner.learn(parameter, 100, 10);

    expect(result.reason).toBe('bandit_exploit');
    expect(result.exploration.explored).toBe(false);
    expect(result.value).toBe(60); // 50 * 0.8 + 100 * 0.2
  });

  test('threshold strategy only updates when delta exceeds threshold', () => {
    const learner = new ParameterLearner();
    const parameter = makeParameter({
      strategy: ADAPTATION_STRATEGIES.THRESHOLD,
      threshold: 5,
      confidenceThreshold: 0,
    });

    const unchanged = learner.learn(parameter, 53, 10);
    expect(unchanged.reason).toBe('threshold_not_met');
    expect(unchanged.value).toBe(50);

    const changed = learner.learn(parameter, 61, 10);
    expect(changed.reason).toBe('threshold_update');
    expect(changed.value).toBe(61);
    expect(changed.changed).toBe(true);
  });

  test('none strategy keeps parameter static', () => {
    const learner = new ParameterLearner();
    const parameter = makeParameter({
      strategy: ADAPTATION_STRATEGIES.NONE,
      confidenceThreshold: 0,
    });

    const result = learner.learn(parameter, 100, 10);

    expect(result.reason).toBe('strategy_none');
    expect(result.value).toBe(50);
    expect(result.changed).toBe(false);
  });

  test('hard bounds violations are blocked', () => {
    const learner = new ParameterLearner();
    const parameter = makeParameter({
      strategy: ADAPTATION_STRATEGIES.THRESHOLD,
      threshold: 0,
      confidenceThreshold: 0,
      hardMax: 100,
      softMax: 90,
    });

    const result = learner.learn(parameter, 120, 10);

    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('hard_bounds_exceeded');
    expect(result.value).toBe(50);
    expect(result.warnings[0]).toMatch(/Hard bounds exceeded/);
  });

  test('soft bounds emit warning but allow update', () => {
    const warnings = [];
    const learner = new ParameterLearner({
      warn: (message) => warnings.push(message),
    });
    const parameter = makeParameter({
      strategy: ADAPTATION_STRATEGIES.THRESHOLD,
      threshold: 0,
      confidenceThreshold: 0,
      softMax: 90,
      hardMax: 100,
    });

    const result = learner.learn(parameter, 95, 10);

    expect(result.blocked).toBe(false);
    expect(result.value).toBe(95);
    expect(result.warnings.length).toBe(1);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/Soft bounds warning/);
  });
});
