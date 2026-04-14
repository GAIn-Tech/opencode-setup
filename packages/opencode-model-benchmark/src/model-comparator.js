/**
 * ModelComparator - Compares models across multiple dimensions
 *
 * Task 9 (hyper-param-learning-system):
 * - Extend weights from global → per-model
 * - Register per-model hyper-parameters and adapt weights based on prediction accuracy
 */

import { createRequire } from 'node:module';

const DEFAULT_GLOBAL_WEIGHTS = Object.freeze({
  benchmark: 0.4,
  cost: 0.2,
  latency: 0.2,
  reliability: 0.2,
});

const WEIGHT_DIMS = Object.freeze(['benchmark', 'cost', 'latency', 'reliability']);

let HyperParameterRegistry = null;
let FeedbackCollector = null;
let ParameterLearner = null;

// Fail-open: this package is library-only and should remain usable without the learner.
try {
  const require = createRequire(import.meta.url);
  ({ HyperParameterRegistry } = require('../../opencode-hyper-param-learner/src/index.js'));
  ({ FeedbackCollector } = require('../../opencode-hyper-param-learner/src/feedback-collector.js'));
  ({ ParameterLearner } = require('../../opencode-hyper-param-learner/src/parameter-learner.js'));
} catch {
  HyperParameterRegistry = null;
  FeedbackCollector = null;
  ParameterLearner = null;
}

function clampNumber(value, min, max, fallback) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function normalizeModelIdForParam(modelId) {
  const raw = String(modelId || '').trim().toLowerCase();
  if (!raw) return 'unknown';
  const cleaned = raw
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return cleaned || 'unknown';
}

function sanitizeWeightVector(raw, fallback) {
  const out = {};
  for (const dim of WEIGHT_DIMS) {
    const v = raw && typeof raw === 'object' ? raw[dim] : undefined;
    const fb = fallback && typeof fallback === 'object' ? fallback[dim] : 0;
    out[dim] = clampNumber(v, 0, 1, clampNumber(fb, 0, 1, 0));
  }
  return out;
}

function normalizeNoSumAboveOne(weights) {
  let sum = 0;
  for (const dim of WEIGHT_DIMS) sum += weights[dim] || 0;
  if (sum <= 1) return weights;

  // Normalization rule: never allow per-model weights to sum above 1.0.
  const scaled = {};
  for (const dim of WEIGHT_DIMS) scaled[dim] = (weights[dim] || 0) / sum;
  return scaled;
}

function isNeutralPairwiseScore(score) {
  // Pairwise comparators often output {1, 0.5} or {0.5, 1}. A 0.5 score is neutral.
  return typeof score === 'number' && Number.isFinite(score) && Math.abs(score - 0.5) < 1e-12;
}

export class ModelComparator {
  constructor(options = {}) {
    // Backward compatibility: allow passing global weights in `options.weights`.
    this.weights = sanitizeWeightVector(options.weights, DEFAULT_GLOBAL_WEIGHTS);

    // Explicit per-model overrides (optional). Map: { [modelId]: { benchmark, cost, latency, reliability } }
    this.modelWeights = options.modelWeights || options.perModelWeights || {};

    // Hyper-param + feedback wiring (fail-open).
    this._hyperParams = options.hyperParamRegistry || null;
    if (!this._hyperParams && HyperParameterRegistry) {
      try {
        this._hyperParams = new HyperParameterRegistry();
      } catch {
        this._hyperParams = null;
      }
    }

    this._feedbackCollector = options.feedbackCollector || null;
    if (!this._feedbackCollector && FeedbackCollector) {
      try {
        this._feedbackCollector = new FeedbackCollector({ registry: this._hyperParams });
      } catch {
        this._feedbackCollector = null;
      }
    }

    this._parameterLearner = options.parameterLearner || null;
    if (!this._parameterLearner && ParameterLearner) {
      try {
        this._parameterLearner = new ParameterLearner();
      } catch {
        this._parameterLearner = null;
      }
    }

    // In-memory sample counts for confidence gating.
    this._weightSampleCounts = new Map(); // paramName -> integer
  }

  _getParamName(modelId, dimension) {
    const normalized = normalizeModelIdForParam(modelId);
    return `model_weight_${normalized}_${dimension}`;
  }

  _getDefaultWeightFor(modelId, dimension) {
    // Prefer explicit per-model overrides, else fall back to global defaults.
    const direct = this.modelWeights && typeof this.modelWeights === 'object'
      ? this.modelWeights[modelId]
      : null;
    const directNorm = this.modelWeights && typeof this.modelWeights === 'object'
      ? this.modelWeights[normalizeModelIdForParam(modelId)]
      : null;
    const base = sanitizeWeightVector(direct || directNorm || this.weights, this.weights);
    return clampNumber(base[dimension], 0, 1, clampNumber(DEFAULT_GLOBAL_WEIGHTS[dimension], 0, 1, 0));
  }

  _ensureModelWeightParams(modelId) {
    if (!this._hyperParams) return;
    const normalized = normalizeModelIdForParam(modelId);

    for (const dim of WEIGHT_DIMS) {
      const name = `model_weight_${normalized}_${dim}`;

      try {
        if (!this._hyperParams.has(name)) {
          this._hyperParams.register({
            name,
            current_value: this._getDefaultWeightFor(modelId, dim),
            learning_config: {
              adaptation_strategy: 'ema',
              triggers: {
                outcome_type: 'success/failure',
                min_samples: 20,
                confidence_threshold: 0.8,
              },
              bounds: {
                soft: { min: 0, max: 1 },
                hard: { min: 0, max: 1 },
              },
              exploration_policy: {
                enabled: false,
                epsilon: 0,
                annealing_rate: 0,
              },
            },
            grouping: {
              group_by_task_type: false,
              group_by_complexity: false,
              aggregate_function: 'mean',
            },
            individual_tracking: {
              per_session: false,
              per_task: false,
            },
          });
        }
      } catch {
        // Fail-open: registry may be readonly/invalid; keep runtime defaults.
      }
    }

    // Enforce normalization invariant at rest.
    this._normalizeAndPersistModelWeights(modelId);
  }

  _readModelWeightVector(modelId) {
    // Start from global defaults.
    let resolved = sanitizeWeightVector(this.weights, DEFAULT_GLOBAL_WEIGHTS);

    // Apply explicit per-model overrides.
    const direct = this.modelWeights && typeof this.modelWeights === 'object'
      ? this.modelWeights[modelId]
      : null;
    const directNorm = this.modelWeights && typeof this.modelWeights === 'object'
      ? this.modelWeights[normalizeModelIdForParam(modelId)]
      : null;
    if (direct || directNorm) {
      resolved = sanitizeWeightVector(direct || directNorm, resolved);
    }

    // Apply hyper-parameter overrides (if available).
    if (this._hyperParams) {
      this._ensureModelWeightParams(modelId);
      const hp = {};
      for (const dim of WEIGHT_DIMS) {
        const name = this._getParamName(modelId, dim);
        try {
          const param = this._hyperParams.get(name);
          if (param && typeof param.current_value === 'number' && Number.isFinite(param.current_value)) {
            hp[dim] = param.current_value;
          }
        } catch {
          // ignore
        }
      }
      resolved = sanitizeWeightVector(hp, resolved);
    }

    return normalizeNoSumAboveOne(resolved);
  }

  _normalizeAndPersistModelWeights(modelId) {
    if (!this._hyperParams) return;

    const normalizedId = normalizeModelIdForParam(modelId);
    const current = {};

    for (const dim of WEIGHT_DIMS) {
      const name = `model_weight_${normalizedId}_${dim}`;
      try {
        const param = this._hyperParams.get(name);
        current[dim] = clampNumber(param?.current_value, 0, 1, this._getDefaultWeightFor(modelId, dim));
      } catch {
        current[dim] = this._getDefaultWeightFor(modelId, dim);
      }
    }

    const fixed = normalizeNoSumAboveOne(current);
    for (const dim of WEIGHT_DIMS) {
      const name = `model_weight_${normalizedId}_${dim}`;
      const next = clampNumber(fixed[dim], 0, 1, this._getDefaultWeightFor(modelId, dim));
      try {
        this._hyperParams.update(name, { current_value: next });
      } catch {
        // ignore
      }
    }
  }

  /**
   * Compare two models and return scores
   */
  compare(modelA, modelB, data) {
    const scores = {
      modelA: 0,
      modelB: 0,
      breakdown: {}
    };

    const weightsA = this._readModelWeightVector(modelA);
    const weightsB = this._readModelWeightVector(modelB);

    // Benchmark comparison
    if (data.benchmarks) {
      const benchmarkScore = this.compareBenchmarks(
        data.benchmarks[modelA], 
        data.benchmarks[modelB]
      );
      scores.breakdown.benchmark = benchmarkScore;
      scores.modelA += benchmarkScore.modelA * weightsA.benchmark;
      scores.modelB += benchmarkScore.modelB * weightsB.benchmark;
    }

    // Cost comparison (lower is better)
    if (data.cost) {
      const costScore = this.compareCost(data.cost[modelA], data.cost[modelB]);
      scores.breakdown.cost = costScore;
      scores.modelA += costScore.modelA * weightsA.cost;
      scores.modelB += costScore.modelB * weightsB.cost;
    }

    // Latency comparison (lower is better)
    if (data.latency) {
      const latencyScore = this.compareLatency(
        data.latency[modelA], 
        data.latency[modelB]
      );
      scores.breakdown.latency = latencyScore;
      scores.modelA += latencyScore.modelA * weightsA.latency;
      scores.modelB += latencyScore.modelB * weightsB.latency;
    }

    // Reliability comparison
    if (data.reliability) {
      const reliabilityScore = this.compareReliability(
        data.reliability[modelA],
        data.reliability[modelB]
      );
      scores.breakdown.reliability = reliabilityScore;
      scores.modelA += reliabilityScore.modelA * weightsA.reliability;
      scores.modelB += reliabilityScore.modelB * weightsB.reliability;
    }

    scores.winner = scores.modelA > scores.modelB ? modelA : 
                    scores.modelB > scores.modelA ? modelB : 'tie';

    // Optional learning hook: if an outcome is provided, treat the weighted winner as a prediction
    // and adapt per-model weights based on whether the scoring predicted success.
    const actualWinner = this._extractActualWinner(modelA, modelB, data);
    if (actualWinner && actualWinner !== 'tie' && scores.winner !== 'tie') {
      this._recordPredictionFeedback(modelA, modelB, scores.winner, actualWinner);
      this._adaptWeightsFromOutcome(modelA, modelB, scores.breakdown, scores.winner, actualWinner);
    }

    return scores;
  }

  _extractActualWinner(modelA, modelB, data) {
    const outcome = data && typeof data === 'object' ? data.outcome : null;
    if (!outcome || typeof outcome !== 'object') return null;

    // Explicit winner fields
    const explicit = outcome.winner || outcome.actual_winner || outcome.success_model_id || outcome.success_model;
    if (explicit === modelA || explicit === modelB) return explicit;

    // Boolean maps: { success_by_model: { [modelId]: boolean } } or { success: { [modelId]: boolean } }
    const map = outcome.success_by_model || outcome.successByModel || outcome.success;
    if (map && typeof map === 'object') {
      const a = Boolean(map[modelA]);
      const b = Boolean(map[modelB]);
      if (a && !b) return modelA;
      if (b && !a) return modelB;
    }

    return null;
  }

  _recordPredictionFeedback(modelA, modelB, predictedWinner, actualWinner) {
    if (!this._feedbackCollector) return;

    const predictedA = predictedWinner === modelA;
    const actualA = actualWinner === modelA;
    const meta = {
      kind: 'model_comparator_prediction',
      modelA,
      modelB,
      predicted_winner: predictedWinner,
      actual_winner: actualWinner,
    };

    // Non-blocking: FeedbackCollector queues work.
    try {
      this._feedbackCollector.recordPrecision({ predicted: predictedA, actual: actualA }, meta);
      this._feedbackCollector.recordOutcome({ success: predictedWinner === actualWinner }, meta);
    } catch {
      // ignore
    }
  }

  _adaptWeightsFromOutcome(modelA, modelB, breakdown, predictedWinner, actualWinner) {
    if (!this._hyperParams || !this._parameterLearner) return;
    if (!breakdown || typeof breakdown !== 'object') return;

    const models = [modelA, modelB];
    for (const modelId of models) {
      this._ensureModelWeightParams(modelId);
    }

    // Success = actual winner. Failure = the other model.
    const isSuccess = (modelId) => modelId === actualWinner;

    // Use dimension-level agreement with outcome as the learning signal.
    // If the model succeeded and a dimension favored it, weight should increase; if the model failed
    // but a dimension favored it, weight should decrease. Neutral dimensions → 0.5.
    for (const dim of WEIGHT_DIMS) {
      const dimScore = breakdown[dim];
      if (!dimScore || typeof dimScore !== 'object') continue;
      const aScore = clampNumber(dimScore.modelA, 0, 1, 0.5);
      const bScore = clampNumber(dimScore.modelB, 0, 1, 0.5);

      const updateOne = (modelId, score) => {
        const name = this._getParamName(modelId, dim);
        let param;
        try {
          param = this._hyperParams.get(name);
        } catch {
          return;
        }
        if (!param) return;

        const neutral = isNeutralPairwiseScore(score);
        const success = isSuccess(modelId);

        let signal;
        if (neutral) {
          signal = 0.5;
        } else if (success) {
          signal = score > 0.5 ? 1 : 0;
        } else {
          signal = score > 0.5 ? 0 : 1;
        }

        const prevCount = this._weightSampleCounts.get(name) || 0;
        const nextCount = prevCount + 1;
        this._weightSampleCounts.set(name, nextCount);

        let learned;
        try {
          learned = this._parameterLearner.learn(param, signal, nextCount);
        } catch {
          return;
        }

        if (learned && !learned.blocked && typeof learned.value === 'number' && Number.isFinite(learned.value)) {
          try {
            this._hyperParams.update(name, { current_value: clampNumber(learned.value, 0, 1, param.current_value) });
          } catch {
            // ignore
          }
        }
      };

      updateOne(modelA, aScore);
      updateOne(modelB, bScore);
    }

    // Enforce invariants at rest after updates.
    this._normalizeAndPersistModelWeights(modelA);
    this._normalizeAndPersistModelWeights(modelB);
  }

  compareBenchmarks(a, b) {
    if (!a || !b) return { modelA: 0.5, modelB: 0.5 };
    
    const aScore = (a.passAt1 || 0) + (a.passAt10 || 0) / 10;
    const bScore = (b.passAt1 || 0) + (b.passAt10 || 0) / 10;
    const total = aScore + bScore || 1;
    
    return {
      modelA: aScore / total,
      modelB: bScore / total
    };
  }

  compareCost(costA, costB) {
    const lower = Math.min(costA || Infinity, costB || Infinity);
    return {
      modelA: costA === lower ? 1 : 0.5,
      modelB: costB === lower ? 1 : 0.5
    };
  }

  compareLatency(latA, latB) {
    const lower = Math.min(latA || Infinity, latB || Infinity);
    return {
      modelA: latA === lower ? 1 : 0.5,
      modelB: latB === lower ? 1 : 0.5
    };
  }

  compareReliability(relA, relB) {
    return {
      modelA: relA || 0.5,
      modelB: relB || 0.5
    };
  }

  /**
   * Rank multiple models
   */
  rank(models, data) {
    const rankings = models.map((model) => ({
      modelId: model,
      score: 0,
      breakdown: {},
    }));

    const d = data && typeof data === 'object' ? data : {};

    // Precompute normalization baselines across the candidate set.
    let maxBenchmarkRaw = 0;
    if (d.benchmarks) {
      for (const id of models) {
        const b = d.benchmarks[id];
        const raw = (b?.passAt1 || 0) + (b?.passAt10 || 0) / 10;
        if (raw > maxBenchmarkRaw) maxBenchmarkRaw = raw;
      }
    }

    const minCost = d.cost
      ? Math.min(...models.map((id) => (typeof d.cost[id] === 'number' ? d.cost[id] : Infinity)))
      : Infinity;
    const minLatency = d.latency
      ? Math.min(...models.map((id) => (typeof d.latency[id] === 'number' ? d.latency[id] : Infinity)))
      : Infinity;

    for (const ranking of rankings) {
      const modelId = ranking.modelId;
      const w = this._readModelWeightVector(modelId);

      // Benchmark: normalize to [0,1] by best-in-set.
      if (d.benchmarks?.[modelId]) {
        const b = d.benchmarks[modelId];
        const raw = (b?.passAt1 || 0) + (b?.passAt10 || 0) / 10;
        const norm = maxBenchmarkRaw > 0 ? raw / maxBenchmarkRaw : 0;
        ranking.score += clampNumber(norm, 0, 1, 0) * w.benchmark;
        ranking.breakdown.benchmark = clampNumber(norm, 0, 1, 0);
      }

      // Cost: lower is better; normalize as min/value.
      if (d.cost && typeof d.cost[modelId] === 'number' && Number.isFinite(d.cost[modelId])) {
        const v = d.cost[modelId];
        const norm = minCost < Infinity && v > 0 ? minCost / v : 0.5;
        ranking.score += clampNumber(norm, 0, 1, 0.5) * w.cost;
        ranking.breakdown.cost = clampNumber(norm, 0, 1, 0.5);
      }

      // Latency: lower is better; normalize as min/value.
      if (d.latency && typeof d.latency[modelId] === 'number' && Number.isFinite(d.latency[modelId])) {
        const v = d.latency[modelId];
        const norm = minLatency < Infinity && v > 0 ? minLatency / v : 0.5;
        ranking.score += clampNumber(norm, 0, 1, 0.5) * w.latency;
        ranking.breakdown.latency = clampNumber(norm, 0, 1, 0.5);
      }

      // Reliability: expected already [0,1].
      if (d.reliability && typeof d.reliability[modelId] === 'number' && Number.isFinite(d.reliability[modelId])) {
        const norm = clampNumber(d.reliability[modelId], 0, 1, 0.5);
        ranking.score += norm * w.reliability;
        ranking.breakdown.reliability = norm;
      }
    }

    rankings.sort((a, b) => b.score - a.score);
    return rankings;
  }
}

export default ModelComparator;
