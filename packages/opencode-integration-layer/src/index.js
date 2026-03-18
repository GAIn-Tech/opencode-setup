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

// Context bridge for governor → distill advisory signals
const { ContextBridge } = require('./context-bridge');

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
    setImmediate(() => {
      try {
        _pkgEventsFlushing = false;
        const fp = _getPkgEventsPath();
        if (!fp) return;
        const fs = require('fs');
        const dir = require('path').dirname(fp);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        // Read existing events, append new ones, write back
        let existing = [];
        try {
          if (fs.existsSync(fp)) {
            existing = JSON.parse(fs.readFileSync(fp, 'utf8'));
          }
        } catch {
          existing = [];
        }
        const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // Keep 7 days
        const recent = existing.filter(e => e && e.timestamp && e.timestamp > cutoff);
        const merged = [...recent, ..._pkgEvents].slice(-MAX_PKG_EVENTS);
        fs.writeFileSync(fp, JSON.stringify(merged, null, 2), 'utf8');
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
    this.modelRouter = config.modelRouter || config.ModelRouter || null;
    this.preloadSkills = config.preloadSkills || null;
    this.runbooks = config.runbooks || null;
    this.fallbackDoctor = config.fallbackDoctor || null;
    this.pluginLifecycle = config.pluginLifecycle || null;
    this.workflowStore = config.workflowStore || null;
    this.workflowExecutor = config.workflowExecutor || null;
    this.dashboardLauncher = config.dashboardLauncher || null;
    this.healthd = config.healthd || null;
    // P1 FIX: Use Map keyed by task_id instead of global mutable state
    this.taskContextMap = new Map();
    this.currentSessionId = config.currentSessionId || config.sessionId || null;

    // T21: Package execution tracking
    this._pkgTrackingEnabled = true;

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

    // T8: ContextBridge — advisory bridge between governor and distill compression
    this.contextBridge = new ContextBridge({
      governor: this._getGovernorInstance(),
      logger,
    });
    
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
  }

  /**
   * Get the integration status of all loaded packages.
   * Returns an object with boolean values indicating package availability.
   */
  getIntegrationStatus() {
    return { ...integrationStatus };
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
      const errorData = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : error;
      const result = await this.memoryGraph.buildGraph([{
        sessionId,
        ...errorData,
        timestamp: new Date().toISOString(),
      }]);
      this.recordPackageExecution('memoryGraph', 'buildGraph', true, Date.now() - t0, { sessionId });
      return result;
    } catch (err) {
      this.recordPackageExecution('memoryGraph', 'buildGraph', false, Date.now() - t0, {
        sessionId, error: err.message,
      });
      return null;
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
    if (!this.crashGuard || typeof this.crashGuard.commandExists !== 'function') {
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
    if (!this.crashGuard || typeof this.crashGuard.safeSpawn !== 'function') {
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

    return {
      selection,
      budget,
      toolNames: [...toolNames],
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
    const advisorContext = this.normalizeTaskContext(taskContext);

    // Compute runtime context so DCP/budget/tool recommendations participate in live flows
    const runtimeContext = this.resolveRuntimeContext(taskContext);
    taskContext.runtime_context = runtimeContext;
    taskContext.runtimeContext = runtimeContext;

    // Set context for showboat
    this.setTaskContext(taskContext);

    // Get SkillRL recommendations
    let skills = null;
    if (this.skillRL) {
      skills = this.skillRL.selectSkills(taskContext);
      this.logger.info('SkillRL selected skills', {
        skills: skills.map((s) => s.name),
        task: taskContext.task || 'unknown'
      });
    }

    // Execute the task with adaptive options
    const advice = this.advisor ? this.advisor.advise(advisorContext) : null;
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
      compressionRecommendedSkills: runtimeContext?.compression?.recommendedSkills || []
    };

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
    if (this.skillRL && skills) {
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

}

module.exports = { IntegrationLayer };
