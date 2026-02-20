/**
 * IntegrationLayer - Wires SkillRL and Showboat into existing packages
 * 
 * This module provides hook implementations that connect:
 * - SkillRL → OrchestrationAdvisor (skill selection augmentation)
 * - SkillRL → Learning Engine (failure distillation)
 * - Showboat → Proofcheck (evidence capture)
 */
let contextUtils;
try {
  contextUtils = require('@jackoatmon/opencode-shared-orchestration/src/context-utils');
} catch {
  // Fallback for non-linked environments (development without bun link)
  try {
    contextUtils = require('../../opencode-shared-orchestration/src/context-utils');
  } catch (e) {
    console.warn('[IntegrationLayer] opencode-shared-orchestration not found. Context utilities unavailable.');
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
let structuredLogger, inputValidator, healthChecker, backupManager, featureFlags, contextGovernor, memoryGraph;
try {
  structuredLogger = require('opencode-logger');
} catch (e) {
  structuredLogger = null;
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

// Initialize logger if available
const logger = structuredLogger?.createLogger?.('integration-layer') || {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || ''),
};

class IntegrationLayer {
  constructor(config = {}) {
    this.skillRL = config.skillRL || config.skillRLManager || null;
    this.showboat = config.showboat || config.showboatWrapper || null;
    this.quotaManager = config.quotaManager || null;
    this.advisor = config.advisor || config.orchestrationAdvisor || null;
    this.modelRouter = config.modelRouter || config.ModelRouter || null;
    this.preloadSkills = config.preloadSkills || null;
    // P1 FIX: Use Map keyed by task_id instead of global mutable state
    this.taskContextMap = new Map();
    this.currentSessionId = config.currentSessionId || config.sessionId || null;
    
    // Initialize utility packages
    this.logger = logger;
    this.validator = inputValidator;
    this.healthChecker = healthChecker;
    this.backupManager = backupManager;
    this.featureFlags = featureFlags;
    this.contextGovernor = contextGovernor;
    this.memoryGraph = memoryGraph;
    
    // Log initialization status
    logger.info('IntegrationLayer initialized', {
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
    try {
      return await this.healthChecker.getHealth();
    } catch (err) {
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
    try {
      return await this.backupManager.backup(label);
    } catch (err) {
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
   * Select tools for a task using the tiered preload system.
   * Returns the tool selection result or null if preload-skills unavailable.
   */
  selectToolsForTask(taskContext) {
    if (!this.preloadSkills) return null;
    try {
      return this.preloadSkills.selectTools(taskContext);
    } catch (err) {
      console.warn('[IntegrationLayer] preload-skills selectTools failed:', err.message);
      return null;
    }
  }

  /**
   * Load an on-demand (Tier 2) skill mid-conversation.
   */
  loadOnDemandSkill(skillName, taskType) {
    if (!this.preloadSkills) return null;
    try {
      return this.preloadSkills.loadOnDemand(skillName, taskType);
    } catch (err) {
      console.warn('[IntegrationLayer] on-demand skill load failed:', err.message);
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
    } catch (err) {
      console.warn('[IntegrationLayer] recordToolUsage failed:', err.message);
    }
  }

  /**
   * Set current task context (for showboat high-impact gating)
   * P1 FIX: Now uses Map keyed by task_id to prevent cross-run contamination
   */
  setTaskContext(taskContext) {
    const taskId = taskContext?.task?.id || taskContext?.id || 'default';
    this.taskContextMap.set(taskId, taskContext);
  }
  
  /**
   * Get current task context by task_id
   */
  getTaskContext(taskId) {
    return this.taskContextMap.get(taskId || 'default');
  }
  
  /**
   * Clear task context when task completes
   */
  clearTaskContext(taskId) {
    const id = taskId || 'default';
    this.taskContextMap.delete(id);
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
   * Create hooks for OrchestrationAdvisor
   * These hooks augment advice with SkillRL and track failures
   */
  createOrchestrationAdvisorHooks() {
    return {
      /**
       * Augment advice with SkillRL skill selection before returning
       */
      onBeforeAdviceReturn: (taskContext, advice) => {
        if (!this.skillRL) {
          return advice;
        }

        // Use SkillRL to select skills for this task
        const skills = this.skillRL.selectSkills(taskContext);

        // Augment advice with SkillRL recommendations
        return {
          ...advice,
          skillrl_skills: skills.map(s => s.name),
          skillrl_relevance: skills.map(s => s.relevance_score)
        };
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
          task_type: taskContext.task || 'unknown',
          skills_used: Array.isArray(outcome?.skills_used) ? outcome.skills_used : [],
          error_message: antiPattern.description,
          anti_pattern: {
            type: antiPattern.type || 'task_failure',
            context: antiPattern.description
          },
          outcome_description: antiPattern.description,
          quota_signal: this._extractQuotaSignal(taskContext, outcome)
        });

        console.log(`[IntegrationLayer] Failure distilled into SkillRL: ${antiPattern.type}`);
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
        const taskContext = this.taskContextMap.get(taskId);
        
        if (!this.showboat || !taskContext) {
          return;
        }

        // Check if this is a high-impact task
        if (!this.showboat.isHighImpact(taskContext)) {
          console.log('[IntegrationLayer] Skipping evidence capture (not high-impact)');
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
          console.log(`[IntegrationLayer] Evidence captured: ${evidence.path}`);
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
   * Full workflow: task → SkillRL selection → execution → showboat evidence
   */
  async executeTaskWithEvidence(taskContext, executeTaskFn) {
    // Enrich context with system signals
    taskContext = this.enrichTaskContext(taskContext || {});

    // Set context for showboat
    this.setTaskContext(taskContext);

    // Get SkillRL recommendations
    let skills = null;
    if (this.skillRL) {
      skills = this.skillRL.selectSkills(taskContext);
      console.log(`[IntegrationLayer] SkillRL selected: ${skills.map(s => s.name).join(', ')}`);
    }

    // Execute the task with adaptive options
    const advice = this.advisor ? this.advisor.advise(taskContext) : null;
    const adaptiveOptions = {
      retries: (advice?.risk_score > 50 || advice?.quota_risk > 0.8) ? 1 : 3,
      backoff: (advice?.quota_risk > 0.5) ? 3000 : 1000
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

    // Learn from outcome if failure
    if (!result.success && this.skillRL && skills) {
      this.skillRL.evolutionEngine.learnFromFailure({
        task_id: taskContext.task_id,
        run_id: taskContext.run_id,
        step_id: taskContext.step_id,
        task_type: taskContext.task || 'unknown',
        skills_used: skills.map(s => s.name),
        error_message: result.error || 'Unknown error',
        anti_pattern: {
          type: 'task_failure',
          context: result.error || 'Task execution failed'
        },
        outcome_description: result.error || 'Task execution failed',
        quota_signal: this._extractQuotaSignal(taskContext, result)
      });
    } else if (result.success && this.skillRL && skills) {
      this.skillRL.learnFromOutcome({
        success: true,
        task_id: taskContext.task_id,
        run_id: taskContext.run_id,
        step_id: taskContext.step_id,
        task_type: taskContext.task || 'unknown',
        skills_used: skills.map((s) => s.name),
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
}

module.exports = { IntegrationLayer };
