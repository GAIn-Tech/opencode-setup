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

// Simple file lock to prevent concurrent write corruption
const _locks = new Map();

async function _acquireLock(lockPath, timeout = 5000) {
  const start = Date.now();
  while (_locks.has(lockPath)) {
    if (Date.now() - start > timeout) {
      throw new Error(`Lock acquisition timeout for ${lockPath}`);
    }
    await new Promise(r => setTimeout(r, 50));
  }
  _locks.set(lockPath, true);
}

function _releaseLock(lockPath) {
  _locks.delete(lockPath);
}

// Safe JSON to prevent crashes from circular references
const SafeJSON = {
  stringify: (obj) => {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
  },
  parse: (str, fallback = {}) => {
    try {
      return JSON.parse(str);
    } catch {
      return fallback;
    }
  }
};

// Learning validation to prevent corrupted learnings from corrupting the system
const LearningValidator = {
  // Validate skill data before accepting it
  validateSkill: (skill) => {
    if (!skill || typeof skill !== 'object') return { valid: false, reason: 'Not an object' };
    if (!skill.name || typeof skill.name !== 'string') return { valid: false, reason: 'Missing or invalid name' };
    if (skill.success_rate !== undefined) {
      if (typeof skill.success_rate !== 'number' || skill.success_rate < 0 || skill.success_rate > 1) {
        return { valid: false, reason: 'success_rate must be 0-1' };
      }
    }
    if (skill.usage_count !== undefined) {
      if (typeof skill.usage_count !== 'number' || skill.usage_count < 0) {
        return { valid: false, reason: 'usage_count must be >= 0' };
      }
    }
    return { valid: true };
  },
  
  // Validate evolution rule
  validateRule: (rule) => {
    if (!rule || typeof rule !== 'object') return { valid: false, reason: 'Not an object' };
    if (!rule.trigger || typeof rule.trigger !== 'string') return { valid: false, reason: 'Missing trigger' };
    if (!rule.action || typeof rule.action !== 'string') return { valid: false, reason: 'Missing action' };
    return { valid: true };
  },
  
  // Sanitize and clamp values to prevent drift
  sanitize: (skill) => {
    const sanitized = { ...skill };
    if (sanitized.success_rate !== undefined) {
      sanitized.success_rate = Math.max(0, Math.min(1, sanitized.success_rate));
    }
    if (sanitized.usage_count !== undefined) {
      sanitized.usage_count = Math.max(0, Math.floor(sanitized.usage_count));
    }
    if (sanitized.adaptive_threshold !== undefined) {
      sanitized.adaptive_threshold = Math.max(0, Math.min(1, sanitized.adaptive_threshold));
    }
    return sanitized;
  }
};

class SkillRLManager {
  constructor(options = {}) {
    this.stateFile = options.stateFile || './skill-rl-state.json';
    this.skillBank = new SkillBank(options.skillBank);
    this.evolutionEngine = new EvolutionEngine(options.evolution);
    
    // Learning validation enabled by default
    this._validationEnabled = options.validationEnabled !== false;
  }

  /**
   * Learn from an outcome - validate before accepting
   * @param {object} outcome - { task_type, outcome, skill_used, success, ... }
   */
  learnFromOutcome(outcome) {
    // Validate outcome before processing
    if (this._validationEnabled) {
      if (!outcome || typeof outcome !== 'object') {
        console.warn('[SkillRL] Rejected invalid outcome: not an object');
        return;
      }
      if (outcome.success === undefined) {
        console.warn('[SkillRL] Rejected outcome: missing success field');
        return;
      }
    }
    
    // Process through skill bank
    const updated = this.skillBank.learn(outcome);
    
    // Validate updated skill data
    if (this._validationEnabled) {
      const validation = LearningValidator.validateSkill(updated);
      if (!validation.valid) {
        console.warn(`[SkillRL] Rejected corrupted skill update: ${validation.reason}`);
        return;
      }
      // Sanitize to prevent drift
      Object.assign(updated, LearningValidator.sanitize(updated));
    }
    
    // Process through evolution engine
    this.evolutionEngine.evolve(outcome);
    
    // Save state
    this._save();
    
    return updated;
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
   * Save state to disk (with locking to prevent concurrent write corruption)
   */
  async _save() {
    if (!this.persistencePath) return;

    const lockPath = `${this.persistencePath}.lock`;
    await _acquireLock(lockPath);
    
    try {
      const state = {
        skillBank: this.skillBank.export(),
        evolutionEngine: this.evolutionEngine.export(),
        timestamp: Date.now()
      };

      const parentDir = path.dirname(this.persistencePath);
      const tempPath = `${this.persistencePath}.tmp`;

      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.writeFileSync(tempPath, SafeJSON.stringify(state, null, 2));
      fs.renameSync(tempPath, this.persistencePath);
    } catch (error) {
      console.warn('Failed to persist SkillRL state:', error.message);
    } finally {
      _releaseLock(lockPath);
    }
  }

  /**
   * Load state from disk
   */
  async _load() {
    if (!this.persistencePath || !fs.existsSync(this.persistencePath)) return;
    
    const lockPath = `${this.persistencePath}.lock`;
    await _acquireLock(lockPath);
    
    try {
      const data = SafeJSON.parse(fs.readFileSync(this.persistencePath, 'utf-8'));
      
      if (data.skillBank) {
        this.skillBank.import(data.skillBank);
      }
      if (data.evolutionEngine) {
        this.evolutionEngine.import(data.evolutionEngine);
      }
    } catch (error) {
      console.warn('Failed to load SkillRL state:', error.message);
    } finally {
      _releaseLock(lockPath);
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
