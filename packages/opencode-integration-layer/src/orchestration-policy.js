'use strict';

// === ORCHESTRATION POLICY CONSTANTS ===
// These define task execution caps and scaling factors.
// Could be externalized to a config file (e.g., orchestration-config.json) in the future.

const ORCHESTRATION_CAPS = Object.freeze({
  // Budget weights for combined scoring
  budgetWeights: {
    context: 0.7,
    cost: 0.3,
  },
  // Base fanout/concurrency caps per category
  categoryBase: {
    deep: { fanout: 30, concurrency: 25 },
    ultrabrain: { fanout: 25, concurrency: 20 },
    research: { fanout: 20, concurrency: 15 },
    architecture: { fanout: 20, concurrency: 15 },
    'unspecified-high': { fanout: 15, concurrency: 12 },
    'unspecified-low': { fanout: 15, concurrency: 12 },
    quick: { fanout: 10, concurrency: 8 },
    default: { fanout: 15, concurrency: 12 },
    'visual-engineering': { fanout: 20, concurrency: 15 },
    artistry: { fanout: 20, concurrency: 15 },
    writing: { fanout: 10, concurrency: 8 },
  },
  // Multipliers applied based on task complexity
  complexityMultipliers: {
    low: 0.8,
    moderate: 1,
    high: 1.2,
    critical: 1.35,
  },
  // Budget scaling factors by health band
  budgetScaleByBand: {
    critical: 0.35,
    high: 0.5,
    medium: 0.75,
    healthy: 1,
  },
  // Health band thresholds (score ranges)
  healthBands: {
    critical: 0.85,
    high: 0.65,
    medium: 0.4,
  },
});

// Precedence rules for policy resolution
const PRECEDENCE_RULES = Object.freeze([
  'runtime.forceSerial',
  'runtime.parallel.disabled',
  'task.baseCaps',
  'runtime.parallel.requestedCaps',
  'budget.adaptiveScale',
]);

// Backward compatibility aliases
const DEFAULT_BUDGET_WEIGHTS = ORCHESTRATION_CAPS.budgetWeights;
const CATEGORY_BASE_CAPS = ORCHESTRATION_CAPS.categoryBase;
const COMPLEXITY_MULTIPLIERS = ORCHESTRATION_CAPS.complexityMultipliers;

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.min(1, Math.max(0, numeric));
}

function asPositiveInt(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.floor(numeric);
}

function scoreToBand(score) {
  const { critical, high, medium } = ORCHESTRATION_CAPS.healthBands;
  if (score >= critical) return 'critical';
  if (score >= high) return 'high';
  if (score >= medium) return 'medium';
  return 'healthy';
}

function budgetScaleForBand(band) {
  return ORCHESTRATION_CAPS.budgetScaleByBand[band] ?? 1;
}

function getBaseCaps(taskClassification = {}) {
  const category = taskClassification.category || taskClassification.taskType || 'default';
  const complexity = String(taskClassification.complexity || 'moderate').toLowerCase();

  const base = CATEGORY_BASE_CAPS[category] || CATEGORY_BASE_CAPS.default;
  const multiplier = COMPLEXITY_MULTIPLIERS[complexity] || COMPLEXITY_MULTIPLIERS.moderate;

  return {
    category,
    complexity,
    fanout: Math.max(1, Math.floor(base.fanout * multiplier)),
    concurrency: Math.max(1, Math.floor(base.concurrency * multiplier)),
  };
}

function computeCombinedBudgetScore(signals = {}, options = {}) {
  const contextPressure = clamp01(signals.contextPressure ?? signals.context_pressure ?? signals.contextPct);
  const costPressure = clamp01(signals.costPressure ?? signals.cost_pressure ?? signals.costPct);

  const contextWeight = clamp01(options.contextWeight ?? DEFAULT_BUDGET_WEIGHTS.context);
  const costWeight = clamp01(options.costWeight ?? DEFAULT_BUDGET_WEIGHTS.cost);
  const weightSum = contextWeight + costWeight;

  const normalizedContextWeight = weightSum > 0 ? contextWeight / weightSum : DEFAULT_BUDGET_WEIGHTS.context;
  const normalizedCostWeight = weightSum > 0 ? costWeight / weightSum : DEFAULT_BUDGET_WEIGHTS.cost;

  const rawScore = (contextPressure * normalizedContextWeight) + (costPressure * normalizedCostWeight);
  const score = Math.round(rawScore * 100) / 100;

  return {
    score,
    band: scoreToBand(score),
    contextPressure,
    costPressure,
    weights: {
      context: Math.round(normalizedContextWeight * 100) / 100,
      cost: Math.round(normalizedCostWeight * 100) / 100,
    },
    components: {
      context: Math.round(contextPressure * normalizedContextWeight * 1000) / 1000,
      cost: Math.round(costPressure * normalizedCostWeight * 1000) / 1000,
    },
  };
}

function resolveOrchestrationPolicy(input = {}) {
  const runtimeContext = input.runtimeContext && typeof input.runtimeContext === 'object'
    ? input.runtimeContext
    : {};
  const budgetSignals = input.budgetSignals && typeof input.budgetSignals === 'object'
    ? input.budgetSignals
    : {};
  const taskClassification = input.taskClassification && typeof input.taskClassification === 'object'
    ? input.taskClassification
    : {};

  const combinedBudget = computeCombinedBudgetScore(budgetSignals, input.weights || {});
  const baseCaps = getBaseCaps(taskClassification);

  const orderedRules = [...PRECEDENCE_RULES];
  const runtimeParallel = runtimeContext.parallel && typeof runtimeContext.parallel === 'object'
    ? runtimeContext.parallel
    : {};

  let appliedRule = 'budget.adaptiveScale';

  if (runtimeParallel.forceSerial === true) {
    appliedRule = 'runtime.forceSerial';
  } else if (runtimeParallel.disabled === true) {
    appliedRule = 'runtime.parallel.disabled';
  }

  let maxFanout;
  let maxConcurrency;

  if (appliedRule === 'runtime.forceSerial' || appliedRule === 'runtime.parallel.disabled') {
    maxFanout = 1;
    maxConcurrency = 1;
  } else {
    const requestedFanout = asPositiveInt(runtimeParallel.requestedFanout);
    const requestedConcurrency = asPositiveInt(runtimeParallel.requestedConcurrency);

    const cappedFanout = requestedFanout ? Math.min(baseCaps.fanout, requestedFanout) : baseCaps.fanout;
    const cappedConcurrency = requestedConcurrency ? Math.min(baseCaps.concurrency, requestedConcurrency) : baseCaps.concurrency;

    const budgetScale = budgetScaleForBand(combinedBudget.band);
    maxFanout = Math.max(1, Math.floor(cappedFanout * budgetScale));
    maxConcurrency = Math.max(1, Math.floor(cappedConcurrency * budgetScale));
  }

  const qualityHint = Math.max(0.2, Math.min(0.8, 0.78 - (combinedBudget.score * 0.4)));
  const costHint = Math.max(0.1, Math.min(0.7, 0.12 + (combinedBudget.score * 0.35) + (combinedBudget.costPressure * 0.15)));
  const latencyHint = Math.max(0.05, 1 - qualityHint - costHint);

  const hasAdvisoryInputs = Object.keys(budgetSignals).length > 0;

  return {
    contractVersion: '1.0',
    failOpen: true,
    inputs: {
      runtimeContext,
      budgetSignals,
      taskClassification,
    },
    outputs: {
      parallel: {
        maxFanout,
        maxConcurrency,
      },
      routing: {
        weightHints: {
          quality: Math.round(qualityHint * 1000) / 1000,
          cost: Math.round(costHint * 1000) / 1000,
          latency: Math.round(latencyHint * 1000) / 1000,
        },
        fallback: {
          allowFailOpen: true,
          reason: hasAdvisoryInputs ? 'policy-applied' : 'advisory-inputs-missing',
          metadata: {
            combinedBudgetBand: combinedBudget.band,
            precedenceRule: appliedRule,
          },
        },
      },
    },
    explain: {
      budget: combinedBudget,
      baseCaps,
      precedence: {
        orderedRules,
        appliedRule,
      },
    },
  };
}

module.exports = {
  computeCombinedBudgetScore,
  resolveOrchestrationPolicy,
};
