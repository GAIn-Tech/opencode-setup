/**
 * TierResolver - Classifies tools into Tier 0/1/2 based on task context.
 * 
 * Tier 0: Always loaded (core tools every task needs)
 * Tier 1: Task-classified via regex patterns (loaded when prompt matches)
 * Tier 2: On-demand (loaded via load_skill meta-tool)
 * 
 * The resolver reads tool-tiers.json and applies pattern matching + RL overrides.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_TIERS_PATHS = [
  // Project-local (portable)
  () => path.join(process.cwd(), 'opencode-config', 'tool-tiers.json'),
  // User-global
  () => path.join(os.homedir(), '.config', 'opencode', 'tool-tiers.json'),
];

class TierResolver {
  constructor(options = {}) {
    this.tiersPath = options.tiersPath || null;
    this.tiers = null;
    this._compiledPatterns = null;
    this._tierOverrides = new Map(); // RL-driven promotions/demotions
    this._usageStats = new Map(); // track on-demand loads per skill+taskType
    
    this._loadTiers();
  }

  /**
   * Load tool-tiers.json from first available location
   */
  _loadTiers() {
    const searchPaths = this.tiersPath 
      ? [() => this.tiersPath] 
      : DEFAULT_TIERS_PATHS;

    for (const pathFn of searchPaths) {
      const p = pathFn();
      try {
        if (fs.existsSync(p)) {
          this.tiers = JSON.parse(fs.readFileSync(p, 'utf-8'));
          this._compilePatterns();
          return;
        }
      } catch (err) {
        console.warn(`[preload-skills] Failed to load tiers from ${p}: ${err.message}`);
      }
    }

    console.warn('[preload-skills] No tool-tiers.json found, using minimal defaults');
    this.tiers = this._getMinimalDefaults();
    this._compilePatterns();
  }

  /**
   * Pre-compile Tier 1 regex patterns for fast matching
   */
  _compilePatterns() {
    this._compiledPatterns = {};
    if (!this.tiers?.tier_1?.categories) return;

    for (const [category, config] of Object.entries(this.tiers.tier_1.categories)) {
      try {
        this._compiledPatterns[category] = {
          regex: new RegExp(config.patterns.join('|'), 'i'),
          tools: config.tools || [],
          skills: config.skills || [],
          mcps: config.mcps || [],
        };
      } catch (err) {
        console.warn(`[preload-skills] Invalid regex in category '${category}': ${err.message}`);
      }
    }
  }

  /**
   * Resolve which tools/skills/MCPs to load for a given prompt + task context.
   * 
   * @param {string} prompt - The user's message
   * @param {object} taskContext - Optional context with task_type, tags, etc.
   * @returns {{ tools: string[], skills: string[], mcps: string[], tier2_available: object[] }}
   */
  resolve(prompt, taskContext = {}) {
    const result = {
      tools: new Set(),
      skills: new Set(),
      mcps: new Set(),
      tier2_available: [],
      _matchedCategories: [],
    };

    // --- Tier 0: Always loaded ---
    if (this.tiers?.tier_0) {
      (this.tiers.tier_0.tools || []).forEach(t => result.tools.add(t));
      (this.tiers.tier_0.skills || []).forEach(s => result.skills.add(s));
      (this.tiers.tier_0.mcps || []).forEach(m => result.mcps.add(m));
    }

    // --- Tier 1: Pattern-matched ---
    const promptLower = (prompt || '').toLowerCase();
    for (const [category, compiled] of Object.entries(this._compiledPatterns)) {
      if (compiled.regex.test(promptLower)) {
        result._matchedCategories.push(category);
        compiled.tools.forEach(t => result.tools.add(t));
        compiled.skills.forEach(s => result.skills.add(s));
        compiled.mcps.forEach(m => result.mcps.add(m));
      }
    }

    // --- Apply RL tier overrides ---
    for (const [skillName, override] of this._tierOverrides) {
      if (override.tier === 1) {
        // Promoted from Tier 2 → Tier 1 for this task type
        const taskType = taskContext.task_type || 'general';
        if (!override.taskTypes || override.taskTypes.includes(taskType)) {
          result.skills.add(skillName);
        }
      } else if (override.tier === 2) {
        // Demoted from Tier 1 → Tier 2
        result.skills.delete(skillName);
      }
    }

    // --- Tier 2: Catalog for on-demand loading ---
    if (this.tiers?.tier_2?.skills) {
      result.tier2_available = this.tiers.tier_2.skills
        .filter(s => !result.skills.has(s.name))
        .map(s => ({
          name: s.name,
          description: s.brief || s.description || '',
          domain: s.domain || 'general',
        }));
    }

    return {
      tools: [...result.tools],
      skills: [...result.skills],
      mcps: [...result.mcps],
      tier2_available: result.tier2_available,
      _matchedCategories: result._matchedCategories,
    };
  }

  /**
   * Record an on-demand skill load (for promotion tracking)
   */
  recordOnDemandLoad(skillName, taskType = 'general') {
    const key = `${skillName}::${taskType}`;
    const stats = this._usageStats.get(key) || { count: 0, firstSeen: Date.now() };
    stats.count++;
    stats.lastSeen = Date.now();
    this._usageStats.set(key, stats);

    // Auto-promote if loaded >5 times for this task type
    if (stats.count >= 5) {
      this.promoteTier(skillName, taskType);
    }
  }

  /**
   * Record that a Tier 1 skill was NOT used despite being loaded
   */
  recordUnused(skillName, taskType = 'general') {
    const key = `unused::${skillName}::${taskType}`;
    const stats = this._usageStats.get(key) || { count: 0, total: 0 };
    stats.count++;
    stats.total++;
    this._usageStats.set(key, stats);

    // Auto-demote if unused >95% of the time over 50+ sessions
    if (stats.total >= 50 && (stats.count / stats.total) > 0.95) {
      this.demoteTier(skillName);
    }
  }

  /**
   * Promote a skill from Tier 2 → Tier 1 for specific task types
   */
  promoteTier(skillName, taskType) {
    const existing = this._tierOverrides.get(skillName);
    if (existing?.tier === 1) {
      // Already promoted, add task type
      if (!existing.taskTypes.includes(taskType)) {
        existing.taskTypes.push(taskType);
      }
    } else {
      this._tierOverrides.set(skillName, {
        tier: 1,
        taskTypes: [taskType],
        promotedAt: Date.now(),
        reason: 'auto_promotion_frequent_on_demand',
      });
    }
    console.log(`[preload-skills] Promoted '${skillName}' to Tier 1 for task type '${taskType}'`);
  }

  /**
   * Demote a skill from Tier 1 → Tier 2
   */
  demoteTier(skillName) {
    this._tierOverrides.set(skillName, {
      tier: 2,
      demotedAt: Date.now(),
      reason: 'auto_demotion_low_usage',
    });
    console.log(`[preload-skills] Demoted '${skillName}' to Tier 2 (low usage)`);
  }

  /**
   * Export state for persistence
   */
  exportState() {
    return {
      overrides: Object.fromEntries(this._tierOverrides),
      usageStats: Object.fromEntries(this._usageStats),
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Import persisted state
   */
  importState(state) {
    if (state?.overrides) {
      this._tierOverrides = new Map(Object.entries(state.overrides));
    }
    if (state?.usageStats) {
      this._usageStats = new Map(Object.entries(state.usageStats));
    }
  }

  /**
   * Get stats for dashboard/debugging
   */
  getStats() {
    return {
      tiersLoaded: !!this.tiers,
      tier0Count: this.tiers?.tier_0?.tools?.length || 0,
      tier1Categories: Object.keys(this._compiledPatterns || {}),
      tier2Count: this.tiers?.tier_2?.skills?.length || 0,
      activeOverrides: this._tierOverrides.size,
      trackedUsage: this._usageStats.size,
    };
  }

  // --- Granular API methods (used by PreloadSkillsPlugin) ---

  /** Get Tier 0 tools/skills/mcps (always loaded) */
  getTier0() {
    return {
      tools: this.tiers?.tier_0?.tools || [],
      skills: this.tiers?.tier_0?.skills || [],
      mcps: this.tiers?.tier_0?.mcps || [],
    };
  }

  /** Match Tier 1 categories against a prompt, returns matched tools/skills/mcps */
  matchTier1(prompt) {
    const result = { tools: [], skills: [], mcps: [], categories: [] };
    const promptLower = (prompt || '').toLowerCase();
    for (const [category, compiled] of Object.entries(this._compiledPatterns || {})) {
      if (compiled.regex.test(promptLower)) {
        result.categories.push(category);
        result.tools.push(...(compiled.tools || []));
        result.skills.push(...(compiled.skills || []));
        result.mcps.push(...(compiled.mcps || []));
      }
    }
    // Deduplicate
    result.tools = [...new Set(result.tools)];
    result.skills = [...new Set(result.skills)];
    result.mcps = [...new Set(result.mcps)];
    return result;
  }

  /** Get brief descriptions for all Tier 2 skills (for system prompt injection) */
  getTier2Brief() {
    const skills = this.tiers?.tier_2?.skills || {};
    return Object.entries(skills).map(([name, info]) => ({
      name,
      brief: info?.description || info?.trigger_hint || '',
      domain: info?.domain || 'general',
    }));
  }

  /** Get full config for a specific Tier 2 skill by name */
  getTier2Skill(name) {
    const skills = this.tiers?.tier_2?.skills || {};
    return skills[name] ? { name, ...skills[name] } : null;
  }

  /** Get all Tier 1 skill names across all categories */
  getTier1SkillNames() {
    const names = new Set();
    for (const compiled of Object.values(this._compiledPatterns || {})) {
      (compiled.skills || []).forEach(s => names.add(s));
    }
    return [...names];
  }

  /** Get current RL overrides as plain object */
  getOverrides() {
    return Object.fromEntries(this._tierOverrides);
  }

  /** Apply RL overrides from external source */
  applyOverrides(overrides) {
    if (overrides && typeof overrides === 'object') {
      for (const [key, val] of Object.entries(overrides)) {
        this._tierOverrides.set(key, val);
      }
    }
  }

  /** Alias for promoteTier */
  promote(skillName, taskType) {
    return this.promoteTier(skillName, taskType);
  }

  /** Alias for demoteTier */
  demote(skillName) {
    return this.demoteTier(skillName);
  }

  /** Summary for dashboard (alias for getStats) */
  getSummary() {
    return this.getStats();
  }

  _getMinimalDefaults() {
    return {
      version: '1.0.0',
      tier_0: {
        tools: ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob', 'TodoWrite'],
        skills: [],
        mcps: [],
      },
      tier_1: { categories: {} },
      tier_2: { skills: [] },
    };
  }
}

module.exports = { TierResolver };
