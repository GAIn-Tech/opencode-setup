'use strict';

const path = require('path');
const { IntelligentRotator } = require('./key-rotator');
const { KeyRotatorFactory } = require('./key-rotator-factory');
const policies = require('./policies.json');
const Orchestrator = require('./strategies/orchestrator');
let CircuitBreaker;
try { ({ CircuitBreaker } = require('@jackoatmon/opencode-circuit-breaker')); } catch (e) {
  try { ({ CircuitBreaker } = require('../../opencode-circuit-breaker/src/index.js')); } catch (e2) {
    CircuitBreaker = null;
  }
}
const DynamicExplorationController = require('./dynamic-exploration-controller');
const TokenBudgetManager = require('./token-budget-manager');
const TokenCostCalculator = require('./strategies/token-cost-calculator');

// Resilient subagent routing components
const { resolveModelAlias, hasAlias, getAliasesFor, MODEL_ALIASES } = require('./model-alias-resolver');
const { validateResponse, isRetriableFailure, FAILURE_TYPES, ResponseValidationError } = require('./response-validator');
const { SubagentRetryManager, CATEGORY_FALLBACKS, DEFAULT_FALLBACKS } = require('./subagent-retry-manager');

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
let MetaAwarenessTracker;
try { Logger = require('@jackoatmon/opencode-logger'); } catch (e) {
  try { Logger = require('../../opencode-logger/src/index.js'); } catch (e2) { Logger = null; }
}
if (Logger && typeof Logger !== 'function') {
  Logger = Logger.Logger || Logger.default || null;
}
try { ValidatorLib = require('@jackoatmon/opencode-validator'); } catch (e) {
  try { ValidatorLib = require('../../opencode-validator/src/index.js'); } catch (e2) { ValidatorLib = null; }
}
try { OpenCodeErrors = require('@jackoatmon/opencode-errors'); } catch (e) {
  try { OpenCodeErrors = require('../../opencode-errors/src/index.js'); } catch (e2) { OpenCodeErrors = null; }
}
try { FallbackDoctor = require('@jackoatmon/opencode-fallback-doctor'); } catch (e) {
  try { FallbackDoctor = require('../../opencode-fallback-doctor/src/index.js'); } catch (e2) { FallbackDoctor = null; }
}
try { HealthCheck = require('@jackoatmon/opencode-health-check'); } catch (e) {
  try { HealthCheck = require('../../opencode-health-check/src/index.js'); } catch (e2) { HealthCheck = null; }
}
try {
  ({ MetaAwarenessTracker } = require('@jackoatmon/opencode-learning-engine'));
} catch (e) {
  try {
    ({ MetaAwarenessTracker } = require('../../opencode-learning-engine/src/index.js'));
  } catch (e2) {
    MetaAwarenessTracker = null;
  }
}

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
    this.integrationLayerClass = options.integrationLayerClass || IntegrationLayer;
    this._log = options.logger || null;
    
    // Lazy-initialize on first use
    this._services = {};
  }
  
  /**
   * Initialize the adapter with required services
   */
  initialize(modelRouter) {
    if (this._initialized) return;
    
    // Create IntegrationLayer instance if we got the class
    if (this.integrationLayerClass && !this.layer) {
      this.layer = new this.integrationLayerClass({
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
   * Transforms raw advice into metaKBAdvice format for routing pipeline
   */
  getLearningAdvice(context) {
    if (!this.layer?.advisor) {
      this._log?.warn('[ModelRouter] Learning advisor not available');
      return null;
    }
    try {
      const normalizedContext = this.layer?.normalizeTaskContext
        ? this.layer.normalizeTaskContext(context || {})
        : {
            ...(context || {}),
            task_type: context?.task_type || context?.taskType || context?.task || 'general',
            attempt_number: context?.attempt_number ?? context?.attemptNumber ?? 1,
          };
      const advice = this.layer.advisor.advise(normalizedContext);
      if (!advice) return null;
      
      // Transform advice into metaKBAdvice format for routing
      // Look for anti-patterns that mention specific models to penalize
      const modelPenalties = {};
      const antiPatterns = advice.antiPatterns || advice.patterns || [];
      
      for (const pattern of antiPatterns) {
        if (pattern.affected_models || pattern.models) {
          const models = pattern.affected_models || pattern.models;
          const severity = pattern.severity === 'high' ? -0.3 : pattern.severity === 'medium' ? -0.15 : -0.05;
          for (const modelId of models) {
            modelPenalties[modelId] = (modelPenalties[modelId] || 0) + severity;
          }
        }
      }
      
      return {
        ...advice,
        metaKBAdvice: {
          modelPenalties,
          source: 'meta-kb',
        }
      };
    } catch (e) {
      this._log?.error('[ModelRouter] Learning advice failed:', e.message);
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
   * Orchestration state machine for tracking task lifecycle
   * Enables dynamic adaptation and error recovery
   */
  orchestrationState = {
    currentTaskId: null,
    phase: 'idle', // idle -> selecting -> executing -> completed | failed
    attempts: 0,
    history: [],
    context: {}
  };

  /**
   * Transition orchestration state and record in history
   */
  transitionState(newPhase, context = {}) {
    const prevPhase = this.orchestrationState.phase;
    this.orchestrationState.phase = newPhase;
    this.orchestrationState.context = { ...this.orchestrationState.context, ...context };
    this.orchestrationState.history.push({
      from: prevPhase,
      to: newPhase,
      timestamp: Date.now(),
      ...context
    });
    // Keep history bounded
    if (this.orchestrationState.history.length > 50) {
      this.orchestrationState.history.shift();
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
    // T19 (Wave 11): Startup time instrumentation
    const _startupT0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

    // P4: INTEGRATION ADAPTER - Single point of integration (fixes option creep)
    // Instead of 10+ if-checks, use the adapter for all integrations
    this._adapter = new RouterIntegrationAdapter(IntegrationLayer, {
      skillRL: options.skillRLManager,
      quotaManager: options.quotaManager,
      preloadSkills: options.preloadSkills,
      integrationLayerClass: options.integrationLayerClass,
      logger: options.logger || null,
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
    const MetaAwarenessTrackerClass = options.metaAwarenessTrackerClass || MetaAwarenessTracker;
    this.metaAwarenessTracker = options.metaAwarenessTracker || (MetaAwarenessTrackerClass ? new MetaAwarenessTrackerClass() : null);

    // T4 (Wave 11): Context Governor for budget-aware routing
    this.contextGovernor = options.contextGovernor || null;
    
    // P1: Atomic Write for Stats - add stats persistence path
    this.statsPersistPath = options.statsPersistPath || null;
    this._statsWritePending = false;
    
    // P1: Learning-Guided Model Routing - integrate LearningEngine
    this.learningEngine = options.learningEngine || null;
    this._learningAdviceCache = new Map();
    this._learningAdviceCacheTTL = 300000; // 5 minutes cache - longer for anti-pattern learning
    this._learningAdviceCacheMaxSize = 1000; // Prevent unbounded growth - evict oldest at limit

    // T5 (Wave 11): Model ID resolution cache - O(1) lookup after first resolution
    this._modelIdCache = null; // Lazy-init Map for O(1) resolution
    
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

    // P3: Dynamic Exploration Mode
    const cliExploration = process.argv.includes('--exploration') || process.argv.includes('--explore');
    const explorationActive = options.exploration?.active ?? cliExploration ?? String(process.env.OPENCODE_EXPLORATION_ACTIVE || '').toLowerCase() === 'true';
    const explorationMode = options.exploration?.mode || process.env.OPENCODE_EXPLORATION_MODE || 'balanced';
    const explorationBudget = Number(options.exploration?.budget ?? process.env.OPENCODE_EXPLORATION_BUDGET ?? 20);
    const explorationTokenRatio = Number(options.exploration?.tokenBudgetRatio ?? process.env.OPENCODE_EXPLORATION_TOKEN_RATIO ?? 0.1);
    this.tokenBudgetManager = options.tokenBudgetManager || new TokenBudgetManager({
      minExplorationTokens: options.exploration?.minTokens ?? process.env.OPENCODE_EXPLORATION_MIN_TOKENS,
    });
    this.explorationController = options.explorationController || new DynamicExplorationController({
      tokenBudgetRatio: explorationTokenRatio,
      tokenBudgetManager: this.tokenBudgetManager,
    });

    if (explorationActive) {
      void this.explorationController.activate(explorationMode, explorationBudget);
    }
    
    // P1: ConfigLoader Integration - use centralized configuration
    this.configLoader = options.configLoader || null;
    if (this.configLoader) {
      this.config = this.configLoader.load();
    } else {
      this.config = {};
    }
    
    // P2: Logger Integration - use structured logging
    const LoggerCtor = options.loggerClass || Logger;
    if (options.logger) {
      this.logger = options.logger;
    } else if (LoggerCtor) {
      this.logger = new LoggerCtor({ service: 'model-router' });
    } else {
      this.logger = null;
    }

    // P2: Validator Integration - Initialize input validator
    const validatorModule = options.validator || ValidatorLib;
    if (validatorModule && validatorModule.Validator && validatorModule.ValidationResult) {
      this.validator = validatorModule;
    } else {
      this.validator = null;
    }

    // P1: Errors Integration - use standardized error taxonomy
    const errorTaxonomy = options.openCodeErrors || OpenCodeErrors;
    this.errorHandler = options.errorHandler || null;
    this._errorCategory = errorTaxonomy?.ErrorCategory || null;
    this._errorCode = errorTaxonomy?.ErrorCode || null;

    this.healthCheck = options.healthCheck || HealthCheck || null;
    this.CircuitBreaker = options.circuitBreakerClass || CircuitBreaker || null;

    // P2: Fallback Doctor Auto-Validation - validate fallback chains at initialization
    this.fallbackDoctor = options.fallbackDoctor || null;
    if (this.fallbackDoctor) {
      const chainModels = Object.keys(this.models);
      const diagnosis = this.fallbackDoctor.diagnose({ models: chainModels });
      if (!diagnosis.healthy) {
        this._logWarn('[ModelRouter] Fallback chain issues detected', {
          issues: diagnosis.issues.map((i) => i.message),
        });
      }
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
       this._logError('[ModelRouter] Failed to initialize Orchestrator', { error: error?.message || error });
       this._logError('[ModelRouter] Falling back to legacy scoring system');
       this.orchestrator = null;
     }

    // Initialize circuit breakers for each provider
    this.circuitBreakers = {};
    const providers = [...new Set(Object.values(this.models).map(m => m.provider))];
    if (this.CircuitBreaker) {
      for (const provider of providers) {
        this.circuitBreakers[provider] = new this.CircuitBreaker({
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
    }
    
    // P2: Health-Check Integration - Register providers as subsystems
    this._registerProvidersWithHealthCheck();

    // T19 (Wave 11): Log startup duration
    const _startupMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - _startupT0;
    this._logInfo('[Startup] ModelRouter', { startupMs: Number(_startupMs.toFixed(1)) });
  }

  _logInfo(message, meta) {
    if (this.logger?.info) {
      this.logger.info(message, meta);
      return;
    }
    if (meta !== undefined) {
      console.log(message, meta);
      return;
    }
    console.log(message);
  }

  _logWarn(message, meta) {
    if (this.logger?.warn) {
      this.logger.warn(message, meta);
      return;
    }
    if (meta !== undefined) {
      console.warn(message, meta);
      return;
    }
    console.warn(message);
  }

  _logError(message, meta) {
    if (this.logger?.error) {
      this.logger.error(message, meta);
      return;
    }
    if (meta !== undefined) {
      console.error(message, meta);
      return;
    }
    console.error(message);
  }

  /**
   * T5 (Wave 11): Invalidate model ID resolution cache.
   * Call when model registry changes.
   */
  _invalidateModelIdCache() {
    this._modelIdCache = null;
  }

  /**
   * P1: Execute through circuit breaker - Wrap provider calls with active circuit breaker
   * @param {string} provider - Provider name
   * @param {Function} fn - Async function to execute
   * @returns {Promise<any>}
   */
  async executeThroughBreaker(provider, fn) {
    const breaker = this.circuitBreakers[provider];
    if (!breaker) return fn();
    
    return breaker.execute(fn);
  }

  /**
   * P2: Register model providers with health-check system
   * @private
   */
  _registerProvidersWithHealthCheck() {
    if (!this.healthCheck || typeof this.healthCheck.registerSubsystem !== 'function') {
      return;
    }
    
    const providers = [...new Set(Object.values(this.models).map(m => m.provider))];
    for (const provider of providers) {
      this.healthCheck.registerSubsystem(`model-provider:${provider}`, async () => {
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
        }, {
        checkInterval: 30000,
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
    const explorationSelection = this.explorationController?.selectModelForTaskSync({
      taskId: ctx.taskId || ctx.sessionId || 'unknown',
      intentCategory: ctx.taskType || ctx.task || 'general',
      complexity: ctx.complexity || 'moderate',
      availableTokens: ctx.availableTokens,
      sessionId: ctx.sessionId,
      modelId: ctx.modelId,
      language: ctx.language,
      fileSize: ctx.fileSize,
    });

    if (explorationSelection?.model) {
      const resolved = this.resolveModelId ? this.resolveModelId(explorationSelection.model) : explorationSelection.model;
      const model = this.models[resolved];
      if (model) {
        const rotator = KeyRotatorFactory.getRotator(this.rotators, model.provider);
        const key = rotator ? rotator.getNextKey() : null;
        return {
          model,
          keyId: key ? key.id : null,
          modelId: resolved,
          score: 1,
          reason: explorationSelection.isExploration ? 'exploration:thompson' : 'exploration:best-known',
          rotator,
          key,
        };
      }
    }

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

    let candidates = this._filterByConstraints(ctx || {});
    
    // Pre-selection health verification: Filter out unavailable models before scoring
    // This prevents tool timeouts by checking circuit breaker state and key availability
    candidates = this._filterByHealth(candidates);
    
    // Skill-RL Integration: Get skill-based model recommendations (T7: memoized)
    let skillBoost = {};
    if (this.skillRLManager) {
      try {
        const taskType = ctx?.taskType || 'general';
        // T7 (Wave 11): Memoize selectSkills by taskType (10-min TTL, 200-entry max)
        if (!this._skillRLMemo) this._skillRLMemo = new Map();
        const cached = this._skillRLMemo.get(taskType);
        const now = Date.now();
        let recommended;
        if (cached && (now - cached.ts) < 600000) {
          recommended = cached.value;
        } else {
          recommended = this.skillRLManager.selectSkills({ 
            taskType, 
            context: ctx 
          });
          // Evict oldest if over 200 entries
          if (this._skillRLMemo.size >= 200) {
            const oldest = this._skillRLMemo.keys().next().value;
            this._skillRLMemo.delete(oldest);
          }
          this._skillRLMemo.set(taskType, { value: recommended, ts: now });
        }
        // T24: SkillBank.selectSkills does not expose recommendedModels on skill objects.
        // When skill-to-model mapping is added, populate skillBoost here
        // using skill.success_rate (snake_case, matching SkillBank output shape).
        // Dead recommendedModels/successRate(camelCase) code removed.
      } catch (e) {
        // Silently skip skill RL if unavailable
      }
    }
    
    // P1: Meta-KB Integration: Get learning engine advice for model selection
    // Query meta-KB for anti-patterns that should penalize specific models
    let metaKBPenalty = {};
    if (this.learningEngine) {
      try {
        const advice = this.getLearningAdvice(ctx);
        if (advice?.metaKBAdvice) {
          // metaKBAdvice format: { modelPenalties: { 'model-id': -0.2, ... } }
          metaKBPenalty = advice.metaKBAdvice.modelPenalties || {};
        }
      } catch (e) {
        // Silently skip meta-KB advice if unavailable
      }
    }
    
    const scored = candidates.map((modelId) => {
      const baseScore = this._scoreModel(modelId, ctx);
      const boost = skillBoost[modelId] || 0;
      const penalty = metaKBPenalty[modelId] || 0;
      return {
        modelId,
        ...baseScore,
        score: baseScore.score + (boost * 0.1) + penalty, // 10% weight for skill, meta-KB penalty applied
      };
    });
    scored.sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      // Emergency fallback: try any available model regardless of constraints
      const emergencyModels = Object.values(this.models).filter(m => m.provider);
      if (emergencyModels.length > 0) {
        const fallback = emergencyModels[0];
        const rotator = KeyRotatorFactory.getRotator(this.rotators, fallback.provider);
        const key = rotator ? rotator.getNextKey() : null;
        return {
          model: fallback,
          keyId: key ? key.id : null,
          modelId: fallback.id,
          score: 0,
          reason: 'emergency-fallback: no models matched constraints',
          rotator,
          key,
        };
      }
      throw new Error('No model available for the given constraints');
    }

    const winner = scored[0];
    const model = this.models[winner.modelId];
    const rotator = KeyRotatorFactory.getRotator(this.rotators, model.provider);
    const key = rotator ? rotator.getNextKey() : null;
    if (this.metaAwarenessTracker) {
      this.metaAwarenessTracker.trackEvent({
        event_type: 'orchestration.model_selected',
        task_type: ctx?.taskType || ctx?.task || 'general',
        complexity: ctx?.complexity || 'moderate',
        outcome: 'selected',
        metadata: {
          model: winner.modelId,
          provider: model.provider,
          score: winner.score,
          reason: winner.reason,
        },
      });
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
    const explorationSelection = await this.explorationController?.selectModelForTask({
      taskId: ctx.taskId || ctx.sessionId || 'unknown',
      intentCategory: ctx.taskType || ctx.task || 'general',
      complexity: ctx.complexity || 'moderate',
      availableTokens: ctx.availableTokens,
      sessionId: ctx.sessionId,
      modelId: ctx.modelId,
      language: ctx.language,
      fileSize: ctx.fileSize,
    });

    if (explorationSelection?.model) {
      const resolved = this.resolveModelId ? this.resolveModelId(explorationSelection.model) : explorationSelection.model;
      const model = this.models[resolved];
      if (model) {
        const rotator = KeyRotatorFactory.getRotator(this.rotators, model.provider);
        const key = rotator ? await rotator.getNextKey() : null;
        return {
          model,
          keyId: key ? key.id : null,
          modelId: resolved,
          score: 1,
          reason: explorationSelection.isExploration ? 'exploration:thompson' : 'exploration:best-known',
          rotator,
          key,
        };
      }
    }

    if (this.orchestrator && typeof this.orchestrator.selectModel === 'function' && ctx.task) {
      try {
        const selection = await this.orchestrator.selectModel(ctx.task, ctx);
        // P1: Use resolveModelId to canonicalize model ID from orchestrator
        const resolvedModelId = this.resolveModelId(selection?.model_id);
        if (selection && selection.model_id && resolvedModelId) {
          const model = this.models[resolvedModelId];
          const rotator = KeyRotatorFactory.getRotator(this.rotators, model.provider);
          const key = rotator ? await rotator.getNextKey() : null;
          // P1: Track adviceId for learning correlation
          const adviceId = selection.adviceId || `orchestrator_${selection.model_id}_${Date.now()}`;
          return {
            model,
            keyId: key ? key.id : null,
            modelId: resolvedModelId,
            score: -1,
            reason: `orchestrator:${selection.strategy || 'strategy'}`,
            rotator,
            key,
            orchestration: selection,
            adviceId, // P1: Pass adviceId for learning correlation
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
   * Atomic stats persistence - write to temp file then rename.
   * @private
   */
  async _persistStatsAtomic() {
    if (!this.statsPersistPath || this._statsWritePending) return;
    
    this._statsWritePending = true;
    try {
      const fs = require('fs').promises;
      const tempPath = this.statsPersistPath + '.tmp';
      await fs.writeFile(tempPath, JSON.stringify(this.stats, null, 2), 'utf8');
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
   * Pre-selection health verification: Filter out unavailable models before scoring.
   * This prevents tool timeouts by checking:
   * 1. Circuit breaker state (provider-level)
   * 2. Key availability (rotator health)
   * 
   * @private
   * @param {string[]} candidateIds - Model IDs to filter
   * @returns {string[]} - Available model IDs
   */
  _filterByHealth(candidateIds) {
    return candidateIds.filter((modelId) => {
      const model = this.models[modelId];
      if (!model) return false;
      
      // Check circuit breaker state for this provider
      const cb = this.circuitBreakers[model.provider];
      if (cb) {
        const state = cb.getState();
        // Exclude models from providers with open or half-open circuit breakers
        if (state === 'open' || state === 'half-open') {
          return false;
        }
      }
      
      // Check key availability via rotator
      const rotator = KeyRotatorFactory.getRotator(this.rotators, model.provider);
      if (rotator) {
        // Check if rotator has any healthy keys available
        if (typeof rotator.getProviderStatus === 'function') {
          const status = rotator.getProviderStatus();
          if (status?.isExhausted || status?.healthyKeys === 0) {
            return false;
          }
        }
        // Also check if we can get a key (more direct check)
        try {
          const key = rotator.getNextKey();
          if (!key) {
            return false;
          }
        } catch (e) {
          // If getNextKey throws, exclude this model
          return false;
        }
      }
      
      return true;
    });
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

      // Cache the result - with eviction to prevent unbounded growth
      if (this._learningAdviceCache.size >= this._learningAdviceCacheMaxSize) {
        // Evict oldest 10% entries
        const entries = [...this._learningAdviceCache.entries()];
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toRemove = Math.floor(this._learningAdviceCacheMaxSize * 0.1);
        for (let i = 0; i < toRemove; i++) {
          this._learningAdviceCache.delete(entries[i][0]);
        }
      }
      this._learningAdviceCache.set(cacheKey, {
        timestamp: Date.now(),
        advice
      });

      return advice;
    } catch (error) {
      this._logWarn('[ModelRouter] LearningEngine advise failed', { error: error.message });
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

    // Apply meta-KB signals (from Wave 9 meta-knowledge-base integration)
    // advice.routing.meta_kb_warnings is set by the adviceGenerated hook (Task 6)
    // advice.routing.meta_kb_evidence is set by the same hook for positive signals
    const routing = advice.routing || {};
    const metaWarnings = typeof routing.meta_kb_warnings === 'number' ? routing.meta_kb_warnings : 0;
    const metaEvidence = Array.isArray(routing.meta_kb_evidence) ? routing.meta_kb_evidence : [];

    if (metaWarnings > 0) {
      // Each meta-KB warning applies a small penalty (capped at 0.25)
      const metaPenalty = Math.min(0.25, metaWarnings * 0.05);
      result.scorePenalty += metaPenalty;
      result.reasons.push(`meta-kb:warnings(${metaWarnings})`);
    }

    if (metaEvidence.length > 0) {
      // Positive evidence reduces penalty (bonus capped at 0.1)
      const metaBonus = Math.min(0.1, metaEvidence.length * 0.03);
      result.scorePenalty = Math.max(0, result.scorePenalty - metaBonus);
      result.reasons.push(`meta-kb:evidence(${metaEvidence.length})`);
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
      this._logWarn('[ModelRouter] Failed to record learning outcome', { error: error.message });
    }
  }

  reloadConfig() {
    if (!this.configLoader) return false;
    try {
      this.config = this.configLoader.load();
      return true;
    } catch (error) {
      this._logWarn('[ModelRouter] Failed to reload config', { error: error.message });
      return false;
    }
  }

  async recordExplorationOutcome(task, selection, result) {
    if (!this.explorationController) return null;
    const metrics = await this.explorationController.gatherMetrics(task, selection, result);
    if (result?.tokensUsed && task?.sessionId) {
      const tokens = typeof result.tokensUsed === 'number'
        ? result.tokensUsed
        : (result.tokensUsed.input || 0) + (result.tokensUsed.output || 0);
      this.tokenBudgetManager?.recordUsage(task.sessionId, selection?.model, tokens);
    }

    if (this.skillRLManager?.skillBank && selection?.model) {
      const taskType = task?.intentCategory || task?.taskType || 'general';
      const skillName = `model:${selection.model}`;
      this.skillRLManager.skillBank.addTaskSpecificSkill(taskType, {
        name: skillName,
        principle: 'Model selection based on exploration outcomes',
        application_context: `Model exploration for ${taskType}`,
      });
      this.skillRLManager.learnFromOutcome({
        task_type: taskType,
        skill_used: skillName,
        success: Boolean(result?.success),
        outcome: result?.success ? 'success' : 'failure',
      });
    }
    return metrics;
  }

  /**
   * T12: Known benchmark pass@1 scores for common models.
   * Used by _applyBenchmarkBonus() as a supplementary routing signal.
   * Scores are normalized pass@1 rates (0-1) from HumanEval and MBPP.
   * Updated periodically from opencode-model-benchmark assessment runs.
   * @private
   */
  static BENCHMARK_SCORES = {
    'anthropic/claude-opus-4-6':        { humaneval: 0.92, mbpp: 0.90 },
    'anthropic/claude-opus-4-5':        { humaneval: 0.90, mbpp: 0.88 },
    'anthropic/claude-sonnet-4-5':      { humaneval: 0.88, mbpp: 0.86 },
    'anthropic/claude-haiku-4-5':       { humaneval: 0.78, mbpp: 0.80 },
    'openai/gpt-5':                     { humaneval: 0.89, mbpp: 0.87 },
    'openai/gpt-5.2':                   { humaneval: 0.72, mbpp: 0.75 },
    'openai/o1':                        { humaneval: 0.93, mbpp: 0.91 },
    'openai/o1-mini':                   { humaneval: 0.82, mbpp: 0.80 },
    'google/gemini-3-pro':              { humaneval: 0.85, mbpp: 0.84 },
    'google/gemini-3-flash':            { humaneval: 0.76, mbpp: 0.78 },
    'deepseek/deepseek-chat':           { humaneval: 0.80, mbpp: 0.82 },
    'groq/llama-4-maverick':            { humaneval: 0.73, mbpp: 0.76 },
    'groq/llama-4-scout':               { humaneval: 0.68, mbpp: 0.72 },
    'groq/llama-3.3-70b-versatile':     { humaneval: 0.65, mbpp: 0.70 },
    'cerebras/llama-4-maverick':        { humaneval: 0.73, mbpp: 0.76 },
    'cerebras/llama-3.3-70b':           { humaneval: 0.62, mbpp: 0.68 },
  };

  /**
   * T12: Apply benchmark bonus to model score.
   * Reads HumanEval/MBPP pass@1 from known benchmark scores and applies
   * a 0 to 0.15 bonus as a supplementary routing signal.
   * Does NOT change existing scoring weights.
   * @private
   * @param {string} modelId - Canonical model ID (e.g. 'anthropic/claude-opus-4-6')
   * @returns {{ bonus: number, reason: string|null }}
   */
  _applyBenchmarkBonus(modelId) {
    const scores = ModelRouter.BENCHMARK_SCORES[modelId];
    if (!scores) {
      return { bonus: 0, reason: null };
    }

    // Average the available benchmark scores
    const benchScores = [];
    if (typeof scores.humaneval === 'number') benchScores.push(scores.humaneval);
    if (typeof scores.mbpp === 'number') benchScores.push(scores.mbpp);

    if (benchScores.length === 0) {
      return { bonus: 0, reason: null };
    }

    const avgScore = benchScores.reduce((a, b) => a + b, 0) / benchScores.length;

    // Map average score (0-1) to bonus (0-0.15)
    // Only apply bonus for scores above 0.60 baseline (below is no bonus)
    // Linear scale: 0.60 → 0, 1.0 → 0.15
    const baseline = 0.60;
    const maxBonus = 0.15;
    const bonus = avgScore > baseline
      ? Math.min(maxBonus, ((avgScore - baseline) / (1.0 - baseline)) * maxBonus)
      : 0;

    return {
      bonus: Math.round(bonus * 1000) / 1000, // Round to 3 decimal places
      reason: `benchmark(avg=${avgScore.toFixed(2)},+${bonus.toFixed(3)})`
    };
  }

  /**
   * T13: Apply cost-efficiency factor to model score.
   * Uses TokenCostCalculator pricing to favor cost-efficient models.
   * Lower cost-per-token → higher bonus (max 0.05, i.e. 5% weight).
   * Supplementary signal — does NOT change existing scoring weights.
   * @private
   * @param {string} modelId - Canonical model ID
   * @returns {{ bonus: number, reason: string|null }}
   */
  _applyCostEfficiency(modelId) {
    const model = this.models[modelId];
    if (!model || !model.provider) {
      return { bonus: 0, reason: null };
    }

    // Initialize calculator lazily
    if (!this._tokenCostCalc) {
      this._tokenCostCalc = new TokenCostCalculator();
    }

    // Extract model name without provider prefix for pricing lookup
    const modelName = modelId.includes('/') ? modelId.split('/').pop() : modelId;
    const pricing = this._tokenCostCalc.getPricing(model.provider, modelName);

    if (!pricing) {
      return { bonus: 0, reason: null };
    }

    // Use average of input + output cost per 1K tokens as the cost signal
    const avgCostPer1K = (pricing.input + pricing.output) / 2;

    // Normalize: lower cost = higher bonus
    // Scale: $0/1K → 0.05 bonus, $15/1K+ → 0 bonus (linear)
    const maxCostThreshold = 15.0; // $/1K tokens - at or above this, no cost bonus
    const maxBonus = 0.05;
    const bonus = avgCostPer1K < maxCostThreshold
      ? maxBonus * (1 - avgCostPer1K / maxCostThreshold)
      : 0;

    return {
      bonus: Math.round(bonus * 1000) / 1000,
      reason: `cost($${avgCostPer1K.toFixed(2)}/1K,+${bonus.toFixed(3)})`
    };
  }

  /**
   * T4 (Wave 11): Apply budget-aware penalty to model score.
   * If session budget is >= 70% consumed, penalize high-cost models to encourage cheaper alternatives.
   * Does NOT block model selection - only adjusts scores.
   * @private
   * @param {string} modelId - Canonical model ID
   * @param {object} ctx - Routing context (may include sessionId)
   * @returns {{ penalty: number, reason: string|null }}
   */
  _applyBudgetPenalty(modelId, ctx) {
    // Need session context to check budget
    const sessionId = ctx?.sessionId;
    if (!sessionId || !this.contextGovernor) {
      return { penalty: 0, reason: null };
    }

    // Get budget status for this session
    const budgetStatus = this.contextGovernor.getRemainingBudget(sessionId, modelId);
    if (!budgetStatus) {
      return { penalty: 0, reason: null };
    }

    const pct = budgetStatus.pct ?? 0;
    // T4: Apply penalty at 70% threshold (lowered from 80%)
    if (pct < 0.70) {
      return { penalty: 0, reason: null };
    }

    // Get model cost - penalize more expensive models more
    const model = this.models[modelId];
    if (!model) {
      return { penalty: 0, reason: null };
    }

    // Initialize calculator lazily
    if (!this._tokenCostCalc) {
      this._tokenCostCalc = new TokenCostCalculator();
    }

    const modelName = modelId.includes('/') ? modelId.split('/').pop() : modelId;
    const pricing = this._tokenCostCalc.getPricing(model.provider, modelName);

    if (!pricing) {
      return { penalty: 0, reason: null };
    }

    // Calculate penalty based on cost and budget severity
    const avgCostPer1K = (pricing.input + pricing.output) / 2;

    // Penalty scales with budget severity:
    // 70-80%: mild penalty (-0.05 for expensive models)
    // 80-95%: moderate penalty (-0.10 for expensive models)
    // 95%+: severe penalty (-0.15 for expensive models)
    let severity = 0.05;
    if (pct >= 0.95) severity = 0.15;
    else if (pct >= 0.80) severity = 0.10;

    // Scale penalty by cost: $0-3/1K = 0, $15+/1K = full penalty
    const maxCostThreshold = 15.0;
    const costFactor = Math.min(1.0, avgCostPer1K / maxCostThreshold);
    const penalty = -(severity * costFactor);

    return {
      penalty: Math.round(penalty * 1000) / 1000,
      reason: `budget(${Math.round(pct * 100)}%,$${avgCostPer1K.toFixed(2)}/1K,${penalty.toFixed(3)})`
    };
  }

  /**
   * Score a single model based on multiple signals.
   * Called by selectModel() for each candidate.
   * @private
   */
  _scoreModel(modelId, ctx) {
    const model = this.models[modelId];
    if (!model) {
      return { score: -Infinity, reason: 'model-not-found' };
    }

    const successRate = this._getSuccessRate(modelId);
    let score = successRate;
    const reasons = [`success_rate(${successRate.toFixed(2)})`];

    const avgLatency = this._getAvgLatency(modelId);
    const baselineLatency = model.default_latency_ms || avgLatency || 1000;
    const latencyPenalty = Math.min(0.20, Math.max(0, avgLatency - baselineLatency) / 5000);
    score -= latencyPenalty;
    reasons.push(`latency(${Math.round(avgLatency || baselineLatency)}ms,-${latencyPenalty.toFixed(3)})`);

    if (ctx?.taskType && Array.isArray(model.task_types)) {
      if (model.task_types.includes(ctx.taskType)) {
        score += 0.10;
        reasons.push(`task(${ctx.taskType},+0.10)`);
      } else {
        score -= 0.05;
        reasons.push(`task(${ctx.taskType},-0.05)`);
      }
    }

    if (Array.isArray(ctx?.requiredStrengths) && ctx.requiredStrengths.length > 0) {
      const modelStrengths = Array.isArray(model.strengths) ? model.strengths : [];
      const matched = ctx.requiredStrengths.filter((s) => modelStrengths.includes(s));
      const strengthBonus = (matched.length / ctx.requiredStrengths.length) * 0.10;
      score += strengthBonus;
      reasons.push(`strengths(${matched.length}/${ctx.requiredStrengths.length},+${strengthBonus.toFixed(3)})`);
      if (matched.length > 0) {
        reasons.push(`strengths_matched(${matched.join(',')})`);
      }
    }

    const rotator = KeyRotatorFactory.getRotator(this.rotators, model.provider);
    if (rotator && typeof rotator.getProviderStatus === 'function') {
      const status = rotator.getProviderStatus();
      if (status?.isExhausted) {
        score -= 0.50;
        reasons.push('rotator-exhausted(-0.50)');
      } else if (
        status
        && Number.isFinite(status.healthyKeys)
        && Number.isFinite(status.totalKeys)
        && status.healthyKeys < status.totalKeys
      ) {
        score -= 0.10;
        reasons.push(`rotator-pressure(${status.healthyKeys}/${status.totalKeys},-0.10)`);
      }
    }

    const cb = this.circuitBreakers[model.provider];
    if (cb) {
      const state = cb.getState();
      if (state === 'open') {
        score -= 0.80;
        reasons.push('circuit-open(-0.80)');
      } else if (state === 'half-open') {
        score -= 0.30;
        reasons.push('circuit-half-open(-0.30)');
      }
    }

    if (ctx?.maxBudget && Number.isFinite(model.cost_per_1k_tokens)) {
      const estimatedCost = model.cost_per_1k_tokens * 2;
      if (estimatedCost > ctx.maxBudget) {
        score -= 0.15;
        reasons.push(`over-budget($${estimatedCost.toFixed(3)}>$${ctx.maxBudget},-0.15)`);
      }
    }

    // Apply benchmark bonus (T12)
    const benchBonus = this._applyBenchmarkBonus(modelId);
    score += benchBonus.bonus;

    // Apply cost efficiency bonus (T13)
    const costBonus = this._applyCostEfficiency(modelId);
    score += costBonus.bonus;

    // T4: Apply budget-aware penalty
    const budgetPenalty = this._applyBudgetPenalty(modelId, ctx);
    score += budgetPenalty.penalty;

    if (benchBonus.reason) reasons.push(benchBonus.reason);
    if (costBonus.reason) reasons.push(costBonus.reason);
    if (budgetPenalty.reason) reasons.push(budgetPenalty.reason);

    const learningPenalty = this._applyLearningPenalties(modelId, ctx || {});
    if (learningPenalty.scorePenalty > 0) {
      score -= learningPenalty.scorePenalty;
      reasons.push(...learningPenalty.reasons);
    }

    return {
      score: Math.max(0, Math.min(1, score)),
      reason: reasons.join('; ')
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

  /**
   * T5 (Wave 11): Resolve model ID with O(1) cache lookup
   * 
   * Resolves a model ID to its full namespaced form (e.g., 'claude-opus-4-6' → 'anthropic/claude-opus-4-6')
   * Uses a cache for O(1) lookup after first resolution.
   * 
   * @param {string} modelId - Model ID to resolve
   * @returns {string|null} - Resolved model ID or null if not found
   */
  resolveModelId(modelId) {
    if (!modelId) return null;

    // Initialize cache lazily (O(1) Map)
    if (!this._modelIdCache) {
      this._modelIdCache = new Map();
    }

    // Cache hit path - O(1) lookup
    if (this._modelIdCache.has(modelId)) {
      return this._modelIdCache.get(modelId);
    }

    const resolvedAlias = resolveModelAlias(modelId);
    if (this.models[resolvedAlias]) {
      this._modelIdCache.set(modelId, resolvedAlias);
      return resolvedAlias;
    }

    // Direct key match (already namespaced)
    if (this.models[modelId]) {
      this._modelIdCache.set(modelId, modelId);
      return modelId;
    }

    // Try provider-prefix inference
    const modelToProvider = {
      'claude': 'anthropic',
      'gpt-4': 'openai',
      'gpt-4o': 'openai',
      'gpt-4-turbo': 'openai',
      'gpt-3.5': 'openai',
      'gpt': 'openai',
      'gemini': 'google',
      'llama': 'groq',
      'mixtral': 'mistral',
      'command': 'cohere',
      'mistral': 'mistral',
      'deepseek': 'deepseek',
    };
    const modelLower = modelId.toLowerCase();
    for (const [pattern, provider] of Object.entries(modelToProvider)) {
      if (modelLower.startsWith(pattern) || modelLower.includes(pattern)) {
        const namespaced = `${provider}/${modelId}`;
        if (this.models[namespaced]) {
          this._modelIdCache.set(modelId, namespaced);
          return namespaced;
        }
      }
    }

    // Try all provider prefixes
    const prefixes = ['anthropic/', 'openai/', 'groq/', 'cerebras/', 'deepseek/', 'nvidia/', 'google/', 'mistral/', 'cohere/', 'x/', 'antigravity/'];
    for (const prefix of prefixes) {
      const namespaced = `${prefix}${modelId}`;
      if (this.models[namespaced]) {
        this._modelIdCache.set(modelId, namespaced);
        return namespaced;
      }

      if (resolvedAlias !== modelId) {
        const aliasedNamespaced = `${prefix}${resolvedAlias}`;
        if (this.models[aliasedNamespaced]) {
          this._modelIdCache.set(modelId, aliasedNamespaced);
          return aliasedNamespaced;
        }
      }
    }

    // Partial match fallback (e.g. version-suffixed IDs)
    for (const [key, model] of Object.entries(this.models)) {
      const modelBaseName = model.id?.replace(/-(\d{8})$/, '').replace(/-(\d{4})$/, '');
      if (modelBaseName && (modelId.includes(modelBaseName) || resolvedAlias.includes(modelBaseName))) {
        this._modelIdCache.set(modelId, key);
        return key;
      }

      const keySuffix = key.split('/').pop();
      if (keySuffix) {
        const keyBase = keySuffix.replace(/-(\d{8})$/, '').replace(/-(\d{4})$/, '');
        if (modelId.includes(keyBase) || resolvedAlias.includes(keyBase)) {
          this._modelIdCache.set(modelId, key);
          return key;
        }
      }
    }

    return null;
  }

  // ─── Model Outcome Recording ───────────────────────────────────────────────

  /**
   * Record a model outcome to update live success rates and latency tracking.
   * Persists to statsPersistPath so outcomes survive across restarts.
   *
   * @param {string} modelId - Model ID (namespaced or bare)
   * @param {boolean} success - Whether the model call succeeded
   * @param {number} latencyMs - Latency in milliseconds (0 if unknown)
   */
  recordResult(modelId, success, latencyMs = 0) {
    const resolved = this.resolveModelId(modelId) || modelId;
    if (!this.stats[resolved]) {
      // Initialize if model not in registry (e.g., new model)
      this.stats[resolved] = { calls: 0, successes: 0, failures: 0, total_latency_ms: 0 };
    }

    const latencyValue = typeof latencyMs === 'number' ? latencyMs : 0;
    const error = latencyMs && typeof latencyMs === 'object' ? latencyMs : null;

    this.stats[resolved].calls++;
    if (success) {
      this.stats[resolved].successes++;
      if (this.metaAwarenessTracker) {
        this.metaAwarenessTracker.trackEvent({
          event_type: 'orchestration.failure_recovery_step',
          task_type: 'model_execution',
          complexity: 'moderate',
          outcome: 'recovered',
          metadata: {
            model: resolved,
            latency_ms: latencyValue,
            recovered: true,
          },
        });
      }
    } else {
      this.stats[resolved].failures++;
      if (this.metaAwarenessTracker) {
        this.metaAwarenessTracker.trackEvent({
          event_type: 'orchestration.failure_recovery_step',
          task_type: 'model_execution',
          complexity: 'moderate',
          outcome: 'repeated_failure',
          metadata: {
            model: resolved,
            latency_ms: latencyValue,
            repeated_failure: true,
            error: error?.message || null,
          },
        });
      }

      const model = this.models[resolved];
      const keyId = error?.keyId || null;
      if (model && keyId) {
        const rotator = KeyRotatorFactory.getRotator(this.rotators, model.provider);
        if (rotator && typeof rotator.recordFailure === 'function') {
          rotator.recordFailure(keyId, error);
        }
      }
    }
    if (latencyValue > 0) {
      this.stats[resolved].total_latency_ms += latencyValue;
    }

    if (this.explorationController?.recordExplorationOutcome) {
      try {
        this.explorationController.recordExplorationOutcome(resolved, {
          success: Boolean(success),
          latencyMs: latencyValue,
        });
      } catch (_) {
        // Exploration updates are best-effort and must never block routing.
      }
    }

    // Async persist to disk (non-blocking)
    this._persistStats();

    return this.stats[resolved];
  }

  /**
   * Async stats persistence to statsPersistPath.
   * @private
   */
  _persistStats() {
    if (!this.statsPersistPath) return;
    // Defer to avoid blocking hot path
    setImmediate(() => {
      try {
        const fs = require('fs');
        const json = JSON.stringify({ stats: this.stats, savedAt: new Date().toISOString() }, null, 2);
        const tmp = this.statsPersistPath + '.tmp';
        fs.writeFileSync(tmp, json, 'utf8');
        try { require('fs').renameSync(tmp, this.statsPersistPath); } catch (_) { /* best-effort */ }
      } catch (_) { /* never crash persistence */ }
    });
  }

  /**
   * Load persisted stats from statsPersistPath on startup.
   * Seeds this.stats with historical outcomes so RL has memory from previous sessions.
   * @param {Object} runtimeOutcomes - Outcomes from runtime-tool-telemetry (via model-selection file)
   */
  loadStatsFromDisk(runtimeOutcomes = []) {
    if (!this.statsPersistPath) return;
    try {
      const fs = require('fs');
      if (fs.existsSync(this.statsPersistPath)) {
        const data = JSON.parse(fs.readFileSync(this.statsPersistPath, 'utf8'));
        if (data.stats && typeof data.stats === 'object') {
          for (const [modelId, s] of Object.entries(data.stats)) {
            if (!this.stats[modelId]) {
              this.stats[modelId] = { calls: 0, successes: 0, failures: 0, total_latency_ms: 0 };
            }
            this.stats[modelId].calls += s.calls || 0;
            this.stats[modelId].successes += s.successes || 0;
            this.stats[modelId].failures += s.failures || 0;
            this.stats[modelId].total_latency_ms += s.total_latency_ms || 0;
          }
        }
      }
    } catch (_) { /* fail-open */ }

    // Also ingest runtime outcomes captured by telemetry
    if (Array.isArray(runtimeOutcomes)) {
      for (const e of runtimeOutcomes) {
        if (e.modelId && typeof e.success === 'boolean') {
          this.recordResult(e.modelId, e.success, e.latencyMs || 0);
        }
      }
    }
  }

  // ─── Backward Compatibility Aliases ─────────────────────────────────────

  /**
   * Alias for route() - backward compatibility
   */
  selectModel(ctx = {}) {
    return this.route(ctx);
  }

  /**
   * Alias for recordResult() - forward compatibility
   */
  recordOutcome(modelId, success, latencyOrError = 0) {
    return this.recordResult(modelId, success, latencyOrError);
  }

  /**
   * Alias for getModelStats() - backward compatibility (old signature)
   */
  getModelStats(modelId) {
    return this.stats[modelId] || { calls: 0, successes: 0, failures: 0, total_latency_ms: 0 };
  }
}

// ─── Exports ───────────────────────────────────────────────────

module.exports = { 
  ModelRouter, 
  policies,
  
  // Response validation (early failure detection)
  validateResponse,
};
