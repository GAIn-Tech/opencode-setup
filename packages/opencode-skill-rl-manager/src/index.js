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
const { ExplorationRLAdapter } = require('./exploration-adapter');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Cross-process file lock to prevent concurrent write corruption
// Uses filesystem locks instead of in-memory Map (which fails across processes)
const LOCK_DIR = path.join(process.cwd(), '.opencode', 'locks');

async function _ensureLockDir() {
  if (!fs.existsSync(LOCK_DIR)) {
    fs.mkdirSync(LOCK_DIR, { recursive: true });
  }
}

async function _acquireLock(lockPath, timeout = 5000) {
  await _ensureLockDir();
  const lockFile = path.join(LOCK_DIR, `${lockPath.replace(/[^a-zA-Z0-9]/g, '_')}.lock`);
  const start = Date.now();
  
  // Use atomic lock acquisition with O_EXCL flag
  while (true) {
    if (Date.now() - start > timeout) {
      throw new Error(`Lock acquisition timeout for ${lockPath}`);
    }
    try {
      // O_EXCL creates atomically - fails if file exists
      fs.closeSync(fs.openSync(lockFile, 'wx'));
      // Write pid after atomic creation
      fs.writeFileSync(lockFile, String(process.pid), 'utf8');
      return; // Lock acquired
    } catch (err) {
      if (err.code === 'EEXIST') {
        // Lock exists, wait and retry
        await new Promise(r => setTimeout(r, 50));
        continue;
      }
      throw err; // Other error
    }
  }
}

function _releaseLock(lockPath) {
  const lockFile = path.join(LOCK_DIR, `${lockPath.replace(/[^a-zA-Z0-9]/g, '_')}.lock`);
  if (fs.existsSync(lockFile)) {
    fs.unlinkSync(lockFile);
  }
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
    const _defaultRLPath = path.join(os.homedir(), '.opencode', 'skill-rl.json');
    this.persistencePath = options.persistencePath || options.stateFile || _defaultRLPath;
    this.skillBank = new SkillBank(options.skillBank);
    this.evolutionEngine = new EvolutionEngine(this.skillBank, options.evolution);

    // One-time migration: old ./skill-rl-state.json → canonical ~/.opencode/skill-rl.json
    const _legacyPath = path.join(process.cwd(), 'skill-rl-state.json');
    if (fs.existsSync(_legacyPath) && !fs.existsSync(this.persistencePath)) {
      try {
        fs.mkdirSync(path.dirname(this.persistencePath), { recursive: true });
        fs.copyFileSync(_legacyPath, this.persistencePath);
      } catch (_) { /* non-fatal */ }
    }

    // Learning validation enabled by default
    this._validationEnabled = options.validationEnabled !== false;

    // Load persisted state BEFORE syncWithRegistry so existing usage_count/success_rate are preserved.
    // syncWithRegistry is additive (skips skills already in the Map), so it won't overwrite loaded data.
    if (fs.existsSync(this.persistencePath)) {
      try {
        const _persisted = SafeJSON.parse(fs.readFileSync(this.persistencePath, 'utf-8'));
        if (_persisted.skillBank) this.skillBank.import(_persisted.skillBank);
        if (_persisted.evolutionEngine) this.evolutionEngine.import(_persisted.evolutionEngine);
      } catch (_err) { /* non-fatal — fresh state on corruption */ }
    }

    // Sync with skill registry on startup — additive, never overwrites existing data
    const _registryPath = path.resolve(__dirname, '../../../opencode-config/skills/registry.json');
    this.syncWithRegistry(_registryPath);

    // Exploration policy (env-driven, NOT persisted)
    this.explorationMode = process.env.OPENCODE_EXPLORATION_MODE || 'greedy';
    this.epsilon = Math.min(1, Math.max(0, parseFloat(process.env.OPENCODE_EPSILON || '0.1')));
  }

  /**
   * Learn from an outcome - validate before accepting, then route to skill bank and evolution engine
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
    
    // Process through skill bank - update success rate for used skill
    let updated = null;
    if (outcome.skill_used) {
      updated = this.skillBank.updateSuccessRate(outcome.skill_used, outcome.success, outcome.task_type);
    }
    
    // Track MCP tool affinities for the used skill (before validation gate
    // so affinities are recorded even when updateSuccessRate output is rejected)
    if (outcome.mcpToolsUsed && Array.isArray(outcome.mcpToolsUsed) && outcome.mcpToolsUsed.length > 0 && outcome.skill_used) {
      const skill = this.skillBank.generalSkills.get(outcome.skill_used);
      if (skill) {
        skill.tool_affinities = skill.tool_affinities || {};
        for (const tool of outcome.mcpToolsUsed) {
          if (tool && typeof tool === 'string') {
            skill.tool_affinities[tool] = (skill.tool_affinities[tool] || 0) + 1;
          }
        }
      }
    }

    // Validate updated skill data
    if (this._validationEnabled && updated) {
      const validation = LearningValidator.validateSkill(updated);
      if (!validation.valid) {
        console.warn(`[SkillRL] Rejected corrupted skill update: ${validation.reason}`);
        return;
      }
      // Sanitize to prevent drift
      Object.assign(updated, LearningValidator.sanitize(updated));
    }

    // Also route to evolution engine for success/failure learning
    let evolutionResult;
    if (outcome.success) {
      evolutionResult = this.evolutionEngine.learnFromSuccess(outcome);
    } else {
      evolutionResult = this.evolutionEngine.learnFromFailure(outcome);
    }
    
    // Save state
    this._save();
    
    // Return combined result: both updates and evolution details
    return {
      ...(updated || {}),
      ...evolutionResult,
      skills_updated: evolutionResult.skills_updated || [],
      skills_created: evolutionResult.skills_created || [],
      reinforced_skills: evolutionResult.reinforced_skills || []
    };
  }

  /**
   * Select skills for a given task context
   * 
   * @param {Object} taskContext - Task context from OrchestrationAdvisor
   * @returns {Array} Ranked list of relevant skills
   */
selectSkills(taskContext) {
      const skills = this.skillBank.querySkills(taskContext);

     let result;
     if (this.explorationMode === 'ucb') {
       result = this._applyUCB(skills);
     } else if (this.explorationMode === 'epsilon-greedy') {
       result = this._applyEpsilonGreedy(skills, taskContext);
     } else {
       result = skills; // greedy / default
     }

    // Record usage for selected skills
    result.forEach(skill => {
      this.skillBank.recordUsage(skill.name, taskContext.task_type);
    });

    return result;
  }

  /**
   * Get UCB dampening factor for cold-start registry skills
   * Prevents new registry-imported skills from dominating selection
   * @param {Object} skill - Skill object
   * @returns {number} Dampening factor (0 to 1.0)
   */
  _getUCBDampeningFactor(skill) {
    if (skill.source !== 'registry') return 1.0;
    return Math.min(1.0, (skill.usage_count || 0) / 5);
  }

  /**
   * UCB exploration: rerank skills by Upper Confidence Bound score
   * UCB = success_rate + sqrt(2 * ln(total_usage + 1) / (skill_usage + 1)) * dampening
   * Dampening applies cold-start penalty to registry-sourced skills with low usage
   * @param {Array} skills - Skills from querySkills
   * @returns {Array} Skills reranked by UCB score
   */
  _applyUCB(skills) {
    let totalUsage = 0;
    for (const skill of this.skillBank.generalSkills.values()) {
      totalUsage += (skill.usage_count || 0);
    }

    return [...skills].sort((a, b) => {
      const dampeningA = this._getUCBDampeningFactor(a);
      const dampeningB = this._getUCBDampeningFactor(b);
      const ucbA = (a.success_rate || 0.5) + Math.sqrt(2 * Math.log(totalUsage + 1) / ((a.usage_count || 0) + 1)) * dampeningA;
      const ucbB = (b.success_rate || 0.5) + Math.sqrt(2 * Math.log(totalUsage + 1) / ((b.usage_count || 0) + 1)) * dampeningB;
      return ucbB - ucbA;
    });
  }

  /**
    * Select a random skill from a pool, preferring category-relevant skills
    * If taskContext.task_type matches a skill's category, prefer those skills
    * Otherwise, fall back to full pool
    * @param {Array} skills - Pool of skills to select from
    * @param {Object} taskContext - Task context with optional task_type
    * @returns {Object} Randomly selected skill
    */
   _weightedRandomSkill(skills, taskContext) {
     const category = taskContext?.task_type;
     if (category) {
       const categorySkills = skills.filter(s => s.category === category);
       if (categorySkills.length > 0) {
         return categorySkills[Math.floor(Math.random() * categorySkills.length)];
       }
     }
     return skills[Math.floor(Math.random() * skills.length)];
   }

  /**
    * Epsilon-greedy exploration: with probability epsilon, inject one random unexplored skill
    * Prefers category-relevant skills when task_type is available
    * @param {Array} skills - Skills from querySkills
    * @param {Object} taskContext - Task context for category-weighted selection
    * @returns {Array} Skills with possible random injection
    */
   _applyEpsilonGreedy(skills, taskContext) {
     if (Math.random() < this.epsilon) {
       const allSkills = [...this.skillBank.generalSkills.values()];
       const resultNames = new Set(skills.map(s => s.name));
       const candidates = allSkills.filter(s => !resultNames.has(s.name));
       if (candidates.length > 0) {
         const random = this._weightedRandomSkill(candidates, taskContext);
         const result = [...skills];
         if (result.length > 0) {
           result[result.length - 1] = random;
         } else {
           result.push(random);
         }
         return result;
       }
     }
     return skills;
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
      this._saveSync();
    }
  }

  /**
   * Save state synchronously for immediate-read flows (e.g. tests)
   */
  _saveSync() {
    if (!this.persistencePath) return;

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
    }
  }

  /**
   * Get default success_rate based on skill category (tiered defaults)
   * @param {object} registryEntry - Registry entry with category field
   * @returns {number} success_rate between 0 and 1
   */
  _getDefaultSuccessRate(registryEntry) {
    const category = registryEntry.category || 'general';
    
    // Tier 1: debugging/testing/review → 0.70
    if (['debugging', 'testing', 'review'].includes(category)) {
      return 0.70;
    }
    
    // Tier 2: general/meta/planning/reasoning/memory/observability → 0.65
    if (['general', 'meta', 'planning', 'reasoning', 'memory', 'observability'].includes(category)) {
      return 0.65;
    }
    
    // Tier 3: everything else (niche/experimental) → 0.50
    return 0.50;
  }

  /**
   * Merge registry metadata into existing skill entry (for seed collisions)
   * Preserves existing success_rate and usage_count, adds new triggers/tags
   * @param {object} existing - Existing skill entry
   * @param {object} registryEntry - Registry entry to merge
   */
  _mergeRegistryMetadata(existing, registryEntry) {
    // Build merged object explicitly field-by-field to avoid any property descriptor issues
    // Preserve the existing entry completely, only adding new metadata from registry
    const merged = {
      // Core fields from existing (seed) - NEVER overwrite these
      name: existing.name,
      principle: existing.principle || registryEntry.description || '',
      success_rate: existing.success_rate, // CRITICAL: preserve seed's success_rate
      usage_count: existing.usage_count, // CRITICAL: preserve seed's usage_count
      last_updated: existing.last_updated,
      source: existing.source,
      tags: [],
      application_context: ''
    };
    
    // Merge triggers into application_context (avoid duplicates)
    const existingContexts = new Set(
      (existing.application_context || '')
        .split(',')
        .map(s => s.trim())
        .filter(s => s)
    );
    
    const newTriggers = registryEntry.triggers || [];
    newTriggers.forEach(trigger => {
      existingContexts.add(trigger);
    });
    
    merged.application_context = Array.from(existingContexts).join(', ');
    
    // Merge tags (avoid duplicates)
    const existingTags = new Set(existing.tags || []);
    const newTags = registryEntry.tags || [];
    newTags.forEach(tag => {
      existingTags.add(tag);
    });
    
    merged.tags = Array.from(existingTags);
    
    // Add any additional fields from existing that we might have missed
    if (existing.category) merged.category = existing.category;
    
    return merged;
  }

  /**
   * Additively seed skill bank from registry.json.
   * Preserves existing usage_count and success_rate. Adds missing skills only.
   * For seed collisions, merges registry metadata into existing entry.
   * @param {string} registryPath - Absolute path to registry.json
   */
  syncWithRegistry(registryPath) {
    if (!registryPath || !fs.existsSync(registryPath)) return;
    let registry;
    try {
      registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    } catch (_) { return; }

    const skills = registry.skills || {};
    let mutated = false;

    for (const [skillName, meta] of Object.entries(skills)) {
      // Normalize: strip any path prefix (superpowers/, etc.), use base name only
      const baseName = skillName.includes('/') ? skillName.split('/').pop() : skillName;

      // Check if skill already exists
      const existing = this.skillBank.generalSkills.get(baseName);
      if (existing) {
        // Merge registry metadata into existing entry (seed collision case)
        const merged = this._mergeRegistryMetadata(existing, meta);
        this.skillBank.generalSkills.set(baseName, merged);
        mutated = true;
        continue;
      }

      // New skill: use tiered default success_rate
      const defaultSuccessRate = this._getDefaultSuccessRate(meta);

      this.skillBank.generalSkills.set(baseName, {
        name: baseName,
        principle: meta.description || '',
        application_context: (meta.triggers || []).join(', '),
        success_rate: defaultSuccessRate,
        usage_count: 0,
        last_updated: Date.now(),
        tags: meta.tags || [],
        source: meta.source || 'registry',
        category: meta.category || 'general',
      });
      mutated = true;
    }

    if (mutated) {
      this.skillBank._invalidateCache();
      this._save().catch(() => {}); // fire-and-forget
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
  EvolutionEngine,
  ExplorationRLAdapter,
};
