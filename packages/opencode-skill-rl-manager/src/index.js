/**
 * SkillRL Manager - Main entry point
 * 
 * Hierarchical skill orchestration using SkillRL principles
 * arXiv:2602.08234
 * 
 * Core Components:
 * - SkillBank: Hierarchical storage (General vs Task-Specific)
 * - EvolutionEngine: Recursive learning from failures
 * - Selector: Context-aware skill selection
 */

'use strict';

const { SkillBank } = require('./skill-bank');
const { EvolutionEngine } = require('./evolution-engine');
const fs = require('fs');
const path = require('path');

class SkillRLManager {
  constructor(options = {}) {
    this.skillBank = new SkillBank();
    this.evolutionEngine = new EvolutionEngine(this.skillBank);
    
    // Persistence path (optional)
    this.persistencePath = options.persistencePath || null;
    
    // Load from persistence if path provided
    if (this.persistencePath && fs.existsSync(this.persistencePath)) {
      this._load();
    }
  }

  /**
   * Select skills for a given task context
   * 
   * @param {Object} taskContext - Task context from OrchestrationAdvisor
   * @returns {Array} Ranked list of relevant skills
   */
  selectSkills(taskContext) {
    const skills = this.skillBank.querySkills(taskContext);
    
    // Record usage for selected skills
    skills.forEach(skill => {
      this.skillBank.recordUsage(skill.name, taskContext.task_type);
    });
    
    return skills;
  }

  /**
   * Learn from task outcome
   * Routes to either learnFromFailure or learnFromSuccess
   * 
   * @param {Object} outcome - Task outcome from learning-engine
   * @returns {Object} Learning result
   */
  learnFromOutcome(outcome) {
    console.log('[SkillRLManager] learnFromOutcome', { success: outcome.success, hasQuota: !!outcome.quota_signal });
    let result;
    if (outcome.success) {
      result = this.evolutionEngine.learnFromSuccess(outcome);
    } else {
      result = this.evolutionEngine.learnFromFailure(outcome);
    }
    
    if (this.persistencePath) {
      this._save();
    }
    
    return result;
  }

  /**
   * Manually add a skill to the bank
   * 
   * @param {Object} skill - Skill object
   * @param {string} type - 'general' or task type for task-specific
   */
  addSkill(skill, type = 'general') {
    if (type === 'general') {
      this.skillBank.addGeneralSkill(skill);
    } else {
      this.skillBank.addTaskSpecificSkill(type, skill);
    }
    
    if (this.persistencePath) {
      this._save();
    }
  }

  /**
   * Get comprehensive report
   */
  getReport() {
    const skills = this.skillBank.getAllSkills();
    const failureStats = this.evolutionEngine.getFailureStats();
    
    return {
      skills: {
        general_count: skills.general.length,
        task_specific_count: skills.taskSpecific.length,
        total: skills.total,
        top_general: skills.general
          .sort((a, b) => b.success_rate - a.success_rate)
          .slice(0, 5),
        top_task_specific: skills.taskSpecific
          .sort((a, b) => b.success_rate - a.success_rate)
          .slice(0, 5)
      },
      learning: failureStats,
      version: '1.0.0'
    };
  }

  /**
   * Save state to disk
   */
  _save() {
    if (!this.persistencePath) return;
    
    const state = {
      skillBank: this.skillBank.export(),
      evolutionEngine: this.evolutionEngine.export(),
      timestamp: Date.now()
    };
    
    fs.writeFileSync(this.persistencePath, JSON.stringify(state, null, 2));
  }

  /**
   * Load state from disk
   */
  _load() {
    if (!this.persistencePath || !fs.existsSync(this.persistencePath)) return;
    
    try {
      const data = JSON.parse(fs.readFileSync(this.persistencePath, 'utf-8'));
      
      if (data.skillBank) {
        this.skillBank.import(data.skillBank);
      }
      
      if (data.evolutionEngine) {
        this.evolutionEngine.import(data.evolutionEngine);
      }
    } catch (error) {
      console.warn('Failed to load SkillRL state:', error.message);
    }
  }

  /**
   * Export full state (for debugging)
   */
  export() {
    return {
      skillBank: this.skillBank.export(),
      evolutionEngine: this.evolutionEngine.export()
    };
  }

  /**
   * Import full state (for debugging)
   */
  import(data) {
    if (data.skillBank) {
      this.skillBank.import(data.skillBank);
    }
    if (data.evolutionEngine) {
      this.evolutionEngine.import(data.evolutionEngine);
    }
  }
}

module.exports = {
  SkillRLManager,
  SkillBank,
  EvolutionEngine
};
