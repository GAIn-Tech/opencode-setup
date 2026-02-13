'use strict';

const path = require('path');
const policies = require('./policies.json');
const { IntelligentRotator } = require('./key-rotator');
const { KeyRotatorFactory } = require('./key-rotator-factory');

/**
 * ModelRouter — Policy-based model selection with live outcome tuning.
...
   constructor(options = {}) {
    this.policies = options.policies || policies;
    this.models = this.policies.models;
    this.costTiers = this.policies.cost_tiers;
    this.complexityRouting = this.policies.complexity_routing;
    this.tuning = this.policies.tuning;

    // Intelligent Rotators per provider
    this.rotators = options.rotators || KeyRotatorFactory.createFromEnv(options.env || process.env);
    
    // Live outcome tracking per model
...
  getAllStats() {
    return Object.keys(this.stats)
      .map((modelId) => ({
        model: modelId,
        ...this.getModelStats(modelId),
      }))
      .sort((a, b) => b.success_rate - a.success_rate);
  }

  /**
   * Get an API key for a selected model.
   * 
   * @param {string} modelId 
   * @returns {object|null} { key: string, keyId: string, rotator: IntelligentRotator }
   */
  getApiKeyForModel(modelId) {
    const model = this.models[modelId];
    if (!model) return null;

    const rotator = this.rotators[model.provider];
    if (!rotator) return null;

    const key = rotator.getNextKey();
    if (!key) return null;

    return {
      key: key.value,
      keyId: key.id,
      rotator
    };
  }

  /**
   * List all known models with their policy metadata.
...
    // 6. Strength match bonus
    if (ctx.requiredStrengths.length > 0) {
      const matched = ctx.requiredStrengths.filter((s) => model.strengths.includes(s));
      const strengthBonus = (matched.length / ctx.requiredStrengths.length) * 0.10;
      score += strengthBonus;
      if (matched.length > 0) {
        reasons.push(`strengths=${matched.join(',')}`);
      }
    }

    // 7. Rotator health check
    const rotator = this.rotators[model.provider];
    if (rotator) {
      const status = rotator.getProviderStatus();
      if (status.isExhausted) {
        score -= 0.50; // Heavy penalty if no keys are healthy
        reasons.push('rotator-exhausted');
      } else if (status.healthyKeys < status.totalKeys) {
        score -= 0.10; // Light penalty if some keys are dead
        reasons.push(`rotator-pressure(${status.healthyKeys}/${status.totalKeys})`);
      }
    }

    // 8. Cost check — if model is way too expensive for the budget, penalize

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
