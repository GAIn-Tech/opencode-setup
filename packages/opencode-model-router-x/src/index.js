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
const { createRandomSource } = require('./deterministic-rng');
let ThompsonSamplingRouter;
try {
  ThompsonSamplingRouter = require('./thompson-sampling-router');
} catch (e) {
  ThompsonSamplingRouter = null;
}

// Resilient subagent routing components
const { resolveModelAlias, hasAlias, getAliasesFor, MODEL_ALIASES } = require('./model-alias-resolver');
const { validateResponse, isRetriableFailure, FAILURE_TYPES, ResponseValidationError } = require('./response-validator');
const { SubagentRetryManager, CATEGORY_FALLBACKS, DEFAULT_FALLBACKS } = require('./subagent-retry-manager');

function _isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function _asArray(value) {
  return Array.isArray(value) ? value : [];
}

function _asObject(value) {
  return _isPlainObject(value) ? value : {};
}

function _safeMathMin(values, fallback = 0) {
  const numericValues = _asArray(values).filter((value) => Number.isFinite(value));
  return numericValues.length > 0 ? Math.min(...numericValues) : fallback;
}

function _safeMathMax(values, fallback = 1) {
  const numericValues = _asArray(values).filter((value) => Number.isFinite(value));
  return numericValues.length > 0 ? Math.max(...numericValues) : fallback;
}

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
let MetaAwarenessTracker, MetaKBReader;
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
try {
  ({ MetaKBReader } = require('@jackoatmon/opencode-learning-engine'));
} catch (e) {
  try {
    ({ MetaKBReader } = require('../../opencode-learning-engine/src/meta-kb-reader.js'));
  } catch (e2) {
    MetaKBReader = null;
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
    this.metaKBReaderClass = options.metaKBReaderClass || MetaKBReader;
    this.metaKB = options.metaKB || null;
    this.metaKBPath = options.metaKBPath;
     
    // Lazy-initialize on first use
    this._services = {};

    if (!this.metaKB && this.metaKBReaderClass) {
      try {
        this.metaKB = new this.metaKBReaderClass(this.metaKBPath);
        this.metaKB.load?.();
      } catch (_) {
        this.metaKB = null;
      }
    }
  }

  _toModelArray(entry) {
    if (!entry || typeof entry !== 'object') return [];
    if (Array.isArray(entry.affected_models)) return entry.affected_models;
    if (Array.isArray(entry.models)) return entry.models;
    if (typeof entry.model === 'string') return [entry.model];
    if (typeof entry.model_id === 'string') return [entry.model_id];
    return [];
  }

  _buildContextText(context = {}) {
    const parts = [
      context.task_type,
      context.taskType,
      context.task,
      context.description,
      context.complexity,
      ..._asArray(context.required_strengths),
      ..._asArray(context.requiredStrengths),
    ];
    return parts
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
      .toLowerCase();
  }

  _extractMetaKBPenalties(context = {}) {
    const penalties = {};
    const antiPatterns = Array.isArray(this.metaKB?.index?.anti_patterns)
      ? this.metaKB.index.anti_patterns
      : [];
    if (antiPatterns.length === 0) {
      return penalties;
    }

    const contextText = this._buildContextText(context);
    const metaWarnings = this.metaKB?.query?.(context)?.warnings || [];
    const warningSet = new Set(
      metaWarnings
        .map((warning) => `${warning.pattern || ''}|${warning.description || ''}`)
        .filter((key) => key !== '|')
    );

    for (const antiPattern of antiPatterns) {
      const models = this._toModelArray(antiPattern);
      if (models.length === 0) continue;

      const antiPatternText = `${antiPattern.pattern || ''} ${antiPattern.description || ''}`.toLowerCase();
      const warningKey = `${antiPattern.pattern || ''}|${antiPattern.description || ''}`;

      const hasQueryHit = warningSet.has(warningKey)
        || warningSet.has(`${antiPattern.pattern || ''}|`);
      const contextTokens = contextText
        .split(/[^a-z0-9-]+/)
        .filter((token) => token.length >= 4);
      const hasTokenOverlap = contextTokens.some((token) => antiPatternText.includes(token));
      const isRelevant = hasQueryHit || hasTokenOverlap;
      if (!isRelevant) continue;

      const severity = antiPattern.severity === 'critical'
        ? -0.4
        : antiPattern.severity === 'high'
          ? -0.3
          : antiPattern.severity === 'medium'
            ? -0.15
            : -0.05;

      for (const modelId of models) {
        penalties[modelId] = (penalties[modelId] || 0) + severity;
      }
    }

    return penalties;
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
    try {
      const safeContext = _asObject(context);
      const normalizedContext = this.layer?.normalizeTaskContext
        ? this.layer.normalizeTaskContext(safeContext)
        : {
            ...safeContext,
            task_type: safeContext.task_type || safeContext.taskType || safeContext.task || 'general',
            attempt_number: safeContext.attempt_number ?? safeContext.attemptNumber ?? 1,
          };
      const advice = this.layer?.advisor?.advise
        ? this.layer.advisor.advise(normalizedContext)
        : null;
      
      // Transform advice into metaKBAdvice format for routing
      // Look for anti-patterns that mention specific models to penalize
      const modelPenalties = {};
      const antiPatterns = advice?.antiPatterns || advice?.patterns || [];
      
      for (const pattern of antiPatterns) {
        if (pattern.affected_models || pattern.models) {
          const models = pattern.affected_models || pattern.models;
          const severity = pattern.severity === 'high' ? -0.3 : pattern.severity === 'medium' ? -0.15 : -0.05;
          for (const modelId of models) {
            modelPenalties[modelId] = (modelPenalties[modelId] || 0) + severity;
          }
        }
      }

      const metaKBPenalties = this._extractMetaKBPenalties(normalizedContext);
      for (const [modelId, penalty] of Object.entries(metaKBPenalties)) {
        modelPenalties[modelId] = (modelPenalties[modelId] || 0) + penalty;
      }

      if (!advice && Object.keys(modelPenalties).length === 0) {
        return null;
      }
      
      return {
        ..._asObject(advice),
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
      metaKBPath: options.metaKBPath,
      metaKBReaderClass: options.metaKBReaderClass,
      metaKB: options.metaKB,
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
    const configuredPressureWindowMs = Number(
      options.providerPressureWindowMs
      ?? options.providerCooldownMs
      ?? this.tuning.provider_pressure_window_ms
      ?? this.tuning.providerPressureWindowMs
      ?? this.tuning.provider_cooldown_ms
      ?? this.tuning.providerCooldownMs
      ?? 120000
    );
    this.providerPressureWindowMs = Number.isFinite(configuredPressureWindowMs) && configuredPressureWindowMs > 0
      ? configuredPressureWindowMs
      : 120000;
    this.providerPressures = new Map();
    // Backward compatibility for older tests/callers.
    this.providerCooldowns = this.providerPressures;
    const MetaAwarenessTrackerClass = options.metaAwarenessTrackerClass || MetaAwarenessTracker;
    this.metaAwarenessTracker = options.metaAwarenessTracker || (MetaAwarenessTrackerClass ? new MetaAwarenessTrackerClass() : null);

    // T4 (Wave 11): Context Governor for budget-aware routing
    this.contextGovernor = options.contextGovernor || null;

// Category-based routing via Thompson Sampling
// Explicit null = disable Thompson, undefined = auto-create, instance = use provided
this.thompsonRouter = options.thompsonRouter !== undefined 
  ? options.thompsonRouter 
  : (ThompsonSamplingRouter ? new ThompsonSamplingRouter() : null);
    this._categoryConfigCache = null;
    
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
      configLoader: options.configLoader || null,
      explorationFloor: options.exploration?.explorationFloor ?? options.explorationFloor,
      budgetAwareExploration: options.exploration?.budgetAwareExploration ?? options.exploration?.budgetAwareEnabled ?? options.budgetAwareExploration,
      capExploreAbovePct: options.exploration?.capExploreAbovePct,
      capExploreTo: options.exploration?.capExploreTo,
      disableExploreAbovePct: options.exploration?.disableExploreAbovePct,
    });

    if (explorationActive) {
      void this.explorationController.activate(explorationMode, explorationBudget);
    }

    // Default context-governor fallback from token budget manager when available.
    if (!this.contextGovernor && this.tokenBudgetManager?.governor) {
      this.contextGovernor = this.tokenBudgetManager.governor;
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
    if (!ctx.category) {
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
        if (model && !this._isAnthropicModel(model.provider) && !this._isAnthropicModel(model.id)) {
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
    }

    if (ctx && typeof ctx.overrideModelId === 'string') {
      const forcedModel = this.models[ctx.overrideModelId];
      if (forcedModel && !this._isAnthropicModel(forcedModel.provider) && !this._isAnthropicModel(forcedModel.id)) {
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

    if (ctx.category) {
      const categorySelection = this.selectModelForCategory(ctx.category);
      if (categorySelection) {
        return categorySelection;
      }
    }

    let candidates = this._filterByConstraints(ctx || {});
    
    // Pre-selection health verification: Filter out unavailable models before scoring
    // This prevents tool timeouts by checking circuit breaker state and key availability
    candidates = this._filterByHealth(candidates, ctx || {});
    
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
    
    const policyAdjustments = this._computePolicyScoreAdjustments(candidates, ctx || {});

    const scored = candidates.map((modelId) => {
      const baseScoreRaw = this._scoreModel(modelId, ctx);
      const baseScore = _asObject(baseScoreRaw);
      const baseScoreValue = Number.isFinite(baseScore.score) ? baseScore.score : 0;
      const baseReason = typeof baseScore.reason === 'string' ? baseScore.reason : '';
      const boost = skillBoost[modelId] || 0;
      const penalty = metaKBPenalty[modelId] || 0;
      const policyAdjustment = policyAdjustments.adjustments[modelId] || 0;
      const policyReason = policyAdjustments.reason
        ? `${policyAdjustments.reason}(${policyAdjustment >= 0 ? '+' : ''}${policyAdjustment.toFixed(3)})`
        : null;
      const reason = [baseReason, policyReason].filter(Boolean).join('; ');
      return {
        modelId,
        ...baseScore,
        score: baseScoreValue + (boost * 0.1) + penalty + policyAdjustment, // Keep existing factors; policy hints modulate final score
        reason,
      };
    });
    scored.sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      // Emergency fallback: try any available model regardless of constraints
      const emergencyModels = Object.values(this.models).filter(
        (m) => m.provider && !this._isAnthropicModel(m.provider) && !this._isAnthropicModel(m.id)
      );
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

  /**
   * Select model for a category using Thompson Sampling.
   * Falls back to static category ordering if Thompson data is unavailable.
   * @param {string} category
   * @returns {Object|null}
   */
  selectModelForCategory(category) {
    if (typeof category !== 'string' || category.trim().length === 0) {
      return null;
    }

    const categoryConfig = this._loadCategoryConfig(category);
    if (!categoryConfig) {
      return null;
    }

    const candidates = [categoryConfig.model, ..._asArray(categoryConfig.fallbacks)]
      .filter((modelId) => typeof modelId === 'string' && modelId.trim().length > 0)
      .map((modelId) => modelId.trim())
      .filter((modelId) => !this._isAnthropicModel(modelId));
    const uniqueCandidates = [...new Set(candidates)];

    if (uniqueCandidates.length === 0) {
      return null;
    }

    if (!this.thompsonRouter) {
      return this._staticCategorySelection(category, uniqueCandidates);
    }

    const normalizedCandidates = [...new Set(
      uniqueCandidates
        .map((modelId) => this._normalizeModelIdForThompson(modelId))
        .filter((modelId) => typeof modelId === 'string' && modelId.length > 0)
        .filter((modelId) => !this._isAnthropicModel(modelId))
    )];

    if (normalizedCandidates.length === 0) {
      return this._staticCategorySelection(category, uniqueCandidates);
    }

    const availableModels = new Set(
      _asArray(this.thompsonRouter.getAvailableModels?.())
        .filter((modelId) => typeof modelId === 'string' && modelId.trim().length > 0)
        .map((modelId) => modelId.trim())
        .filter((modelId) => !this._isAnthropicModel(modelId))
    );
    for (const modelId of normalizedCandidates) {
      availableModels.add(modelId);
    }
    this.thompsonRouter._models = [...availableModels];

    // Ensure category map exists and is constrained to configured candidates.
    if (!this.thompsonRouter.posteriors.has(category)) {
      this.thompsonRouter.posteriors.set(category, new Map());
    }
    const posteriors = this.thompsonRouter.posteriors.get(category);
    const candidateSet = new Set(normalizedCandidates);

    const existingByCandidate = new Map();
    for (const [trackedId, posterior] of posteriors.entries()) {
      const normalizedTrackedId = this._normalizeModelIdForThompson(trackedId);
      if (!candidateSet.has(normalizedTrackedId) || !posterior || typeof posterior !== 'object') {
        continue;
      }
      const alpha = Number.isFinite(posterior.alpha) && posterior.alpha > 0 ? posterior.alpha : 1;
      const beta = Number.isFinite(posterior.beta) && posterior.beta > 0 ? posterior.beta : 1;
      existingByCandidate.set(normalizedTrackedId, { alpha, beta });
    }

    posteriors.clear();
    // CRITICAL: initialize uniform priors (alpha=1, beta=1) BEFORE selection.
    for (const candidateId of normalizedCandidates) {
      posteriors.set(candidateId, existingByCandidate.get(candidateId) || { alpha: 1, beta: 1 });
    }

    const selectedId = this.thompsonRouter.select(category);
    const normalizedSelected = this._normalizeModelIdForThompson(selectedId);
    if (!selectedId || !candidateSet.has(normalizedSelected) || this._isAnthropicModel(selectedId)) {
      return this._staticCategorySelection(category, uniqueCandidates);
    }

    const candidateMatch = uniqueCandidates.find(
      (candidateId) => this._normalizeModelIdForThompson(candidateId) === normalizedSelected
    );

    const resolvedSelected = this.resolveModelId(candidateMatch)
      || this.resolveModelId(normalizedSelected)
      || this.resolveModelId(selectedId)
      || normalizedSelected;

    const model = this.models[resolvedSelected] || this.models[candidateMatch] || this.models[normalizedSelected];
    if (!model || this._isAnthropicModel(model.provider) || this._isAnthropicModel(model.id)) {
      return this._staticCategorySelection(category, uniqueCandidates);
    }

    const rotator = KeyRotatorFactory.getRotator(this.rotators, model.provider);
    const key = rotator ? rotator.getNextKey() : null;

    return {
      model,
      modelId: model.id || resolvedSelected,
      keyId: key ? key.id : null,
      key,
      reason: `thompson-sampling:category=${category}`,
      rotator,
      candidates: uniqueCandidates,
    };
  }

  /**
   * Normalize model ID for Thompson router.
   * Example: openai/gpt-5.3-codex -> gpt-5.3-codex
   * @private
   */
  _normalizeModelIdForThompson(modelId) {
    if (!modelId || typeof modelId !== 'string') return modelId;
    const segments = modelId.split('/').filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : modelId;
  }

  /**
   * Reject Anthropic/Claude models globally.
   * @private
   */
  _isAnthropicModel(modelId) {
    if (!modelId || typeof modelId !== 'string') return false;
    const normalized = modelId.toLowerCase();
    return normalized.includes('anthropic') || normalized.includes('claude');
  }

  /**
   * Load category config from oh-my-opencode.json.
   * @private
   */
  _loadCategoryConfig(category) {
    if (typeof category !== 'string' || category.trim().length === 0) {
      return null;
    }

    try {
      if (!this._categoryConfigCache) {
        const fs = require('fs');
        const configPath = path.resolve(__dirname, '../../../opencode-config/oh-my-opencode.json');
        const configRaw = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(configRaw);
        this._categoryConfigCache = _asObject(parsed?.categories);
      }
      return this._categoryConfigCache[category] || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Static category selection fallback.
   * @private
   */
  _staticCategorySelection(category, presetCandidates = null) {
    const config = this._loadCategoryConfig(category);
    if (!config) {
      return null;
    }

    const candidates = Array.isArray(presetCandidates) && presetCandidates.length > 0
      ? presetCandidates
      : [config.model, ..._asArray(config.fallbacks)]
          .filter((modelId) => typeof modelId === 'string' && modelId.trim().length > 0)
          .map((modelId) => modelId.trim())
          .filter((modelId) => !this._isAnthropicModel(modelId));

    for (const candidateId of candidates) {
      const normalizedId = this._normalizeModelIdForThompson(candidateId);
      const resolvedId = this.resolveModelId(candidateId)
        || this.resolveModelId(normalizedId)
        || candidateId;
      const model = this.models[resolvedId] || this.models[candidateId] || this.models[normalizedId];
      if (!model || this._isAnthropicModel(model.provider) || this._isAnthropicModel(model.id)) {
        continue;
      }

      const rotator = KeyRotatorFactory.getRotator(this.rotators, model.provider);
      const key = rotator ? rotator.getNextKey() : null;

      return {
        model,
        modelId: model.id || resolvedId,
        keyId: key ? key.id : null,
        key,
        reason: `static:category=${category}`,
        rotator,
        candidates,
      };
    }

    return null;
  }

  async routeAsync(ctx = {}) {
    if (ctx.category) {
      const categorySelection = this.selectModelForCategory(ctx.category);
      if (categorySelection) {
        return categorySelection;
      }
    }

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
      if (model && !this._isAnthropicModel(model.provider) && !this._isAnthropicModel(model.id)) {
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
          if (!model || this._isAnthropicModel(model.provider) || this._isAnthropicModel(model.id)) {
            return this.route(ctx);
          }
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

      if (this._isAnthropicModel(model.provider) || this._isAnthropicModel(model.id)) {
        return false;
      }

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
  _filterByHealth(candidateIds, ctx = {}) {
    this._ingestProviderPressureSignals(ctx);

    return candidateIds.filter((modelId) => {
      const model = this.models[modelId];
      if (!model) return false;

      if (this._isProviderUnderPressure(model.provider)) {
        return false;
      }
      
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

  _normalizePressureSeverity(input) {
    if (typeof input === 'number' && Number.isFinite(input)) {
      if (input >= 0.9) return 'critical';
      if (input >= 0.75) return 'high';
      if (input >= 0.55) return 'medium';
      if (input >= 0.35) return 'low';
      return null;
    }

    if (typeof input !== 'string') return null;
    const value = input.trim().toLowerCase();
    if (value === 'critical' || value === 'high' || value === 'medium' || value === 'low') {
      return value;
    }
    return null;
  }

  _severityMultiplier(severity) {
    if (severity === 'critical') return 2.0;
    if (severity === 'high') return 1.5;
    if (severity === 'medium') return 1.0;
    if (severity === 'low') return 0.5;
    return 0;
  }

  _setProviderPressure(provider, signal = {}, now = Date.now()) {
    if (typeof provider !== 'string' || provider.trim().length === 0) {
      return false;
    }

    const severity = this._normalizePressureSeverity(signal.severity);
    const multiplier = this._severityMultiplier(severity);
    if (!Number.isFinite(now) || multiplier <= 0) {
      return false;
    }

    const pressureUntil = now + Math.round(this.providerPressureWindowMs * multiplier);
    const current = this.providerPressures.get(provider);
    const existingReasons = _asArray(current?.reasons).filter(
      (reason) => typeof reason === 'string' && reason.trim().length > 0
    );
    const incomingReasons = _asArray(signal.reasons).filter(
      (reason) => typeof reason === 'string' && reason.trim().length > 0
    );
    const classToken = typeof signal.class === 'string' && signal.class.trim().length > 0
      ? signal.class.trim().toLowerCase()
      : 'generic';

    this.providerPressures.set(provider, {
      until: Number.isFinite(current?.until) ? Math.max(current.until, pressureUntil) : pressureUntil,
      severity,
      class: classToken,
      reasons: [...new Set([...existingReasons, ...incomingReasons, classToken])],
      source: signal.source || 'routing-signals',
    });
    return true;
  }

  _isProviderUnderPressure(provider, now = Date.now()) {
    if (typeof provider !== 'string' || provider.trim().length === 0) {
      return false;
    }

    const pressure = this.providerPressures.get(provider);
    const pressureUntil = pressure?.until;
    if (!Number.isFinite(pressureUntil)) {
      this.providerPressures.delete(provider);
      return false;
    }

    if (!Number.isFinite(now) || now < pressureUntil) {
      return true;
    }

    this.providerPressures.delete(provider);
    return false;
  }

  _setProviderCooldown(provider, now = Date.now()) {
    return this._setProviderPressure(provider, {
      severity: 'high',
      class: 'api',
      reasons: ['api'],
      source: 'legacy-cooldown-bridge',
    }, now);
  }

  _isProviderCoolingDown(provider, now = Date.now()) {
    return this._isProviderUnderPressure(provider, now);
  }

  _normalizeBudgetPressure(ctx = {}) {
    try {
      const budgetSignals = ctx?.budgetSignals || {};
      const contextBudget = budgetSignals.contextBudget || budgetSignals.sessionBudget || null;
      const pctRaw = Number(
        contextBudget?.pct
        ?? contextBudget?.usage
        ?? budgetSignals?.pct
        ?? budgetSignals?.usage
      );
      const bandRaw = contextBudget?.band
        || budgetSignals?.band
        || ctx?.policyDecision?.outputs?.routing?.fallback?.metadata?.combinedBudgetBand
        || ctx?.orchestrationPolicyDecision?.outputs?.routing?.fallback?.metadata?.combinedBudgetBand
        || null;

      const band = typeof bandRaw === 'string' ? bandRaw.trim().toLowerCase() : null;
      if (band === 'critical') return { severity: 'critical', signal: 0.95 };
      if (band === 'high') return { severity: 'high', signal: 0.85 };
      if (band === 'medium') return { severity: 'medium', signal: 0.65 };
      if (band === 'low' || band === 'healthy') return { severity: null, signal: Number.isFinite(pctRaw) ? pctRaw : 0.2 };

      if (Number.isFinite(pctRaw)) {
        return {
          severity: this._normalizePressureSeverity(pctRaw),
          signal: pctRaw,
        };
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  _extractProviderHealthSignals(ctx = {}) {
    const rawSignals = ctx?.providerHealthSignals;
    if (!rawSignals || typeof rawSignals !== 'object' || Array.isArray(rawSignals)) {
      return [];
    }

    const normalized = [];
    for (const [provider, payload] of Object.entries(rawSignals)) {
      const severity = this._normalizePressureSeverity(payload?.severity ?? payload?.level ?? payload?.score);
      if (!severity) continue;
      normalized.push({
        provider,
        severity,
        class: 'health',
        reasons: ['health'],
        source: 'provider-health-signals',
      });
    }
    return normalized;
  }

  _selectBudgetPressureProviders() {
    const providers = {};
    for (const model of Object.values(this.models || {})) {
      if (!model?.provider) continue;
      const cost = Number(model.cost_per_1k_tokens);
      if (!Number.isFinite(cost)) continue;
      if (!Number.isFinite(providers[model.provider])) {
        providers[model.provider] = cost;
        continue;
      }
      providers[model.provider] = Math.max(providers[model.provider], cost);
    }

    const entries = Object.entries(providers);
    if (entries.length <= 1) return [];

    entries.sort((a, b) => b[1] - a[1]);
    const topCount = Math.max(1, Math.floor(entries.length / 2));
    return entries.slice(0, topCount).map(([provider]) => provider);
  }

  _normalizeProviderPressureSignals(ctx = {}) {
    const pressureSignals = [];
    const budgetPressure = this._normalizeBudgetPressure(ctx);
    const healthSignals = this._extractProviderHealthSignals(ctx);
    const healthByProvider = new Map(healthSignals.map((signal) => [signal.provider, signal]));

    for (const signal of healthSignals) {
      pressureSignals.push(signal);
    }

    if (budgetPressure?.severity) {
      for (const provider of this._selectBudgetPressureProviders()) {
        const existing = healthByProvider.get(provider);
        const severity = existing
          ? this._normalizePressureSeverity(existing.severity === 'critical' ? 'critical' : budgetPressure.severity)
          : budgetPressure.severity;
        pressureSignals.push({
          provider,
          severity,
          class: 'budget',
          reasons: existing ? ['budget', 'health'] : ['budget'],
          source: 'budget-signals',
        });
      }
    }

    return pressureSignals;
  }

  _ingestProviderPressureSignals(ctx = {}) {
    if (!ctx || typeof ctx !== 'object') {
      return;
    }

    try {
      const now = Date.now();
      const pressureSignals = this._normalizeProviderPressureSignals(ctx);
      for (const signal of pressureSignals) {
        this._setProviderPressure(signal.provider, signal, now);
      }
    } catch (_) {
      // Fail-open by design.
    }
  }

  _isRateLimitEvidence(error) {
    if (!error || typeof error !== 'object') {
      return false;
    }

    try {
      const statusCode = Number(
        error.status
        ?? error.statusCode
        ?? error.httpStatus
        ?? error.response?.status
        ?? error.error?.status
      );
      if (statusCode === 429) {
        return true;
      }

      const tokens = [
        error.code,
        error.type,
        error.name,
        error.error?.code,
        error.error?.type,
      ]
        .filter((value) => typeof value === 'string')
        .map((value) => value.toLowerCase());

      if (tokens.some((value) => value.includes('rate_limit') || value.includes('ratelimit') || value.includes('too_many_requests') || value.includes('throttl'))) {
        return true;
      }

      const message = typeof error.message === 'string'
        ? error.message.toLowerCase()
        : (typeof error.error?.message === 'string' ? error.error.message.toLowerCase() : '');
      if (!message) {
        return false;
      }

      return /rate\s*limit|too many requests|throttl|http\s*429|\b429\b/.test(message);
    } catch (_) {
      return false;
    }
  }

  /**
   * P1: Get learning-guided advice for routing decisions
   * Uses LearningEngine to penalize models with anti-pattern history
   * @private
   */
  _getLearningAdvice(ctx = {}) {
    const fallbackAdvice = { warnings: [], suggestions: [], shouldPause: false, riskScore: 0 };

    if (!this.learningEngine) {
      return fallbackAdvice;
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

      if (advice && typeof advice.then === 'function') {
        this._logWarn('[ModelRouter] Legacy learning advice path received async advise() result; using fail-open fallback');
        return fallbackAdvice;
      }

      if (!advice || typeof advice !== 'object') {
        return fallbackAdvice;
      }

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
      return fallbackAdvice;
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

  _getPathValue(source, path) {
    if (!_isPlainObject(source) || typeof path !== 'string' || path.length === 0) {
      return undefined;
    }
    const segments = path.split('.').filter(Boolean);
    let cursor = source;
    for (const segment of segments) {
      if (!_isPlainObject(cursor) || !(segment in cursor)) {
        return undefined;
      }
      cursor = cursor[segment];
    }
    return cursor;
  }

  _getConfigValueAny(paths = [], defaultValue) {
    for (const path of _asArray(paths)) {
      if (typeof path !== 'string' || path.length === 0) {
        continue;
      }
      if (this.configLoader?.get) {
        const value = this.configLoader.get(path, undefined);
        if (value !== undefined) {
          return value;
        }
      }
      const valueFromConfig = this._getPathValue(this.config, path);
      if (valueFromConfig !== undefined) {
        return valueFromConfig;
      }
    }
    return defaultValue;
  }

  _getConfigBooleanAny(paths = [], defaultValue = false) {
    const value = this._getConfigValueAny(paths, defaultValue);
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return Boolean(defaultValue);
  }

  _getConfigNumberAny(paths = [], defaultValue, min = null, max = null) {
    const raw = this._getConfigValueAny(paths, defaultValue);
    let numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      numeric = Number(defaultValue);
    }
    if (!Number.isFinite(numeric)) {
      return defaultValue;
    }
    if (Number.isFinite(min)) {
      numeric = Math.max(min, numeric);
    }
    if (Number.isFinite(max)) {
      numeric = Math.min(max, numeric);
    }
    return numeric;
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
    const costEfficiencyEnabled = this._getConfigBooleanAny([
      'routing.cost_efficiency_enabled',
      'routing.costEfficiencyEnabled',
    ], true);
    if (!costEfficiencyEnabled) {
      return { bonus: 0, reason: null };
    }

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
    const fallbackCost = Number(model.cost_per_1k_tokens);
    let avgCostPer1K = null;

    if (pricing && Number.isFinite(pricing.input) && Number.isFinite(pricing.output)) {
      // Use average of input + output cost per 1K tokens as the cost signal
      avgCostPer1K = (pricing.input + pricing.output) / 2;
    } else if (Number.isFinite(fallbackCost) && fallbackCost >= 0) {
      avgCostPer1K = fallbackCost;
    }

    if (!Number.isFinite(avgCostPer1K)) {
      return { bonus: 0, reason: null };
    }

    // Normalize: lower cost = higher bonus
    // Scale: $0/1K → 0.05 bonus, $15/1K+ → 0 bonus (linear)
    const maxCostThreshold = this._getConfigNumberAny([
      'routing.cost_efficiency_max_cost_per_1k',
      'routing.costEfficiencyMaxCostPer1k',
    ], 15.0, 0.1, 1000);
    const maxBonus = this._getConfigNumberAny([
      'routing.cost_efficiency_max_bonus',
      'routing.costEfficiencyMaxBonus',
    ], 0.05, 0, 0.2);
    const bonus = avgCostPer1K < maxCostThreshold
      ? maxBonus * (1 - avgCostPer1K / maxCostThreshold)
      : 0;

    return {
      bonus: Math.round(bonus * 1000) / 1000,
      reason: `cost($${avgCostPer1K.toFixed(2)}/1K,+${bonus.toFixed(3)})`
    };
  }

  getLearningAdvice(ctx = {}) {
    try {
      this._adapter.initialize(this);
      const advice = this._adapter.getLearningAdvice(ctx);
      if (advice) {
        return advice;
      }
    } catch (error) {
      this._logWarn('[ModelRouter] Adapter learning advice failed', { error: error.message });
    }

    return this._getLearningAdvice(ctx);
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
    const budgetPenaltyEnabled = this._getConfigBooleanAny([
      'routing.budget_penalty_enabled',
      'routing.budgetPenaltyEnabled',
    ], true);
    if (!budgetPenaltyEnabled) {
      return { penalty: 0, reason: null };
    }

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

  _applyScoreJitter(modelId, ctx = {}) {
    const jitterEnabled = this._getConfigBooleanAny([
      'routing.jitter_enabled',
      'routing.jitterEnabled',
    ], false);
    if (!jitterEnabled) {
      return { delta: 0, reason: null };
    }

    const jitterFactor = this._getConfigNumberAny([
      'routing.jitter_factor',
      'routing.jitterFactor',
    ], 0.1, 0, 1);
    const maxDeltaConfig = this._getConfigNumberAny([
      'routing.score_jitter_max_delta',
      'routing.scoreJitterMaxDelta',
    ], 0.02, 0, 0.1);
    const maxDelta = jitterFactor * maxDeltaConfig;
    if (maxDelta <= 0) {
      return { delta: 0, reason: null };
    }

    const seed = process.env.OPENCODE_REPLAY_SEED
      || ctx?.sessionId
      || ctx?.taskId
      || ctx?.requestId
      || null;

    if (!seed) {
      return { delta: 0, reason: null };
    }

    const randomSource = createRandomSource(`model-router-jitter:${modelId}`, String(seed));
    const random = randomSource.next();
    const delta = (random * 2 - 1) * maxDelta;
    if (!Number.isFinite(delta) || delta === 0) {
      return { delta: 0, reason: null };
    }

    const roundedDelta = Math.round(delta * 10000) / 10000;
    const signed = roundedDelta >= 0 ? `+${roundedDelta.toFixed(4)}` : roundedDelta.toFixed(4);
    return {
      delta: roundedDelta,
      reason: `jitter(${signed})`,
    };
  }

  _getPolicyWeightHints(ctx = {}) {
    try {
      const decision = ctx?.policyDecision
        || ctx?.orchestrationPolicyDecision
        || ctx?.runtimeContext?.policyDecision
        || null;
      const hints = decision?.outputs?.routing?.weightHints;
      if (!hints || typeof hints !== 'object') {
        return null;
      }

      const rawQuality = Number(hints.quality);
      const rawCost = Number(hints.cost);
      const rawLatency = Number(hints.latency);

      const quality = Number.isFinite(rawQuality) && rawQuality >= 0 ? rawQuality : 0;
      const cost = Number.isFinite(rawCost) && rawCost >= 0 ? rawCost : 0;
      const latency = Number.isFinite(rawLatency) && rawLatency >= 0 ? rawLatency : 0;
      const total = quality + cost + latency;
      if (total <= 0) {
        return null;
      }

      const budgetBand = decision?.outputs?.routing?.fallback?.metadata?.combinedBudgetBand
        || decision?.explain?.budget?.band
        || 'healthy';

      return {
        quality: quality / total,
        cost: cost / total,
        latency: latency / total,
        budgetBand,
      };
    } catch (_) {
      return null;
    }
  }

  _normalizeSignal(value, min, max, preferLower = false) {
    if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return 0.5;
    }
    const normalized = (value - min) / (max - min);
    const clamped = Math.max(0, Math.min(1, normalized));
    return preferLower ? (1 - clamped) : clamped;
  }

  _computePolicyScoreAdjustments(candidateIds = [], ctx = {}) {
    const hints = this._getPolicyWeightHints(ctx);
    if (!hints || !Array.isArray(candidateIds) || candidateIds.length === 0) {
      return { adjustments: {}, reason: null };
    }

    const qualityByModel = {};
    const costByModel = {};
    const latencyByModel = {};
    const qualityValues = [];
    const costValues = [];
    const latencyValues = [];

    for (const modelId of candidateIds) {
      const model = this.models[modelId] || {};
      const quality = this._getSuccessRate(modelId);
      const cost = Number.isFinite(model.cost_per_1k_tokens) ? model.cost_per_1k_tokens : null;
      const avgLatency = this._getAvgLatency(modelId);
      const latency = Number.isFinite(model.default_latency_ms) && model.default_latency_ms > 0
        ? model.default_latency_ms
        : (avgLatency > 0 ? avgLatency : null);

      qualityByModel[modelId] = quality;
      qualityValues.push(quality);
      if (Number.isFinite(cost)) {
        costByModel[modelId] = cost;
        costValues.push(cost);
      }
      if (Number.isFinite(latency)) {
        latencyByModel[modelId] = latency;
        latencyValues.push(latency);
      }
    }

    if (qualityValues.length === 0) {
      return { adjustments: {}, reason: null };
    }

    const qualityMin = _safeMathMin(qualityValues, 0);
    const qualityMax = _safeMathMax(qualityValues, 1);
    const costMin = _safeMathMin(costValues, 0);
    const costMax = _safeMathMax(costValues, 1);
    const latencyMin = _safeMathMin(latencyValues, 0);
    const latencyMax = _safeMathMax(latencyValues, 1);

    const strengthByBand = {
      healthy: 0.18,
      medium: 0.2,
      high: 0.22,
      critical: 0.24,
    };
    const adjustmentStrength = strengthByBand[hints.budgetBand] || strengthByBand.healthy;
    const adjustments = {};

    for (const modelId of candidateIds) {
      const qualitySignal = this._normalizeSignal(qualityByModel[modelId], qualityMin, qualityMax, false);
      const costSignal = this._normalizeSignal(costByModel[modelId], costMin, costMax, true);
      const latencySignal = this._normalizeSignal(latencyByModel[modelId], latencyMin, latencyMax, true);

      const weightedSignal = (qualitySignal * hints.quality)
        + (costSignal * hints.cost)
        + (latencySignal * hints.latency);
      const centeredSignal = weightedSignal - 0.5;
      adjustments[modelId] = Math.round((centeredSignal * adjustmentStrength) * 1000) / 1000;
    }

    return {
      adjustments,
      reason: `policy-hints(q=${hints.quality.toFixed(2)},c=${hints.cost.toFixed(2)},l=${hints.latency.toFixed(2)},band=${hints.budgetBand})`,
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
    const scorePenalty = Number.isFinite(learningPenalty?.scorePenalty) ? learningPenalty.scorePenalty : 0;
    const learningReasons = _asArray(learningPenalty?.reasons).filter(
      (reason) => typeof reason === 'string' && reason.length > 0
    );
    if (scorePenalty > 0) {
      score -= scorePenalty;
      if (learningReasons.length > 0) {
        reasons.push(...learningReasons);
      }
    }

    const jitter = this._applyScoreJitter(modelId, ctx || {});
    if (jitter.reason) {
      score += jitter.delta;
      reasons.push(jitter.reason);
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
   * @param {object} ctx - Optional routing context (supports ctx.category)
   */
  recordResult(modelId, success, latencyMs = 0, ctx = {}) {
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
      if (model && this._isRateLimitEvidence(error)) {
        this._setProviderPressure(model.provider, {
          severity: 'high',
          class: 'api',
          reasons: ['api'],
          source: 'record-result',
        });
      }

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

    // Category Thompson posterior update (best-effort, fail-open).
    if (this.thompsonRouter && typeof ctx?.category === 'string' && ctx.category.trim().length > 0) {
      try {
        const category = ctx.category.trim();
        const posteriors = this.thompsonRouter.getPosteriors(category);
        const resolvedNormalized = this._normalizeModelIdForThompson(resolved);
        const modelNormalized = this._normalizeModelIdForThompson(modelId);
        const trackedModelId = [resolved, modelId, resolvedNormalized, modelNormalized]
          .find((candidate) => typeof candidate === 'string' && posteriors.has(candidate))
          || resolvedNormalized;

        if (trackedModelId && !this._isAnthropicModel(trackedModelId)) {
          this.thompsonRouter.update(category, trackedModelId, Boolean(success));
        }
      } catch (_) {
        // Never block result recording on posterior update.
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
  recordOutcome(modelId, success, latencyOrError = 0, ctx = {}) {
    return this.recordResult(modelId, success, latencyOrError, ctx);
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
