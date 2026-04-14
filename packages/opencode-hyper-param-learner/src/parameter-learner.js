'use strict';

const ADAPTATION_STRATEGIES = Object.freeze({
  EMA: 'ema',
  BANDIT: 'bandit',
  THRESHOLD: 'threshold',
  NONE: 'none',
});

const SUPPORTED_STRATEGIES = new Set(Object.values(ADAPTATION_STRATEGIES));

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ensureFiniteNumber(value, fieldPath) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${fieldPath}: expected finite number`);
  }
}

function ensureInteger(value, fieldPath, min = 0) {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`Invalid ${fieldPath}: expected integer >= ${min}`);
  }
}

function ensureRange(value, fieldPath, min, max) {
  ensureFiniteNumber(value, fieldPath);
  if (value < min || value > max) {
    throw new Error(`Invalid ${fieldPath}: expected ${min} <= value <= ${max}`);
  }
}

function clamp01(value) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function validateBounds(bounds, fieldPath = 'learning_config.bounds') {
  if (!isPlainObject(bounds)) {
    throw new Error(`Invalid ${fieldPath}: expected object`);
  }

  for (const boundName of ['soft', 'hard']) {
    const bound = bounds[boundName];
    const boundPath = `${fieldPath}.${boundName}`;

    if (!isPlainObject(bound)) {
      throw new Error(`Invalid ${boundPath}: expected object`);
    }

    ensureFiniteNumber(bound.min, `${boundPath}.min`);
    ensureFiniteNumber(bound.max, `${boundPath}.max`);

    if (bound.min > bound.max) {
      throw new Error(
        `Invalid ${boundPath}: min (${bound.min}) must be <= max (${bound.max})`
      );
    }
  }

  if (bounds.soft.min < bounds.hard.min || bounds.soft.max > bounds.hard.max) {
    throw new Error(
      `Invalid ${fieldPath}: soft bounds must stay within hard bounds`
    );
  }
}

function validateParameter(parameter) {
  if (!isPlainObject(parameter)) {
    throw new Error('Invalid parameter: expected object');
  }

  ensureFiniteNumber(parameter.current_value, 'current_value');

  if (!isPlainObject(parameter.learning_config)) {
    throw new Error('Invalid learning_config: expected object');
  }

  const config = parameter.learning_config;
  if (typeof config.adaptation_strategy !== 'string') {
    throw new Error('Invalid learning_config.adaptation_strategy: expected string');
  }

  const strategy = config.adaptation_strategy.toLowerCase();
  if (!SUPPORTED_STRATEGIES.has(strategy)) {
    throw new Error(
      `Unsupported adaptation strategy: "${config.adaptation_strategy}"`
    );
  }

  if (!isPlainObject(config.triggers)) {
    throw new Error('Invalid learning_config.triggers: expected object');
  }

  ensureInteger(config.triggers.min_samples, 'learning_config.triggers.min_samples', 1);
  ensureRange(
    config.triggers.confidence_threshold,
    'learning_config.triggers.confidence_threshold',
    0,
    1
  );

  validateBounds(config.bounds, 'learning_config.bounds');

  if (!isPlainObject(config.exploration_policy)) {
    throw new Error('Invalid learning_config.exploration_policy: expected object');
  }

  const policy = config.exploration_policy;
  if (typeof policy.enabled !== 'boolean') {
    throw new Error('Invalid learning_config.exploration_policy.enabled: expected boolean');
  }

  ensureRange(policy.epsilon, 'learning_config.exploration_policy.epsilon', 0, 1);
  ensureRange(
    policy.annealing_rate,
    'learning_config.exploration_policy.annealing_rate',
    0,
    1
  );
}

class ParameterLearner {
  constructor(options = {}) {
    this._random = typeof options.random === 'function' ? options.random : Math.random;
    this._warn = typeof options.warn === 'function' ? options.warn : (message) => {
      console.warn(message);
    };
    this._defaultAlpha =
      typeof options.defaultAlpha === 'number' && Number.isFinite(options.defaultAlpha)
        ? options.defaultAlpha
        : 0.2;
    this._defaultThreshold =
      typeof options.defaultThreshold === 'number' && Number.isFinite(options.defaultThreshold)
        ? options.defaultThreshold
        : 0.05;
  }

  computeConfidence(sampleCount, minSamples) {
    ensureInteger(sampleCount, 'sample_count', 0);
    ensureInteger(minSamples, 'min_samples', 1);

    return clamp01(sampleCount / minSamples);
  }

  checkBounds(value, bounds) {
    validateBounds(bounds);

    const hard = bounds.hard;
    if (value < hard.min || value > hard.max) {
      return {
        blocked: true,
        warning: false,
        reason: `Hard bounds exceeded: ${value} is outside [${hard.min}, ${hard.max}]`,
      };
    }

    const soft = bounds.soft;
    if (value <= soft.min || value >= soft.max) {
      return {
        blocked: false,
        warning: true,
        reason: `Soft bounds warning: ${value} is near edge [${soft.min}, ${soft.max}]`,
      };
    }

    return {
      blocked: false,
      warning: false,
      reason: null,
    };
  }

  executeExplorationPolicy(parameter) {
    validateParameter(parameter);

    const policy = parameter.learning_config.exploration_policy;
    const hard = parameter.learning_config.bounds.hard;
    const epsilonBefore = policy.epsilon;
    const epsilonAfter = clamp01(epsilonBefore * policy.annealing_rate);

    let explored = false;
    let exploredValue = null;

    if (policy.enabled && this._random() < epsilonBefore) {
      explored = true;
      exploredValue = hard.min + this._random() * (hard.max - hard.min);
    }

    return {
      explored,
      explored_value: exploredValue,
      epsilon_before: epsilonBefore,
      epsilon_after: epsilonAfter,
    };
  }

  learn(parameter, signal, sampleCount = 0) {
    validateParameter(parameter);
    ensureFiniteNumber(signal, 'signal');
    ensureInteger(sampleCount, 'sample_count', 0);

    const config = parameter.learning_config;
    const strategy = config.adaptation_strategy.toLowerCase();
    const currentValue = parameter.current_value;
    const confidence = this.computeConfidence(sampleCount, config.triggers.min_samples);
    const threshold = config.triggers.confidence_threshold;
    const exploration = this.executeExplorationPolicy(parameter);

    const result = {
      strategy,
      previous_value: currentValue,
      value: currentValue,
      changed: false,
      blocked: false,
      reason: 'no_change',
      confidence,
      confidence_threshold: threshold,
      sample_count: sampleCount,
      min_samples: config.triggers.min_samples,
      warnings: [],
      exploration,
    };

    if (confidence < threshold) {
      result.blocked = true;
      result.reason = 'confidence_below_threshold';
      return result;
    }

    let candidate = currentValue;

    if (strategy === ADAPTATION_STRATEGIES.NONE) {
      result.reason = 'strategy_none';
      return result;
    }

    if (strategy === ADAPTATION_STRATEGIES.EMA) {
      const alpha = Number.isFinite(config.alpha) ? config.alpha : this._defaultAlpha;
      candidate = currentValue * (1 - alpha) + signal * alpha;
      result.reason = 'ema_update';
    } else if (strategy === ADAPTATION_STRATEGIES.BANDIT) {
      if (exploration.explored) {
        candidate = exploration.explored_value;
        result.reason = 'bandit_explore';
      } else {
        const alpha = Number.isFinite(config.alpha) ? config.alpha : this._defaultAlpha;
        candidate = currentValue * (1 - alpha) + signal * alpha;
        result.reason = 'bandit_exploit';
      }
    } else if (strategy === ADAPTATION_STRATEGIES.THRESHOLD) {
      const thresholdDelta = Number.isFinite(config.threshold)
        ? config.threshold
        : this._defaultThreshold;
      if (Math.abs(signal - currentValue) <= thresholdDelta) {
        result.reason = 'threshold_not_met';
        return result;
      }

      candidate = signal;
      result.reason = 'threshold_update';
    }

    const boundsCheck = this.checkBounds(candidate, config.bounds);
    if (boundsCheck.blocked) {
      result.blocked = true;
      result.reason = 'hard_bounds_exceeded';
      result.warnings.push(boundsCheck.reason);
      return result;
    }

    if (boundsCheck.warning) {
      result.warnings.push(boundsCheck.reason);
      this._warn(`[ParameterLearner] ${parameter.name || 'unknown'}: ${boundsCheck.reason}`);
    }

    result.value = candidate;
    result.changed = candidate !== currentValue;
    return result;
  }
}

module.exports = {
  ADAPTATION_STRATEGIES,
  ParameterLearner,
};
