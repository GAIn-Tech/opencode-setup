/**
 * Preload Skills Plugin — Dynamic Tier-Based Tool Orchestration
 * 
 * Implements a 3-tier tool loading system:
 * - Tier 0 (always): Core tools loaded for every prompt
 * - Tier 1 (task-classified): Tools matched via regex patterns against user prompt
 * - Tier 2 (on-demand): Specialized tools invokable via load_skill meta-tool
 * 
 * Integrates with SkillRLManager for promotion/demotion feedback loop.
 */

const { EventEmitter } = require('events');
const { TierResolver } = require('./tier-resolver');

const DEFAULTS = {
  tiersConfigPath: null,       // Path to tool-tiers.json, auto-resolved if null
  maxTier1Tools: 15,           // Cap on Tier 1 tools per prompt (prevent context bloat)
  maxTotalTokenBudget: 2500,   // Approximate token budget for tool definitions
  rlEnabled: true,             // Whether to use SkillRL for boost/adjustments
  promotionThreshold: 5,       // On-demand loads before promoting T2→T1
  demotionSessionWindow: 50,   // Sessions to track for demotion analysis
  demotionUsageFloor: 0.05,    // Usage rate below which T1→T2 demotion triggers
  logLevel: 'info',            // 'debug' | 'info' | 'warn' | 'error'
};

class PreloadSkillsPlugin extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULTS, ...options };
    this.tierResolver = null;
    this.skillRL = options.skillRL || null;  // Optional SkillRLManager instance
    this.stats = {
      promptsProcessed: 0,
      tier0Loads: 0,
      tier1Loads: 0,
      tier2OnDemandLoads: 0,
      cacheHits: 0,
      promotions: [],
      demotions: [],
    };
    this._promptCache = new Map();  // LRU-ish cache for repeated prompt patterns
    this._onDemandTracker = new Map();  // skill → { taskType → count }
    this._usageTracker = new Map();     // skill → { total: N, sessions: N }
    this._initialized = false;
  }

  /**
   * Initialize the plugin. Must be called before selectTools().
   * Loads tool-tiers.json and validates tier definitions.
   */
  async init() {
    try {
      this.tierResolver = new TierResolver({ tiersPath: this.config.tiersConfigPath });
      this._initialized = true;
      this.emit('initialized', { tiers: this.tierResolver.getSummary() });
      this._log('info', `Initialized with ${this.tierResolver.getSummary().totalSkills} skills across 3 tiers`);
    } catch (err) {
      this._log('warn', `Failed to initialize tier resolver: ${err.message}. Falling back to load-all mode.`);
      this._initialized = false;
      this.emit('init-fallback', { error: err.message });
    }
  }

  /**
   * Select tools for a given prompt. Core orchestration method.
   * 
   * @param {Object} context - Task context
   * @param {string} context.prompt - User's prompt text
   * @param {string} [context.taskType] - Optional task type hint
   * @param {Object} [context.metadata] - Additional context (session, agent, etc.)
   * @returns {Object} { tools: string[], tier2Available: Object[], metadata: Object }
   */
  selectTools(context = {}) {
    // Auto-initialize synchronously if init() wasn't called
    if (!this._initialized) {
      try {
        this.tierResolver = new TierResolver({ tiersPath: this.config.tiersConfigPath });
        this._initialized = true;
        this._log('info', 'Auto-initialized on first selectTools() call');
      } catch (err) {
        this._log('warn', `Auto-init failed: ${err.message}. Using fallback.`);
        return this._fallbackSelection(context);
      }
    }

    const prompt = context.prompt || '';
    this.stats.promptsProcessed++;

    // 1. Check cache for identical/similar prompts
    const cacheKey = this._computeCacheKey(prompt);
    if (this._promptCache.has(cacheKey)) {
      this.stats.cacheHits++;
      return this._promptCache.get(cacheKey);
    }

    // 2. Always include Tier 0 (returns {tools, skills, mcps})
    const tier0 = this.tierResolver.getTier0();
    const tier0Flat = [...(tier0.tools || []), ...(tier0.skills || [])].map(name =>
      typeof name === 'string' ? { name, source: 'tier0' } : { ...name, source: 'tier0' }
    );
    this.stats.tier0Loads++;

    // 3. Classify prompt → Tier 1 matches (returns {tools, skills, mcps, categories})
    const tier1Matches = this.tierResolver.matchTier1(prompt, context.taskType);
    const tier1Flat = [...(tier1Matches.tools || []), ...(tier1Matches.skills || [])].map(name =>
      typeof name === 'string' ? { name, source: 'tier1', categories: tier1Matches.categories } : { ...name, source: 'tier1' }
    );
    const tier1Tools = tier1Flat.slice(0, this.config.maxTier1Tools);
    this.stats.tier1Loads += tier1Tools.length;

    // 4. Apply SkillRL boost if available
    let rlBoost = [];
    if (this.config.rlEnabled && this.skillRL) {
      try {
        const rlSelection = this.skillRL.selectSkills({
          task_type: context.taskType || this._inferTaskType(prompt),
          prompt_keywords: this._extractKeywords(prompt),
          ...context.metadata,
        });
        // Only boost skills not already in Tier 0/1
        const existingNames = new Set([...tier0Flat.map(t => t.name), ...tier1Tools.map(t => t.name)]);
        rlBoost = (rlSelection || [])
          .filter(s => !existingNames.has(s.name) && s.success_rate > 0.7)
          .slice(0, 3);
        this._log('debug', `SkillRL boosted: ${rlBoost.map(s => s.name).join(', ') || 'none'}`);
      } catch (err) {
        this._log('warn', `SkillRL query failed: ${err.message}`);
      }
    }

    // 5. Merge and deduplicate
    const allTools = this._dedup([...tier0Flat, ...tier1Tools, ...rlBoost.map(s => ({
      name: s.name,
      description: s.description || `RL-boosted: ${s.name}`,
      source: 'skillrl',
    }))]);

    // 6. Get Tier 2 manifest (brief descriptions for system prompt)
    const tier2Available = this.tierResolver.getTier2Brief();

    const result = {
      tools: allTools,
      tier2Available,
      metadata: {
        tier0Count: tier0.length,
        tier1Count: tier1Tools.length,
        rlBoostCount: rlBoost.length,
        totalCount: allTools.length,
        matchedCategories: tier1Matches.categories || [],
        estimatedTokens: this._estimateTokens(allTools),
      },
    };

    // Cache result (max 100 entries, evict oldest)
    if (this._promptCache.size >= 100) {
      const firstKey = this._promptCache.keys().next().value;
      this._promptCache.delete(firstKey);
    }
    this._promptCache.set(cacheKey, result);

    this.emit('tools-selected', result.metadata);
    return result;
  }

  /**
   * Load a Tier 2 skill on demand. Called when agent invokes load_skill tool.
   * 
   * @param {string} skillName - Name of the skill to load
   * @param {string} [taskType] - Current task type for tracking
   * @returns {Object|null} Skill definition or null if not found
   */
  loadOnDemand(skillName, taskType) {
    if (!this._initialized) {
      this._log('warn', `Cannot load on-demand: not initialized`);
      return null;
    }

    const skill = this.tierResolver.getTier2Skill(skillName);
    if (!skill) {
      this._log('warn', `Tier 2 skill not found: ${skillName}`);
      return null;
    }

    this.stats.tier2OnDemandLoads++;
    
    // Track for promotion analysis
    const effectiveTaskType = taskType || 'unknown';
    if (!this._onDemandTracker.has(skillName)) {
      this._onDemandTracker.set(skillName, new Map());
    }
    const taskMap = this._onDemandTracker.get(skillName);
    taskMap.set(effectiveTaskType, (taskMap.get(effectiveTaskType) || 0) + 1);

    // Check if this skill should be promoted to Tier 1
    const totalLoads = taskMap.get(effectiveTaskType) || 0;
    if (totalLoads >= this.config.promotionThreshold) {
      this._promoteToTier1(skillName, effectiveTaskType);
    }

    this.emit('on-demand-load', { skillName, taskType: effectiveTaskType, totalLoads });
    this._log('info', `On-demand loaded: ${skillName} (${totalLoads}x for ${effectiveTaskType})`);
    
    return skill;
  }

  /**
   * Record tool usage for demotion analysis.
   * Call after task completion with which tools were actually used.
   * 
   * @param {string[]} usedTools - Names of tools actually invoked
   * @param {string} taskType - Task type for this session
   */
  recordUsage(usedTools = [], taskType) {
    for (const tool of usedTools) {
      if (!this._usageTracker.has(tool)) {
        this._usageTracker.set(tool, { total: 0, sessions: 0, byTaskType: new Map() });
      }
      const tracker = this._usageTracker.get(tool);
      tracker.total++;
      tracker.sessions++;
      const tt = taskType || 'unknown';
      tracker.byTaskType.set(tt, (tracker.byTaskType.get(tt) || 0) + 1);
    }

    // Check for demotions periodically
    if (this.stats.promptsProcessed % this.config.demotionSessionWindow === 0) {
      this._checkDemotions();
    }
  }

  /**
   * Get the load_skill tool definition for injection into agent context.
   * This meta-tool allows agents to request Tier 2 skills mid-conversation.
   */
  getLoadSkillToolDefinition() {
    const tier2Brief = this._initialized ? this.tierResolver.getTier2Brief() : [];
    const availableList = tier2Brief.map(s => `  - ${s.name}: ${s.brief}`).join('\n');

    return {
      name: 'load_skill',
      description: `Load a specialized skill on-demand. Available skills:\n${availableList}\n\nCall this when you need a capability not in your current tool set.`,
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the skill to load',
            enum: tier2Brief.map(s => s.name),
          },
        },
        required: ['name'],
      },
    };
  }

  /**
   * Get plugin statistics and health report.
   */
  getReport() {
    return {
      initialized: this._initialized,
      stats: { ...this.stats },
      tierSummary: this._initialized ? this.tierResolver.getSummary() : null,
      onDemandTracker: Object.fromEntries(
        [...this._onDemandTracker.entries()].map(([k, v]) => [k, Object.fromEntries(v)])
      ),
      usageTracker: Object.fromEntries(
        [...this._usageTracker.entries()].map(([k, v]) => [k, {
          total: v.total,
          sessions: v.sessions,
          byTaskType: Object.fromEntries(v.byTaskType),
        }])
      ),
      promotions: this.stats.promotions,
      demotions: this.stats.demotions,
    };
  }

  /**
   * Export full state for persistence.
   */
  exportState() {
    return {
      version: 1,
      timestamp: new Date().toISOString(),
      onDemandTracker: Object.fromEntries(
        [...this._onDemandTracker.entries()].map(([k, v]) => [k, Object.fromEntries(v)])
      ),
      usageTracker: Object.fromEntries(
        [...this._usageTracker.entries()].map(([k, v]) => [k, {
          total: v.total,
          sessions: v.sessions,
          byTaskType: Object.fromEntries(v.byTaskType),
        }])
      ),
      stats: { ...this.stats },
      tierOverrides: this._initialized ? this.tierResolver.getOverrides() : {},
    };
  }

  /**
   * Import state from persistence.
   */
  importState(state) {
    if (!state || state.version !== 1) return;

    // Restore on-demand tracker
    if (state.onDemandTracker) {
      for (const [skill, taskMap] of Object.entries(state.onDemandTracker)) {
        this._onDemandTracker.set(skill, new Map(Object.entries(taskMap)));
      }
    }

    // Restore usage tracker
    if (state.usageTracker) {
      for (const [tool, data] of Object.entries(state.usageTracker)) {
        this._usageTracker.set(tool, {
          total: data.total || 0,
          sessions: data.sessions || 0,
          byTaskType: new Map(Object.entries(data.byTaskType || {})),
        });
      }
    }

    // Restore tier overrides
    if (state.tierOverrides && this._initialized) {
      this.tierResolver.applyOverrides(state.tierOverrides);
    }

    this._log('info', 'State imported successfully');
  }

  // --- Private Methods ---

  _promoteToTier1(skillName, taskType) {
    if (!this._initialized) return;

    const promoted = this.tierResolver.promote(skillName, taskType);
    if (promoted) {
      this.stats.promotions.push({
        skill: skillName,
        taskType,
        timestamp: new Date().toISOString(),
      });
      this._log('info', `PROMOTED ${skillName} to Tier 1 for task type: ${taskType}`);
      this.emit('promotion', { skill: skillName, taskType });
    }
  }

  _checkDemotions() {
    if (!this._initialized) return;

    const tier1Skills = this.tierResolver.getTier1SkillNames();
    for (const skill of tier1Skills) {
      const tracker = this._usageTracker.get(skill);
      if (!tracker) continue;

      const usageRate = tracker.sessions > 0
        ? tracker.total / this.stats.promptsProcessed
        : 0;

      if (usageRate < this.config.demotionUsageFloor && 
          this.stats.promptsProcessed >= this.config.demotionSessionWindow) {
        const demoted = this.tierResolver.demote(skill);
        if (demoted) {
          this.stats.demotions.push({
            skill,
            usageRate,
            timestamp: new Date().toISOString(),
          });
          this._log('info', `DEMOTED ${skill} to Tier 2 (usage: ${(usageRate * 100).toFixed(1)}%)`);
          this.emit('demotion', { skill, usageRate });
        }
      }
    }
  }

  _fallbackSelection(context) {
    // When not initialized, return empty selection with warning
    this._log('warn', 'Using fallback selection — all tools available, no tier filtering');
    return {
      tools: [],
      tier2Available: [],
      metadata: {
        tier0Count: 0,
        tier1Count: 0,
        rlBoostCount: 0,
        totalCount: 0,
        matchedCategories: [],
        estimatedTokens: 0,
        fallback: true,
      },
    };
  }

  _dedup(tools) {
    const seen = new Set();
    return tools.filter(t => {
      if (seen.has(t.name)) return false;
      seen.add(t.name);
      return true;
    });
  }

  _computeCacheKey(prompt) {
    // Simple hash: lowercase, extract keywords, sort, join
    const words = prompt.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .sort()
      .slice(0, 20);
    return words.join('|');
  }

  _extractKeywords(prompt) {
    return prompt.toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }

  _inferTaskType(prompt) {
    const lower = prompt.toLowerCase();
    if (/\b(bug|fix|error|crash|debug|issue)\b/.test(lower)) return 'debugging';
    if (/\b(test|spec|assert|expect|coverage)\b/.test(lower)) return 'testing';
    if (/\b(refactor|rename|extract|move|clean)\b/.test(lower)) return 'refactoring';
    if (/\b(add|create|implement|build|feature)\b/.test(lower)) return 'implementation';
    if (/\b(deploy|release|publish|ship)\b/.test(lower)) return 'deployment';
    if (/\b(doc|readme|comment|explain)\b/.test(lower)) return 'documentation';
    if (/\b(commit|push|merge|rebase|branch|pr|pull)\b/.test(lower)) return 'git';
    if (/\b(style|css|layout|design|ui|ux|component)\b/.test(lower)) return 'frontend';
    return 'general';
  }

  _estimateTokens(tools) {
    // Rough estimate: ~50 tokens per tool definition
    return tools.length * 50;
  }

  _log(level, message) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    if (levels[level] >= levels[this.config.logLevel]) {
      const prefix = `[preload-skills]`;
      if (level === 'error') console.error(prefix, message);
      else if (level === 'warn') console.warn(prefix, message);
      else console.log(prefix, message);
    }
  }
}

module.exports = { PreloadSkillsPlugin, DEFAULTS };
