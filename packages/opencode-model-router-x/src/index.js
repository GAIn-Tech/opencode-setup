'use strict';

const path = require('path');
const { IntelligentRotator } = require('./key-rotator');
const { KeyRotatorFactory } = require('./key-rotator-factory');
const { policies } = require('./policies.json');
const { Orchestrator } = require('./strategies/orchestrator');

class ModelRouter {
  constructor(options = {}) {
    this.policies = policies;
    this.models = this._flattenModels(this.policies);
    this.rotators = KeyRotatorFactory.createFromEnv(options.env || process.env);
    this.stats = Object.fromEntries(
      Object.keys(this.models).map((id) => [id, { calls: 0, successes: 0, failures: 0, total_latency_ms: 0 }])
    );
    this.tuning = options.tuning || {};
    this.tuning.success_rate_floor = this.tuning.success_rate_floor ?? 0.50;
    this.tuning.success_rate_ceiling = this.tuning.success_rate_ceiling ?? 0.99;
    this.tuning.min_samples_for_tuning = this.tuning.min_samples_for_tuning ?? 5;
    
    // Initialize Orchestrator correctly with strategies and global context
    try {
      const GlobalModelContext = require('./strategies/global-model-context.js');
      const FallbackLayerStrategy = require('./strategies/fallback-layer-strategy.js');
      const ProjectStartStrategy = require('./strategies/project-start-strategy.js');
      const ManualOverrideController = require('./strategies/manual-override-controller.js');
      const StuckBugDetector = require('./strategies/stuck-bug-detector.js');
      const PerspectiveSwitchStrategy = require('./strategies/perspective-switch-strategy.js');
      const ReversionManager = require('./strategies/reversion-manager.js');
      
      const globalContext = new GlobalModelContext();
      const strategies = [
        new ManualOverrideController({ globalContext }),
        new StuckBugDetector({ globalContext }),
        new PerspectiveSwitchStrategy({ globalContext }),
        new ReversionManager({ globalContext }),
        new ProjectStartStrategy({ globalContext }),
        new FallbackLayerStrategy({ router: this })
      ];
      
      this.orchestrator = new Orchestrator({
        strategies,
        globalContext
      });
    } catch (error) {
      console.error('[ModelRouter] Failed to initialize Orchestrator:', error);
      console.error('[ModelRouter] Falling back to legacy scoring system');
      this.orchestrator = null;
    }
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
   * Route an incoming request to the best available model.
   *
   * @param {Object} ctx - Routing context with constraints.
   * @param {string} [ctx.taskType] - Task category (e.g., 'code_generation', 'documentation').
   * @param {string[]} [ctx.requiredTools] - Tools the model must support.
   * @param {number} [ctx.maxBudget] - Maximum acceptable cost in USD.
   * @param {number} [ctx.maxLatency] - Maximum acceptable latency in ms.
   * @param {string[]} [ctx.requiredStrengths] - Strengths the model must have.
   * @returns {Object} `{ model, key, score, reason, rotator }`
   */
  route(ctx = {}) {
    // First, check if Orchestrator has a model selection override
    const orchestration = this.orchestrator.orchestrate(ctx);
    if (orchestration.override) {
      const modelId = orchestration.modelId;
      const model = this.models[modelId];
      if (model) {
        const rotator = this.rotators[model.provider];
        const key = rotator ? rotator.getNextKey() : null;
        return {
          model,
          keyId: key ? key.id : null,
          modelId,
          score: -1, // Orchestrator selections get priority, not scored
          reason: `orchestrator: ${orchestration.reason}`,
          rotator,
          key,
          orchestration, // Include orchestration metadata
        };
      }
    }

    // Fall back to existing scoring logic
    const candidates = this._filterByConstraints(ctx);
    const scored = candidates.map((modelId) => ({
      modelId,
      ...this._scoreModel(modelId, ctx),
    }));
    scored.sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      throw new Error('No model available for the given constraints');
    }

    const winner = scored[0];
    const model = this.models[winner.modelId];
    const rotator = this.rotators[model.provider];
    const key = rotator ? rotator.getNextKey() : null;
    return {
      model,
      keyId: key ? key.id : null,
      modelId: winner.modelId,
      score: winner.score,
      reason: winner.reason,
      rotator,
      key,
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
