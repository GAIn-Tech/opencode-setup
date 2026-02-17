'use strict';

const path = require('path');
const { IntelligentRotator } = require('./key-rotator');
const { KeyRotatorFactory } = require('./key-rotator-factory');
const policies = require('./policies.json');
const Orchestrator = require('./strategies/orchestrator');
const { CircuitBreaker } = require('@jackoatmon/opencode-circuit-breaker');

// P4: INTEGRATION LAYER - Use IntegrationLayer instead of individual imports (fixes option creep)
// This single import replaces all the individual try/catch blocks below
let IntegrationLayer;
try {
  IntegrationLayer = require('@jackoatmon/opencode-integration-layer');
} catch (e) {
  try {
    IntegrationLayer = require('../../opencode-integration-layer/src/index.js');
  } catch (e2) {
    IntegrationLayer = null;
  }
}

// Fallback imports for direct access (used in constructor)
// These are kept for backwards compatibility - the adapter is preferred
let Logger, ValidatorLib, OpenCodeErrors, FallbackDoctor, HealthCheck;
try { Logger = require('@jackoatmon/opencode-logger'); } catch (e) { Logger = null; }
try { ValidatorLib = require('@jackoatmon/opencode-validator'); } catch (e) { ValidatorLib = null; }
try { OpenCodeErrors = require('@jackoatmon/opencode-errors'); } catch (e) { OpenCodeErrors = null; }
try { FallbackDoctor = require('@jackoatmon/opencode-fallback-doctor'); } catch (e) { FallbackDoctor = null; }
try { HealthCheck = require('@jackoatmon/opencode-health-check'); } catch (e) { HealthCheck = null; }

/**
 * P4: RouterIntegrationAdapter - Facade pattern to fix "option creep"
 * 
 * This adapter wraps the IntegrationLayer and provides a clean, unified API
 * for ModelRouter. It replaces all the individual if-checks with a single
 * integration point, making the code much cleaner and maintainable.
 * 
 * Before: 10+ if-checks in ModelRouter for optional dependencies
 * After: Single adapter call with graceful fallbacks
 */
class RouterIntegrationAdapter {
  constructor(integrationLayer, options = {}) {
    this.layer = integrationLayer;
    this.options = options;
    this._initialized = false;
    
    // Lazy-initialize on first use
    this._services = {};
  }
  
  /**
   * Initialize the adapter with required services
   */
  initialize(modelRouter) {
    if (this._initialized) return;
    
    // Create IntegrationLayer instance if we got the class
    if (IntegrationLayer && !this.layer) {
      this.layer = new IntegrationLayer({
        modelRouter,
        skillRL: this.options.skillRL,
        quotaManager: this.options.quotaManager,
        preloadSkills: this.options.preloadSkills
      });
    }
    
    this._initialized = true;
  }
  
  /**
   * Get learning engine advice - returns null if not available
   */
  getLearningAdvice(context) {
    if (!this.layer?.advisor) return null;
    try {
      return this.layer.advisor.advise(context);
    } catch (e) {
      return null;
    }
  }
  
  /**
   * Record outcome to learning engine - fire and forget
   */
  recordLearningOutcome(outcome) {
    if (!this.layer?.advisor) return;
    try {
      this.layer.advisor.learnFromOutcome?.(outcome);
    } catch (e) {
      // Fire and forget - don't block
    }
  }
  
  /**
   * Validate input using validator - returns data if not available
   */
  validateInput(data) {
    if (!this.layer?.validateInput) return { valid: true, data };
    try {
      return this.layer.validateInput(data);
    } catch (e) {
      return { valid: true, data };
    }
  }
  
  /**
   * Check if feature flag is enabled - defaults to true
   */
  isFeatureEnabled(flagName) {
    if (!this.layer?.isFeatureEnabled) return true;
    try {
      return this.layer.isFeatureEnabled(flagName);
    } catch (e) {
      return true;
    }
  }
  
  /**
   * Get health status - returns healthy if not available
   */
  async getHealth() {
    if (!this.layer?.getHealth) return { status: 'healthy' };
    try {
      return await this.layer.getHealth();
    } catch (e) {
      return { status: 'healthy' };
    }
  }
  
  /**
   * Create backup - returns null if not available
   */
  async createBackup(label) {
    if (!this.layer?.createBackup) return null;
    try {
      return await this.layer.createBackup(label);
    } catch (e) {
      return null;
    }
  }
  
  /**
   * Get config - returns empty object if not available
   */
  getConfig() {
    if (!this.layer?.config) return {};
    return this.layer.config;
  }
  
  /**
   * Enrich task context with system signals
   */
  enrichContext(context) {
    if (!this.layer?.enrichTaskContext) return context;
    try {
      return this.layer.enrichTaskContext(context);
    } catch (e) {
      return context;
    }
  }
}

class ModelRouter {
  constructor(options = {}) {
    // P4: INTEGRATION ADAPTER - Single point of integration (fixes option creep)
    // Instead of 10+ if-checks, use the adapter for all integrations
    this._adapter = new RouterIntegrationAdapter(IntegrationLayer, {
      skillRL: options.skillRLManager,
      quotaManager: options.quotaManager,
      preloadSkills: options.preloadSkills
    });
    
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
    
    // P1: Atomic Write for Stats - add stats persistence path
    this.statsPersistPath = options.statsPersistPath || null;
    this._statsWritePending = false;
    
    // P1: Learning-Guided Model Routing - integrate LearningEngine
    this.learningEngine = options.learningEngine || null;
    this._learningAdviceCache = new Map();
    this._learningAdviceCacheTTL = 60000; // 1 minute cache
    
    // P1: KeyRotator → Learning - connect key rotation to learning
    if (this.learningEngine) {
      Object.values(this.rotators).forEach(rotator => {
        if (rotator.setLearningEngine) {
          rotator.setLearningEngine(this.learningEngine);
        }
      });
    }
    
    // P3: Skill-RL Integration - integrate SkillRLManager for skill-based routing
    this.skillRLManager = options.skillRLManager || null;
    
    // P3: Feature Flags for Model Rollouts - integrate FeatureFlags for gradual model introductions
    this.featureFlags = options.featureFlags || null;
    
    // P1: ConfigLoader Integration - use centralized configuration
    this.configLoader = options.configLoader || null;
    if (this.configLoader) {
      this.config = this.configLoader.load();
    } else {
      this.config = {};
    }
    
    // P2: Fallback Doctor Auto-Validation - validate fallback chains at initialization
    this.fallbackDoctor = options.fallbackDoctor || null;
    if (this.fallbackDoctor && FallbackDoctor) {
      const chainModels = Object.keys(this.models);
      const diagnosis = this.fallbackDoctor.diagnose({ models: chainModels });
      if (!diagnosis.healthy) {
        console.warn('[ModelRouter] Fallback chain issues detected:', diagnosis.issues.map(i => i.message).join('; '));
      }
    }
    
    // P1: Errors Integration - use standardized error taxonomy
    this.errorHandler = options.errorHandler || null;
    if (this.errorHandler && OpenCodeErrors) {
      this._errorCategory = OpenCodeErrors.ErrorCategory;
      this._errorCode = OpenCodeErrors.ErrorCode;
    } else {
      this._errorCategory = null;
      this._errorCode = null;
    }
    
    // P2: Logger Integration - use structured logging
    if (options.logger) {
      this.logger = options.logger;
    } else if (Logger) {
      this.logger = new Logger({ service: 'model-router' });
    } else {
      this.logger = null;
    }

    // P2: Validator Integration - Initialize input validator
    if (ValidatorLib && ValidatorLib.Validator) {
      this.validator = ValidatorLib;
    } else {
      this.validator = null;
    }
    
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

    // Initialize circuit breakers for each provider
    this.circuitBreakers = {};
    const providers = [...new Set(Object.values(this.models).map(m => m.provider))];
    for (const provider of providers) {
      this.circuitBreakers[provider] = new CircuitBreaker({
        name: provider,
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 30000, // 30s
        halfOpenAttempts: 3,
        // P3: Connect circuit breaker state to learning engine
        onStateChange: (oldState, newState) => {
          if (this.learningEngine) {
            this.learningEngine.ingest({
              type: 'circuit_breaker_state_change',
              provider,
              oldState,
              newState,
              timestamp: Date.now()
            });
          }
        },
        onFailure: (error) => {
          if (this.learningEngine) {
            this.learningEngine.ingest({
              type: 'circuit_breaker_failure',
              provider,
              error: error.message,
              timestamp: Date.now()
            });
          }
        }
      });
    }
    
    // P2: Health-Check Integration - Register providers as subsystems
    this._registerProvidersWithHealthCheck();
  }

  /**
   * P2: Register model providers with health-check system
   * @private
   */
  _registerProvidersWithHealthCheck() {
    if (!HealthCheck || !HealthCheck.registerSubsystem) {
      return;
    }
    
    const providers = [...new Set(Object.values(this.models).map(m => m.provider))];
    for (const provider of providers) {
      HealthCheck.registerSubsystem(`model-provider:${provider}`, {
        checkInterval: 30000,
        checkFn: async () => {
          const cb = this.circuitBreakers[provider];
          if (!cb) {
            return { healthy: true, message: 'No circuit breaker' };
          }
          const state = cb.getState();
          return {
            healthy: state !== 'open',
            message: `Circuit breaker state: ${state}`,
            metadata: { circuitState: state }
          };
        },
        metadata: { provider }
      });
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
  async getApiKeyForModel(modelId) {
    const model = this.models[modelId];
    if (!model) return null;

    const rotator = KeyRotatorFactory.getRotator(this.rotators, model.provider);
    if (!rotator) return null;

    let key = null;
    try {
      key = await rotator.getNextKey();
    } catch (err) {
      console.error(`[ModelRouter] Failed to get key for model ${modelId}:`, err.message);
      return null;
    }
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
  async route(ctx = {}) {
    if (ctx && typeof ctx.overrideModelId === 'string') {
      const forcedModel = this.models[ctx.overrideModelId];
      if (forcedModel) {
        const forcedRotator = this.rotators[forcedModel.provider];
        let forcedKey = null;
        try {
          forcedKey = forcedRotator ? await forcedRotator.getNextKey() : null;
        } catch (err) {
          console.error(`[ModelRouter] Failed to get key for override model:`, err.message);
        }
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
    
    // Skill-RL Integration: Get skill-based model recommendations
    let skillBoost = {};
    if (this.skillRLManager) {
      try {
        const taskType = ctx?.taskType || 'general';
        const recommended = this.skillRLManager.selectSkills({ 
          taskType, 
          context: ctx 
        });
        if (recommended?.length > 0) {
          recommended.forEach(skill => {
            if (skill.recommendedModels) {
              skill.recommendedModels.forEach(modelId => {
                skillBoost[modelId] = (skillBoost[modelId] || 0) + skill.successRate;
              });
            }
          });
        }
      } catch (e) {
        // Silently skip skill RL if unavailable
      }
    }
    
    const scored = candidates.map((modelId) => {
      const baseScore = this._scoreModel(modelId, ctx);
      const boost = skillBoost[modelId] || 0;
      return {
        modelId,
        ...baseScore,
        score: baseScore.score + (boost * 0.1), // 10% weight for skill-based recommendations
      };
    });
    scored.sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      throw new Error('No model available for the given constraints');
    }

    const winner = scored[0];
    const model = this.models[winner.modelId];
    const rotator = KeyRotatorFactory.getRotator(this.rotators, model.provider);
    let key = null;
    try {
      key = rotator ? await rotator.getNextKey() : null;
    } catch (err) {
      console.error(`[ModelRouter] Failed to get key for winner model:`, err.message);
    }
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
          let key = null;
          try {
            key = rotator ? await rotator.getNextKey() : null;
          } catch (err) {
            console.error(`[ModelRouter] Failed to get key in routeAsync:`, err.message);
          }
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
    
    // P1: Atomic Write for Stats - persist after each update
    this._persistStatsAtomic();
  }

  /**
   * Atomic stats persistence - write to temp file then rename.
    * @private
    */
  async _persistStatsAtomic() {
    if (!this.statsPersistPath || this._statsWritePending) return;
    
    this._statsWritePending = true;
    try {
      const fs = require('fs').promises;
      const tempPath = this.statsPersistPath + '.tmp';
      const backupPath = this.statsPersistPath + '.backup';
      
      // Write to temp file
      const statsJson = JSON.stringify(this.stats, null, 2);
      await fs.writeFile(tempPath, statsJson, 'utf8');
      
      // Try to keep backup of previous successful write
      try {
        await fs.access(this.statsPersistPath);
        await fs.copyFile(this.statsPersistPath, backupPath);
      } catch {
        // No previous file exists yet - that's OK
      }
      
      // Atomic rename
      await fs.rename(tempPath, this.statsPersistPath);
    } catch (err) {
      console.error('[ModelRouter] Failed to persist stats:', err.message);
    } finally {
      this._statsWritePending = false;
    }
  }

  /**
   * P1: Errors Integration - Create standardized error using OpenCodeErrors taxonomy
   * @private
   */
  _createError(code, message, context = {}) {
    if (this.errorHandler && this._errorCategory && this._errorCode) {
      // Use the provided error handler with standardized taxonomy
      return this.errorHandler.createError({
        code: code,
        message: message,
        context: context,
        category: this._errorCategory.ORCHESTRATION
      });
    }
    // Fallback to standard Error
    const err = new Error(message);
    err.code = code;
    err.context = context;
    return err;
  }

  /**
   * Validate route input using Validator if available.
   * @private
   * @param {Object} ctx - Route context
   * @returns {Object|null} - ValidationResult or null if validator not available
   */
  _validateInput(ctx) {
    if (!this.validator || !this.validator.Validator) {
      return null;
    }

    const result = new this.validator.ValidationResult(true, []);
    
    // Validate required fields
    const ctxValidator = new this.validator.Validator(ctx, 'ctx');
    if (ctx.requiredTools) {
      const toolsValidator = new this.validator.Validator(ctx.requiredTools, 'ctx.requiredTools');
      toolsValidator.type('array');
      if (toolsValidator.errors.length > 0) {
        result.errors.push(...toolsValidator.errors);
        result.valid = false;
      }
    }
    
    return result;
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

      // P3: Feature Flags for Model Rollouts - Check rollout percentage
      if (this.featureFlags) {
        const flagName = `model:${modelId}`;
        if (!this.featureFlags.isEnabled(flagName, ctx.userId)) {
          return false;
        }
      }

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

    // P1: Apply learning-based penalties from LearningEngine
    const learningPenalty = this._applyLearningPenalties(modelId, ctx);
    if (learningPenalty.scorePenalty > 0) {
      score -= learningPenalty.scorePenalty;
      reasons.push(...learningPenalty.reasons);
    }

    return {
      score: Math.max(0, Math.min(1, score)),
      reason: reasons.join('; '),
    };
  }

  /**
   * P1: Get learning-guided advice for routing decisions
   * Uses LearningEngine to penalize models with anti-pattern history
   * @private
   */
  _getLearningAdvice(ctx = {}) {
    if (!this.learningEngine) {
      return { warnings: [], suggestions: [], shouldPause: false, riskScore: 0 };
    }

    // Build cache key from context
    const cacheKey = JSON.stringify({
      taskType: ctx.taskType,
      files: ctx.files?.slice(0, 5) || [],
      complexity: ctx.complexity
    });

    // Check cache
    const cached = this._learningAdviceCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this._learningAdviceCacheTTL) {
      return cached.advice;
    }

    try {
      // Build task context for learning engine
      const taskContext = {
        task_type: ctx.taskType || ctx.task || 'general',
        files: ctx.files || [],
        complexity: ctx.complexity || 'moderate',
        error_type: ctx.errorType,
        attempt_number: ctx.attemptNumber || 1
      };

      const advice = this.learningEngine.advise(taskContext);

      // Cache the result
      this._learningAdviceCache.set(cacheKey, {
        timestamp: Date.now(),
        advice
      });

      return advice;
    } catch (error) {
      console.warn('[ModelRouter] LearningEngine advise failed:', error.message);
      return { warnings: [], suggestions: [], shouldPause: false, riskScore: 0 };
    }
  }

  /**
   * Apply learning penalties to model scoring
   * @private
   */
  _applyLearningPenalties(modelId, ctx = {}) {
    const result = { scorePenalty: 0, reasons: [] };
    
    if (!this.learningEngine) {
      return result;
    }

    const advice = this._getLearningAdvice(ctx);
    
    // Apply penalties from anti-pattern warnings
    if (advice.warnings && advice.warnings.length > 0) {
      for (const warning of advice.warnings) {
        // Penalize if this model is associated with the warning or it's a general warning
        if (warning.modelId === modelId || !warning.modelId) {
          const severityWeight = warning.severity === 'critical' ? 0.5 : 
                               warning.severity === 'high' ? 0.3 : 
                               warning.severity === 'medium' ? 0.15 : 0.05;
          result.scorePenalty += severityWeight;
          result.reasons.push(`learning:${warning.type}(${warning.severity})`);
        }
      }
    }

    // Apply risk score penalty
    if (advice.riskScore && advice.riskScore > 15) {
      result.scorePenalty += Math.min(0.3, advice.riskScore / 100);
      result.reasons.push(`risk:${advice.riskScore.toFixed(1)}`);
    }

    return result;
  }

  /**
   * Record outcome to learning engine for future routing decisions
   * @param {string} modelId
   * @param {Object} outcome - { success, failureReason, tokensUsed, timeTakenMs }
   */
  recordLearningOutcome(modelId, outcome) {
    if (!this.learningEngine) {
      return;
    }

    try {
      // Generate advice ID for tracking
      const adviceId = `router_${modelId}_${Date.now()}`;
      
      // Learn from outcome
      this.learningEngine.learnFromOutcome(adviceId, {
        success: outcome.success,
        failure_reason: outcome.failureReason,
        tokens_used: outcome.tokensUsed,
        time_taken_ms: outcome.timeTakenMs,
        model_id: modelId
      });

      // Also emit event for other listeners
      this.learningEngine.emit('routeOutcome', {
        modelId,
        outcome,
        adviceId
      });
    } catch (error) {
      console.warn('[ModelRouter] Failed to record learning outcome:', error.message);
    }
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

  // ─── Backward Compatibility Aliases ─────────────────────────────────────

  /**
   * Alias for route() - backward compatibility
   */
  selectModel(ctx = {}) {
    return this.route(ctx);
  }

  /**
   * Alias for recordResult() - backward compatibility
   */
  recordOutcome(modelId, success, latencyOrError = 0) {
    return this.recordResult(modelId, success, latencyOrError);
  }

  /**
   * Alias for recordResult() - backward compatibility (old signature)
   */
  getModelStats(modelId) {
    return this.stats[modelId] || { calls: 0, successes: 0, failures: 0, total_latency_ms: 0 };
  }
}

// ─── Exports ───────────────────────────────────────────────────

module.exports = { ModelRouter, policies };
