/**
 * IntegrationLayer - Wires SkillRL and Showboat into existing packages
 * 
 * This module provides hook implementations that connect:
 * - SkillRL → OrchestrationAdvisor (skill selection augmentation)
 * - SkillRL → Learning Engine (failure distillation)
 * - Showboat → Proofcheck (evidence capture)
 */
class IntegrationLayer {
  constructor(config = {}) {
    this.skillRL = config.skillRL || config.skillRLManager || null;
    this.showboat = config.showboat || config.showboatWrapper || null;
    this.quotaManager = config.quotaManager || null;
    this.advisor = config.advisor || config.orchestrationAdvisor || null;
    this.modelRouter = config.modelRouter || config.ModelRouter || null;
    this.currentTaskContext = null;
  }

  /**
   * Set current task context (for showboat high-impact gating)
   */
  setTaskContext(taskContext) {
    this.currentTaskContext = taskContext;
  }

  /**
   * Enrich task context with system-level signals (quota, session metadata)
   */
  enrichTaskContext(taskContext) {
    if (!taskContext) return {};

    // Inject quota and rotator signals if available
    let maxPressure = { percentUsed: 0 };
    
    if (this.quotaManager) {
      const statuses = this.quotaManager.getAllStatuses();
      if (statuses.length > 0) {
        maxPressure = statuses.reduce((max, s) => (s.percentUsed > max.percentUsed ? s : max), statuses[0]);
      }
    }

    // Check rotator health for additional risk
    let rotatorRisk = 0;
    if (this.modelRouter && this.modelRouter.rotators) {
      for (const [providerId, rotator] of Object.entries(this.modelRouter.rotators)) {
        const status = rotator.getProviderStatus();
        if (status.isExhausted) {
          rotatorRisk = Math.max(rotatorRisk, 0.9);
        } else if (status.healthyKeys < status.totalKeys) {
          rotatorRisk = Math.max(rotatorRisk, 0.5);
        }
      }
    }

    const finalPercentUsed = Math.max(maxPressure.percentUsed || 0, rotatorRisk);

    taskContext.quota_signal = {
      provider_id: maxPressure.providerId || 'unknown',
      percent_used: finalPercentUsed,
      warning_threshold: maxPressure.warningThreshold || 0.75,
      critical_threshold: maxPressure.criticalThreshold || 0.95,
      fallback_applied: taskContext.quota_signal?.fallback_applied || false,
      rotator_risk: rotatorRisk
    };

    // Add session/task IDs if missing
    taskContext.task_id = taskContext.task_id || `task_${Date.now()}`;
    taskContext.session_id = taskContext.session_id || this.currentSessionId || null;

    return taskContext;
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
          task_id: `task_${Date.now()}`,
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
        if (!this.showboat || !this.currentTaskContext) {
          return;
        }

        // Check if this is a high-impact task
        if (!this.showboat.isHighImpact(this.currentTaskContext)) {
          console.log('[IntegrationLayer] Skipping evidence capture (not high-impact)');
          return;
        }

        // Generate evidence document
        const evidenceData = {
          task: this.currentTaskContext.task,
          filesModified: this.currentTaskContext.filesModified,
          assertions: this.currentTaskContext.assertions || [],
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
    this.enrichTaskContext(taskContext);

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

    const result = await executeTaskFn(taskContext, skills, adaptiveOptions);

    // Update quota signal with fallback info from result if present
    if (taskContext.quota_signal && result.fallbackApplied !== undefined) {
      taskContext.quota_signal.fallback_applied = result.fallbackApplied;
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

    return result;
  }

  _extractQuotaSignal(taskContext, outcome) {
    let signal = 
      outcome?.quota_signal ||
      outcome?.quotaSignal ||
      taskContext?.quota_signal ||
      taskContext?.quotaSignal ||
      null;

    if (outcome?.fallbackApplied) {
      if (!signal) {
        signal = {
          fallback_applied: true,
          percent_used: 1.0,
          reason: outcome.reason
        };
      } else {
        // Ensure fallback flag is propagated
        signal.fallback_applied = true;
      }
    }

    return signal;
  }
}

module.exports = { IntegrationLayer };
