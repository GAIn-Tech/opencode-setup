/**
 * Evolution Engine - Recursive skill evolution from failures
 * 
 * Based on SkillRL paper: "When a skill fails, distill the root cause
 * and update the skill bank with refined principles"
 * 
 * Flow:
 * 1. Failure occurs
 * 2. Distill root cause from failure context
 * 3. Update existing skill OR create new task-specific skill
 * 4. Adjust success rates via exponential moving average
 */

'use strict';

class EvolutionEngine {
  constructor(skillBank) {
    this.skillBank = skillBank;
    this.failureHistory = [];
  }

  /**
   * Learn from a failure outcome
   * Distills root cause and evolves skill bank
   * 
   * @param {Object} failureContext - Context of the failed task
   * @returns {Object} Evolution result
   */
  learnFromFailure(failureContext) {
    const {
      task_id,
      task_type,
      skills_used,
      error_message,
      anti_pattern,
      outcome_description
    } = failureContext;
    const quotaSignal = this._extractQuotaSignal(failureContext);

    // Step 1: Record failure in history
    this.failureHistory.push({
      task_id,
      task_type,
      skills_used,
      timestamp: Date.now(),
      anti_pattern,
      quota_signal: quotaSignal
    });

    // Step 2: Distill root cause
    const rootCause = this._distillRootCause(failureContext);

    // Step 3: Update skill bank based on root cause
    const evolution = this._evolveSkillBank(rootCause, {
      ...failureContext,
      quota_signal: quotaSignal
    });

    return {
      root_cause: rootCause,
      evolution,
      skills_updated: evolution.updated_skills,
      skills_created: evolution.created_skills,
      quota_signal: quotaSignal
    };
  }

  /**
   * Learn from a success outcome
   * Reinforces skills that worked well
   * 
   * @param {Object} successContext - Context of the successful task
   * @returns {Object} Reinforcement result
   */
  learnFromSuccess(successContext) {
    const { task_id, task_type, skills_used, positive_pattern } = successContext;
    const quotaSignal = this._extractQuotaSignal(successContext);

    const reinforcements = [];

    // Reinforce all skills that were used
    if (skills_used && Array.isArray(skills_used)) {
      skills_used.forEach(skillName => {
        const updated = this.skillBank.updateSuccessRate(skillName, true, task_type);
        if (updated) {
          reinforcements.push(skillName);
        }
      });
    }

    this._applyQuotaSecondarySignal({
      task_type,
      skills_used,
      quota_signal: quotaSignal,
      success: true,
      result: {
        updated_skills: [],
        created_skills: []
      }
    });

    return {
      reinforced_skills: reinforcements,
      positive_pattern,
      quota_signal: quotaSignal
    };
  }

  _extractQuotaSignal(context = {}) {
    const signal = context.quota_signal || context.quotaSignal || null;
    if (!signal || typeof signal !== 'object') {
      return null;
    }

    const percentUsed = Number(signal.percent_used ?? signal.percentUsed ?? 0);
    const criticalThreshold = Number(signal.critical_threshold ?? signal.criticalThreshold ?? 0.9);
    const warningThreshold = Number(signal.warning_threshold ?? signal.warningThreshold ?? 0.75);

    return {
      provider_id: signal.provider_id ?? signal.providerId ?? null,
      percent_used: Number.isFinite(percentUsed) ? percentUsed : 0,
      warning_threshold: Number.isFinite(warningThreshold) ? warningThreshold : 0.75,
      critical_threshold: Number.isFinite(criticalThreshold) ? criticalThreshold : 0.9,
      fallback_applied: Boolean(signal.fallback_applied ?? signal.fallbackApplied)
    };
  }

  _isQuotaPressure(signal) {
    if (!signal) {
      return false;
    }

    return signal.fallback_applied || signal.percent_used >= signal.warning_threshold;
  }

  _upsertQuotaAwareSkill(taskType) {
    const allSkills = this.skillBank.getAllSkills();
    const existingTaskSpecific = allSkills.taskSpecific.find(
      (s) => s.name === 'quota-aware-routing' && s.task_type === taskType
    );

    if (existingTaskSpecific) {
      this.skillBank.addTaskSpecificSkill(taskType, {
        name: 'quota-aware-routing',
        success_rate: Math.min((existingTaskSpecific.success_rate || 0.5) + 0.03, 1.0)
      });
      return 'updated';
    }

    this.skillBank.addTaskSpecificSkill(taskType, {
      name: 'quota-aware-routing',
      principle: 'Treat quota pressure as a secondary signal while preserving primary success objectives',
      application_context: 'When provider quota is near warning/critical thresholds or fallback is used',
      success_rate: 0.6,
      usage_count: 0,
      tags: [taskType, 'quota', 'routing', 'secondary-signal']
    });
    return 'created';
  }

  _applyQuotaSecondarySignal({ task_type, skills_used, quota_signal, success, result }) {
    console.log('[EvolutionEngine] _applyQuotaSecondarySignal', { task_type, success, hasSignal: !!quota_signal });
    if (quota_signal) {
      console.log('[EvolutionEngine] quota_signal:', JSON.stringify(quota_signal, null, 2));
      console.log('[EvolutionEngine] _isQuotaPressure:', this._isQuotaPressure(quota_signal));
    }
    
    if (!this._isQuotaPressure(quota_signal)) {
      return;
    }

    const action = this._upsertQuotaAwareSkill(task_type || 'unknown');
    const reason = success
      ? 'Succeeded under quota pressure; reinforce quota-aware routing as secondary meta-signal'
      : 'Failed under quota pressure; add quota-aware routing as secondary meta-signal';

    if (action === 'created') {
      result.created_skills.push({
        name: 'quota-aware-routing',
        task_type: task_type || 'unknown',
        reason
      });
    } else {
      result.updated_skills.push({
        name: 'quota-aware-routing',
        action: 'boosted',
        reason
      });
    }

    if (success && Array.isArray(skills_used)) {
      skills_used.forEach((skillName) => {
        this.skillBank.updateSuccessRate(skillName, true, task_type);
      });
    }
  }

  /**
   * Distill root cause from failure context
   * Maps anti-patterns to skill deficiencies
   */
  _distillRootCause(failureContext) {
    const { anti_pattern, error_message, task_type, skills_used } = failureContext;

    // Root cause mapping based on anti-pattern types
    const rootCauseMap = {
      'shotgun_debug': {
        cause: 'Lack of systematic debugging approach',
        skill_needed: 'systematic-debugging',
        principle: 'Form hypothesis before making changes'
      },
      'inefficient_solution': {
        cause: 'Failed to identify optimal approach',
        skill_needed: 'solution-optimization',
        principle: 'Evaluate multiple approaches before implementing'
      },
      'type_suppression': {
        cause: 'Type safety ignored',
        skill_needed: 'type-safety',
        principle: 'Fix type errors at source, not via suppression'
      },
      'broken_state': {
        cause: 'State management failure',
        skill_needed: 'state-management',
        principle: 'Verify state consistency after mutations'
      },
      'failed_debug': {
        cause: 'Debugging attempt failed',
        skill_needed: 'advanced-debugging',
        principle: 'Use language server, AST tools before guessing'
      },
      'wrong_tool': {
        cause: 'Tool selection error',
        skill_needed: 'tool-selection',
        principle: 'Match tool capabilities to task requirements'
      },
      'repeated_mistake': {
        cause: 'Failed to learn from previous error',
        skill_needed: 'learning-integration',
        principle: 'Check learning-engine before attempting solution'
      }
    };

    const mapped = rootCauseMap[anti_pattern?.type] || {
      cause: 'Unknown failure pattern',
      skill_needed: 'general-problem-solving',
      principle: 'Verify assumptions before proceeding'
    };

    return {
      ...mapped,
      anti_pattern_type: anti_pattern?.type,
      context: anti_pattern?.context || error_message
    };
  }

  /**
   * Evolve skill bank based on root cause
   * Either updates existing skill or creates new task-specific skill
   */
  _evolveSkillBank(rootCause, failureContext) {
    const { task_type, skills_used, quota_signal } = failureContext;
    const { skill_needed, principle, cause } = rootCause;

    const result = {
      updated_skills: [],
      created_skills: []
    };

    // Step 1: Penalize skills that were used in failure
    if (skills_used && Array.isArray(skills_used)) {
      skills_used.forEach(skillName => {
        const updated = this.skillBank.updateSuccessRate(skillName, false, task_type);
        if (updated) {
          result.updated_skills.push({
            name: skillName,
            action: 'penalized',
            reason: 'Used in failed task'
          });
        }
      });
    }

    // Step 2: Check if skill_needed already exists
    const allSkills = this.skillBank.getAllSkills();
    const existingGeneral = allSkills.general.find(s => s.name === skill_needed);
    const existingTaskSpecific = allSkills.taskSpecific.find(
      s => s.name === skill_needed && s.task_type === task_type
    );

    if (existingGeneral) {
      // Skill exists in general bank - boost it
      this.skillBank.addGeneralSkill({
        name: skill_needed,
        success_rate: Math.min(existingGeneral.success_rate + 0.1, 1.0)
      });
      result.updated_skills.push({
        name: skill_needed,
        action: 'boosted',
        reason: 'Identified as needed for similar failures'
      });
    } else if (existingTaskSpecific) {
      // Skill exists in task-specific bank - boost it
      this.skillBank.addTaskSpecificSkill(task_type, {
        name: skill_needed,
        success_rate: Math.min(existingTaskSpecific.success_rate + 0.1, 1.0)
      });
      result.updated_skills.push({
        name: skill_needed,
        action: 'boosted',
        reason: 'Task-specific skill reinforced'
      });
    } else {
      // Skill doesn't exist - create new task-specific skill
      this.skillBank.addTaskSpecificSkill(task_type, {
        name: skill_needed,
        principle: principle,
        application_context: `When facing ${cause.toLowerCase()}`,
        success_rate: 0.6, // Start moderate
        usage_count: 0,
        tags: [task_type, 'evolved', 'failure-learned']
      });
      result.created_skills.push({
        name: skill_needed,
        principle,
        task_type,
        reason: `Distilled from ${rootCause.anti_pattern_type} failure`
      });
    }

    this._applyQuotaSecondarySignal({
      task_type,
      skills_used,
      quota_signal,
      success: false,
      result
    });

    return result;
  }

  /**
   * Get failure statistics (for reporting)
   */
  getFailureStats() {
    const byType = {};
    const byAntiPattern = {};

    this.failureHistory.forEach(failure => {
      // By task type
      byType[failure.task_type] = (byType[failure.task_type] || 0) + 1;

      // By anti-pattern
      if (failure.anti_pattern?.type) {
        byAntiPattern[failure.anti_pattern.type] = 
          (byAntiPattern[failure.anti_pattern.type] || 0) + 1;
      }
    });

    return {
      total_failures: this.failureHistory.length,
      by_task_type: byType,
      by_anti_pattern: byAntiPattern,
      recent_failures: this.failureHistory.slice(-10)
    };
  }

  /**
   * Generate tier feedback based on failure/success patterns
   * Used by PreloadSkillsPlugin to adjust tool tiers over time
   * 
   * @param {Object} usageStats - { skillName: { loads: N, taskTypes: Set, onDemand: N } }
   * @returns {Object} { promotions: [{skill, taskType, reason}], demotions: [{skill, reason}] }
   */
  generateTierFeedback(usageStats = {}) {
    const promotions = [];
    const demotions = [];

    for (const [skillName, stats] of Object.entries(usageStats)) {
      // Promote: on-demand loaded 5+ times for a specific task type
      if (stats.onDemandLoads >= 5 && stats.taskTypes) {
        for (const taskType of (stats.taskTypes instanceof Set ? [...stats.taskTypes] : stats.taskTypes)) {
          promotions.push({
            skill: skillName,
            taskType,
            reason: `Loaded on-demand ${stats.onDemandLoads} times for ${taskType} tasks`
          });
        }
      }

      // Demote: loaded but rarely used (<5% usage rate over 50+ sessions)
      if (stats.totalSessions >= 50 && stats.usageRate < 0.05) {
        demotions.push({
          skill: skillName,
          reason: `Usage rate ${(stats.usageRate * 100).toFixed(1)}% over ${stats.totalSessions} sessions`
        });
      }
    }

    // Cross-reference with failure history: skills involved in repeated failures get demotion signal
    const failureCounts = {};
    for (const failure of this.failureHistory.slice(-100)) {
      for (const skill of (failure.skills_used || [])) {
        failureCounts[skill] = (failureCounts[skill] || 0) + 1;
      }
    }

    for (const [skill, count] of Object.entries(failureCounts)) {
      if (count >= 10 && !demotions.find(d => d.skill === skill)) {
        demotions.push({
          skill,
          reason: `Involved in ${count} failures in last 100 tasks`
        });
      }
    }

    return { promotions, demotions };
  }

  /**
   * Export evolution history (for persistence)
   */
  export() {
    return {
      failure_history: this.failureHistory
    };
  }

  /**
   * Import evolution history (for persistence)
   */
  import(data) {
    if (data.failure_history) {
      this.failureHistory = data.failure_history;
    }
  }
}

module.exports = { EvolutionEngine };
