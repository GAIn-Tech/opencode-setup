'use strict';

/**
 * FeedbackCollector
 *
 * Base implementation for collecting asynchronous feedback signals that can be
 * used to adapt hyper-parameters over time.
 *
 * Requirements:
 * - async + non-blocking signal ingestion (fire-and-forget safe)
 * - fail-open when sources/hooks throw or optional deps are unavailable
 */

const SIGNAL_TYPES = Object.freeze({
  outcome_signal: 'outcome_signal',
  precision_signal: 'precision_signal',
  efficiency_signal: 'efficiency_signal',
  stability_signal: 'stability_signal',
});

// Optional: used to apply learning_config gates (ema, thresholds, bounds).
const { ParameterLearner } = require('./parameter-learner');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function queueTask(fn) {
  // Bun + modern Node support queueMicrotask; fallback to Promise.
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(fn);
    return;
  }
  Promise.resolve().then(fn);
}

function safeCall(fn, ...args) {
  try {
    return fn(...args);
  } catch (err) {
    return { __error: err };
  }
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function welfordInit() {
  return { n: 0, mean: 0, m2: 0 };
}

function welfordPush(state, x) {
  const next = state || welfordInit();
  const n1 = next.n + 1;
  const delta = x - next.mean;
  const mean = next.mean + delta / n1;
  const delta2 = x - mean;
  return {
    n: n1,
    mean,
    m2: next.m2 + delta * delta2,
  };
}

function welfordVariance(state) {
  if (!state || state.n < 2) return 0;
  return state.m2 / (state.n - 1);
}

function normalizeKey(value) {
  if (typeof value !== 'string' || value.trim() === '') return 'general';
  let key = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  if (!key) key = 'general';
  if (!/^[a-z]/.test(key)) key = `t_${key}`;
  key = key.replace(/[^a-z0-9_]/g, '_');
  if (!/^[a-z][a-z0-9_]*$/.test(key)) return 'general';
  return key;
}

function initCorrelationState() {
  return { n: 0, sumX: 0, sumY: 0, sumXX: 0, sumYY: 0, sumXY: 0 };
}

function pushCorrelation(state, x, y) {
  const next = state || initCorrelationState();
  const n1 = next.n + 1;
  return {
    n: n1,
    sumX: next.sumX + x,
    sumY: next.sumY + y,
    sumXX: next.sumXX + x * x,
    sumYY: next.sumYY + y * y,
    sumXY: next.sumXY + x * y,
  };
}

function pearsonR(state) {
  if (!state || state.n < 2) return 0;
  const n = state.n;
  const num = n * state.sumXY - state.sumX * state.sumY;
  const denX = n * state.sumXX - state.sumX * state.sumX;
  const denY = n * state.sumYY - state.sumY * state.sumY;
  const den = Math.sqrt(Math.max(0, denX) * Math.max(0, denY));
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
  const r = num / den;
  if (!Number.isFinite(r)) return 0;
  return Math.max(-1, Math.min(1, r));
}

function clampToHardBounds(value, parameter, fallbackMin = 0.5, fallbackMax = 2.5) {
  const hard = parameter?.learning_config?.bounds?.hard;
  const min = Number.isFinite(hard?.min) ? hard.min : fallbackMin;
  const max = Number.isFinite(hard?.max) ? hard.max : fallbackMax;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

class FeedbackCollector {
  static SIGNAL_TYPES = SIGNAL_TYPES;

  constructor(options = {}) {
    this._now = typeof options.now === 'function' ? options.now : () => Date.now();
    this._registry = options.registry || null;

    // Optional learner for applying learning_config gates.
    this._parameterLearner = options.parameterLearner || (ParameterLearner ? new ParameterLearner() : null);

    this._listeners = new Map(); // event -> Set(fn)
    this._sources = new Map(); // name -> { detach }

    // Async processing chain (never rejects)
    this._queue = Promise.resolve();

    // Aggregates
    this._outcomeAgg = {
      type: SIGNAL_TYPES.outcome_signal,
      total: 0,
      success: 0,
      failure: 0,
      success_rate: null,
      last_at: null,
    };

    this._precisionAgg = {
      type: SIGNAL_TYPES.precision_signal,
      true_positive: 0,
      false_positive: 0,
      true_negative: 0,
      false_negative: 0,
      precision: null,
      recall: null,
      false_positive_rate: null,
      false_negative_rate: null,
      last_at: null,
    };

    this._efficiencyAgg = {
      type: SIGNAL_TYPES.efficiency_signal,
      samples: 0,
      avg_cost_ratio: null,
      avg_latency_ratio: null,
      avg_tokens_ratio: null,
      last_at: null,
      // internal sums
      _sum_cost_ratio: 0,
      _sum_latency_ratio: 0,
      _sum_tokens_ratio: 0,
      _count_cost: 0,
      _count_latency: 0,
      _count_tokens: 0,
    };

    this._stabilityAgg = {
      type: SIGNAL_TYPES.stability_signal,
      parameters: {},
      overall_variance_mean: 0,
      last_at: null,
      // internal Welford states by param
      _states: new Map(),
    };

    // Meta-awareness domain score → outcome correlation (per workflow)
    // Used to adapt domain_weight_* hyper-parameters.
    this._metaDomainCorr = {
      workflows: new Map(), // workflow -> Map(domainSlug -> correlationState)
      last_at: null,
    };
  }

  /**
   * Record meta-awareness domain scores + outcome feedback.
   *
   * Expected payload:
   * - workflow_type: string
   * - domain_scores: { [domainSlug]: number } (0..100)
   * - outcome: { success: boolean, tests_passed?: boolean, build_passed?: boolean, verification_passed?: boolean }
   */
  recordMetaAwarenessFeedback(payload = {}) {
    const workflow = normalizeKey(payload.workflow_type || 'general');
    const scores = isPlainObject(payload.domain_scores) ? payload.domain_scores : null;
    const outcome = isPlainObject(payload.outcome) ? payload.outcome : {};
    const success = typeof outcome.success === 'boolean' ? outcome.success : null;
    if (!scores || success === null) return;

    const y = success ? 1 : 0;

    const normalizedScores = {};

    if (!this._metaDomainCorr.workflows.has(workflow)) {
      this._metaDomainCorr.workflows.set(workflow, new Map());
    }
    const wfMap = this._metaDomainCorr.workflows.get(workflow);

    for (const [domainSlugRaw, valueRaw] of Object.entries(scores)) {
      const domainSlug = normalizeKey(domainSlugRaw);
      const x = safeNumber(valueRaw);
      if (x === null) continue;
      normalizedScores[domainSlug] = x;
      const prev = wfMap.get(domainSlug) || initCorrelationState();
      wfMap.set(domainSlug, pushCorrelation(prev, x, y));
    }

    this._metaDomainCorr.last_at = this._now();

    // Try to adapt hyper-parameters (fail-open).
    this._maybeUpdateDomainWeights({
      workflow,
      outcome,
      domain_scores: normalizedScores,
    });
  }

  _maybeUpdateDomainWeights({ workflow, outcome, domain_scores }) {
    const registry = this._registry;
    const learner = this._parameterLearner;
    if (!registry || typeof registry.get !== 'function' || typeof registry.update !== 'function') return;
    if (!learner || typeof learner.learn !== 'function') return;

    const wfMap = this._metaDomainCorr.workflows.get(workflow);
    if (!wfMap) return;

    const testsPassed =
      outcome?.tests_passed ??
      outcome?.testsPassed ??
      outcome?.verification_passed ??
      outcome?.verificationPassed ??
      outcome?.build_passed ??
      outcome?.buildPassed;
    const verificationScore = safeNumber(domain_scores?.verification);
    const verificationMismatch = testsPassed === false
      && verificationScore !== null
      && verificationScore >= 75;

    for (const [domainSlug, state] of wfMap.entries()) {
      // Only update params for domains present in the current feedback payload.
      if (!Object.prototype.hasOwnProperty.call(domain_scores, domainSlug)) {
        continue;
      }

      const baseName = `domain_weight_${domainSlug}`;
      const wfName = `domain_weight_${domainSlug}_${workflow}`;

      let paramName = baseName;
      try {
        if (typeof registry.has === 'function' && registry.has(wfName)) {
          paramName = wfName;
        } else if (typeof registry.has === 'function' && !registry.has(baseName)) {
          // If base param is missing (shouldn't happen), skip.
          continue;
        }
      } catch {
        // Fail-open: name validation may throw if a registry differs.
        paramName = baseName;
      }

      let param;
      try {
        param = registry.get(paramName);
      } catch {
        param = null;
      }
      if (!param) continue;

      const r = pearsonR(state);

      // Map correlation → target weight.
      // r in [-1, 1] => multiplier in [0.75, 1.25]
      const mult = 1 + r * 0.25;
      let target = clampToHardBounds(param.current_value * mult, param);

      // Special rule: if verification discipline scored high but tests/build failed,
      // increase verification weight (so the composite penalizes verification issues more).
      if (domainSlug === 'verification' && verificationMismatch) {
        target = clampToHardBounds(Math.max(target, param.current_value + 0.15), param);
      }

      const sampleCount = Number.isFinite(state?.n) ? state.n : 0;
      let learned;
      try {
        learned = learner.learn(param, target, sampleCount);
      } catch {
        learned = null;
      }
      if (!learned || learned.blocked || !learned.changed) continue;

      try {
        registry.update(paramName, {
          current_value: learned.value,
        });
      } catch {
        // Governance or IO may block; fail-open.
      }
    }
  }

  /**
   * Register a listener hook.
   * Events:
   * - signalRecorded: { type, signal, meta }
   * - aggregateUpdated: { type, aggregate }
   * - hook:error: { event, error }
   * - source:error: { source, error }
   */
  on(event, fn) {
    if (typeof fn !== 'function') {
      throw new TypeError(`Hook for "${event}" must be a function`);
    }
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const set = this._listeners.get(event);
    if (!set) return false;
    const deleted = set.delete(fn);
    if (set.size === 0) this._listeners.delete(event);
    return deleted;
  }

  /**
   * Register an external feedback source.
   *
   * attach(api) may synchronously throw or return a Promise; collector is fail-open.
   * If it returns a function, it will be treated as a detach handler.
   */
  registerSource(sourceName, attach) {
    if (typeof sourceName !== 'string' || sourceName.trim() === '') {
      throw new TypeError('sourceName must be a non-empty string');
    }
    if (typeof attach !== 'function') {
      throw new TypeError('attach must be a function');
    }

    // Non-blocking attach.
    this._enqueue(async () => {
      try {
        const api = this._createSourceApi(sourceName);
        const maybeDetach = await attach(api);
        if (typeof maybeDetach === 'function') {
          this._sources.set(sourceName, { detach: maybeDetach });
        } else {
          this._sources.set(sourceName, { detach: null });
        }
      } catch (err) {
        this._emitAsync('source:error', { source: sourceName, error: err?.message || String(err) });
      }
    });
  }

  async shutdown() {
    // Wait for queued work, then detach sources.
    await this.flush();
    for (const [name, entry] of this._sources.entries()) {
      if (typeof entry?.detach === 'function') {
        try {
          entry.detach();
        } catch (err) {
          this._emitAsync('source:error', { source: name, error: err?.message || String(err) });
        }
      }
    }
    this._sources.clear();
  }

  _createSourceApi(sourceName) {
    return Object.freeze({
      source: sourceName,
      emit: (type, signal, meta) => this.recordSignal(type, signal, { ...(meta || {}), source: sourceName }),
      emitOutcome: (signal, meta) => this.recordOutcome(signal, { ...(meta || {}), source: sourceName }),
      emitPrecision: (signal, meta) => this.recordPrecision(signal, { ...(meta || {}), source: sourceName }),
      emitEfficiency: (signal, meta) => this.recordEfficiency(signal, { ...(meta || {}), source: sourceName }),
      emitStability: (signal, meta) => this.recordStability(signal, { ...(meta || {}), source: sourceName }),
    });
  }

  /**
   * Fire-and-forget record. Processing is queued asynchronously.
   * Returns a promise you MAY await (tests), but callers should not need to.
   */
  recordSignal(type, signal, meta = {}) {
    const signalType = String(type);
    const timestamp = this._now();
    const normalizedMeta = isPlainObject(meta) ? { ...meta, at: meta.at ?? timestamp } : { at: timestamp };
    const normalizedSignal = isPlainObject(signal) ? { ...signal } : { value: signal };

    // Queue actual aggregation + hook emissions.
    return this._enqueue(async () => {
      this._emitAsync('signalRecorded', {
        type: signalType,
        signal: clone(normalizedSignal),
        meta: clone(normalizedMeta),
      });

      try {
        if (signalType === SIGNAL_TYPES.outcome_signal) {
          this._aggregateOutcome(normalizedSignal, normalizedMeta);
          this._emitAsync('aggregateUpdated', { type: signalType, aggregate: this.getAggregate(signalType) });
          return;
        }
        if (signalType === SIGNAL_TYPES.precision_signal) {
          this._aggregatePrecision(normalizedSignal, normalizedMeta);
          this._emitAsync('aggregateUpdated', { type: signalType, aggregate: this.getAggregate(signalType) });
          return;
        }
        if (signalType === SIGNAL_TYPES.efficiency_signal) {
          this._aggregateEfficiency(normalizedSignal, normalizedMeta);
          this._emitAsync('aggregateUpdated', { type: signalType, aggregate: this.getAggregate(signalType) });
          return;
        }
        if (signalType === SIGNAL_TYPES.stability_signal) {
          this._aggregateStability(normalizedSignal, normalizedMeta);
          this._emitAsync('aggregateUpdated', { type: signalType, aggregate: this.getAggregate(signalType) });
          return;
        }

        // Unknown signal type: fail-open; keep observability via hooks only.
        this._emitAsync('hook:error', {
          event: 'recordSignal',
          error: `Unknown signal type: ${signalType}`,
        });
      } catch (err) {
        this._emitAsync('hook:error', {
          event: 'aggregate',
          error: err?.message || String(err),
        });
      }
    });
  }

  recordOutcome(signal, meta) {
    return this.recordSignal(SIGNAL_TYPES.outcome_signal, signal, meta);
  }

  recordPrecision(signal, meta) {
    return this.recordSignal(SIGNAL_TYPES.precision_signal, signal, meta);
  }

  recordEfficiency(signal, meta) {
    return this.recordSignal(SIGNAL_TYPES.efficiency_signal, signal, meta);
  }

  recordStability(signal, meta) {
    return this.recordSignal(SIGNAL_TYPES.stability_signal, signal, meta);
  }

  getAggregate(type) {
    const signalType = String(type);
    if (signalType === SIGNAL_TYPES.outcome_signal) return clone(this._outcomeAgg);
    if (signalType === SIGNAL_TYPES.precision_signal) return clone(this._precisionAgg);
    if (signalType === SIGNAL_TYPES.efficiency_signal) {
      const copy = clone(this._efficiencyAgg);
      // Strip internals
      delete copy._sum_cost_ratio;
      delete copy._sum_latency_ratio;
      delete copy._sum_tokens_ratio;
      delete copy._count_cost;
      delete copy._count_latency;
      delete copy._count_tokens;
      return copy;
    }
    if (signalType === SIGNAL_TYPES.stability_signal) {
      const out = {
        type: this._stabilityAgg.type,
        parameters: clone(this._stabilityAgg.parameters),
        overall_variance_mean: this._stabilityAgg.overall_variance_mean,
        last_at: this._stabilityAgg.last_at,
      };
      return out;
    }
    return null;
  }

  async flush() {
    // Drain until stable: queued work may schedule additional work.
    // (e.g., a source attach emits signals that enqueue more processing.)
    // Fail-open: this._queue never rejects by construction.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const snapshot = this._queue;
      await snapshot;
      if (snapshot === this._queue) {
        return;
      }
    }
  }

  _enqueue(fn) {
    // Maintain order; never allow rejection to break the chain.
    this._queue = this._queue
      .then(() => new Promise((resolve) => {
        queueTask(() => {
          Promise.resolve()
            .then(fn)
            .then(resolve)
            .catch(() => resolve());
        });
      }))
      .catch(() => {});
    return this._queue;
  }

  _emitAsync(event, payload) {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return;
    for (const handler of set) {
      queueTask(() => {
        const res = safeCall(handler, payload);
        if (res && res.__error) {
          // Fail-open: surface via hook:error without throwing.
          this._emitAsync('hook:error', {
            event,
            error: res.__error?.message || String(res.__error),
          });
        }
      });
    }
  }

  // ===== Aggregation functions =====

  _aggregateOutcome(signal, meta) {
    // Expected shapes:
    // - { success: boolean }
    // - { outcome: 'success'|'failure' }
    const successBool = typeof signal.success === 'boolean'
      ? signal.success
      : (String(signal.outcome || '').toLowerCase() === 'success');

    this._outcomeAgg.total += 1;
    if (successBool) this._outcomeAgg.success += 1;
    else this._outcomeAgg.failure += 1;

    this._outcomeAgg.success_rate = this._outcomeAgg.total > 0
      ? this._outcomeAgg.success / this._outcomeAgg.total
      : null;
    this._outcomeAgg.last_at = meta?.at ?? this._now();
  }

  _aggregatePrecision(signal, meta) {
    // Supports either explicit confusion-matrix increments, or binary classification:
    // - { true_positive, false_positive, true_negative, false_negative }
    // - { predicted_warning: boolean, actual_warning: boolean }
    // - { predicted: boolean, actual: boolean }
    const tp = safeNumber(signal.true_positive);
    const fp = safeNumber(signal.false_positive);
    const tn = safeNumber(signal.true_negative);
    const fn = safeNumber(signal.false_negative);

    if (tp !== null || fp !== null || tn !== null || fn !== null) {
      this._precisionAgg.true_positive += tp || 0;
      this._precisionAgg.false_positive += fp || 0;
      this._precisionAgg.true_negative += tn || 0;
      this._precisionAgg.false_negative += fn || 0;
    } else {
      const predicted = typeof signal.predicted_warning === 'boolean'
        ? signal.predicted_warning
        : (typeof signal.predicted === 'boolean' ? signal.predicted : null);
      const actual = typeof signal.actual_warning === 'boolean'
        ? signal.actual_warning
        : (typeof signal.actual === 'boolean' ? signal.actual : null);

      if (predicted !== null && actual !== null) {
        if (predicted && actual) this._precisionAgg.true_positive += 1;
        else if (predicted && !actual) this._precisionAgg.false_positive += 1;
        else if (!predicted && actual) this._precisionAgg.false_negative += 1;
        else this._precisionAgg.true_negative += 1;
      }
    }

    const denomPrecision = this._precisionAgg.true_positive + this._precisionAgg.false_positive;
    const denomRecall = this._precisionAgg.true_positive + this._precisionAgg.false_negative;
    const denomFpr = this._precisionAgg.false_positive + this._precisionAgg.true_negative;
    const denomFnr = this._precisionAgg.false_negative + this._precisionAgg.true_positive;

    this._precisionAgg.precision = denomPrecision > 0
      ? this._precisionAgg.true_positive / denomPrecision
      : null;
    this._precisionAgg.recall = denomRecall > 0
      ? this._precisionAgg.true_positive / denomRecall
      : null;
    this._precisionAgg.false_positive_rate = denomFpr > 0
      ? this._precisionAgg.false_positive / denomFpr
      : null;
    this._precisionAgg.false_negative_rate = denomFnr > 0
      ? this._precisionAgg.false_negative / denomFnr
      : null;

    this._precisionAgg.last_at = meta?.at ?? this._now();
  }

  _aggregateEfficiency(signal, meta) {
    // Intended shape:
    // { cost, latency_ms, tokens_used, baseline_cost, baseline_latency_ms, baseline_tokens_used }
    const cost = safeNumber(signal.cost ?? signal.cost_usd);
    const latency = safeNumber(signal.latency_ms ?? signal.time_taken_ms);
    const tokens = safeNumber(signal.tokens_used);
    const bCost = safeNumber(signal.baseline_cost ?? signal.baseline_cost_usd);
    const bLatency = safeNumber(signal.baseline_latency_ms ?? signal.baseline_time_taken_ms);
    const bTokens = safeNumber(signal.baseline_tokens_used);

    this._efficiencyAgg.samples += 1;

    if (cost !== null && bCost !== null && bCost > 0) {
      this._efficiencyAgg._sum_cost_ratio += cost / bCost;
      this._efficiencyAgg._count_cost += 1;
    }
    if (latency !== null && bLatency !== null && bLatency > 0) {
      this._efficiencyAgg._sum_latency_ratio += latency / bLatency;
      this._efficiencyAgg._count_latency += 1;
    }
    if (tokens !== null && bTokens !== null && bTokens > 0) {
      this._efficiencyAgg._sum_tokens_ratio += tokens / bTokens;
      this._efficiencyAgg._count_tokens += 1;
    }

    this._efficiencyAgg.avg_cost_ratio = this._efficiencyAgg._count_cost > 0
      ? this._efficiencyAgg._sum_cost_ratio / this._efficiencyAgg._count_cost
      : null;
    this._efficiencyAgg.avg_latency_ratio = this._efficiencyAgg._count_latency > 0
      ? this._efficiencyAgg._sum_latency_ratio / this._efficiencyAgg._count_latency
      : null;
    this._efficiencyAgg.avg_tokens_ratio = this._efficiencyAgg._count_tokens > 0
      ? this._efficiencyAgg._sum_tokens_ratio / this._efficiencyAgg._count_tokens
      : null;

    this._efficiencyAgg.last_at = meta?.at ?? this._now();
  }

  _aggregateStability(signal, meta) {
    // Intended shape:
    // { param_name, value } OR { parameter, value }
    const paramName = String(signal.param_name ?? signal.parameter ?? '').trim();
    const value = safeNumber(signal.value ?? signal.current_value);
    if (!paramName || value === null) {
      this._stabilityAgg.last_at = meta?.at ?? this._now();
      return;
    }

    const currentState = this._stabilityAgg._states.get(paramName) || welfordInit();
    const nextState = welfordPush(currentState, value);
    this._stabilityAgg._states.set(paramName, nextState);

    const variance = welfordVariance(nextState);
    this._stabilityAgg.parameters[paramName] = {
      n: nextState.n,
      mean: nextState.mean,
      variance,
    };

    // overall variance mean across tracked params
    const variances = Array.from(this._stabilityAgg._states.values(), (state) => welfordVariance(state));
    this._stabilityAgg.overall_variance_mean = variances.length > 0
      ? variances.reduce((a, b) => a + b, 0) / variances.length
      : 0;
    this._stabilityAgg.last_at = meta?.at ?? this._now();

    // Optional registry awareness (fail-open): if provided, caller may use it later.
    // This base collector does not mutate registry.
    void this._registry;
  }
}

module.exports = {
  FeedbackCollector,
  SIGNAL_TYPES,
};
