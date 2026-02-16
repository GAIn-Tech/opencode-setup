'use strict';

const path = require('path');
const { IntelligentRotator } = require('./key-rotator');
const { KeyRotatorFactory } = require('./key-rotator-factory');
const policies = require('./policies.json');
const Orchestrator = require('./strategies/orchestrator');

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
      const stuckBugDetector = new StuckBugDetector();
      this.reversionManager = new ReversionManager();
      const strategies = [
        new ManualOverrideController(),
        new PerspectiveSwitchStrategy(stuckBugDetector),
        new ProjectStartStrategy(),
        new FallbackLayerStrategy()
      ];
      
      this.globalContext = globalContext;
      this.orchestrator = new Orchestrator(strategies);
    } catch (error) {
      console.error('[ModelRouter] Failed to initialize Orchestrator:', error);
      console.error('[ModelRouter] Falling back to legacy scoring system');
      this.orchestrator = null;
    }
  }

  /**
   * Flatten the policies.models object into a lookup by model ID.
   * @private
   */
  _flattenModels(policies) {
    return Object.fromEntries(
      Object.entries(policies.models || {}).map(([modelId, modelData]) => [
        modelId,
        {
          id: modelId,
          ...modelData
        }
      ])
    );
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

    const rotator = KeyRotatorFactory.getRotator(this.rotators, model.provider);
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
    if (ctx && typeof ctx.overrideModelId === 'string') {
      const forcedModel = this.models[ctx.overrideModelId];
      if (forcedModel) {
        const forcedRotator = this.rotators[forcedModel.provider];
        const forcedKey = forcedRotator ? forcedRotator.getNextKey() : null;
        return {
          model: forcedModel,
          keyId: forcedKey ? forcedKey.id : null,
          modelId: ctx.overrideModelId,
          score: -1,
          reason: 'override:modelId',
          rotator: forcedRotator,
          key: forcedKey,
        };
      }
    }

    const candidates = this._filterByConstraints(ctx || {});
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
    const rotator = KeyRotatorFactory.getRotator(this.rotators, model.provider);
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

  async routeAsync(ctx = {}) {
    if (this.orchestrator && typeof this.orchestrator.selectModel === 'function' && ctx.task) {
      try {
        const selection = await this.orchestrator.selectModel(ctx.task, ctx);
        if (selection && selection.model_id && this.models[selection.model_id]) {
          const model = this.models[selection.model_id];
          const rotator = KeyRotatorFactory.getRotator(this.rotators, model.provider);
          const key = rotator ? rotator.getNextKey() : null;
          return {
            model,
            keyId: key ? key.id : null,
            modelId: selection.model_id,
            score: -1,
            reason: `orchestrator:${selection.strategy || 'strategy'}`,
            rotator,
            key,
            orchestration: selection,
          };
        }
      } catch (error) {
        console.error('[ModelRouter] Orchestration selectModel failed, falling back to route():', error?.message || error);
      }
    }

    return this.route(ctx);
  }

  /**
   * List all known models with their policy metadata.
   * @returns {Array<object>}
   */
  listModels() {
    return Object.values(this.models);
  }

  /**
   * Track call outcome for adaptive scoring and key health.
   * @param {string} modelId
   * @param {boolean} success
   * @param {number|object} latencyOrError - Latency in ms or error object
   */
  recordResult(modelId, success, latencyOrError = 0) {
    if (!this.stats[modelId]) return;
    
    const latencyMs = typeof latencyOrError === 'number' ? latencyOrError : 0;
    const error = typeof latencyOrError === 'object' ? latencyOrError : null;

    this.stats[modelId].calls += 1;
    if (success) {
      this.stats[modelId].successes += 1;
    } else {
      this.stats[modelId].failures += 1;
      
      // Update key health if we have error details
      const model = this.models[modelId];
      if (model && error) {
        const rotator = KeyRotatorFactory.getRotator(this.rotators, model.provider);
        const keyId = error.keyId || null; // Some clients might provide the keyId
        if (rotator && keyId) {
            rotator.recordFailure(keyId, error);
        }
      }
    }
    this.stats[modelId].total_latency_ms += Number.isFinite(latencyMs) ? latencyMs : 0;
  }

  /**
   * Apply hard constraints before scoring.
   * @private
   */
  _filterByConstraints(ctx = {}) {
    const requiredTools = Array.isArray(ctx.requiredTools) ? ctx.requiredTools : [];

    return Object.keys(this.models).filter((modelId) => {
      const model = this.models[modelId];
      if (!model) return false;

      if (requiredTools.length > 0) {
        const modelTools = Array.isArray(model.tools) ? model.tools : [];
        const missingTool = requiredTools.some((t) => !modelTools.includes(t));
        if (missingTool) return false;
      }

      if (ctx.maxLatency && model.default_latency_ms && model.default_latency_ms > ctx.maxLatency) {
        return false;
      }

      return true;
    });
  }

  /**
   * Score model using policy + live signals.
   * @private
   */
  _scoreModel(modelId, ctx = {}) {
    const model = this.models[modelId];
    if (!model) return { score: 0, reason: 'missing-model' };

    let score = 0.50;
    const reasons = [];

    const successRate = this._getSuccessRate(modelId);
    score += successRate * 0.30;
    reasons.push(`success=${successRate.toFixed(2)}`);

    const avgLatency = this._getAvgLatency(modelId);
    const baselineLatency = model.default_latency_ms || avgLatency || 1000;
    const latencyPenalty = Math.min(0.20, Math.max(0, avgLatency - baselineLatency) / 5000);
    score -= latencyPenalty;
    reasons.push(`latency=${Math.round(avgLatency || baselineLatency)}ms`);

    if (ctx.taskType && Array.isArray(model.task_types)) {
      if (model.task_types.includes(ctx.taskType)) {
        score += 0.10;
        reasons.push(`task=${ctx.taskType}`);
      } else {
        score -= 0.05;
      }
    }

    if (Array.isArray(ctx.requiredStrengths) && ctx.requiredStrengths.length > 0) {
      const modelStrengths = Array.isArray(model.strengths) ? model.strengths : [];
      const matched = ctx.requiredStrengths.filter((s) => modelStrengths.includes(s));
      score += (matched.length / ctx.requiredStrengths.length) * 0.10;
      if (matched.length > 0) reasons.push(`strengths=${matched.join(',')}`);
    }

    const rotator = KeyRotatorFactory.getRotator(this.rotators, model.provider);
    if (rotator && typeof rotator.getProviderStatus === 'function') {
      const status = rotator.getProviderStatus();
      if (status?.isExhausted) {
        score -= 0.50;
        reasons.push('rotator-exhausted');
      } else if (status && Number.isFinite(status.healthyKeys) && Number.isFinite(status.totalKeys) && status.healthyKeys < status.totalKeys) {
        score -= 0.10;
        reasons.push(`rotator-pressure(${status.healthyKeys}/${status.totalKeys})`);
      }
    }

    if (ctx.maxBudget && Number.isFinite(model.cost_per_1k_tokens)) {
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
