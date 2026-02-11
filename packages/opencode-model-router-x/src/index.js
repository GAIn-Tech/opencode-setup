'use strict';

const path = require('path');
const policies = require('./policies.json');

/**
 * ModelRouter — Policy-based model selection with live outcome tuning.
 *
 * Selects the best LLM model for a given task context based on:
 *   1. Complexity → cost tier mapping (policies.json)
 *   2. Provider weight bias (Anthropic 0.6, others 0.4)
 *   3. Live success_rate / latency tracking per model
 *
 * Usage:
 *   const router = new ModelRouter();
 *   const pick = router.selectModel({ complexity: 'high' });
 *   // ... call the model ...
 *   router.recordOutcome(pick.model, true, 1450);
 */
class ModelRouter {
  /**
   * @param {object} [options]
   * @param {object} [options.policies]       – Override default policies.json
   * @param {object} [options.initialStats]   – Pre-seed outcome history { modelId: { successes, failures, total_latency_ms, calls } }
   */
  constructor(options = {}) {
    this.policies = options.policies || policies;
    this.models = this.policies.models;
    this.costTiers = this.policies.cost_tiers;
    this.complexityRouting = this.policies.complexity_routing;
    this.tuning = this.policies.tuning;

    // Live outcome tracking per model
    // Map<modelId, { successes: number, failures: number, total_latency_ms: number, calls: number }>
    this.stats = {};
    for (const modelId of Object.keys(this.models)) {
      this.stats[modelId] = {
        successes: 0,
        failures: 0,
        total_latency_ms: 0,
        calls: 0,
      };
    }

    // Allow pre-seeding stats
    if (options.initialStats) {
      for (const [modelId, seed] of Object.entries(options.initialStats)) {
        if (this.stats[modelId]) {
          Object.assign(this.stats[modelId], seed);
        }
      }
    }
  }

  // ─── Core API ────────────────────────────────────────────────

  /**
   * Select the best model for a task context.
   *
   * @param {object} context
   * @param {string} context.complexity  – 'simple' | 'moderate' | 'high' | 'critical'
   * @param {string} [context.cost_tier] – Override: use a specific cost tier directly
   * @param {string[]} [context.required_strengths] – e.g. ['long-context', 'debugging']
   * @param {number} [context.max_latency_ms] – Hard latency ceiling
   * @returns {{ model: string, score: number, reason: string, cost_tier: string, fallbacks: string[] }}
   */
  selectModel(context = {}) {
    const complexity = context.complexity || 'moderate';
    const routing = this.complexityRouting[complexity];
    if (!routing) {
      throw new Error(`Unknown complexity level: "${complexity}". Valid: ${Object.keys(this.complexityRouting).join(', ')}`);
    }

    const costTierName = context.cost_tier || routing.cost_tier;
    const costTier = this.costTiers[costTierName];
    if (!costTier) {
      throw new Error(`Unknown cost tier: "${costTierName}". Valid: ${Object.keys(this.costTiers).join(', ')}`);
    }

    // Score every model
    const scored = [];
    for (const modelId of Object.keys(this.models)) {
      const score = this._scoreModel(modelId, {
        preferredTier: costTier.preferred_tier,
        preferenceList: routing.model_preference,
        requiredStrengths: context.required_strengths || [],
        maxLatencyMs: context.max_latency_ms,
        maxBudget: costTier.max_budget,
      });
      scored.push({ model: modelId, ...score });
    }

    // Sort descending by final score
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    const fallbacks = scored.slice(1, 4).map((s) => s.model);

    return {
      model: best.model,
      score: Math.round(best.score * 1000) / 1000,
      reason: best.reason,
      cost_tier: costTierName,
      fallbacks,
    };
  }

  /**
   * Record an outcome for a model call. Feeds live tuning.
   *
   * @param {string} modelId   – e.g. 'anthropic/claude-opus-4-6'
   * @param {boolean} success  – Did the call succeed / produce acceptable output?
   * @param {number} [latencyMs] – Wall-clock latency in ms
   * @returns {{ model: string, success_rate: number, avg_latency_ms: number, calls: number }}
   */
  recordOutcome(modelId, success, latencyMs = 0) {
    if (!this.stats[modelId]) {
      // Unknown model — create a stats entry on the fly
      this.stats[modelId] = { successes: 0, failures: 0, total_latency_ms: 0, calls: 0 };
    }

    const s = this.stats[modelId];

    // Apply exponential decay to old data so recent outcomes matter more
    if (s.calls >= this.tuning.min_samples_for_tuning) {
      const decay = this.tuning.decay_factor;
      s.successes *= decay;
      s.failures *= decay;
      s.total_latency_ms *= decay;
      s.calls *= decay;
    }

    // Record new outcome
    s.calls += 1;
    s.total_latency_ms += latencyMs;
    if (success) {
      s.successes += 1;
    } else {
      s.failures += 1;
    }

    return {
      model: modelId,
      success_rate: this._getSuccessRate(modelId),
      avg_latency_ms: Math.round(s.total_latency_ms / s.calls),
      calls: Math.round(s.calls),
    };
  }

  /**
   * Get live stats for a model.
   *
   * @param {string} modelId
   * @returns {{ success_rate: number, avg_latency_ms: number, calls: number, raw: object } | null}
   */
  getModelStats(modelId) {
    const s = this.stats[modelId];
    if (!s) return null;

    return {
      success_rate: this._getSuccessRate(modelId),
      avg_latency_ms: s.calls > 0 ? Math.round(s.total_latency_ms / s.calls) : 0,
      calls: Math.round(s.calls),
      raw: { ...s },
    };
  }

  /**
   * Get stats for all models, sorted by success rate descending.
   *
   * @returns {Array<{ model: string, success_rate: number, avg_latency_ms: number, calls: number }>}
   */
  getAllStats() {
    return Object.keys(this.stats)
      .map((modelId) => ({
        model: modelId,
        ...this.getModelStats(modelId),
      }))
      .sort((a, b) => b.success_rate - a.success_rate);
  }

  /**
   * List all known models with their policy metadata.
   *
   * @returns {Array<{ model: string, provider: string, tier: string, base_weight: number }>}
   */
  listModels() {
    return Object.entries(this.models).map(([id, m]) => ({
      model: id,
      provider: m.provider,
      tier: m.tier,
      base_weight: m.base_weight,
      strengths: m.strengths,
    }));
  }

  /**
   * Export current state (stats + policies version) for persistence.
   *
   * @returns {{ version: string, stats: object, exported_at: string }}
   */
  exportState() {
    return {
      version: this.policies.version,
      stats: JSON.parse(JSON.stringify(this.stats)),
      exported_at: new Date().toISOString(),
    };
  }

  /**
   * Import previously exported state.
   *
   * @param {{ stats: object }} state
   */
  importState(state) {
    if (state && state.stats) {
      for (const [modelId, s] of Object.entries(state.stats)) {
        if (this.stats[modelId]) {
          Object.assign(this.stats[modelId], s);
        }
      }
    }
  }

  // ─── Internal Scoring ────────────────────────────────────────

  /**
   * Score a model for a given routing context. Returns 0.0–1.0 composite score.
   * @private
   */
  _scoreModel(modelId, ctx) {
    const model = this.models[modelId];
    if (!model) return { score: 0, reason: 'unknown model' };

    const reasons = [];
    let score = 0;

    // 1. Provider weight (Anthropic bias)
    const providerWeight = model.base_weight; // 0.6 for anthropic, 0.4 for others
    score += providerWeight * 0.25; // 25% of score from provider preference
    reasons.push(`provider=${model.provider}(w${providerWeight})`);

    // 2. Tier match — does the model's tier match the cost tier preference?
    const tierMatch = model.tier === ctx.preferredTier;
    if (tierMatch) {
      score += 0.20;
      reasons.push('tier-match');
    } else {
      // Partial credit: flagship when balanced wanted = OK; speed when flagship wanted = penalty
      const tierRank = { speed: 1, balanced: 2, flagship: 3 };
      const modelRank = tierRank[model.tier] || 2;
      const wantedRank = tierRank[ctx.preferredTier] || 2;
      const tierDelta = Math.abs(modelRank - wantedRank);
      score += Math.max(0, 0.20 - tierDelta * 0.08);
    }

    // 3. Preference list position (from complexity_routing.model_preference)
    const prefIndex = ctx.preferenceList.indexOf(modelId);
    if (prefIndex === 0) {
      score += 0.25;
      reasons.push('pref-1st');
    } else if (prefIndex === 1) {
      score += 0.18;
      reasons.push('pref-2nd');
    } else if (prefIndex === 2) {
      score += 0.12;
      reasons.push('pref-3rd');
    } else {
      score += 0.05;
    }

    // 4. Live success rate (outcome tuning) — biggest differentiator over time
    const successRate = this._getSuccessRate(modelId);
    score += successRate * 0.20;
    reasons.push(`sr=${(successRate * 100).toFixed(0)}%`);

    // 5. Latency penalty
    if (ctx.maxLatencyMs) {
      const avgLatency = this._getAvgLatency(modelId);
      if (avgLatency > 0 && avgLatency > ctx.maxLatencyMs) {
        const penalty = this.tuning.latency_penalty_factor;
        score -= penalty;
        reasons.push(`latency-penalty(${avgLatency}ms>${ctx.maxLatencyMs}ms)`);
      }
    }

    // 6. Strength match bonus
    if (ctx.requiredStrengths.length > 0) {
      const matched = ctx.requiredStrengths.filter((s) => model.strengths.includes(s));
      const strengthBonus = (matched.length / ctx.requiredStrengths.length) * 0.10;
      score += strengthBonus;
      if (matched.length > 0) {
        reasons.push(`strengths=${matched.join(',')}`);
      }
    }

    // 7. Cost check — if model is way too expensive for the budget, penalize
    if (ctx.maxBudget) {
      // Rough estimate: assume ~2k tokens per call
      const estimatedCost = model.cost_per_1k_tokens * 2;
      if (estimatedCost > ctx.maxBudget) {
        score -= 0.15;
        reasons.push(`over-budget($${estimatedCost.toFixed(3)}>$${ctx.maxBudget})`);
      }
    }

    return {
      score: Math.max(0, Math.min(1, score)),
      reason: reasons.join('; '),
    };
  }

  /**
   * Get the effective success rate for a model, blending default + live data.
   * @private
   */
  _getSuccessRate(modelId) {
    const s = this.stats[modelId];
    const model = this.models[modelId];
    const defaultRate = model ? model.default_success_rate : 0.80;

    if (!s || s.calls < this.tuning.min_samples_for_tuning) {
      return defaultRate;
    }

    const liveRate = s.successes / (s.successes + s.failures || 1);
    // Blend: 70% live, 30% default (as samples grow, live dominates via decay)
    const blended = liveRate * 0.7 + defaultRate * 0.3;

    return Math.max(this.tuning.success_rate_floor, Math.min(this.tuning.success_rate_ceiling, blended));
  }

  /**
   * Get average latency for a model.
   * @private
   */
  _getAvgLatency(modelId) {
    const s = this.stats[modelId];
    if (!s || s.calls === 0) return 0;
    return s.total_latency_ms / s.calls;
  }
}

// ─── Exports ───────────────────────────────────────────────────

module.exports = { ModelRouter, policies };
