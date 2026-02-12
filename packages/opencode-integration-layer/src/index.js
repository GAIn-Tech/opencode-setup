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
    this.skillRL = config.skillRLManager || null;
    this.showboat = config.showboatWrapper || null;
    this.currentTaskContext = null;
  }

  /**
   * Set current task context (for showboat high-impact gating)
   */
  setTaskContext(taskContext) {
    this.currentTaskContext = taskContext;
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
          skills_used: [],
          error_message: antiPattern.description,
          anti_pattern: antiPattern.type,
          outcome_description: antiPattern.description
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
    // Set context for showboat
    this.setTaskContext(taskContext);

    // Get SkillRL recommendations
    let skills = null;
    if (this.skillRL) {
      skills = this.skillRL.selectSkills(taskContext);
      console.log(`[IntegrationLayer] SkillRL selected: ${skills.map(s => s.name).join(', ')}`);
    }

    // Execute the task
    const result = await executeTaskFn(taskContext, skills);

    // Capture evidence if high-impact
    if (this.showboat && this.showboat.isHighImpact(taskContext)) {
      const evidenceData = {
        task: taskContext.task,
        filesModified: taskContext.filesModified,
        assertions: taskContext.assertions || [],
        outcome: result.success ? 'PASS' : 'FAIL',
        verification: {
          timestamp: new Date().toISOString(),
          exitCode: result.exitCode || 0
        }
      };

      this.showboat.captureEvidence(evidenceData);
    }

    // Learn from outcome if failure
    if (!result.success && this.skillRL && skills) {
      this.skillRL.evolutionEngine.learnFromFailure({
        task_id: `task_${Date.now()}`,
        task_type: taskContext.task || 'unknown',
        skills_used: skillSelection.map(s => s.name),
        error_message: result.error || 'Unknown error',
        anti_pattern: 'task_failure',
        outcome_description: result.error || 'Task execution failed'
      });
    }

    return result;
  }
}

module.exports = { IntegrationLayer };
