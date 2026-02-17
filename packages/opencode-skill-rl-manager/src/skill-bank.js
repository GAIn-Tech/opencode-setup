/**
 * Hierarchical SkillBank - Core data structure for SkillRL
 * 
 * Based on arXiv:2602.08234 - SkillRL Paper
 * 
 * Architecture:
 * - General Skills: Universal, cross-task applicable skills
 * - Task-Specific Skills: Context-bound, specialized skills
 * 
 * Skill Schema (from paper):
 * - name: Human-readable identifier
 * - principle: Core concept/strategy
 * - application_context: When to apply this skill
 * - success_rate: Empirical success metric (0.0-1.0)
 * - usage_count: Times this skill was selected
 * - last_updated: Timestamp of last evolution
 */

'use strict';

class SkillBank {
  constructor() {
    // General Skills - Universal, cross-task applicable
    this.generalSkills = new Map();
    
    // Task-Specific Skills - Indexed by task_type
    this.taskSpecificSkills = new Map();
    
    // Sorted cache for O(1) top-skill lookups (instead of O(n log n) sort every time)
    // Cache is invalidated and rebuilt on any skill update
    this._sortedGeneralCache = null;
    this._sortedTaskCache = new Map(); // by task_type
    
    // Seed with initial general skills
    this._seedGeneralSkills();
  }
  
  // Invalidate sorted cache (call after any skill update)
  _invalidateCache() {
    this._sortedGeneralCache = null;
    this._sortedTaskCache.clear();
  }
  
  // Get top N skills sorted by success_rate (uses cache if available)
  getTopSkills(count = 5, taskType = null) {
    if (taskType) {
      // Task-specific skills
      if (!this._sortedTaskCache.has(taskType)) {
        const taskSkills = this.taskSpecificSkills.get(taskType) || [];
        this._sortedTaskCache.set(taskType, 
          [...taskSkills].sort((a, b) => (b.success_rate || 0) - (a.success_rate || 0))
        );
      }
      return this._sortedTaskCache.get(taskType).slice(0, count);
    }
    
    // General skills
    if (!this._sortedGeneralCache) {
      this._sortedGeneralCache = 
        [...this.generalSkills.values()].sort((a, b) => (b.success_rate || 0) - (a.success_rate || 0));
    }
    return this._sortedGeneralCache.slice(0, count);
  }

  /**
   * Seed initial general skills (domain-agnostic best practices)
   */
  _seedGeneralSkills() {
    const initialSkills = [
      {
        name: 'systematic-debugging',
        principle: 'Hypothesis-driven debugging with verification',
        application_context: 'When encountering errors or unexpected behavior',
        success_rate: 0.85,
        usage_count: 0,
        last_updated: Date.now(),
        tags: ['debugging', 'verification', 'systematic']
      },
      {
        name: 'test-driven-development',
        principle: 'Write tests before implementation code',
        application_context: 'When implementing new features or fixing bugs',
        success_rate: 0.90,
        usage_count: 0,
        last_updated: Date.now(),
        tags: ['testing', 'tdd', 'verification']
      },
      {
        name: 'verification-before-completion',
        principle: 'Always verify work before claiming completion',
        application_context: 'Before committing, creating PRs, or claiming task done',
        success_rate: 0.95,
        usage_count: 0,
        last_updated: Date.now(),
        tags: ['verification', 'quality', 'gate']
      },
      {
        name: 'brainstorming',
        principle: 'Explore requirements and design before implementation',
        application_context: 'When facing ambiguous requirements or multiple valid approaches',
        success_rate: 0.80,
        usage_count: 0,
        last_updated: Date.now(),
        tags: ['planning', 'design', 'exploration']
      },
      {
        name: 'incremental-implementation',
        principle: 'Break complex tasks into small, verifiable steps',
        application_context: 'When facing complex or multi-step tasks',
        success_rate: 0.88,
        usage_count: 0,
        last_updated: Date.now(),
        tags: ['planning', 'decomposition', 'incremental']
      }
    ];

    initialSkills.forEach(skill => {
      this.generalSkills.set(skill.name, skill);
    });
  }

  /**
   * Add or update a general skill
   * @param {Object} skill - Skill object
   */
  addGeneralSkill(skill) {
    const existing = this.generalSkills.get(skill.name);
    if (existing) {
      // Update existing skill
      this.generalSkills.set(skill.name, {
        ...existing,
        ...skill,
        last_updated: Date.now()
      });
    } else {
      // Add new skill
      this.generalSkills.set(skill.name, {
        ...skill,
        success_rate: skill.success_rate || 0.5,
        usage_count: skill.usage_count || 0,
        last_updated: Date.now()
      });
    }
    // Invalidate sorted cache
    this._invalidateCache();
  }

  /**
   * Add or update a task-specific skill
   * @param {string} taskType - Task type (debug, feature, refactor, etc.)
   * @param {Object} skill - Skill object
   */
  addTaskSpecificSkill(taskType, skill) {
    if (!this.taskSpecificSkills.has(taskType)) {
      this.taskSpecificSkills.set(taskType, new Map());
    }

    const taskSkills = this.taskSpecificSkills.get(taskType);
    const existing = taskSkills.get(skill.name);

    if (existing) {
      // Update existing skill
      taskSkills.set(skill.name, {
        ...existing,
        ...skill,
        last_updated: Date.now()
      });
    } else {
      // Add new skill
      taskSkills.set(skill.name, {
        ...skill,
        task_type: taskType,
        success_rate: skill.success_rate || 0.5,
        usage_count: skill.usage_count || 0,
        last_updated: Date.now()
      });
    }
    // Invalidate sorted cache
    this._invalidateCache();
  }

  /**
   * Query relevant skills for a task context
   * Returns hierarchical selection: General skills first, then task-specific
   * 
   * @param {Object} taskContext - Task context from OrchestrationAdvisor
   * @returns {Array} Ranked list of relevant skills
   */
  querySkills(taskContext) {
    const { task_type, complexity, error_type, description } = taskContext;
    const results = [];

    // Step 1: Always include high-success general skills
    const generalCandidates = Array.from(this.generalSkills.values())
      .filter(skill => this._matchesContext(skill, taskContext))
      .sort((a, b) => b.success_rate - a.success_rate)
      .slice(0, 3); // Top 3 general skills

    results.push(...generalCandidates.map(s => ({ ...s, source: 'general' })));

    // Step 2: Add task-specific skills if available
    if (task_type && this.taskSpecificSkills.has(task_type)) {
      const taskSkills = Array.from(this.taskSpecificSkills.get(task_type).values())
        .filter(skill => this._matchesContext(skill, taskContext))
        .sort((a, b) => b.success_rate - a.success_rate)
        .slice(0, 3); // Top 3 task-specific skills

      results.push(...taskSkills.map(s => ({ ...s, source: 'task-specific' })));
    }

    // Step 3: Rank by success_rate and return top 5
    return results
      .sort((a, b) => b.success_rate - a.success_rate)
      .slice(0, 5);
  }

  /**
   * Get performance metrics for a specific skill
   * @param {string} skillName 
   * @param {string} taskType 
   * @returns {Object|null}
   */
  getSkillPerformance(skillName, taskType = null) {
    let skill = this.generalSkills.get(skillName);

    if (!skill && taskType && this.taskSpecificSkills.has(taskType)) {
      skill = this.taskSpecificSkills.get(taskType).get(skillName);
    }

    if (!skill) return null;

    return {
      name: skill.name,
      success_rate: skill.success_rate,
      usage_count: skill.usage_count,
      is_uncertain: skill.usage_count < 5 || skill.success_rate < 0.6
    };
  }

  /**
   * Check if skill matches task context
   * Uses tags and application_context for fuzzy matching
   */
  _matchesContext(skill, taskContext) {
    const { task_type, complexity, error_type, description } = taskContext;

    // Always match if no specific context
    if (!task_type && !complexity && !error_type && !description) {
      return true;
    }

    // Match by tags
    if (skill.tags) {
      const taskTypeMatch = task_type && skill.tags.includes(task_type);
      const complexityMatch = complexity && skill.tags.includes(complexity);
      const errorMatch = error_type && skill.tags.some(tag => 
        error_type.toLowerCase().includes(tag.toLowerCase())
      );

      if (taskTypeMatch || complexityMatch || errorMatch) {
        return true;
      }
    }

    // Match by application_context (fuzzy)
    if (description && skill.application_context) {
      const contextLower = skill.application_context.toLowerCase();
      const descLower = description.toLowerCase();
      const keywords = contextLower.split(/\s+/);
      
      if (keywords.some(keyword => descLower.includes(keyword))) {
        return true;
      }
    }

    // Default: include if success_rate is high (>0.7)
    return skill.success_rate > 0.7;
  }

  /**
   * Record skill usage (increment usage_count)
   */
  recordUsage(skillName, taskType = null) {
    // Check general skills first
    if (this.generalSkills.has(skillName)) {
      const skill = this.generalSkills.get(skillName);
      skill.usage_count += 1;
      skill.last_updated = Date.now();
      return true;
    }

    // Check task-specific skills
    if (taskType && this.taskSpecificSkills.has(taskType)) {
      const taskSkills = this.taskSpecificSkills.get(taskType);
      if (taskSkills.has(skillName)) {
        const skill = taskSkills.get(skillName);
        skill.usage_count += 1;
        skill.last_updated = Date.now();
        return true;
      }
    }

    return false;
  }

  /**
   * Update skill success rate based on outcome
   * Uses exponential moving average for smoothing
   */
  updateSuccessRate(skillName, success, taskType = null) {
    let skill = null;

    // Find skill in general bank
    if (this.generalSkills.has(skillName)) {
      skill = this.generalSkills.get(skillName);
    }

    // Find skill in task-specific bank
    if (!skill && taskType && this.taskSpecificSkills.has(taskType)) {
      const taskSkills = this.taskSpecificSkills.get(taskType);
      if (taskSkills.has(skillName)) {
        skill = taskSkills.get(skillName);
      }
    }

    if (!skill) {
      return false;
    }

    // Exponential moving average (alpha = 0.2 for gradual adjustment)
    const alpha = 0.2;
    const newRate = success ? 1.0 : 0.0;
    skill.success_rate = alpha * newRate + (1 - alpha) * skill.success_rate;
    skill.last_updated = Date.now();

    return true;
  }

  /**
   * Get all skills (for debugging/reporting)
   */
  getAllSkills() {
    const general = Array.from(this.generalSkills.values()).map(s => ({
      ...s,
      source: 'general'
    }));

    const taskSpecific = [];
    for (const [taskType, skillsMap] of this.taskSpecificSkills.entries()) {
      const skills = Array.from(skillsMap.values()).map(s => ({
        ...s,
        source: 'task-specific',
        task_type: taskType
      }));
      taskSpecific.push(...skills);
    }

    return { general, taskSpecific, total: general.length + taskSpecific.length };
  }

  /**
   * Export skill bank state (for persistence)
   */
  export() {
    return {
      general: Array.from(this.generalSkills.entries()),
      taskSpecific: Array.from(this.taskSpecificSkills.entries()).map(([type, skills]) => [
        type,
        Array.from(skills.entries())
      ])
    };
  }

  /**
   * Import skill bank state (for persistence)
   */
  import(data) {
    if (data.general) {
      this.generalSkills = new Map(data.general);
    }
    if (data.taskSpecific) {
      this.taskSpecificSkills = new Map(
        data.taskSpecific.map(([type, skills]) => [type, new Map(skills)])
      );
    }
  }
}

module.exports = { SkillBank };
