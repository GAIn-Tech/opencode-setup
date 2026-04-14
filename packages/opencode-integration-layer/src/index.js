/**
 * IntegrationLayer - Wires SkillRL and Showboat into existing packages
 * 
 * This module provides hook implementations that connect:
 * - SkillRL → OrchestrationAdvisor (skill selection augmentation)
 * - SkillRL → Learning Engine (failure distillation)
 * - Showboat → Proofcheck (evidence capture)
 */
// Import structured logger first (needed for early logging)
let structuredLogger;
try {
  structuredLogger = require('opencode-logger');
} catch (e) {
  structuredLogger = null;
}

// Initialize logger early for use throughout module
const logger = structuredLogger?.createLogger?.('integration-layer') || {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || ''),
  debug: () => {},
};

let contextUtils;
try {
  contextUtils = require('opencode-config-loader/src/context-utils');
} catch {
  try {
    contextUtils = require('../../opencode-config-loader/src/context-utils');
  } catch (e) {
    logger.warn('[IntegrationLayer] opencode-config-loader context-utils not found. Context utilities unavailable.');
    contextUtils = {
      createOrchestrationId: () => `orch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      pickSessionId: (...args) => args.find(Boolean) || null,
      normalizeQuotaSignal: (s) => s || {},
      getQuotaSignal: () => ({}),
    };
  }
}
const { createOrchestrationId, pickSessionId, normalizeQuotaSignal, getQuotaSignal } = contextUtils;

// Import utility packages for full integration
let inputValidator, healthChecker, backupManager, featureFlags, contextGovernor, memoryGraph;
let OpenCodeError, ErrorCategory, ErrorCode;
try {
  ({ OpenCodeError, ErrorCategory, ErrorCode } = require('../../opencode-errors/src/index.js'));
} catch {
  // Fail-open: OpenCodeError unavailable, will use plain Error
  OpenCodeError = null;
  ErrorCategory = null;
  ErrorCode = null;
}
try {
  inputValidator = require('opencode-validator');
} catch (e) {
  inputValidator = null;
}
try {
  healthChecker = require('opencode-health-check');
} catch (e) {
  healthChecker = null;
}
try {
  backupManager = require('opencode-backup-manager');
} catch (e) {
  backupManager = null;
}
try {
  featureFlags = require('opencode-feature-flags');
} catch (e) {
  featureFlags = null;
}
try {
  contextGovernor = require('opencode-context-governor');
} catch (e) {
  contextGovernor = null;
}
try {
  memoryGraph = require('opencode-memory-graph');
} catch (e) {
  memoryGraph = null;
}

// Learning Engine for pre-task advice and post-task learning
let LearningEngine;
try {
  ({ LearningEngine } = require('opencode-learning-engine'));
} catch (e) {
  LearningEngine = null;
}

// [HYPER-PARAM] Hyper-parameterized learning system
let HyperParameterRegistry, FeedbackCollector, ParameterLearner;
let _hyperParamRegistry = null;
let _hyperParamFeedback = null;
let _hyperParamLearner = null;
try {
  const hyperPkg = require('opencode-hyper-param-learner');
  HyperParameterRegistry = hyperPkg.HyperParameterRegistry;
  FeedbackCollector = hyperPkg.FeedbackCollector;
  ParameterLearner = hyperPkg.ParameterLearner;
} catch (e) {
  // Fail-open: hyper-param system unavailable
  HyperParameterRegistry = null;
  FeedbackCollector = null;
  ParameterLearner = null;
}

// Context bridge for governor → distill advisory signals
const { ContextBridge } = require('./context-bridge');

// PEV Contract for Planner/Executor/Verifier/Critic orchestration
let pevContract;
try {
  pevContract = require('../../opencode-pev-contract/src/index.js');
} catch {
  pevContract = null;
}

let resolveOrchestrationPolicy = null;
try {
  ({ resolveOrchestrationPolicy } = require('./orchestration-policy'));
} catch {
  resolveOrchestrationPolicy = null;
}

const DEFAULT_ORCHESTRATION_POLICY_ROLLOUT_CATEGORIES = Object.freeze([
  'deep',
  'ultrabrain',
  'unspecified-high',
]);

// T21: Package-level execution instrumentation
// Tracks which packages are invoked, call frequency, success/failure, and latency.
// Persists to ~/.opencode/package-execution/events.json for dashboard backfill.
let _pkgEvents = [];
let _pkgEventsPath = null;
let _pkgEventsFlushing = false;
const MAX_PKG_EVENTS = 5000;

function _getPkgEventsPath() {
  if (_pkgEventsPath === null) {
    try {
      const os = require('os');
      const path = require('path');
      _pkgEventsPath = path.join(os.homedir(), '.opencode', 'package-execution', 'events.json');
    } catch {
      _pkgEventsPath = '';
    }
  }
  return _pkgEventsPath;
}

function _appendPkgEvent(event) {
  _pkgEvents.push(event);
  while (_pkgEvents.length > MAX_PKG_EVENTS) {
    _pkgEvents.shift();
  }
  // Async flush to file (non-blocking, fail-open)
  if (!_pkgEventsFlushing) {
    _pkgEventsFlushing = true;
    setImmediate(async () => {
      try {
        _pkgEventsFlushing = false;
        const fp = _getPkgEventsPath();
        if (!fp) return;
        const fs = require('fs').promises;
        const path = require('path');
        const dir = path.dirname(fp);
        try {
          await fs.access(dir);
        } catch {
          await fs.mkdir(dir, { recursive: true });
        }
        // Read existing events, append new ones, write back
        let existing = [];
        try {
          const data = await fs.readFile(fp, 'utf8');
          existing = JSON.parse(data);
        } catch {
          existing = [];
        }
        const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // Keep 7 days
        const recent = existing.filter(e => e && e.timestamp && e.timestamp > cutoff);
        const merged = [...recent, ..._pkgEvents].slice(-MAX_PKG_EVENTS);
        await fs.writeFile(fp, JSON.stringify(merged, null, 2), 'utf8');
        _pkgEvents = [];
      } catch {
        _pkgEventsFlushing = false;
      }
    });
  }
}

// Fail-open require for MCP → SkillRL affinity bridge
let _getSessionMcpInvocations = null;
try {
  _getSessionMcpInvocations = require('opencode-learning-engine/src/tool-usage-tracker').getSessionMcpInvocations;
} catch {
  try {
    _getSessionMcpInvocations = require('../../opencode-learning-engine/src/tool-usage-tracker').getSessionMcpInvocations;
  } catch {
    // Fail-open: affinity bridge unavailable without learning-engine
  }
}

// ---- Startup health report ----
const integrationStatus = {
  structuredLogger: !!structuredLogger,
  inputValidator: !!inputValidator,
  healthChecker: !!healthChecker,
  backupManager: !!backupManager,
  featureFlags: !!featureFlags,
  contextGovernor: !!contextGovernor,
  memoryGraph: !!memoryGraph,
};

const _active = Object.entries(integrationStatus).filter(([, v]) => v).map(([k]) => k);
const _missing = Object.entries(integrationStatus).filter(([, v]) => !v).map(([k]) => k);

if (_missing.length > 0) {
  logger.warn(
    `[IntegrationLayer] Degraded startup: ${_missing.length}/${Object.keys(integrationStatus).length} integrations unavailable: ${_missing.join(', ')}`
  );
} else {
  logger.info(`[IntegrationLayer] All ${_active.length} integrations loaded.`);
}

class IntegrationLayer {
  constructor(config = {}) {
    // T19 (Wave 11): Startup time instrumentation
    const _startupT0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

    this.skillRL = config.skillRL || config.skillRLManager || null;
    this.showboat = config.showboat || config.showboatWrapper || null;
    this.quotaManager = config.quotaManager || null;
    this.advisor = config.advisor || config.orchestrationAdvisor || null;
    this.learningEngine = config.learningEngine || null;
    this.modelRouter = config.modelRouter || config.ModelRouter || null;
    this.preloadSkills = config.preloadSkills || null;
    this.runbooks = config.runbooks || null;
    this.crashGuard = config.crashGuard || null;
    this.proofcheck = config.proofcheck || null;
    this.fallbackDoctor = config.fallbackDoctor || null;
    this.pluginLifecycle = config.pluginLifecycle || null;
    this.workflowStore = config.workflowStore || null;
    this.workflowExecutor = config.workflowExecutor || null;
    this.dashboardLauncher = config.dashboardLauncher || null;
    this.healthd = config.healthd || null;
    this.pipelineMetrics = config.pipelineMetrics || null;
    this.alertManager = config.alertManager || null;
    this.explorationAdapter = config.explorationAdapter || null;
    
    // [Task 1.5] Initialize PEV Contract — binding orchestration through contracts
    this._pevContract = null;
    if (pevContract && pevContract.PEVContract) {
      try {
        this._pevContract = new pevContract.PEVContract();
        
        // Register existing components as PEV roles (if they implement the interfaces)
        if (this.advisor && typeof this.advisor.advise === 'function') {
          // Wrap advisor as planner - use existing advise() output as plan
          this._pevContract._advisor = this.advisor;
        }
        if (this.workflowExecutor && typeof this.workflowExecutor.execute === 'function') {
          this._pevContract._workflowExecutor = this.workflowExecutor;
        }
        if (this.showboat && typeof this.showboat.captureEvidence === 'function') {
          this._pevContract._showboat = this.showboat;
        }
        
        logger.info('PEV Contract initialized', {
          hasPlanner: !!this._pevContract._advisor,
          hasExecutor: !!this._pevContract._workflowExecutor,
          hasVerifier: !!this._pevContract._showboat
        });
      } catch (err) {
        logger.warn('PEV Contract initialization failed', { error: err.message });
        this._pevContract = null;
      }
    }
    
    // P1 FIX: Use Map keyed by task_id instead of global mutable state
    this.taskContextMap = new Map();
    this.currentSessionId = config.currentSessionId || config.sessionId || null;

    // T21: Package execution tracking
    this._pkgTrackingEnabled = true;

    // [T22] Track consecutive failures per skill for early warning
    this._skillConsecutiveFailures = new Map(); // skillName → { count: number, lastTask: string }

    // [GAP FIX 1] Event Subscription System
    // Track registered event handlers for observability
    this._eventHandlers = new Map(); // eventName → Array<{ handler: Function, label: string }>
    this._eventStats = new Map(); // eventName → { count, lastRisk, lastTimestamp }
    
    // Initialize logger before using event handlers
    this.logger = logger;
    
    // Initialize default event handlers for critical events
    this._initDefaultEventHandlers(config);

    // Meta-KB index: fail-open loading for SkillRL integration
    this.metaKBIndex = null;
    if (config.metaKBIndexPath) {
      try {
        const fs = require('fs');
        if (fs.existsSync(config.metaKBIndexPath)) {
          const raw = fs.readFileSync(config.metaKBIndexPath, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed.schema_version && parsed.by_category !== undefined) {
            this.metaKBIndex = parsed;
          }
        }
      } catch {
        // Fail-open: proceed without meta-KB
      }
    }
    
    // Initialize utility packages
    this.logger = logger;
    this.validator = inputValidator;
    this.healthChecker = healthChecker;
    this.backupManager = backupManager;
    this.featureFlags = featureFlags;
    this.contextGovernor = contextGovernor;
    this.memoryGraph = config.memoryGraph || memoryGraph;

    // [GAP FIX] Initialize Learning Engine if available
    // This enables pre-task advice and post-task learning integration
    if (!this.learningEngine && LearningEngine) {
      try {
        this.learningEngine = new LearningEngine({ autoLoad: true, autoSave: true });
        logger.info('[IntegrationLayer] LearningEngine initialized for advice/learning');
      } catch (err) {
        logger.warn('[IntegrationLayer] LearningEngine init failed (non-fatal)', { error: err.message });
        this.learningEngine = null;
      }
    }

    // [GAP FIX] Learning advice hooks - fail-open if learning engine unavailable
    this._learningAdviceEnabled = !!this.learningEngine;
    this._learningAdviceCache = new Map(); // adviceId → { advice, timestamp }
    this._learningAdviceCacheMaxAge = 5 * 60 * 1000; // 5 minutes

    // [HYPER-PARAM] Initialize hyper-parameterized learning system
    this._hyperParamEnabled = false;
    this._hyperParamRegistry = null;
    this._hyperParamFeedback = null;
    this._hyperParamLearner = null;
    if (HyperParameterRegistry && FeedbackCollector && ParameterLearner) {
      try {
        // Create registry with persistence path
        const registryPath = config.hyperParamRegistryPath || 
          path.join(process.cwd(), 'opencode-config', 'hyper-parameter-registry.json');
        
        this._hyperParamRegistry = new HyperParameterRegistry(registryPath);
        
        // Create feedback collector
        this._hyperParamFeedback = new FeedbackCollector();
        
        // Create parameter learner with registry
        this._hyperParamLearner = new ParameterLearner(this._hyperParamRegistry, this._hyperParamFeedback);
        
        this._hyperParamEnabled = true;
        
        // [OPTIMIZATION] Performance optimizations
        this._hyperParamPendingFlush = [];        // Batch pending outcomes
        this._hyperParamFlushScheduled = false;      // Debounce scheduled flush
        this._hyperParamFlushMs = config.hyperParamFlushMs || 500; // Debounce window (ms)
        this._hyperParamMaxBatch = config.hyperParamMaxBatch || 10;  // Max batched outcomes
        this._hyperParamCircuitOpen = false;  // Circuit breaker
        this._hyperParamCircuitMs = 5000;   // Circuit reset timeout
        this._hyperParamSlowCount = 0;       // Track slow calls
        this._hyperParamSlowThreshold = 100; // Slow threshold (ms)
        this._hyperParamCache = new Map();      // LRU parameter cache
        this._hyperParamCacheMax = 50;         // Max cached params
        
        logger.info('[HyperParam] Initialized', { 
          registryPath,
          paramCount: this._hyperParamRegistry.count() 
        });
      } catch (err) {
        logger.warn('[HyperParam] Init failed (fail-open)', { error: err.message });
      }
    }

    // T8: ContextBridge — advisory bridge between governor and distill compression
    // Note: Governor is lazy-loaded in _getGovernorInstance() method
    // The contextBridge will be updated with actual governor on first check
    this.contextBridge = new ContextBridge({
      governor: null, // Will be set lazily on first budget check
      logger,
    });
    
    // Lazy-initialize _governorInstance to null initially
    this._governorInstance = null;
    
    // Log initialization status
    const _startupMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - _startupT0;
    logger.info('IntegrationLayer initialized', {
      startupMs: Math.round(_startupMs * 10) / 10,
      hasSkillRL: !!this.skillRL,
      hasShowboat: !!this.showboat,
      hasQuotaManager: !!this.quotaManager,
      hasAdvisor: !!this.advisor,
      hasModelRouter: !!this.modelRouter,
      hasLogger: !!structuredLogger,
      hasValidator: !!inputValidator,
      hasHealthChecker: !!healthChecker,
      hasBackupManager: !!backupManager,
      hasFeatureFlags: !!featureFlags,
      hasContextGovernor: !!contextGovernor,
      hasMemoryGraph: !!memoryGraph,
    });
    logger.info(`[Startup] IntegrationLayer: ${_startupMs.toFixed(1)}ms`);
    
    // [GAP FIX 4] Initialize feature flags with runtime check
    this._initFeatureFlags(config);
  }

  // ---------------------------------------------------------------------------
  // Learning Engine Integration Hooks
  // ---------------------------------------------------------------------------

  /**
   * [GAP FIX] Get learning advice for a task context.
   * Enhanced with hyper-parameter adaptation for tuned advice.
   * 
   * @param {Object} taskContext - { task_type, description, files, complexity, ... }
   * @returns {Object|null} - { warnings, suggestions, routing, should_pause, risk_score, adapted_params } or null
   */
  getLearningAdvice(taskContext) {
    const taskType = taskContext.task_type || taskContext.task || 'unspecified';
    const complexity = taskContext.complexity || 'moderate';
    const context = { task_type: taskType, complexity };

    // [HYPER-PARAM] Pre-fetch adapted parameter values for this context
    const adaptedParams = {};
    if (this._hyperParamEnabled && this._hyperParamRegistry) {
      try {
        const paramNames = [
          'risk_threshold_complexity',
          'skill_success_rate',
          'core_decay_floor',
          'advice_cache_ttl',
          'meta_awareness_weight',
        ];
        
        for (const paramName of paramNames) {
          const param = this._hyperParamRegistry.get(paramName);
          if (param) {
            adaptedParams[paramName] = this.getAdaptableParameter(paramName, context, param.default_value);
          }
        }
      } catch (err) {
        // Fail-open: params are optional
      }
    }

    if (!this._learningAdviceEnabled || !this.learningEngine) {
      // Return hyper-param enriched result even without learning engine
      return adaptedParams ? { adapted_params: adaptedParams } : null;
    }

    try {
      // Build context for advise()
      const adviseContext = {
        task_type: taskType,
        description: taskContext.description || taskContext.prompt || '',
        files: Array.isArray(taskContext.files) ? taskContext.files : [],
        complexity,
        attempt_number: taskContext.attempt_number || 1,
      };

      const advice = this.learningEngine.advise(adviseContext);
      
      // [HYPER-PARAM] Inject adapted parameters into advice
      if (advice) {
        advice.adapted_params = { ...adaptedParams };
        
        // Apply adapted risk threshold if available
        if (adaptedParams.risk_threshold_complexity !== undefined) {
          advice.risk_score = Math.min(
            advice.risk_score || 0.5,
            adaptedParams.risk_threshold_complexity
          );
        }
      }
      
      // Cache the advice
      if (advice && advice.advice_id) {
        this._learningAdviceCache.set(advice.advice_id, {
          advice,
          timestamp: Date.now(),
        });
      }

      return advice;
    } catch (err) {
      this.logger.warn('[IntegrationLayer] getLearningAdvice failed (fail-open)', { 
        error: err.message 
      });
      return adaptedParams ? { adapted_params: adaptedParams } : null;
    }
  }

  /**
   * [GAP FIX] Learn from task outcome - record success/failure for learning.
   * Also flows to hyper-parameter system for parameter adaptation.
   * 
   * @param {string} adviceId - The advice_id from getLearningAdvice()
   * @param {Object} outcome - { success, failure_reason, tokens_used, task_type, complexity }
   */
  learnFromOutcome(adviceId, outcome) {
    // [HYPER-PARAM] Flow outcome to parameter learning system
    if (this._hyperParamEnabled && outcome?.task_type) {
      try {
        const context = {
          task_type: outcome.task_type,
          complexity: outcome.complexity,
          domain: outcome.domain,
        };
        
        // Map outcome to relevant parameters
        const paramMappings = [
          'severity_weight_shotgun_debug',   // Anti-pattern severity
          'risk_threshold_complexity',         // Context-aware thresholds
          'skill_success_rate',               // Skill success rates
          'core_decay_floor',                  // Decay floors
          'advice_cache_ttl',                // Cache TTL
          'model_selection_weight',           // Model weights
          'meta_awareness_weight',           // Domain weights
        ];
        
        for (const paramName of paramMappings) {
          this.recordHyperParamOutcome(paramName, outcome, context);
        }
      } catch (err) {
        // Fail-open: hyper-param error should not break normal learning
        this.logger.warn('[HyperParam] learnFromOutcome hook failed', { error: err.message });
      }
    }

    if (!this._learningAdviceEnabled || !this.learningEngine) {
      return;
    }

    if (!adviceId) {
      // Check cache for most recent advice
      const now = Date.now();
      for (const [id, cached] of this._learningAdviceCache) {
        if (now - cached.timestamp < this._learningAdviceCacheMaxAge) {
          adviceId = id;
          break;
        }
      }
    }

    if (!adviceId) {
      return; // No advice to learn from
    }

    try {
      this.learningEngine.learnFromOutcome(adviceId, outcome);
    } catch (err) {
      this.logger.warn('[IntegrationLayer] learnFromOutcome failed (non-fatal)', { 
        error: err.message 
      });
    }
  }

  /**
   * [GAP FIX] Check if learning advice is available.
   * @returns {boolean}
   */
  isLearningAdviceEnabled() {
    return this._learningAdviceEnabled;
  }

  // ============================================================================
  // Hyper-Parameterized Learning Bridge Methods
  // ============================================================================

  /**
   * [HYPER-PARAM] Check if hyper-parameter system is enabled.
   * @returns {boolean}
   */
  isHyperParamEnabled() {
    return this._hyperParamEnabled;
  }

  /**
   * [HYPER-PARAM] Get adaptable parameter value.
   * OPTIMIZED: LRU cache, circuit breaker, fail-fast.
   * 
   * @param {string} paramName - Parameter name (e.g., 'severity_weight_shotgun_debug')
   * @param {Object} context - { task_type, complexity, domain, ... }
   * @param {number} defaultValue - Fallback value
   * @returns {number} Adapted parameter value
   */
  getAdaptableParameter(paramName, context = {}, defaultValue) {
    const t0 = this._hyperParamEnabled ? performance.now() : 0;

    // Circuit breaker check
    if (this._hyperParamCircuitOpen) {
      return defaultValue;
    }

    if (!this._hyperParamEnabled || !this._hyperParamRegistry || !this._hyperParamLearner) {
      return defaultValue;
    }

    // LRU cache lookup
    const cacheKey = `${paramName}:${context.task_type || 'default'}`;
    const cached = this._hyperParamCache.get(cacheKey);
    if (cached !== undefined) {
      // Move to front (most recently used)
      this._hyperParamCache.delete(cacheKey);
      this._hyperParamCache.set(cacheKey, cached);
      return cached;
    }

    try {
      const result = this._hyperParamLearner.getAdaptedValue(paramName, context, defaultValue);
      
      // LRU cache update (limit size)
      if (this._hyperParamCache.size >= this._hyperParamCacheMax) {
        // Remove oldest entry
        const firstKey = this._hyperParamCache.keys().next().value;
        this._hyperParamCache.delete(firstKey);
      }
      this._hyperParamCache.set(cacheKey, result);
      
      // Track latency
      if (t0) {
        const latency = performance.now() - t0;
        if (latency > this._hyperParamSlowThreshold) {
          this._hyperParamSlowCount++;
        }
      }
      
      return result;
    } catch (err) {
      this.logger.warn('[HyperParam] getAdaptableParameter failed', { paramName, error: err.message });
      this._checkHyperParamCircuit();
      return defaultValue;
    }
  }

  /**
   * [HYPER-PARAM] Record outcome for parameter learning.
   * OPTIMIZED: Batched with debounce, circuit breaker.
   * 
   * @param {string} paramName - Parameter name
   * @param {Object} outcome - { success, outcome_type, latency_ms, tokens_used, cost_cents, ... }
   * @param {Object} context - { task_type, complexity, domain, ... }
   */
  recordHyperParamOutcome(paramName, outcome, context = {}) {
    if (this._hyperParamCircuitOpen || !this._hyperParamEnabled || !this._hyperParamFeedback) {
      return;
    }

    // Add to batch queue
    this._hyperParamPendingFlush.push({ paramName, outcome, context });

    // Check batch size - trigger early flush
    if (this._hyperParamPendingFlush.length >= this._hyperParamMaxBatch) {
      this._doHyperParamFlush();
      return;
    }

    // Debounce flush - schedule if not already scheduled
    if (!this._hyperParamFlushScheduled) {
      this._hyperParamFlushScheduled = true;
      setTimeout(() => {
        this._hyperParamFlushScheduled = false;
        this._doHyperParamFlush();
      }, this._hyperParamFlushMs);
    }
  }

  /**
   * [HYPER-PARAM] Internal flush - processes batched outcomes.
   * @private
   */
  _doHyperParamFlush() {
    if (!this._hyperParamEnabled || !this._hyperParamLearner || !this._hyperParamRegistry) {
      return;
    }

    const batch = this._hyperParamPendingFlush;
    this._hyperParamPendingFlush = []; // Clear for next batch

    try {
      // Process batch
      for (const item of batch) {
        this._hyperParamFeedback.record(item.paramName, item.outcome, item.context);
      }

      // Trigger learning for all tracked parameters
      const adapted = this._hyperParamLearner.runAdaptation();
      
      // Persist registry changes only if adapted
      if (adapted > 0) {
        this._hyperParamRegistry.save();
        logger.info('[HyperParam] Flushed', { adapted, batchSize: batch.length });
      }
    } catch (err) {
      this.logger.warn('[HyperParam] flushHyperParamLearning failed', { error: err.message });
      this._checkHyperParamCircuit();
    }
  }

  /**
   * [HYPER-PARAM] Circuit breaker check.
   * @private
   */
  _checkHyperParamCircuit() {
    this._hyperParamSlowCount++;
    if (this._hyperParamSlowCount >= 5) {
      this._hyperParamCircuitOpen = true;
      this.logger.warn('[HyperParam] Circuit OPEN', { slowCount: this._hyperParamSlowCount });
      
      // Auto-reset after timeout
      setTimeout(() => {
        this._hyperParamCircuitOpen = false;
        this._hyperParamSlowCount = 0;
        this.logger.info('[HyperParam] Circuit RESET');
      }, this._hyperParamCircuitMs);
    }
  }

  /**
   * [HYPER-PARAM] Flush and learn from recorded outcomes.
   * Should be called periodically or after task completion.
   */
  flushHyperParamLearning() {
    // Clear debounce and flush immediately
    this._hyperParamFlushScheduled = false;
    this._doHyperParamFlush();
  }

  /**
   * [HYPER-PARAM] Get parameter learning status for observability.
   * Includes optimization metrics.
   * @returns {Object} Status object
   */
  getHyperParamStatus() {
    if (!this._hyperParamEnabled) {
      return { enabled: false };
    }

    return {
      enabled: true,
      parameterCount: this._hyperParamRegistry?.count() || 0,
      pendingOutcomes: this._hyperParamFeedback?.getPendingCount?.() || 0,
      // Optimization metrics
      circuitOpen: this._hyperParamCircuitOpen || false,
      slowCallCount: this._hyperParamSlowCount || 0,
      cacheSize: this._hyperParamCache?.size || 0,
      pendingBatch: this._hyperParamPendingFlush?.length || 0,
    };
  }

  /**
   * [GAP FIX 4] Initialize feature flags and add isEnabled check.
   * @private
   */
  _initFeatureFlags(config = {}) {
    this._featureFlags = featureFlags || null;
    
    // Default feature flags if no feature flags package
    if (!this._featureFlags) {
      this._featureFlags = {
        isEnabled: (flag) => {
          // Default: all features enabled unless explicitly disabled
          const disabled = process.env.OPENCODE_DISABLED_FEATURES || '';
          return !disabled.split(',').includes(flag);
        },
        get: (flag, defaultValue) => {
          const envKey = `OPENCODE_FEATURE_${flag.toUpperCase()}`;
          return process.env[envKey] || defaultValue;
        },
        getAll: () => ({}),
      };
    }
    
    this.logger.info('[FeatureFlags] Initialized', {
      hasFeatureFlags: !!featureFlags,
    });
  }

  /**
   * [GAP FIX 4] Check if a feature is enabled at runtime.
   * 
   * @param {string} featureName - Name of feature to check
   * @returns {boolean} True if enabled
   */
  isFeatureEnabled(featureName) {
    if (!this._featureFlags) return true; // Fail-open: enabled if no flags
    
    try {
      if (typeof this._featureFlags.isEnabled === 'function') {
        return this._featureFlags.isEnabled(featureName);
      }
      // Fallback for simpler flag objects
      if (typeof this._featureFlags.get === 'function') {
        const value = this._featureFlags.get(featureName, true);
        return value !== false && value !== 'false';
      }
    } catch (err) {
      this.logger.warn('[FeatureFlags] isEnabled failed', { featureName, error: err.message });
    }
    
    return true; // Fail-open
  }

  /**
   * [GAP FIX 4] Get feature flag value.
   * 
   * @param {string} flag - Flag name
   * @param {any} defaultValue - Default if not set
   * @returns {any} Flag value or default
   */
  getFeatureFlag(flag, defaultValue) {
    if (!this._featureFlags) return defaultValue;
    
    try {
      if (typeof this._featureFlags.get === 'function') {
        return this._featureFlags.get(flag, defaultValue);
      }
    } catch (err) {
      this.logger.warn('[FeatureFlags] get failed', { flag, error: err.message });
    }
    
    return defaultValue;
  }

  /**
   * [GAP FIX 5] Get package execution stats for dashboard display.
   * Reads from the internal event tracking.
   * 
   * @returns {Object} Package execution summary
   */
  getPackageExecutionStats() {
    return {
      eventStats: Object.fromEntries(this._eventStats || new Map()),
      handlerCount: this._eventHandlers?.size || 0,
      handlers: this.getEventHandlers(),
    };
  }

  /**
   * [GAP FIX 6] Validate configuration at startup.
   * Checks critical config files exist and are valid JSON.
   * 
   * @param {Object} configPaths - Paths to validate
   * @returns {Object} Validation results
   */
  validateConfig(configPaths = {}) {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
    };

    const fs = require('fs');
    const path = require('path');

    const defaultPaths = {
      'opencode.json': path.join(__dirname, '../../../opencode-config/opencode.json'),
      'registry.json': path.join(__dirname, '../../../opencode-config/skills/registry.json'),
      'oh-my-opencode.json': path.join(__dirname, '../../../opencode-config/oh-my-opencode.json'),
    };

    const pathsToCheck = { ...defaultPaths, ...configPaths };

    for (const [name, filePath] of Object.entries(pathsToCheck)) {
      try {
        if (!fs.existsSync(filePath)) {
          results.warnings.push(`Config file not found: ${name} at ${filePath}`);
          continue;
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(content);
        
        // Basic schema validation hints
        if (name === 'registry.json' && !parsed.skills) {
          results.errors.push(`Invalid registry.json: missing 'skills' field`);
          results.valid = false;
        }
        if (name === 'opencode.json' && !parsed.agents) {
          results.warnings.push(`opencode.json may be missing 'agents' configuration`);
        }
      } catch (err) {
        if (err instanceof SyntaxError) {
          results.errors.push(`Invalid JSON in ${name}: ${err.message}`);
          results.valid = false;
        } else {
          results.warnings.push(`Could not read ${name}: ${err.message}`);
        }
      }
    }

    if (!results.valid) {
      this.logger.error('[ConfigValidation] Failed', { errors: results.errors });
    } else if (results.warnings.length > 0) {
      this.logger.warn('[ConfigValidation] Warnings', { warnings: results.warnings });
    } else {
      this.logger.info('[ConfigValidation] All configs valid');
    }

    return results;
  }

  /**
   * [GAP FIX 1] Initialize default event handlers for critical events.
   * These handlers respond to PEV lifecycle, learning overrides, and skill recommendations.
   * @private
   */
  _initDefaultEventHandlers(config = {}) {
    // Register default handlers - can be overridden by external subscribers
    
    // LEARNING_OVERRIDE: Log and potentially act on routing changes
    this._registerEventHandler('LEARNING_OVERRIDE', (payload) => {
      const { taskType, riskScore, routingOverride } = payload || {};
      
      // Log the override for audit
      this.logger.info('[Event] LEARNING_OVERRIDE received', {
        taskType,
        riskScore,
        agentOverride: routingOverride?.agentOverride,
        skillOverride: routingOverride?.skillOverride,
        penalty: routingOverride?.penalty,
      });
      
      // Track override frequency for observability
      const key = `learning_override_${taskType || 'unknown'}`;
      const current = this._eventStats?.get(key) || { count: 0, lastRisk: 0 };
      this._eventStats?.set(key, {
        count: current.count + 1,
        lastRisk: riskScore || 0,
        lastTimestamp: Date.now(),
      });
      
      return { handled: true, action: 'logged' };
    }, 'learning-override-logger');

    // SKILL_RECOMMENDATION: Log skill auto-detection results
    this._registerEventHandler('SKILL_RECOMMENDATION', (payload) => {
      const { taskType, recommendedSkills } = payload || {};
      
      this.logger.info('[Event] SKILL_RECOMMENDATION received', {
        taskType,
        recommendedSkills: recommendedSkills?.length || 0,
        skills: recommendedSkills,
      });
      
      return { handled: true, action: 'logged' };
    }, 'skill-recommendation-logger');

    // PEV events: Track planner/executor/verifier lifecycle
    this._registerEventHandler('PEV_PLAN_START', (payload) => {
      this.logger.debug('[Event] PEV_PLAN_START', payload);
      return { handled: true };
    }, 'pev-lifecycle');
    
    this._registerEventHandler('PEV_EXECUTE_START', (payload) => {
      this.logger.debug('[Event] PEV_EXECUTE_START', payload);
      return { handled: true };
    }, 'pev-lifecycle');
    
    this._registerEventHandler('PEV_VERIFY_COMPLETE', (payload) => {
      this.logger.debug('[Event] PEV_VERIFY_COMPLETE', payload);
      return { handled: true };
    }, 'pev-lifecycle');

    // compression_triggered: Log when compression is auto-triggered
    this._registerEventHandler('compression_triggered', (payload) => {
      this.logger.info('[Event] compression_triggered', payload);
      return { handled: true, action: 'compression_logged' };
    }, 'compression-tracker');

    this.logger.info('[EventSystem] Default handlers initialized', {
      handlerCount: this._eventHandlers?.size || 0,
    });
  }

  /**
   * [GAP FIX 1] Register an event handler.
   * 
   * @param {string} eventName - Event to listen for
   * @param {Function} handler - Handler function(payload) → result
   * @param {string} label - Identifier for this handler
   */
  on(eventName, handler, label = 'anonymous') {
    return this._registerEventHandler(eventName, handler, label);
  }

  /**
   * [GAP FIX 1] Internal handler registration.
   * @private
   */
  _registerEventHandler(eventName, handler, label) {
    if (!this._eventHandlers) {
      this._eventHandlers = new Map();
    }
    
    if (!this._eventHandlers.has(eventName)) {
      this._eventHandlers.set(eventName, []);
    }
    
    this._eventHandlers.get(eventName).push({ handler, label });
    
    this.logger.debug('[EventSystem] Handler registered', { eventName, label });
    return true;
  }

  /**
   * [GAP FIX 1] Emit event to all registered handlers.
   * 
   * @param {string} eventName - Event to emit
   * @param {Object} payload - Event data
   * @returns {Array} Results from each handler
   */
  emit(eventName, payload) {
    const handlers = this._eventHandlers?.get(eventName) || [];
    const results = [];
    
    for (const { handler, label } of handlers) {
      try {
        const result = handler(payload);
        results.push({ label, success: true, result });
      } catch (err) {
        this.logger.warn('[EventSystem] Handler error', { eventName, label, error: err.message });
        results.push({ label, success: false, error: err.message });
      }
    }
    
    // Also emit through existing PEV system
    if (eventName.startsWith('PEV_') || eventName === 'LEARNING_OVERRIDE' || eventName === 'SKILL_RECOMMENDATION') {
      this.emitPEVEvent(eventName, payload);
    }
    
    return results;
  }

  /**
   * [GAP FIX 1] Get registered event handlers.
   * 
   * @param {string} [eventName] - Optional filter by event name
   * @returns {Object} Map of event names to handler info
   */
  getEventHandlers(eventName) {
    if (eventName) {
      const handlers = this._eventHandlers?.get(eventName) || [];
      return { [eventName]: handlers.map(h => h.label) };
    }
    
    const result = {};
    for (const [name, handlers] of (this._eventHandlers || new Map()).entries()) {
      result[name] = handlers.map(h => h.label);
    }
    return result;
  }

  /**
   * Get the integration status of all loaded packages.
   * Returns an object with boolean values indicating package availability.
   */
  getIntegrationStatus() {
    return { ...integrationStatus };
  }

  /**
   * Lazy-load and cache Governor instance for budget enforcement mode support.
   * Supports 'advisory' (default) and 'enforce-critical' modes.
   * When mode is 'enforce-critical', budget.checkBudget() returns allowed=false at error threshold.
   *
   * @returns {object|null} Governor instance or null if unavailable
   */
  _getGovernorInstance() {
    if (this._governorInstance !== null) {
      return this._governorInstance;
    }

    // Lazy-initialize Governor if contextGovernor module is available
    if (contextGovernor && contextGovernor.Governor) {
      try {
        // Default to 'enforce-critical' - binding by default, not advisory
        // Can still be overridden via OPENCODE_BUDGET_MODE env var for backward compatibility
        const mode = process.env.OPENCODE_BUDGET_MODE || 'enforce-critical';
        this._governorInstance = new contextGovernor.Governor({ mode });
        logger.info('Governor initialized with mode (binding by default)', { mode });
        
        // Update contextBridge with actual governor instance
        if (this.contextBridge) {
          this.contextBridge._governor = this._governorInstance;
        }
      } catch (err) {
        logger.warn('Governor initialization failed', { error: err.message });
        this._governorInstance = null;
      }
    } else {
      this._governorInstance = null;
    }

    return this._governorInstance;
  }

  /**
   * Get current budget enforcement mode.
   * @returns {'advisory'|'enforce-critical'|null}
   */
  getBudgetEnforcementMode() {
    const gov = this._getGovernorInstance();
    if (!gov) return null;
    return gov.getMode ? gov.getMode() : null;
  }

  /**
   * Set budget enforcement mode.
   * @param {'advisory'|'enforce-critical'} mode
   */
  setBudgetEnforcementMode(mode) {
    const gov = this._getGovernorInstance();
    if (!gov || !gov.setMode) return false;
    try {
      gov.setMode(mode);
      logger.info('Budget enforcement mode changed', { mode });
      return true;
    } catch (err) {
      logger.warn('Failed to set budget enforcement mode', { mode, error: err.message });
      return false;
    }
  }

  /**
   * Check context budget before execution with optional enforcement.
   * In 'enforce-critical' mode, throws when budget status is 'error' or 'exceeded'.
   *
   * @param {string} sessionId
   * @param {string} model
   * @param {number} proposedTokens
   * @returns {{ allowed: boolean, status: string, remaining: number, message: string }}
   */
  checkContextBudget(sessionId, model, proposedTokens) {
    const gov = this._getGovernorInstance();
    if (!gov) {
      return { allowed: true, status: 'unknown', remaining: 0, message: 'Governor not available' };
    }

    try {
      return gov.checkBudget(sessionId, model, proposedTokens);
    } catch (err) {
      logger.error('checkContextBudget failed', { sessionId, model, error: err.message });
      if (OpenCodeError && ErrorCategory && ErrorCode) {
        throw new OpenCodeError(`Context budget check failed: ${err.message}`, ErrorCategory.CONFIG, ErrorCode.CONFIG_INVALID, {
          sessionId,
          model,
          originalError: err.message,
          retryable: false
        });
      }
      throw err;
    }
  }

  /**
   * [Task 1.5] Get PEV Contract status and lifecycle events.
   * Returns null if PEV contract not available.
   *
   * @returns {object|null}
   */
  getPEVStatus() {
    if (!this._pevContract) return null;
    
    return {
      initialized: true,
      hasPlanner: !!this._pevContract._advisor,
      hasExecutor: !!this._pevContract._workflowExecutor,
      hasVerifier: !!this._pevContract._showboat,
      ready: !!(this._pevContract._advisor && this._pevContract._workflowExecutor)
    };
  }

  /**
   * [Task 1.5] Emit PEV lifecycle event for observability.
   *
   * @param {string} event - PEV lifecycle event name
   * @param {object} payload - Event payload
   */
  emitPEVEvent(event, payload = {}) {
    if (!this._pevContract) return;
    
    const eventObj = {
      event,
      payload,
      timestamp: new Date().toISOString(),
      source: 'integration-layer'
    };
    
    // Emit through pipeline metrics if available
    if (this.pipelineMetrics && typeof this.pipelineMetrics.recordPEVEvent === 'function') {
      try {
        this.pipelineMetrics.recordPEVEvent(eventObj);
      } catch { /* fail-open */ }
    }
    
    // Emit through contextBridge if available
    if (this.contextBridge) {
      try {
        this.contextBridge._emit?.(event, payload);
      } catch { /* fail-open */ }
    }
    
    this.logger.info('[PEV]', event, payload);
  }

  /**
   * [Task 2.3] Trigger context compression on budget warning.
   * Attempts DCP compression, then Context7 if needed.
   *
   * @param {string} sessionId
   * @param {string} model
   * @private
   */
  _triggerCompression(sessionId, model) {
    const governor = this._getGovernorInstance();
    if (!governor) return;
    
    this.logger.info('Triggering compression due to budget warning', { sessionId, model });
    
    // Emit compression event for observability
    this.emitPEVEvent('compression_triggered', { sessionId, model, reason: 'budget_warning' });
    
    // Try to trigger DCP via contextBridge
    if (this.contextBridge && typeof this.contextBridge.evaluateAndEnforce === 'function') {
      try {
        const result = this.contextBridge.evaluateAndEnforce(sessionId, model, { trigger: 'budget_warning' });
        this.logger.info('Compression triggered via contextBridge', { action: result?.action, reason: result?.reason });
      } catch (err) {
        this.logger.warn('Compression trigger failed', { error: err.message });
      }
    }
  }

  /**
   * T21: Record a package-level execution event for observability.
   * Tracks package calls, success/failure, latency, and session context.
   * Data is written to ~/.opencode/package-execution/events.json for dashboard backfill.
   *
   * @param {string} packageName - Name of the package invoked (e.g., 'skillRL', 'showboat', 'contextGovernor')
   * @param {string} method - Method name called (e.g., 'selectSkills', 'captureEvidence', 'checkBudget')
   * @param {boolean} success - Whether the call succeeded
   * @param {number} durationMs - Call duration in milliseconds
   * @param {object} [details={}] - Additional context { sessionId, taskType, error, ... }
   */
  recordPackageExecution(packageName, method, success, durationMs, details = {}) {
    if (!this._pkgTrackingEnabled) return;
    try {
      const event = {
        package: String(packageName),
        method: String(method),
        success: Boolean(success),
        durationMs: Math.max(0, Number(durationMs) || 0),
        timestamp: Date.now(),
        sessionId: details.sessionId || this.currentSessionId || null,
        taskType: details.taskType || details.task_type || null,
        error: success ? null : String(details.error || 'unknown'),
      };
      _appendPkgEvent(event);

      if (this.pipelineMetrics && typeof this.pipelineMetrics.recordPackageExecution === 'function') {
        try {
          this.pipelineMetrics.recordPackageExecution(event);
        } catch (_metricsErr) {
          // fail-open: metrics emission must not alter runtime behavior
        }
      }
    } catch {
      // Non-fatal: instrumentation must never break normal operations
    }
  }

  /**
   * Diagnose an error using runbooks auto-diagnosis.
   * Delegates to runbooks.diagnose() if available.
   * Fail-open: returns null if runbooks unavailable or throws.
   *
   * @param {string|Error|object} error - Error to diagnose
   * @param {object} [context={}] - Context for remedy execution
   * @returns {{ match: object|null, remedy: object|null, result: object|null } | null}
   */
  diagnose(error, context = {}) {
    if (!this.runbooks) return null;
    const t0 = Date.now();
    try {
      const result = this.runbooks.diagnose(error, context);
      this.recordPackageExecution('runbooks', 'diagnose', true, Date.now() - t0, {
        sessionId: context?.sessionId,
        taskType: context?.task,
      });
      return result;
    } catch (err) {
      this.recordPackageExecution('runbooks', 'diagnose', false, Date.now() - t0, {
        sessionId: context?.sessionId,
        taskType: context?.task,
        error: err.message,
      });
      return null;
    }
  }

  /**
   * Record a session error in the memory graph.
   * Delegates to memoryGraph.buildGraph() with error data.
   * Fail-open: returns null if memoryGraph unavailable or throws.
   *
   * @param {string} sessionId - Session identifier
   * @param {Error|object} error - Error to record
   * @returns {Promise<object|null>} Graph build result or null
   */
  async recordSessionError(sessionId, error) {
    if (!this.memoryGraph) return null;
    const t0 = Date.now();
    try {
      const graphData = {
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        error_type: error?.name || error?.constructor?.name || 'UnknownError',
        message: error?.message || String(error),
        code: error?.code,
        details: error?.details,
      };
      const result = await this.memoryGraph.buildGraph([graphData]);
      this.recordPackageExecution('memoryGraph', 'buildGraph', true, Date.now() - t0, { sessionId });
      return result;
    } catch (err) {
      this.recordPackageExecution('memoryGraph', 'buildGraph', false, Date.now() - t0, { sessionId, error: err.message });
      return null;
    }
  }

  /**
   * [P0] Get skill recommendations with learning-driven routing overrides.
   * 
   * This method wires learning outcomes into skill selection:
   * 1. Get base skill recommendations from SkillRLManager
   * 2. Get anti-pattern advice from LearningEngine
   * 3. Apply learning to routing via applyLearningToRouting()
   * 4. Return combined result with any routing overrides
   *
   * @param {Object} taskContext - { taskType, files, complexity, ... }
   * @returns {Object} { skills: [], routingOverride: { agentOverride, skillOverride, penalty, reason } }
   */
  getSkillRecommendations(taskContext) {
    const defaultResult = { skills: [], routingOverride: null };
    
    // Step 1: Get base skill recommendations from SkillRL
    let skills = [];
    if (this.skillRL && typeof this.skillRL.selectSkills === 'function') {
      try {
        skills = this.skillRL.selectSkills(taskContext) || [];
      } catch (err) {
        this.logger.warn('SkillRL.selectSkills failed', { error: err.message });
      }
    }

    // Step 2: Get learning advice if available
    let advice = null;
    let routingOverride = null;
    
    if (this.learningEngine) {
      try {
        // Get learning advice for this task
        const taskType = taskContext?.taskType || taskContext?.task || 'general';
        advice = this.learningEngine.advise({
          task_type: taskType,
          files: taskContext?.files || [],
          complexity: taskContext?.complexity || 'moderate',
          attempt_number: taskContext?.attemptNumber || 1,
        });

        // Step 3: Apply learning to routing (the key wiring!)
        if (advice && this.learningEngine.applyLearningToRouting) {
          routingOverride = this.learningEngine.applyLearningToRouting(taskContext, advice);
          
          // Emit LEARNING_OVERRIDE event for observability
          if (routingOverride && (routingOverride.agentOverride || routingOverride.penalty !== 0)) {
            this.emitPEVEvent('LEARNING_OVERRIDE', {
              taskType,
              riskScore: advice?.risk_score,
              routingOverride,
            });
            this.logger.info('Learning routing override applied', { 
              taskType, 
              agentOverride: routingOverride.agentOverride,
              penalty: routingOverride.penalty 
            });
          }
        }
      } catch (err) {
        this.logger.warn('Learning engine advise failed', { error: err.message });
      }
    }

    // Step 4: Apply routing override to skills if needed
    if (routingOverride?.skillOverride && Array.isArray(routingOverride.skillOverride)) {
      // Inject override skills at front of recommendations
      skills = [...routingOverride.skillOverride, ...skills];
    }

    return {
      skills,
      advice: advice || null,
      routingOverride,
    };
  }

  /**
   * [P1] Get session errors from memory graph.
   * Delegates to memoryGraph.getSessionErrors() if available.
   * Fail-open: returns empty array if memoryGraph unavailable.
   *
   * @param {string} sessionId - Session identifier
   * @returns {Array} Array of error records for this session
   */
  getSessionErrors(sessionId) {
    if (!this.memoryGraph) return [];
    
    try {
      if (typeof this.memoryGraph.getSessionErrors === 'function') {
        return this.memoryGraph.getSessionErrors(sessionId) || [];
      }
    } catch (err) {
      this.logger.warn('getSessionErrors failed', { sessionId, error: err.message });
    }
    
    return [];
  }

  /**
   * [P1] Get error frequency statistics from memory graph.
   * Delegates to memoryGraph.getErrorFrequency() if available.
   * Fail-open: returns empty array if memoryGraph unavailable.
   *
   * @returns {Array} Array of { error_type, count, first_seen, last_seen }
   */
  getErrorFrequency() {
    if (!this.memoryGraph) return [];
    
    try {
      if (typeof this.memoryGraph.getErrorFrequency === 'function') {
        return this.memoryGraph.getErrorFrequency() || [];
      }
    } catch (err) {
      this.logger.warn('getErrorFrequency failed', { error: err.message });
    }
    
    return [];
  }

  /**
   * [P2] Get tool quality metrics for planning decisions.
   * Reads from ~/.opencode/tool-quality/ directory.
   * Returns tools with quality flags for deprioritization.
   *
   * @param {string} [toolName] - Optional filter by tool name
   * @returns {Object} { totalTools, flaggedTools, summary }
   */
  getToolQualityMetrics(toolName = null) {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const toolQualityDir = path.join(os.homedir(), '.opencode', 'tool-quality');
    
    if (!fs.existsSync(toolQualityDir)) {
      return { totalTools: 0, flaggedTools: [], summary: {} };
    }

    try {
      const files = fs.readdirSync(toolQualityDir).filter(f => f.endsWith('.json'));
      const tools = [];
      
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(toolQualityDir, file), 'utf8'));
          const toolNameFromFile = data.tool_name;
          
          // Filter if toolName specified
          if (toolName && toolName !== toolNameFromFile) continue;
          
          // Check for quality flags
          const flags = [];
          if (data.confusion_rate > 0.2) flags.push('confusion_rate_high');
          if (data.avg_tokens > 25000) flags.push('token_usage_high');
          if (data.success_rate < 0.7) flags.push('success_rate_low');
          
          tools.push({
            name: toolNameFromFile,
            success_rate: data.success_rate,
            confusion_rate: data.confusion_rate,
            avg_tokens: data.avg_tokens,
            flags,
          });
        } catch {
          // Skip invalid files
        }
      }

      const flaggedTools = tools.filter(t => t.flags.length > 0);
      const avgSuccessRate = tools.length > 0 
        ? tools.reduce((sum, t) => sum + (t.success_rate || 0), 0) / tools.length 
        : 0;

      return {
        totalTools: tools.length,
        flaggedTools,
        summary: {
          avgSuccessRate: Math.round(avgSuccessRate * 10000) / 10000,
          flaggedCount: flaggedTools.length,
        },
      };
    } catch (err) {
      this.logger.warn('getToolQualityMetrics failed', { error: err.message });
      return { totalTools: 0, flaggedTools: [], summary: {} };
    }
  }

  /**
   * [P3] Detect skill-orchestrator auto-recommendations based on task keywords.
   * 
   * This implements skill-orchestrator-runtime detection logic:
   * - Analyzes task description for keywords
   * - Matches against registered skill triggers
   * - Returns recommended skills for the task
   *
   * @param {Object} taskContext - { description, taskType, ... }
   * @returns {Array} Recommended skill names
   */
  detectSkillRecommendations(taskContext) {
    // Skill-orchestrator detection keywords (from skill-orchestrator-runtime/SKILL.md)
    const SKILL_DETECTION_KEYWORDS = {
      'context7': ['documentation', 'library', 'api', 'docs', 'framework'],
      'websearch': ['search', 'web', 'internet', 'latest', 'current'],
      'sequentialthinking': ['think', 'reason', 'analyze', 'step by step', 'logical'],
      'supermemory': ['remember', 'memory', 'store', 'recall', 'persist'],
      'grep': ['search', 'find', 'grep', 'code search'],
      'playwright': ['browser', 'click', 'navigate', 'screenshot', 'web'],
      'code-doctor': ['bug', 'error', 'fix', 'debug', 'issue'],
      'systematic-debugging': ['debug', 'troubleshoot', 'investigate', 'diagnose'],
      'test-driven-development': ['test', 'tdd', 'spec', 'behavior'],
      'brainstorming': ['idea', 'brainstorm', 'design', 'plan', 'create'],
      'writing-plans': ['plan', 'roadmap', 'strategy', 'outline'],
      'git-master': ['git', 'commit', 'branch', 'merge', 'rebase'],
      'verification-before-completion': ['verify', 'check', 'validate', 'test'],
      'task-orchestrator': ['orchestrate', 'coordinate', 'multi-step', 'workflow'],
    };

    const recommendedSkills = [];
    const description = (taskContext?.description || '').toLowerCase();
    const taskType = (taskContext?.taskType || taskContext?.task || '').toLowerCase();
    const combinedText = `${description} ${taskType}`;

    // Match keywords to skills
    for (const [skill, keywords] of Object.entries(SKILL_DETECTION_KEYWORDS)) {
      for (const keyword of keywords) {
        if (combinedText.includes(keyword.toLowerCase())) {
          if (!recommendedSkills.includes(skill)) {
            recommendedSkills.push(skill);
          }
          break;
        }
      }
    }

    if (recommendedSkills.length > 0) {
      this.logger.info('Skill-orchestrator detected recommendations', { 
        skills: recommendedSkills,
        taskType: taskContext?.taskType 
      });
      
      // Emit event for observability
      this.emitPEVEvent('SKILL_RECOMMENDATION', {
        taskType: taskContext?.taskType,
        recommendedSkills,
      });
    }

    return recommendedSkills;
  }

  /**
   * [GAP FIX 2] Evaluate skill triggers from registry at task start.
   * 
   * This implements the trigger matching logic from registry.json:
   * - Load skill registry triggers (lazy-loaded)
   * - Match task keywords against trigger phrases
   * - Return skills whose triggers match
   *
   * @param {Object} taskContext - { description, taskType, files, ... }
   * @returns {Array} Skill names that match task triggers
   */
  evaluateSkillTriggers(taskContext) {
    // Lazy-load skill registry triggers
    if (!this._skillRegistryTriggers) {
      this._loadSkillRegistryTriggers();
    }

    const matchedSkills = [];
    const taskText = [
      taskContext?.description || '',
      taskContext?.taskType || taskContext?.task || '',
      taskContext?.intent || '',
    ].join(' ').toLowerCase();

    // Check each skill's triggers against task text
    for (const [skillName, triggers] of Object.entries(this._skillRegistryTriggers || {})) {
      for (const trigger of (triggers || [])) {
        const triggerLower = String(trigger).toLowerCase();
        if (taskText.includes(triggerLower)) {
          if (!matchedSkills.includes(skillName)) {
            matchedSkills.push(skillName);
            
            // Emit event for observability
            this.emit('SKILL_TRIGGER_MATCH', {
              skillName,
              trigger: triggerLower,
              taskType: taskContext?.taskType,
            });
          }
          break; // One match per skill is enough
        }
      }
    }

    if (matchedSkills.length > 0) {
      this.logger.info('[SkillTriggers] Matched skills for task', {
        taskType: taskContext?.taskType,
        matchedSkills,
      });
    }

    return matchedSkills;
  }

  /**
   * [GAP FIX 2] Load skill registry triggers from registry.json.
   * @private
   */
  _loadSkillRegistryTriggers() {
    this._skillRegistryTriggers = {};
    
    try {
      const fs = require('fs');
      const path = require('path');
      const registryPath = path.join(__dirname, '../../../opencode-config/skills/registry.json');
      
      if (fs.existsSync(registryPath)) {
        const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        
        if (registry?.skills) {
          for (const [skillName, skillData] of Object.entries(registry.skills || {})) {
            const triggers = skillData?.triggers || [];
            if (triggers.length > 0) {
              this._skillRegistryTriggers[skillName] = triggers;
            }
          }
        }
        
        this.logger.info('[SkillTriggers] Loaded triggers for skills', {
          skillCount: Object.keys(this._skillRegistryTriggers).length,
        });
      }
    } catch (err) {
      this.logger.warn('[SkillTriggers] Failed to load registry', { error: err.message });
    }

    // Fallback: basic triggers from detectSkillRecommendations
    if (Object.keys(this._skillRegistryTriggers).length === 0) {
      this._skillRegistryTriggers = {
        'context7': ['documentation', 'library', 'api', 'docs', 'framework'],
        'websearch': ['search', 'web', 'internet', 'latest', 'current'],
        'sequentialthinking': ['think', 'reason', 'analyze', 'step by step'],
        'supermemory': ['remember', 'memory', 'store', 'recall', 'persist'],
        'grep': ['search', 'find', 'grep', 'code search'],
        'playwright': ['browser', 'click', 'navigate', 'screenshot'],
        'code-doctor': ['bug', 'error', 'fix', 'debug', 'issue'],
        'systematic-debugging': ['debug', 'troubleshoot', 'investigate', 'diagnose'],
        'test-driven-development': ['test', 'tdd', 'spec', 'behavior'],
        'brainstorming': ['idea', 'brainstorm', 'design', 'plan', 'create'],
        'writing-plans': ['plan', 'roadmap', 'strategy', 'outline'],
        'git-master': ['git', 'commit', 'branch', 'merge', 'rebase'],
        'verification-before-completion': ['verify', 'check', 'validate', 'test'],
        'task-orchestrator': ['orchestrate', 'coordinate', 'multi-step', 'workflow'],
      };
    }
  }

  /**
   * Get all errors recorded for a specific session.
   * Delegates to memoryGraph.getSessionErrors().
   * Fail-open: returns null if memoryGraph unavailable or throws.
   *
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Array|null>} Array of session errors or null
   */
  async getSessionErrors(sessionId) {
    if (!this.memoryGraph) return null;
    try {
      return await this.memoryGraph.getSessionErrors(sessionId);
    } catch {
      return null;
    }
  }

  /**
   * Get error frequency statistics across all sessions.
   * Delegates to memoryGraph.getErrorFrequency().
   * Fail-open: returns null if memoryGraph unavailable or throws.
   *
   * @returns {Promise<object|null>} Error frequency data or null
   */
  async getErrorFrequency() {
    if (!this.memoryGraph) return null;
    try {
      return await this.memoryGraph.getErrorFrequency();
    } catch {
      return null;
    }
  }

  /**
   * Activate the memory graph with optional configuration.
   * Delegates to memoryGraph.activate().
   * Fail-open: returns null if memoryGraph unavailable or throws.
   *
   * @param {object} [opts={}] - Activation options
   * @returns {Promise<object|null>} Activation result or null
   */
  async activateMemoryGraph(opts = {}) {
    if (!this.memoryGraph) return null;
    try {
      return await this.memoryGraph.activate(opts);
    } catch {
      return null;
    }
  }

  /**
   * Check if the memory graph is currently active.
   * Delegates to memoryGraph.isActive().
   * Fail-open: returns false if memoryGraph unavailable or throws.
   *
   * @returns {boolean} True if memory graph is active, false otherwise
   */
  isMemoryGraphActive() {
    if (!this.memoryGraph) return false;
    try {
      return this.memoryGraph.isActive();
    } catch {
      return false;
    }
  }

  /**
   * Validate a fallback model chain using fallback-doctor.
   * @param {string[]} models - Ordered list of model IDs
   * @returns {Object|null} Validation result with valid, issues, suggestions
   */
  validateFallbackChain(models) {
    if (!this.fallbackDoctor) return null;
    const t0 = Date.now();
    try {
      const result = this.fallbackDoctor.validateChain(models);
      this.recordPackageExecution('fallbackDoctor', 'validateChain', true, Date.now() - t0, {});
      return result;
    } catch (err) {
      this.recordPackageExecution('fallbackDoctor', 'validateChain', false, Date.now() - t0, { error: err.message });
      return null;
    }
  }

  /**
   * Run fallback-doctor diagnostics on model configuration.
   * @param {Object} [config] - Optional config override
   * @returns {Object|null} Diagnostic result with healthy, modelCount, issues
   */
  diagnoseFallbacks(config) {
    if (!this.fallbackDoctor) return null;
    const t0 = Date.now();
    try {
      const result = this.fallbackDoctor.diagnose(config);
      this.recordPackageExecution('fallbackDoctor', 'diagnose', true, Date.now() - t0, {});
      return result;
    } catch (err) {
      this.recordPackageExecution('fallbackDoctor', 'diagnose', false, Date.now() - t0, { error: err.message });
      return null;
    }
  }

  /**
   * Evaluate health of all plugins.
   * @param {Array} inputs - Plugin input descriptors
   * @returns {Promise<object|null>}
   */
  async evaluatePluginHealth(inputs) {
    if (!this.pluginLifecycle) return null;
    const t0 = Date.now();
    try {
      const result = await this.pluginLifecycle.evaluateMany(inputs);
      this.recordPackageExecution('pluginLifecycle', 'evaluateMany', true, Date.now() - t0, {});
      return result;
    } catch (err) {
      this.recordPackageExecution('pluginLifecycle', 'evaluateMany', false, Date.now() - t0, { error: err.message });
      return null;
    }
  }

  /**
   * List all plugin states.
   * @returns {object|null}
   */
  listPlugins() {
    if (!this.pluginLifecycle) return null;
    try {
      return this.pluginLifecycle.list();
    } catch {
      return null;
    }
  }

  /**
   * Execute a workflow with durable checkpointing.
   * @param {object} workflowDef - Workflow definition { name, steps }
   * @param {object} input - Initial input data
   * @param {string} [runId] - Optional run ID
   * @returns {Promise<{ runId: string, status: string, context: object }|null>}
   */
  async executeWorkflow(workflowDef, input, runId) {
    if (!this.workflowExecutor) return null;
    const t0 = Date.now();
    try {
      const result = await this.workflowExecutor.execute(workflowDef, input, runId);
      this.recordPackageExecution('workflowExecutor', 'execute', true, Date.now() - t0, {
        taskType: workflowDef?.name,
      });
      return result;
    } catch (err) {
      this.recordPackageExecution('workflowExecutor', 'execute', false, Date.now() - t0, {
        taskType: workflowDef?.name,
        error: err.message,
      });
      this.logger.error('Workflow execution failed', { workflow: workflowDef?.name, error: err.message });
      return null;
    }
  }

  /**
   * Resume a workflow from its last checkpoint.
   * @param {string} runId
   * @param {object} workflowDef
   * @returns {Promise<object|null>}
   */
  async resumeWorkflow(runId, workflowDef) {
    if (!this.workflowExecutor) return null;
    const t0 = Date.now();
    try {
      const result = await this.workflowExecutor.resume(runId, workflowDef);
      this.recordPackageExecution('workflowExecutor', 'resume', true, Date.now() - t0, { runId });
      return result;
    } catch (err) {
      this.recordPackageExecution('workflowExecutor', 'resume', false, Date.now() - t0, {
        runId, error: err.message,
      });
      this.logger.error('Workflow resume failed', { runId, error: err.message });
      return null;
    }
  }

  /**
   * Get workflow run state.
   * @param {string} runId
   * @returns {object|null}
   */
  getWorkflowState(runId) {
    if (!this.workflowStore) return null;
    try {
      return this.workflowStore.getRunState(runId);
    } catch {
      return null;
    }
  }

  /**
   * Get the current dashboard runtime status.
   * @returns {object|null}
   */
  getDashboardStatus() {
    if (!this.dashboardLauncher || typeof this.dashboardLauncher.checkDashboard !== 'function') {
      return null;
    }
    try {
      return this.dashboardLauncher.checkDashboard();
    } catch {
      return null;
    }
  }

  /**
   * Ensure the dashboard is running.
   * @param {boolean} [openInBrowser=false]
   * @returns {object|null}
   */
  ensureDashboardRunning(openInBrowser = false) {
    if (!this.dashboardLauncher || typeof this.dashboardLauncher.ensureDashboard !== 'function') {
      return null;
    }
    try {
      return this.dashboardLauncher.ensureDashboard(openInBrowser);
    } catch {
      return null;
    }
  }

  /**
   * Stop the dashboard if it is running.
   * @returns {object|null}
   */
  stopDashboard() {
    if (!this.dashboardLauncher || typeof this.dashboardLauncher.stopDashboard !== 'function') {
      return null;
    }
    try {
      return this.dashboardLauncher.stopDashboard();
    } catch {
      return null;
    }
  }

  /**
   * Run an immediate plugin/MCP health check cycle.
   * @returns {object|null}
   */
  runRuntimeHealthCheck() {
    if (!this.healthd || typeof this.healthd.runCheck !== 'function') {
      return null;
    }
    try {
      return this.healthd.runCheck();
    } catch {
      return null;
    }
  }

  /**
   * Return the latest runtime health snapshot.
   * @returns {object|null}
   */
  getRuntimeHealthStatus() {
    if (!this.healthd) {
      return null;
    }
    try {
      return {
        status: this.healthd.status,
        lastResult: this.healthd.lastResult,
        checkCount: this.healthd.checkCount,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check command availability via crash-guard spawn protection.
   */
  commandExists(command) {
    if (!this.crashGuard) {
      return false;
    }
    if (typeof this.crashGuard.commandExists !== 'function') {
      return false;
    }
    try {
      return this.crashGuard.commandExists(command);
    } catch (err) {
      this.logger.warn('crash-guard commandExists failed', { command, error: err.message });
      return false;
    }
  }

  /**
   * Safe process spawn through crash-guard ENOENT protections.
   */
  safeSpawn(command, args = [], options = {}) {
    if (!this.crashGuard) {
      return null;
    }
    if (typeof this.crashGuard.safeSpawn !== 'function') {
      this.logger.warn('safeSpawn requested but crash-guard not available', { command });
      return null;
    }
    try {
      return this.crashGuard.safeSpawn(command, args, options);
    } catch (err) {
      this.logger.error('safeSpawn failed', { command, error: err.message });
      if (OpenCodeError && ErrorCategory && ErrorCode) {
        throw new OpenCodeError(`Process spawn failed: ${err.message}`, ErrorCategory.NETWORK, ErrorCode.CONNECTION_FAILED, {
          command,
          args,
          originalError: err.message,
          retryable: true
        });
      }
      throw err;
    }
  }

  /**
   * Validate input data using the validator package.
   */
  validateInput(data, schema) {
    if (!this.validator) {
      this.logger.warn('validateInput called but validator not available');
      // SECURITY: Fail closed when validator unavailable - reject unknown inputs
      return { valid: false, errors: ['Validator not available - rejecting input for safety'] };
    }
    try {
      const result = this.validator.validate(data);
      if (schema) {
        return result.type('object').schema(schema);
      }
      return result;
    } catch (err) {
      this.logger.error('Validation failed', { error: err.message });
      if (OpenCodeError && ErrorCategory && ErrorCode) {
        throw new OpenCodeError(err.message, ErrorCategory.VALIDATION, ErrorCode.INVALID_INPUT, {
          originalError: err.message,
          retryable: false
        });
      }
      return { valid: false, errors: [err.message] };
    }
  }

  /**
   * Get system health status.
   */
  async getHealth() {
    if (!this.healthChecker) {
      return { status: 'unknown', reason: 'health-check not available' };
    }
    const t0 = Date.now();
    try {
      const result = await this.healthChecker.getHealth();
      this.recordPackageExecution('healthChecker', 'getHealth', true, Date.now() - t0, {});
      return result;
    } catch (err) {
      this.recordPackageExecution('healthChecker', 'getHealth', false, Date.now() - t0, { error: err.message });
      this.logger.error('Health check failed', { error: err.message });
      return { status: 'unhealthy', error: err.message };
    }
  }

  /**
   * Create a backup of current state.
   */
  async createBackup(label) {
    if (!this.backupManager) {
      this.logger.warn('createBackup called but backup-manager not available');
      return null;
    }
    const t0 = Date.now();
    try {
      const result = await this.backupManager.backup(label);
      this.recordPackageExecution('backupManager', 'backup', true, Date.now() - t0, {});
      return result;
    } catch (err) {
      this.recordPackageExecution('backupManager', 'backup', false, Date.now() - t0, { error: err.message });
      this.logger.error('Backup failed', { error: err.message });
      return null;
    }
  }

  /**
   * Check if a feature flag is enabled.
   */
  isFeatureEnabled(flagName) {
    if (!this.featureFlags) {
      // SECURITY: Fail closed - disable unknown features by default
      return false;
    }
    try {
      return this.featureFlags.isEnabled(flagName);
    } catch (err) {
      this.logger.warn('Feature flag check failed', { flag: flagName, error: err.message });
      return true;
    }
  }

  /**
   * Check context budget for a session+model combination.
   * Fail-open: returns { allowed: true, status: 'unknown' } if Governor unavailable.
   * @param {string} sessionId
   * @param {string} model
   * @param {number} proposedTokens
   * @returns {{ allowed: boolean, status: string, remaining: number, message: string }}
   */
  checkContextBudget(sessionId, model, proposedTokens) {
    if (!this.contextGovernor) {
      return { allowed: true, status: 'unknown', urgency: 0, remaining: Infinity, message: 'Governor not available — budget unchecked' };
    }
    const t0 = Date.now();
    try {
      const gov = this._getGovernorInstance();
      const result = gov.checkBudget(sessionId, model, proposedTokens);
      const durationMs = Date.now() - t0;
      this.recordPackageExecution('contextGovernor', 'checkBudget', true, durationMs, { sessionId, model });
      // Log budget warnings at thresholds
      if (result.status === 'error') {
        this.logger.error('Context budget CRITICAL', { sessionId, model, pct: result.message });
      } else if (result.status === 'warn') {
        this.logger.warn('Context budget WARNING', { sessionId, model, pct: result.message });
      }
      return result;
    } catch (err) {
      this.recordPackageExecution('contextGovernor', 'checkBudget', false, Date.now() - t0, {
        sessionId, model, error: err.message,
      });
      this.logger.warn('checkContextBudget failed (fail-open)', { error: err.message });
      if (OpenCodeError && ErrorCategory && ErrorCode) {
        throw new OpenCodeError(`Context budget check failed: ${err.message}`, ErrorCategory.CONFIG, ErrorCode.CONFIG_INVALID, {
          sessionId,
          model,
          originalError: err.message,
          retryable: true
        });
      }
      return { allowed: true, status: 'unknown', urgency: 0, remaining: Infinity, message: `Budget check error: ${err.message}` };
    }
  }

  /**
   * Record actual token consumption for a session+model.
   * @param {string} sessionId
   * @param {string} model
   * @param {number} count
   * @returns {{ used: number, remaining: number, pct: number, status: string } | null}
   */
  recordTokenUsage(sessionId, model, count) {
    if (!this.contextGovernor) return null;
    const t0 = Date.now();
    try {
      const gov = this._getGovernorInstance();
      const result = gov.consumeTokens(sessionId, model, count);
      this.recordPackageExecution('contextGovernor', 'consumeTokens', true, Date.now() - t0, { sessionId, model });
      if (result.status === 'error') {
        this.logger.error('Token budget CRITICAL after consumption', { sessionId, model, used: result.used, remaining: result.remaining });
      } else if (result.status === 'warn') {
        this.logger.warn('Token budget WARNING after consumption', { sessionId, model, used: result.used, remaining: result.remaining });
      }
      return result;
    } catch (err) {
      this.recordPackageExecution('contextGovernor', 'consumeTokens', false, Date.now() - t0, {
        sessionId, model, error: err.message,
      });
      this.logger.warn('recordTokenUsage failed (non-fatal)', { error: err.message });
      return null;
    }
  }

  /**
   * Evaluate context budget and return compression advisory signal.
   * Delegates to ContextBridge for threshold evaluation.
   * @param {string} sessionId
   * @param {string} model
   * @returns {{ action: 'compress_urgent'|'compress'|'none', reason: string, pct: number }}
   */
  evaluateContextBudget(sessionId, model) {
    return this.contextBridge.evaluateAndCompress(sessionId, model);
  }

  /**
   * Get current budget status for a session+model.
   * @param {string} sessionId
   * @param {string} model
   * @returns {{ remaining: number, used: number, max: number, pct: number, status: string } | null}
   */
  getContextBudgetStatus(sessionId, model) {
    if (!this.contextGovernor) return null;
    const t0 = Date.now();
    try {
      const gov = this._getGovernorInstance();
      const result = gov.getRemainingBudget(sessionId, model);
      this.recordPackageExecution('contextGovernor', 'getRemainingBudget', true, Date.now() - t0, { sessionId, model });
      return result;
    } catch (err) {
      this.recordPackageExecution('contextGovernor', 'getRemainingBudget', false, Date.now() - t0, {
        sessionId, model, error: err.message,
      });
      this.logger.warn('getContextBudgetStatus failed', { error: err.message });
      return null;
    }
  }

  /**
   * Lazily instantiate a Governor singleton. The contextGovernor module
   * reference is the *package* export; we need an *instance*.
   * @private
   */
  _getGovernorInstance() {
    if (!this._governorInstance && this.contextGovernor) {
      const GovernorClass = this.contextGovernor.Governor || this.contextGovernor;
      if (typeof GovernorClass === 'function') {
        this._governorInstance = new GovernorClass();
      }
    }
    return this._governorInstance;
  }

  /**
   * Select tools for a task using the tiered preload system.
   * Returns the tool selection result or null if preload-skills unavailable.
   */
  selectToolsForTask(taskContext) {
    if (!this.preloadSkills) return null;
    const t0 = Date.now();
    try {
      const result = this.preloadSkills.selectTools(taskContext);
      this.recordPackageExecution('preloadSkills', 'selectTools', true, Date.now() - t0, {
        sessionId: taskContext?.sessionId,
        taskType: taskContext?.task,
      });
      return result;
    } catch (err) {
      this.recordPackageExecution('preloadSkills', 'selectTools', false, Date.now() - t0, {
        sessionId: taskContext?.sessionId,
        taskType: taskContext?.task,
        error: err.message,
      });
      this.logger.warn('preload-skills selectTools failed', { error: err.message });
      return null;
    }
  }

  /**
   * Combine tool selection with current context-budget pressure so runtime
   * consumers have a single actionable plan.
   */
  resolveRuntimeContext(taskContext = {}) {
    const selection = this.selectToolsForTask(taskContext);
    const sessionId = taskContext.sessionId || taskContext.session_id || this.currentSessionId || null;
    const model = taskContext.model || taskContext.modelId || taskContext.model_id || null;
    const budget = sessionId && model
      ? this.evaluateContextBudget(sessionId, model)
      : { action: 'none', reason: 'Session/model not available — budget unchecked', pct: 0 };

    const toolNames = new Set((selection?.tools || []).map((tool) => tool?.name || tool).filter(Boolean));
    const recommendedTools = [];
    const recommendedSkills = [];

    if (budget.action === 'compress' || budget.action === 'compress_urgent') {
      for (const toolName of ['distill_browse_tools', 'distill_run_tool', 'checkContextBudget', 'getContextBudgetStatus']) {
        if (!toolNames.has(toolName)) {
          toolNames.add(toolName);
          recommendedTools.push(toolName);
        }
      }
      recommendedSkills.push('dcp', 'distill', 'context-governor');
    }

    const selectionMetaContext = typeof selection?.meta_context === 'string'
      ? selection.meta_context
      : '';

    return {
      selection,
      budget,
      toolNames: [...toolNames],
      meta_context: selectionMetaContext,
      has_meta_context: selectionMetaContext.trim().length > 0,
      compression: {
        active: budget.action === 'compress' || budget.action === 'compress_urgent',
        recommendedTools,
        recommendedSkills,
      },
    };
  }

  /**
   * Load an on-demand (Tier 2) skill mid-conversation.
   */
  loadOnDemandSkill(skillName, taskType) {
    if (!this.preloadSkills) return null;
    const t0 = Date.now();
    try {
      const result = this.preloadSkills.loadOnDemand(skillName, taskType);
      this.recordPackageExecution('preloadSkills', 'loadOnDemand', true, Date.now() - t0, { skillName, taskType });
      return result;
    } catch (err) {
      this.recordPackageExecution('preloadSkills', 'loadOnDemand', false, Date.now() - t0, {
        skillName, taskType, error: err.message,
      });
      this.logger.warn('on-demand skill load failed', {
        skillName,
        taskType,
        error: err.message
      });
      return null;
    }
  }

  /**
   * Record tool usage after task execution for tier promotion/demotion feedback.
   */
  recordToolUsage(usedTools, taskType) {
    if (!this.preloadSkills) return;
    try {
      this.preloadSkills.recordUsage(usedTools, taskType);
      this.recordPackageExecution('preloadSkills', 'recordUsage', true, 0, { taskType });
    } catch (err) {
      this.recordPackageExecution('preloadSkills', 'recordUsage', false, 0, {
        taskType, error: err.message,
      });
      this.logger.warn('recordToolUsage failed', {
        usedTools,
        taskType,
        error: err.message
      });
    }
  }

  /**
   * Set current task context (for showboat high-impact gating)
   * P1 FIX: Now uses Map keyed by task_id to prevent cross-run contamination
   */
  setTaskContext(taskContext) {
    const taskId = taskContext?.task?.id || taskContext?.id || 'default';
    // T13: Evict stale entries before adding new ones (1-hour TTL)
    this._evictStaleTaskContexts();
    this.taskContextMap.set(taskId, { context: taskContext, ts: Date.now() });
  }
  
  /**
   * Get current task context by task_id
   */
  getTaskContext(taskId) {
    const entry = this.taskContextMap.get(taskId || 'default');
    return entry?.context ?? entry ?? null;
  }
  
  /**
   * Clear task context when task completes
   */
  clearTaskContext(taskId) {
    const id = taskId || 'default';
    this.taskContextMap.delete(id);
  }

  /**
   * T13: Evict stale task contexts older than 1 hour.
   * Called automatically on setTaskContext to prevent unbounded Map growth.
   * @private
   */
  _evictStaleTaskContexts() {
    const TTL_MS = 60 * 60 * 1000; // 1 hour
    const now = Date.now();
    for (const [key, entry] of this.taskContextMap) {
      if (entry?.ts && (now - entry.ts) > TTL_MS) {
        this.taskContextMap.delete(key);
      }
    }
  }

  /**
   * Enrich task context with system-level signals (quota, session metadata)
   */
  enrichTaskContext(taskContext) {
    if (!taskContext) return {};

    const enriched = { ...taskContext };
    const existingQuotaSignal = getQuotaSignal(enriched);

    // Inject quota and rotator signals if available
    let maxPressure = { percentUsed: 0 };
    
    if (this.quotaManager) {
      const statuses = this.quotaManager.getAllStatuses();
      if (statuses.length > 0) {
        maxPressure = statuses.reduce((max, status) => {
          const statusPercent = this._readPercentUsed(status);
          const maxPercent = this._readPercentUsed(max);
          return statusPercent > maxPercent ? status : max;
        }, statuses[0]);
      }
    }

    // Check rotator health for additional risk
    let rotatorRisk = 0;
    if (this.modelRouter && this.modelRouter.rotators) {
      for (const [, rotator] of Object.entries(this.modelRouter.rotators)) {
        if (!rotator || typeof rotator.getProviderStatus !== 'function') {
          continue;
        }

        const status = rotator.getProviderStatus();
        if (!status) {
          continue;
        }

        if (status.isExhausted) {
          rotatorRisk = Math.max(rotatorRisk, 0.9);
        } else if (status.healthyKeys < status.totalKeys) {
          rotatorRisk = Math.max(rotatorRisk, 0.5);
        }
      }
    }

    const finalPercentUsed = Math.max(this._readPercentUsed(maxPressure), rotatorRisk);
    const fallbackApplied = existingQuotaSignal.fallback_applied;

    const normalizedQuotaSignal = normalizeQuotaSignal({
      provider_id: maxPressure.provider_id || maxPressure.providerId || 'unknown',
      percent_used: finalPercentUsed,
      warning_threshold: maxPressure.warning_threshold || maxPressure.warningThreshold || 0.75,
      critical_threshold: maxPressure.critical_threshold || maxPressure.criticalThreshold || 0.95,
      fallback_applied: fallbackApplied,
      rotator_risk: rotatorRisk
    });

    enriched.quota_signal = normalizedQuotaSignal;
    enriched.quotaSignal = normalizedQuotaSignal;

    // Add session/task IDs if missing
    enriched.task_id = enriched.task_id || createOrchestrationId('task');
    enriched.session_id = pickSessionId(enriched, this.currentSessionId);
    enriched.sessionId = enriched.session_id;

    return enriched;
  }

  /**
   * Normalize task context shape for advisor and downstream learners.
   */
  normalizeTaskContext(taskContext = {}) {
    const normalized = { ...taskContext };

    const taskType = normalized.task_type || normalized.taskType || normalized.task || null;
    if (taskType && !normalized.task_type) {
      normalized.task_type = taskType;
    }
    if (taskType && !normalized.taskType) {
      normalized.taskType = taskType;
    }
    if (taskType && !normalized.task) {
      normalized.task = taskType;
    }

    const attemptNumber = normalized.attemptNumber ?? normalized.attempt_number ?? null;
    if (attemptNumber !== null && normalized.attemptNumber === undefined) {
      normalized.attemptNumber = attemptNumber;
    }
    if (attemptNumber !== null && normalized.attempt_number === undefined) {
      normalized.attempt_number = attemptNumber;
    }

    return normalized;
  }

  _isOrchestrationPolicyEnabled(taskContext = {}, runtimeContext = {}) {
    const taskPolicy = taskContext.orchestrationPolicy;
    const runtimePolicy = runtimeContext.orchestrationPolicy;

    if (taskPolicy && typeof taskPolicy === 'object' && taskPolicy.enabled === false) {
      return false;
    }
    if (runtimePolicy && typeof runtimePolicy === 'object' && runtimePolicy.enabled === false) {
      return false;
    }
    if (taskContext.disableOrchestrationPolicy === true || runtimeContext.disableOrchestrationPolicy === true) {
      return false;
    }

    if (!this._isOrchestrationPolicyCategoryEnabled(taskContext, runtimeContext)) {
      return false;
    }

    return true;
  }

  _normalizeRolloutEnabledCategories(categories) {
    if (!Array.isArray(categories)) {
      return null;
    }

    const normalized = categories
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);

    return new Set(normalized);
  }

  _resolveOrchestrationPolicyRollout(taskContext = {}, runtimeContext = {}) {
    const taskPolicy = taskContext.orchestrationPolicy;
    const runtimePolicy = runtimeContext.orchestrationPolicy;

    const candidates = [
      runtimePolicy?.rollout,
      taskPolicy?.rollout,
      runtimeContext?.orchestrationPolicyRollout,
      taskContext?.orchestrationPolicyRollout,
    ];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }

      const categories = this._normalizeRolloutEnabledCategories(candidate.enabledCategories);
      if (categories) {
        return categories;
      }
    }

    return new Set(DEFAULT_ORCHESTRATION_POLICY_ROLLOUT_CATEGORIES);
  }

  _isOrchestrationPolicyCategoryEnabled(taskContext = {}, runtimeContext = {}) {
    const categoryRaw = taskContext.category || taskContext.task_type || taskContext.taskType || taskContext.task || 'default';
    const category = String(categoryRaw).trim().toLowerCase();
    if (!category) {
      return false;
    }

    const enabledCategories = this._resolveOrchestrationPolicyRollout(taskContext, runtimeContext);
    return enabledCategories.has(category);
  }

  _buildFailOpenPolicyDecision(reason, metadata = {}) {
    return {
      contractVersion: '1.0',
      failOpen: true,
      inputs: {
        runtimeContext: {},
        budgetSignals: {},
        taskClassification: {},
      },
      outputs: {
        parallel: {
          maxFanout: 1,
          maxConcurrency: 1,
        },
        routing: {
          weightHints: {
            quality: 0.5,
            cost: 0.3,
            latency: 0.2,
          },
          fallback: {
            allowFailOpen: true,
            reason,
            metadata: {
              combinedBudgetBand: 'healthy',
              precedenceRule: 'policy.failOpenFallback',
              ...metadata,
            },
          },
        },
      },
      explain: {
        budget: {
          score: 0,
          band: 'healthy',
          contextPressure: 0,
          costPressure: 0,
          weights: { context: 0.7, cost: 0.3 },
          components: { context: 0, cost: 0 },
        },
        baseCaps: {
          category: 'default',
          complexity: 'moderate',
          fanout: 1,
          concurrency: 1,
        },
        precedence: {
          orderedRules: ['policy.failOpenFallback'],
          appliedRule: 'policy.failOpenFallback',
        },
      },
    };
  }

  _resolveOrchestrationPolicyDecision(taskContext = {}, runtimeContext = {}) {
    if (!this._isOrchestrationPolicyEnabled(taskContext, runtimeContext)) {
      return null;
    }

    if (typeof resolveOrchestrationPolicy !== 'function') {
      return this._buildFailOpenPolicyDecision('policy-module-unavailable');
    }

    const quotaSignal = taskContext.quota_signal || taskContext.quotaSignal || {};
    const runtimeBudget = runtimeContext.budget && typeof runtimeContext.budget === 'object'
      ? runtimeContext.budget
      : {};
    const budgetSignals = {};
    const contextPressure = runtimeBudget.contextPressure ?? runtimeBudget.context_pressure ?? runtimeBudget.pct ?? quotaSignal.percent_used;
    const costPressure = runtimeBudget.costPressure ?? runtimeBudget.cost_pressure ?? quotaSignal.percent_used;

    if (Number.isFinite(Number(contextPressure))) {
      budgetSignals.contextPressure = Number(contextPressure);
    }
    if (Number.isFinite(Number(costPressure))) {
      budgetSignals.costPressure = Number(costPressure);
    }

    const taskClassification = {
      category: taskContext.category || taskContext.task_type || taskContext.taskType || taskContext.task || 'default',
      taskType: taskContext.task_type || taskContext.taskType || taskContext.task || 'general',
      complexity: taskContext.complexity || 'moderate',
    };

    const runtimePolicyContext = {
      parallel: {
        ...(runtimeContext.parallel && typeof runtimeContext.parallel === 'object' ? runtimeContext.parallel : {}),
        ...(taskContext.parallel && typeof taskContext.parallel === 'object' ? taskContext.parallel : {}),
      },
    };

    try {
      return resolveOrchestrationPolicy({
        runtimeContext: runtimePolicyContext,
        budgetSignals,
        taskClassification,
      });
    } catch (error) {
      return this._buildFailOpenPolicyDecision('policy-evaluation-failed', {
        error: error?.message || String(error),
      });
    }
  }

  _buildDownstreamMetaContext(runtimeContext, advice) {
    const preloadBlock = typeof runtimeContext?.meta_context === 'string'
      ? runtimeContext.meta_context
      : '';
    const normalizedPreload = preloadBlock.trim();
    const adviceMeta = advice && typeof advice.meta_context === 'object' && advice.meta_context !== null
      ? advice.meta_context
      : null;

    const hasPreload = normalizedPreload.length > 0;
    const hasAdvice = Boolean(adviceMeta);

    let source = 'none';
    if (hasPreload && hasAdvice) {
      source = 'merged';
    } else if (hasPreload) {
      source = 'preload-skills';
    } else if (hasAdvice) {
      source = 'advisor';
    }

    return {
      source,
      block: preloadBlock,
      structured: adviceMeta || {
        warnings: [],
        suggestions: [],
        conventions: [],
      },
      has_context: hasPreload || hasAdvice,
    };
  }

  /**
   * Create hooks for OrchestrationAdvisor
   * These hooks augment advice with SkillRL and track failures
   */
  createOrchestrationAdvisorHooks() {
    return {
      /**
       * Augment advice with SkillRL skill selection before returning.
       * When meta-KB is available, adjusts skill scores based on
       * anti-pattern penalties and positive evidence boosts.
       */
      onBeforeAdviceReturn: (taskContext, advice) => {
        if (!this.skillRL) {
          return advice;
        }

        // Use SkillRL to select skills for this task
        const skills = this.skillRL.selectSkills(taskContext);

        // Augment advice with SkillRL recommendations
        const augmented = {
          ...advice,
          skillrl_skills: skills.map(s => s.name),
          skillrl_relevance: skills.map(s => s.relevance_score),
        };

        // Apply meta-KB signal adjustments to SkillRL scores (fail-open)
        if (this.metaKBIndex) {
          try {
            const adjustments = this._computeMetaKBSkillAdjustments(
              taskContext, skills, this.metaKBIndex
            );
            augmented.meta_kb_skill_adjustments = adjustments;
          } catch (err) {
            logger.warn('Meta-KB skill adjustment failed', { error: err.message });
          }
        }

        return augmented;
      },

      /**
       * Distill failures into SkillRL evolution engine
       */
      onFailureDistilled: (outcome, antiPattern, taskContext) => {
        if (!this.skillRL) {
          return;
        }

        // Record failure in SkillRL for evolution
        this.skillRL.evolutionEngine.learnFromFailure({
          task_id: taskContext.task_id || createOrchestrationId('task'),
          task_type: taskContext.task_type || taskContext.task || 'unknown',
          skills_used: Array.isArray(outcome?.skills_used) ? outcome.skills_used : [],
          error_message: antiPattern.description,
          anti_pattern: {
            type: antiPattern.type || 'task_failure',
            context: antiPattern.description
          },
          outcome_description: antiPattern.description,
          quota_signal: this._extractQuotaSignal(taskContext, outcome)
        });

        this.logger.info('Failure distilled into SkillRL', {
          antiPatternType: antiPattern.type,
          task: taskContext.task_type || taskContext.task || 'unknown'
        });
      },

      /**
       * Determine if evidence should be captured (delegates to showboat)
       */
      shouldCaptureEvidence: (taskContext, advice) => {
        if (!this.showboat) {
          return false;
        }

        return this.showboat.isHighImpact(taskContext);
      }
    };
  }

  /**
   * Create hooks for Proofcheck
   * These hooks capture evidence via showboat for high-impact tasks
   */
  createProofcheckHooks() {
    return {
      /**
       * Capture evidence after verification completes
       */
      onVerificationComplete: async (verificationResult) => {
        // P1 FIX: Use taskContextMap instead of global mutable state
        const taskId = verificationResult?.taskId || 'default';
        const taskContext = this.getTaskContext(taskId);
        
        if (!this.showboat || !taskContext) {
          return;
        }

        // Check if this is a high-impact task
        if (!this.showboat.isHighImpact(taskContext)) {
          this.logger.debug('Skipping evidence capture (not high-impact)', {
            task: taskContext.task || 'unknown'
          });
          return;
        }

        // Generate evidence document
        const evidenceData = {
          task: taskContext.task,
          filesModified: taskContext.filesModified,
          assertions: taskContext.assertions || [],
          outcome: verificationResult.allPassed ? 'PASS' : 'FAIL',
          verification: {
            timestamp: verificationResult.timestamp,
            results: verificationResult.results
          }
        };

        const evidence = this.showboat.captureEvidence(evidenceData);
        
        if (evidence) {
          this.logger.info('Evidence captured', { path: evidence.path });
        }
      },

      /**
       * Generate showboat evidence document for a task
       */
      captureEvidence: async (taskContext, verification) => {
        if (!this.showboat) {
          return null;
        }

        const evidenceData = {
          task: taskContext.task,
          filesModified: taskContext.filesModified,
          assertions: taskContext.assertions || [],
          outcome: verification.allPassed ? 'PASS' : 'FAIL',
          verification: {
            timestamp: verification.timestamp,
            results: verification.results
          }
        };

        const evidence = this.showboat.captureEvidence(evidenceData);
        return evidence ? evidence.path : null;
      }
    };
  }

  /**
   * Create a fully-integrated OrchestrationAdvisor with SkillRL hooks
   */
  createIntegratedAdvisor(OrchestrationAdvisor, antiPatternCatalog, positivePatternTracker) {
    const hooks = this.createOrchestrationAdvisorHooks();
    return new OrchestrationAdvisor(antiPatternCatalog, positivePatternTracker, hooks);
  }

  /**
   * Create a fully-integrated Proofcheck with Showboat hooks
   */
  createIntegratedProofcheck(Proofcheck, config = {}) {
    const hooks = this.createProofcheckHooks();
    return new Proofcheck({
      ...config,
      hooks
    });
  }

  /**
   * Canonical delegation entrypoint.
   */
  async delegate(taskContext, executeTaskFn) {
    return this.executeTaskWithEvidence(taskContext, executeTaskFn);
  }

  /**
   * Backward-compatible alias for delegation entrypoint.
   */
  async executeDelegation(taskContext, executeTaskFn) {
    return this.executeTaskWithEvidence(taskContext, executeTaskFn);
  }

  /**
   * Full workflow: task → SkillRL selection → execution → showboat evidence
   */
  async executeTaskWithEvidence(taskContext, executeTaskFn) {
    // Enrich context with system signals
    taskContext = this.enrichTaskContext(taskContext || {});
    // T23: Normalize taskContext itself so both taskType and task_type are present
    // for all downstream consumers (SkillRL, learnFromFailure, learnFromOutcome, etc.)
    taskContext = this.normalizeTaskContext(taskContext);
    const advisorContext = taskContext;

    // Compute runtime context so DCP/budget/tool recommendations participate in live flows
    const runtimeContext = this.resolveRuntimeContext(taskContext);
    const isOrchestrationPolicyEnabled = this._isOrchestrationPolicyEnabled(taskContext, runtimeContext);
    let computedPolicyDecision = isOrchestrationPolicyEnabled
      ? (runtimeContext?.policyDecision || runtimeContext?.orchestrationPolicyDecision || taskContext?.policyDecision || null)
      : null;
    if (isOrchestrationPolicyEnabled && !computedPolicyDecision) {
      try {
        computedPolicyDecision = this._resolveOrchestrationPolicyDecision(taskContext, runtimeContext);
      } catch (error) {
        computedPolicyDecision = this._buildFailOpenPolicyDecision('policy-evaluation-failed', {
          error: error?.message || String(error),
        });
      }
    }
    if (computedPolicyDecision) {
      runtimeContext.policyDecision = computedPolicyDecision;
      runtimeContext.orchestrationPolicyDecision = computedPolicyDecision;
      taskContext.policyDecision = computedPolicyDecision;
    }
    taskContext.runtime_context = runtimeContext;
    taskContext.runtimeContext = runtimeContext;
    taskContext.meta_context = runtimeContext?.meta_context || '';

    // Telemetry seam: emit normalized orchestration policy decisions when present.
    // Fail-open by design: telemetry emission must never alter task behavior.
    const policyDecision = runtimeContext?.policyDecision || runtimeContext?.orchestrationPolicyDecision || taskContext?.policyDecision || null;
    if (policyDecision && this.pipelineMetrics && typeof this.pipelineMetrics.recordPolicyDecision === 'function') {
      try {
        this.pipelineMetrics.recordPolicyDecision(policyDecision, {
          sessionId: taskContext.session_id || taskContext.sessionId || this.currentSessionId || '',
          taskId: taskContext.task_id || taskContext.taskId || '',
          taskType: taskContext.task_type || taskContext.taskType || taskContext.task || 'unknown',
          sampleRate: runtimeContext?.telemetry?.policyDecisionSampleRate ?? taskContext?.policyTelemetrySampleRate,
        });
      } catch (_e) {
        // fail-open: telemetry must never break execution
      }
    }

    if (policyDecision && this.pipelineMetrics && typeof this.pipelineMetrics.recordParallelControls === 'function') {
      try {
        const requestedParallel = policyDecision?.inputs?.runtimeContext?.parallel || runtimeContext?.parallel || {};
        const appliedParallel = policyDecision?.outputs?.parallel || {};
        this.pipelineMetrics.recordParallelControls({
          sessionId: taskContext.session_id || taskContext.sessionId || this.currentSessionId || '',
          taskId: taskContext.task_id || taskContext.taskId || '',
          taskType: taskContext.task_type || taskContext.taskType || taskContext.task || 'unknown',
          category: policyDecision?.inputs?.taskClassification?.category || taskContext.category || 'default',
          budgetBand: policyDecision?.explain?.budget?.band || 'healthy',
          fallbackReason: policyDecision?.outputs?.routing?.fallback?.reason || 'policy-applied',
          requestedFanout: requestedParallel.requestedFanout ?? requestedParallel.fanout,
          requestedConcurrency: requestedParallel.requestedConcurrency ?? requestedParallel.concurrency,
          appliedFanout: appliedParallel.maxFanout,
          appliedConcurrency: appliedParallel.maxConcurrency,
          source: 'integration-layer',
          failOpen: policyDecision?.failOpen === true,
        });
      } catch (_e) {
        // fail-open: telemetry must never break execution
      }
    }

    // [T11] Check context budget before execution — binding in enforce-critical mode
    const _sessionId = taskContext.session_id || taskContext.sessionId;
    const _model = taskContext.model || taskContext.modelId || runtimeContext?.model;
    if (_sessionId && _model) {
      try {
        const budget = this.checkContextBudget(_sessionId, _model, 1000 /* estimated */);
        
        // In enforce-critical mode, block when budget not allowed
        if (!budget.allowed) {
          const errorMsg = `Context budget ${budget.status}: ${budget.message}`;
          this.logger.error('Context budget BLOCKED', { session: _sessionId, model: _model, status: budget.status, message: budget.message });
          
          // Throw error in enforce-critical mode
          if (OpenCodeError && ErrorCategory && ErrorCode) {
            throw new OpenCodeError(errorMsg, ErrorCategory.CONFIG, ErrorCode.CONTEXT_EXHAUSTED, {
              sessionId: _sessionId,
              model: _model,
              budgetStatus: budget.status,
              remaining: budget.remaining,
              retryable: false
            });
          }
          throw new Error(errorMsg);
        }
        
        if (budget.status === 'error') {
          this.logger.error('Context budget CRITICAL before task', { session: _sessionId, model: _model });
        } else if (budget.status === 'warn') {
          this.logger.warn('Context budget WARNING before task', { session: _sessionId, model: _model });
          // [Task 2.3] Trigger compression on warning in enforce-critical mode
          this._triggerCompression(_sessionId, _model);
        }
      } catch (e) {
        // Re-throw errors in enforce-critical mode (budget.allowed === false)
        // Fail-open only for actual check failures (not budget exhaustion)
        if (!e.message?.includes('budget')) {
          this.logger.warn('Budget check failed (fail-open)', { error: e?.message });
        }
        throw e; // Re-throw budget exhaustion errors
      }
    }

    // Set context for showboat
    this.setTaskContext(taskContext);

    // Get SkillRL recommendations
    let skills = null;
    let metaKBAdj = null;
    if (this.skillRL) {
      skills = this.skillRL.selectSkills(taskContext);

      // Meta-KB signal injection into SkillRL promotion/demotion scoring
      if (this.metaKBIndex && Array.isArray(skills) && skills.length > 0) {
        try {
          const rescored = this._applyMetaKBSkillPromotionScores(taskContext, skills, this.metaKBIndex);
          skills = rescored.skills;
          metaKBAdj = rescored.adjustments;

          if (metaKBAdj && metaKBAdj.net_adjustment < -0.3) {
            this.logger.warn('Meta-KB anti-pattern risk detected for selected skills', {
              net_adjustment: metaKBAdj.net_adjustment,
              anti_pattern_penalty: metaKBAdj.anti_pattern_penalty,
              affected_skills: metaKBAdj.affected_skills,
            });
          }
        } catch (_e) {
          // Fail-open: meta-KB adjustment must never block execution
          this.logger.warn('Meta-KB skill adjustment failed (fail-open)', { error: _e?.message });
        }
      }

      this.logger.info('SkillRL selected skills', {
        skills: skills.map((s) => s.name),
        task: taskContext.task || 'unknown'
      });

      // T18: Auto-feed PipelineMetricsCollector on skill selection
      if (this.pipelineMetrics && typeof this.pipelineMetrics.recordSkillSelection === 'function' && skills.length > 0) {
        try {
          this.pipelineMetrics.recordSkillSelection({
            skills: skills.map(s => s.name),
            taskType: taskContext.task_type || taskContext.task || 'unknown',
            timestamp: Date.now(),
          });
        } catch (_e) { /* fail-open */ }
      }
    }

    // Cross-feedback: SkillRL performance → advise() context
    // Enrich advisorContext with top/bottom skill performers so LearningEngine's
    // OrchestrationAdvisor can factor SkillRL data into routing decisions.
    if (this.skillRL && this.skillRL.skillBank) {
      try {
        const _allSkills = [...this.skillRL.skillBank.generalSkills.values()];
        const _usedSkills = _allSkills.filter(s => (s.usage_count || 0) > 0);
        if (_usedSkills.length > 0) {
          const _sorted = _usedSkills.sort((a, b) => (b.success_rate || 0) - (a.success_rate || 0));
          advisorContext.skillRLPerformance = {
            top_performers: _sorted.slice(0, 5).map(s => ({ name: s.name, success_rate: s.success_rate, usage_count: s.usage_count })),
            bottom_performers: _sorted.slice(-3).map(s => ({ name: s.name, success_rate: s.success_rate, usage_count: s.usage_count })),
            total_skills: _allSkills.length,
            active_skills: _usedSkills.length,
          };
        }
      } catch (_e) { /* fail-open: enrichment must never block advise() */ }
    }

    // Execute the task with adaptive options
    let advice = null;
    if (this.advisor) {
      try {
        advice = await Promise.resolve(this.advisor.advise(advisorContext));
      } catch (_advisorErr) {
        this.logger.warn('Advisor.advise() failed (fail-open)', { error: _advisorErr?.message });
      }
    }
    const downstreamMetaContext = this._buildDownstreamMetaContext(runtimeContext, advice);
    taskContext.meta_context = downstreamMetaContext;
    const budgetAction = runtimeContext?.budget?.action || 'none';
    const compressionActive = runtimeContext?.compression?.active === true;
    const adaptiveOptions = {
      retries: (budgetAction === 'compress_urgent' || advice?.risk_score > 50 || advice?.quota_risk > 0.8) ? 1 : 3,
      backoff: (compressionActive || advice?.quota_risk > 0.5) ? 3000 : 1000,
      runtimeContext,
      budgetAction,
      compressionActive,
      recommendedTools: runtimeContext?.toolNames || [],
      compressionRecommendedTools: runtimeContext?.compression?.recommendedTools || [],
      compressionRecommendedSkills: runtimeContext?.compression?.recommendedSkills || [],
      metaKBSkillAdjustments: metaKBAdj,
      metaContext: downstreamMetaContext,
    };

    // Wire: record compression advisory when evaluateAndCompress() triggers compress/compress_urgent
    if (compressionActive && this.pipelineMetrics && typeof this.pipelineMetrics.recordCompression === 'function') {
      try {
        const _budgetPct = runtimeContext?.budget?.pct || 0;
        const _budgetStatus = (_sessionId && _model) ? this.getContextBudgetStatus(_sessionId, _model) : null;
        const _usedTokens = _budgetStatus?.used || 0;
        // Estimate post-compression tokens at ~50% savings (distill average)
        const _estimatedAfter = _usedTokens > 0 ? Math.round(_usedTokens * 0.5) : 0;
        this.pipelineMetrics.recordCompression({
          sessionId: _sessionId || '',
          tokensBefore: _usedTokens,
          tokensAfter: _estimatedAfter,
          pipeline: budgetAction === 'compress_urgent' ? 'distill-urgent' : 'distill-advisory',
          durationMs: 0,
        });
      } catch (_e) { /* fail-open: metric recording must never break execution */ }
    }

    // T4: Budget-aware model routing — call modelRouter.route() before execution
    // so _applyBudgetPenalty() scores actually influence model selection at runtime.
    // Fail-open: if route() throws or modelRouter is unavailable, continue with original model.
    if (this.modelRouter && typeof this.modelRouter.route === 'function') {
      try {
        const routeCtx = {
          sessionId: _sessionId,
          modelId: _model,
          taskType: taskContext.task_type || taskContext.taskType || taskContext.task || 'general',
          complexity: taskContext.complexity || 'moderate',
          task: taskContext.task,
        };
        if (policyDecision) {
          routeCtx.policyDecision = policyDecision;
        }
        const routeResult = this.modelRouter.route(routeCtx);
        if (routeResult && routeResult.modelId) {
          const originalModel = _model;
          if (routeResult.modelId !== originalModel) {
            taskContext.model = routeResult.modelId;
            taskContext.modelId = routeResult.modelId;
            this.logger.warn('ModelRouter budget-aware routing overrode model', {
              original: originalModel,
              routed: routeResult.modelId,
              score: routeResult.score,
              reason: routeResult.reason,
            });
          } else {
            this.logger.info('ModelRouter confirmed current model', {
              model: routeResult.modelId,
              score: routeResult.score,
              reason: routeResult.reason,
            });
          }
        }
      } catch (_routeErr) {
        // Fail-open: routing failure must never block task execution
        this.logger.warn('ModelRouter.route() failed (fail-open)', { error: _routeErr?.message });
      }
    }

    let result = null;
    let executionError = null;

    try {
      result = await executeTaskFn(taskContext, skills, adaptiveOptions);
    } catch (error) {
      executionError = error;
      result = {
        success: false,
        error: error?.message || String(error),
        reason: error?.message || String(error)
      };
    }

    // Record outcome in ModelRouter for adaptive routing and key rotation
    if (this.modelRouter && result.modelId) {
      this.modelRouter.recordResult(
        result.modelId,
        result.success,
        executionError || (result.success ? (result.latencyMs || 0) : result)
      );
    }

    // [T10] Record actual token consumption — fail-open, advisory only
    const _tokensUsed = result?.tokensUsed || result?.usage?.total_tokens || result?.usage?.output_tokens || 0;
    let _budgetResult = null;
    if (_tokensUsed > 0 && _sessionId && _model) {
      try {
        _budgetResult = this.recordTokenUsage(_sessionId, _model, _tokensUsed);
      } catch (e) {
        // Fail-open: token recording failure is non-fatal
      }
    }
    // [T19] Evaluate budget alerts after token consumption — fail-open
    if (_budgetResult && this.alertManager && typeof this.alertManager.evaluateBudget === 'function') {
      try {
        this.alertManager.evaluateBudget({ sessionId: _sessionId, model: _model, ..._budgetResult });
      } catch (_e) {
        // Fail-open: alert evaluation is advisory only
      }
    }

    // Update quota signal with fallback info from result if present
    if (taskContext.quota_signal) {
      const fallbackApplied = result?.fallbackApplied ?? result?.fallback_applied;
      if (fallbackApplied !== undefined) {
        taskContext.quota_signal.fallback_applied = fallbackApplied;
        taskContext.quotaSignal = taskContext.quota_signal;
      }
    }

    // Capture evidence if high-impact, critical quota, high risk, or skill uncertainty
    const isCriticalQuota = taskContext.quota_signal?.percent_used >= (taskContext.quota_signal?.critical_threshold || 0.95);
    const isHighRisk = advice?.risk_score > 60;
    
    let isSkillUncertain = false;
    if (this.skillRL && this.skillRL.skillBank && skills) {
      isSkillUncertain = skills.some(s => {
        const perf = this.skillRL.skillBank.getSkillPerformance(s.name, taskContext.task);
        return perf?.is_uncertain;
      });
    }

    if (this.showboat && (this.showboat.isHighImpact(taskContext) || isCriticalQuota || isHighRisk || isSkillUncertain)) {
      const evidenceData = {
        task: taskContext.task,
        filesModified: taskContext.filesModified,
        assertions: taskContext.assertions || [],
        outcome: result.success ? 'PASS' : 'FAIL',
        verification: {
          timestamp: new Date().toISOString(),
          exitCode: result.exitCode || 0,
          risk_score: advice?.risk_score,
          is_skill_uncertain: isSkillUncertain
        }
      };

      this.showboat.captureEvidence(evidenceData);
    }

    // Collect MCP tools used in this session for affinity tracking
    const _mcpToolsUsed = _getSessionMcpInvocations
      ? _getSessionMcpInvocations(taskContext.session_id || taskContext.sessionId)
      : [];

    // Wire: record Context7 lookups from MCP tool invocations
    if (this.pipelineMetrics && typeof this.pipelineMetrics.recordContext7Lookup === 'function' && _mcpToolsUsed.length > 0) {
      try {
        const _context7Tools = _mcpToolsUsed.filter(t =>
          String(t).toLowerCase().includes('context7')
        );
        for (const _c7tool of _context7Tools) {
          this.pipelineMetrics.recordContext7Lookup({
            libraryName: String(_c7tool),
            resolved: true,
            snippetCount: 0,
            durationMs: 0,
          });
        }
      } catch (_e) { /* fail-open: metric recording must never break execution */ }
    }

    // Learn from outcome if failure
    if (!result.success && this.skillRL && skills) {
      this.skillRL.evolutionEngine.learnFromFailure({
        task_id: taskContext.task_id,
        run_id: taskContext.run_id,
        step_id: taskContext.step_id,
        task_type: taskContext.task_type || taskContext.task || 'unknown',
        skills_used: skills.map(s => s.name),
        skill_used: skills[0]?.name,
        error_message: result.error || 'Unknown error',
        anti_pattern: {
          type: 'task_failure',
          context: result.error || 'Task execution failed'
        },
        outcome_description: result.error || 'Task execution failed',
        quota_signal: this._extractQuotaSignal(taskContext, result)
      });
      // Also call learnFromOutcome on failure to update tool_affinities
      this.skillRL.learnFromOutcome({
        success: false,
        skill_used: skills[0]?.name,
        mcpToolsUsed: _mcpToolsUsed,
        task_type: taskContext.task_type || taskContext.task || 'unknown',
      });
    } else if (result.success && this.skillRL && skills) {
      this.skillRL.learnFromOutcome({
        success: true,
        task_id: taskContext.task_id,
        run_id: taskContext.run_id,
        step_id: taskContext.step_id,
        task_type: taskContext.task_type || taskContext.task || 'unknown',
        skills_used: skills.map((s) => s.name),
        skill_used: skills[0]?.name,
        mcpToolsUsed: _mcpToolsUsed,
        positive_pattern: {
          type: 'task_success',
          context: result.message || 'Task execution succeeded'
        },
        quota_signal: this._extractQuotaSignal(taskContext, result)
      });
    }

    // Cross-feedback: SkillRL → LearningEngine
    // After SkillRL updates skill weights, forward skill performance data to
    // LearningEngine as pattern evidence so both learning systems reinforce each other.
    // Fail-open: cross-feedback must never break task execution.
    if (this.learningEngine && this.skillRL && skills) {
      try {
        const _taskType = taskContext.task_type || taskContext.task || 'unknown';
        const _primarySkill = skills[0]?.name;
        const _skillData = _primarySkill ? this.skillRL.skillBank.generalSkills.get(_primarySkill) : null;
        if (_skillData) {
          const _perfSummary = {
            skill_name: _skillData.name,
            success_rate: _skillData.success_rate,
            usage_count: _skillData.usage_count,
            tool_affinities: _skillData.tool_affinities || {},
          };
          if (result.success) {
            this.learningEngine.addPositivePattern({
              type: 'skill_success',
              description: `Skill "${_primarySkill}" succeeded (rate: ${(_skillData.success_rate ?? 0).toFixed(2)}, uses: ${_skillData.usage_count || 0})`,
              success_rate: _skillData.success_rate || 0.5,
              context: { task_type: _taskType, skill_performance: _perfSummary },
              discovered_at: new Date().toISOString(),
              source: 'skillrl-cross-feedback',
            });
          } else {
            this.learningEngine.addAntiPattern({
              type: 'skill_failure',
              description: `Skill "${_primarySkill}" failed (rate: ${(_skillData.success_rate ?? 0).toFixed(2)}, uses: ${_skillData.usage_count || 0})`,
              severity: (_skillData.success_rate != null && _skillData.success_rate < 0.3) ? 'high' : 'medium',
              context: { task_type: _taskType, skill_performance: _perfSummary },
              discovered_at: new Date().toISOString(),
              source: 'skillrl-cross-feedback',
            });
          }
        }
      } catch (_e) { /* fail-open: cross-feedback must never break execution */ }
    }

    // Fire-and-forget: feed model exploration data back into SkillRL weights
    // Reads model_performance SQLite table → calls skillRL.learnFromOutcome() per model
    // Async, non-blocking, fail-open — must never delay task completion
    if (this.explorationAdapter) {
      const _taskCategory = taskContext.task_type || taskContext.task || 'unknown';
      Promise.resolve()
        .then(() => this.explorationAdapter.updateFromExploration(_taskCategory))
        .catch(() => { /* fail-open: exploration feedback is advisory only */ });
    }

    // [T22] Track consecutive failures per skill for early warning
    if (!result.success && skills) {
      for (const skill of skills) {
        const key = skill.name;
        const entry = this._skillConsecutiveFailures.get(key) || { count: 0, lastTask: '' };
        entry.count += 1;
        entry.lastTask = taskContext.task || 'unknown';
        this._skillConsecutiveFailures.set(key, entry);
        if (entry.count >= 3) {
          this.logger.warn('Skill consecutive failure threshold reached', {
            skill: key,
            consecutiveFailures: entry.count,
            lastTask: entry.lastTask
          });
          // Soft weight reduction: flag in SkillRL for next selection
          if (this.skillRL && typeof this.skillRL.skillBank?.markSkillCaution === 'function') {
            try { this.skillRL.skillBank.markSkillCaution(key, entry.count); } catch {}
          }
        }
      }
    } else if (result.success && skills) {
      // Reset consecutive failure counter on success
      for (const skill of skills) {
        this._skillConsecutiveFailures.delete(skill.name);
      }
    }

    // [T21] FallbackDoctor skill failure detection — advisory only
    if (this.fallbackDoctor && skills && typeof this.fallbackDoctor.detectSkillFailures === 'function') {
      try {
        const sfResult = this.fallbackDoctor.detectSkillFailures(skills, taskContext);
        if (sfResult.problematicSkills.length > 0) {
          this.logger.warn('FallbackDoctor: problematic skills detected', {
            skills: sfResult.problematicSkills,
            warnings: sfResult.warnings
          });
        }
      } catch { /* fail-open */ }
    }

    if (executionError) {
      throw executionError;
    }

    return result;
  }

  _readPercentUsed(signal) {
    if (!signal) {
      return 0;
    }

    return signal.percentUsed ?? signal.percent_used ?? 0;
  }

  _extractQuotaSignal(taskContext, outcome) {
    const signal = normalizeQuotaSignal(
      outcome?.quota_signal ||
      outcome?.quotaSignal ||
      taskContext?.quota_signal ||
      taskContext?.quotaSignal ||
      {}
    );

    const fallbackReason =
      outcome?.fallback_reason ||
      outcome?.fallbackReason ||
      signal.fallback_reason ||
      signal.fallbackReason ||
      null;

    const reasonText = String(
      fallbackReason || outcome?.reason || outcome?.message || ''
    ).toLowerCase();
    const isQuotaReason = reasonText.includes('quota');

    if (outcome?.fallbackApplied === true) {
      signal.fallback_applied = true;
      signal.fallback_reason = isQuotaReason ? 'quota_fallback' : 'non_quota_fallback';
      if (isQuotaReason || signal.percent_used >= signal.warning_threshold) {
        signal.percent_used = Math.max(signal.percent_used, 1.0);
      }
    } else if (fallbackReason) {
      signal.fallback_reason = isQuotaReason ? 'quota_fallback' : 'non_quota_fallback';
    }

    return signal.provider_id === 'unknown' && signal.percent_used === 0 && signal.rotator_risk === 0
      ? null
      : signal;
  }

  /**
   * Compute meta-KB skill adjustments for SkillRL integration.
   * Anti-patterns matching skill names → penalty (negative score).
   * Positive path matches → boost (positive score).
   * @private
   */
  _computeMetaKBSkillAdjustments(taskContext, skills, metaKBIndex) {
    const skillNames = skills.map(s => (s.name || '').toLowerCase());
    const files = taskContext?.files || [];
    let antiPatternPenalty = 0;
    let positiveEvidence = 0;
    const affectedSkills = [];

    // Check anti-patterns for skill name mentions
    if (Array.isArray(metaKBIndex.anti_patterns)) {
      for (const ap of metaKBIndex.anti_patterns) {
        const patternLower = (ap.pattern || '').toLowerCase();
        const descLower = (ap.description || '').toLowerCase();
        for (const skillName of skillNames) {
          if (patternLower.includes(skillName) || descLower.includes(skillName)) {
            const severityWeight = { critical: 4, high: 3, medium: 2, low: 1 }[ap.severity] || 1;
            antiPatternPenalty += severityWeight;
            affectedSkills.push({ skill: skillName, type: 'anti_pattern', severity: ap.severity });
          }
        }
      }
    }

    // Check positive path matches
    if (files.length > 0 && metaKBIndex.by_affected_path) {
      for (const file of files) {
        const normalized = file.replace(/\\/g, '/');
        for (const [pathKey, entries] of Object.entries(metaKBIndex.by_affected_path)) {
          if (normalized.startsWith(pathKey) || normalized.includes(pathKey)) {
            positiveEvidence += entries.length;
          }
        }
      }
    }

    return {
      anti_pattern_penalty: antiPatternPenalty,
      positive_evidence: positiveEvidence,
      affected_skills: affectedSkills,
      net_adjustment: positiveEvidence - antiPatternPenalty,
    };
  }

  _applyMetaKBSkillPromotionScores(taskContext, skills, metaKBIndex) {
    const perSkillSignals = [];
    const rescored = skills.map((skill) => {
      const signal = this._computeMetaKBSignalForSkill(taskContext, skill, metaKBIndex);
      perSkillSignals.push(signal);

      const promotionScore = this._computeSkillPromotionScore(skill);
      const adjustedPromotionScore = promotionScore + signal.positiveBonus - signal.antiPatternPenalty;

      return {
        ...skill,
        promotion_score: promotionScore,
        adjusted_promotion_score: adjustedPromotionScore,
        meta_kb_signal: {
          anti_pattern_penalty: signal.antiPatternPenalty,
          positive_pattern_bonus: signal.positiveBonus,
          anti_pattern_hits: signal.antiPatternHits,
          positive_pattern_hits: signal.positivePatternHits,
        },
      };
    }).sort((a, b) => (b.adjusted_promotion_score || 0) - (a.adjusted_promotion_score || 0));

    const antiPatternPenalty = perSkillSignals.reduce((sum, signal) => sum + signal.antiPatternPenalty, 0);
    const positiveEvidence = perSkillSignals.reduce((sum, signal) => sum + signal.positiveBonus, 0);
    const affectedSkills = perSkillSignals
      .filter((signal) => signal.antiPatternHits > 0)
      .map((signal) => ({
        skill: signal.skillName,
        type: 'anti_pattern',
        severity: signal.maxSeverity,
      }));

    return {
      skills: rescored,
      adjustments: {
        anti_pattern_penalty: antiPatternPenalty,
        positive_evidence: positiveEvidence,
        affected_skills: affectedSkills,
        net_adjustment: positiveEvidence - antiPatternPenalty,
      },
    };
  }

  _computeSkillPromotionScore(skill) {
    const relevanceScore = Number(skill?.relevance_score);
    const successRate = Number(skill?.success_rate);
    const existingPromotion = Number(skill?.promotion_score);
    const usageCount = Number(skill?.usage_count) || 0;

    const base = Number.isFinite(existingPromotion)
      ? existingPromotion
      : (Number.isFinite(relevanceScore)
        ? relevanceScore
        : (Number.isFinite(successRate) ? successRate : 0.5));

    const usageBoost = Math.min(usageCount / 100, 0.3);
    return base + usageBoost;
  }

  _computeMetaKBSignalForSkill(taskContext, skill, metaKBIndex) {
    const skillName = String(skill?.name || '').toLowerCase();
    const tokens = skillName.split(/[-_\s]+/).filter(Boolean);
    const skillTerms = new Set([skillName, ...tokens]);
    const files = Array.isArray(taskContext?.files) ? taskContext.files : [];

    let antiPatternPenalty = 0;
    let positiveBonus = 0;
    let antiPatternHits = 0;
    let positivePatternHits = 0;
    let maxSeverity = 'low';

    const severityPenalty = {
      critical: 0.6,
      high: 0.4,
      medium: 0.25,
      low: 0.1,
    };
    const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };

    if (Array.isArray(metaKBIndex?.anti_patterns)) {
      for (const antiPattern of metaKBIndex.anti_patterns) {
        const text = `${antiPattern?.pattern || ''} ${antiPattern?.description || ''}`.toLowerCase();
        const matched = [...skillTerms].some((term) => term && text.includes(term));
        if (!matched) {
          continue;
        }

        antiPatternHits += 1;
        const severity = String(antiPattern?.severity || 'low').toLowerCase();
        antiPatternPenalty += severityPenalty[severity] || severityPenalty.low;
        if ((severityRank[severity] || 1) > (severityRank[maxSeverity] || 1)) {
          maxSeverity = severity;
        }
      }
    }

    const byPath = metaKBIndex?.by_affected_path;
    if (byPath && typeof byPath === 'object') {
      for (const filePath of files) {
        const normalized = String(filePath || '').replace(/\\/g, '/');
        for (const [pathKey, entries] of Object.entries(byPath)) {
          const normalizedKey = String(pathKey || '').replace(/\\/g, '/');
          if (!normalized.startsWith(normalizedKey) && !normalized.includes(normalizedKey)) {
            continue;
          }

          const entryList = Array.isArray(entries) ? entries : [];
          for (const entry of entryList) {
            const entryText = `${entry?.summary || ''} ${entry?.description || ''}`.toLowerCase();
            const skillMatched = [...skillTerms].some((term) => term && entryText.includes(term));
            positivePatternHits += 1;
            positiveBonus += skillMatched ? 0.2 : 0.05;
          }
        }
      }
    }

    return {
      skillName,
      antiPatternPenalty,
      positiveBonus,
      antiPatternHits,
      positivePatternHits,
      maxSeverity,
    };
  }

}

module.exports = { IntegrationLayer };
