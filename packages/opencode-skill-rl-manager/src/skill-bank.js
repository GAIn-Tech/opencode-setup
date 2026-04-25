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
 * - success_rate: Backward-compatible success metric (0.0-1.0)
 * - success_rate_overall: Smoothed overall success rate (0.0-1.0)
 * - success_rate_by_complexity: Success rate buckets by complexity
 * - success_rate_by_task_type: Success rate buckets by task type
 * - avg_tokens_used: Average tokens consumed when used
 * - avg_latency_ms: Average latency when used
 * - confidence_interval: Wilson interval bounds for empirical success rate
 * - sample_count: Number of outcomes recorded (evidence weight)
 * - usage_count: Times this skill was selected
 * - last_updated: Timestamp of last evolution
 */

'use strict';

const { SemanticMatcher } = require('./semantic-matcher');

function clamp01(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toFiniteOrNull(value) {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

// Wilson score interval for a Bernoulli proportion.
// Returns bounds clamped to [0, 1].
function wilsonInterval(successes, trials, z = 1.96) {
  const n = Number(trials);
  const k = Number(successes);
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(k) || k < 0) {
    return { lower: 0, upper: 1 };
  }

  const p = Math.max(0, Math.min(1, k / n));
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom;

  return {
    lower: clamp01(center - margin),
    upper: clamp01(center + margin)
  };
}

function readBucketRate(bucket, fallbackRate) {
  if (typeof bucket === 'number' && Number.isFinite(bucket)) return clamp01(bucket);
  if (bucket && typeof bucket === 'object' && typeof bucket.success_rate === 'number') {
    return clamp01(bucket.success_rate);
  }
  return clamp01(fallbackRate);
}

function ensureBucket(container, key, seedRate) {
  if (!container || typeof container !== 'object') {
    return null;
  }

  if (!container[key] || typeof container[key] !== 'object') {
    container[key] = {
      success_rate: clamp01(seedRate),
      sample_count: 0,
      success_count: 0,
      confidence_interval: { lower: 0, upper: 1 }
    };
  } else {
    const existing = container[key];
    if (typeof existing.success_rate !== 'number' || !Number.isFinite(existing.success_rate)) {
      existing.success_rate = clamp01(seedRate);
    }
    existing.sample_count = Number.isInteger(existing.sample_count) && existing.sample_count >= 0
      ? existing.sample_count
      : 0;
    existing.success_count = Number.isInteger(existing.success_count) && existing.success_count >= 0
      ? existing.success_count
      : 0;
    if (!existing.confidence_interval || typeof existing.confidence_interval !== 'object') {
      existing.confidence_interval = { lower: 0, upper: 1 };
    }
    existing.confidence_interval.lower = clamp01(existing.confidence_interval.lower);
    existing.confidence_interval.upper = clamp01(existing.confidence_interval.upper);
  }

  return container[key];
}

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
    
    // Semantic matching layer (additive fallback for synonym/domain signal matching)
    this.semanticMatcher = new SemanticMatcher();
    
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

  _ensureMultiDimMetrics(skill) {
    if (!skill || typeof skill !== 'object') return;

    // Backward compatibility: treat existing success_rate as overall if missing.
    const initialOverall = typeof skill.success_rate_overall === 'number' && Number.isFinite(skill.success_rate_overall)
      ? skill.success_rate_overall
      : (typeof skill.success_rate === 'number' && Number.isFinite(skill.success_rate) ? skill.success_rate : 0.5);

    skill.success_rate_overall = clamp01(initialOverall);
    skill.success_rate = clamp01(skill.success_rate_overall);

    if (!Number.isInteger(skill.sample_count) || skill.sample_count < 0) {
      skill.sample_count = 0;
    }
    if (!Number.isInteger(skill.success_count) || skill.success_count < 0) {
      skill.success_count = 0;
    }

    if (!skill.confidence_interval || typeof skill.confidence_interval !== 'object') {
      skill.confidence_interval = { lower: 0, upper: 1 };
    }
    skill.confidence_interval.lower = clamp01(skill.confidence_interval.lower);
    skill.confidence_interval.upper = clamp01(skill.confidence_interval.upper);

    if (!skill.success_rate_by_complexity || typeof skill.success_rate_by_complexity !== 'object') {
      skill.success_rate_by_complexity = {};
    }
    if (!skill.success_rate_by_task_type || typeof skill.success_rate_by_task_type !== 'object') {
      skill.success_rate_by_task_type = {};
    }

    // Efficiency metrics (streaming averages)
    if (skill.avg_tokens_used !== null && skill.avg_tokens_used !== undefined) {
      const num = toFiniteOrNull(skill.avg_tokens_used);
      skill.avg_tokens_used = num !== null && num >= 0 ? num : null;
    } else {
      skill.avg_tokens_used = null;
    }

    if (skill.avg_latency_ms !== null && skill.avg_latency_ms !== undefined) {
      const num = toFiniteOrNull(skill.avg_latency_ms);
      skill.avg_latency_ms = num !== null && num >= 0 ? num : null;
    } else {
      skill.avg_latency_ms = null;
    }

    if (!Number.isInteger(skill.tokens_sample_count) || skill.tokens_sample_count < 0) {
      skill.tokens_sample_count = 0;
    }
    if (!Number.isInteger(skill.latency_sample_count) || skill.latency_sample_count < 0) {
      skill.latency_sample_count = 0;
    }
  }

  _getContextualSuccessRate(skill, taskContext) {
    const base = typeof skill?.success_rate_overall === 'number'
      ? skill.success_rate_overall
      : (typeof skill?.success_rate === 'number' ? skill.success_rate : 0.5);

    const taskType = taskContext?.task_type;
    const complexity = taskContext?.complexity;

    if (taskType && skill?.success_rate_by_task_type && skill.success_rate_by_task_type[taskType] !== undefined) {
      return readBucketRate(skill.success_rate_by_task_type[taskType], base);
    }

    if (complexity && skill?.success_rate_by_complexity && skill.success_rate_by_complexity[complexity] !== undefined) {
      return readBucketRate(skill.success_rate_by_complexity[complexity], base);
    }

    return clamp01(base);
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
        success_rate_overall: 0.85,
        success_rate_by_complexity: {},
        success_rate_by_task_type: {},
        avg_tokens_used: null,
        avg_latency_ms: null,
        confidence_interval: { lower: 0, upper: 1 },
        sample_count: 0,
        success_count: 0,
        usage_count: 0,
        last_updated: Date.now(),
        tags: ['debugging', 'verification', 'systematic'],
        source: 'seed'
      },
      {
        name: 'test-driven-development',
        principle: 'Write tests before implementation code',
        application_context: 'When implementing new features or fixing bugs',
        success_rate: 0.90,
        success_rate_overall: 0.90,
        success_rate_by_complexity: {},
        success_rate_by_task_type: {},
        avg_tokens_used: null,
        avg_latency_ms: null,
        confidence_interval: { lower: 0, upper: 1 },
        sample_count: 0,
        success_count: 0,
        usage_count: 0,
        last_updated: Date.now(),
        tags: ['testing', 'tdd', 'verification'],
        source: 'seed'
      },
      {
        name: 'verification-before-completion',
        principle: 'Always verify work before claiming completion',
        application_context: 'Before committing, creating PRs, or claiming task done',
        success_rate: 0.95,
        success_rate_overall: 0.95,
        success_rate_by_complexity: {},
        success_rate_by_task_type: {},
        avg_tokens_used: null,
        avg_latency_ms: null,
        confidence_interval: { lower: 0, upper: 1 },
        sample_count: 0,
        success_count: 0,
        usage_count: 0,
        last_updated: Date.now(),
        tags: ['verification', 'quality', 'gate'],
        source: 'seed'
      },
      {
        name: 'brainstorming',
        principle: 'Explore requirements and design before implementation',
        application_context: 'When facing ambiguous requirements or multiple valid approaches',
        success_rate: 0.80,
        success_rate_overall: 0.80,
        success_rate_by_complexity: {},
        success_rate_by_task_type: {},
        avg_tokens_used: null,
        avg_latency_ms: null,
        confidence_interval: { lower: 0, upper: 1 },
        sample_count: 0,
        success_count: 0,
        usage_count: 0,
        last_updated: Date.now(),
        tags: ['planning', 'design', 'exploration'],
        source: 'seed'
      },
      {
        name: 'incremental-implementation',
        principle: 'Break complex tasks into small, verifiable steps',
        application_context: 'When facing complex or multi-step tasks',
        success_rate: 0.88,
        success_rate_overall: 0.88,
        success_rate_by_complexity: {},
        success_rate_by_task_type: {},
        avg_tokens_used: null,
        avg_latency_ms: null,
        confidence_interval: { lower: 0, upper: 1 },
        sample_count: 0,
        success_count: 0,
        usage_count: 0,
        last_updated: Date.now(),
        tags: ['planning', 'decomposition', 'incremental'],
        source: 'seed'
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
      const merged = {
        ...existing,
        ...skill,
        last_updated: Date.now()
      };

      // If caller updates success_rate, mirror to success_rate_overall.
      if (skill.success_rate_overall !== undefined && skill.success_rate_overall !== null) {
        merged.success_rate_overall = clamp01(skill.success_rate_overall);
        merged.success_rate = clamp01(merged.success_rate_overall);
      } else if (skill.success_rate !== undefined && skill.success_rate !== null) {
        merged.success_rate = clamp01(skill.success_rate);
        merged.success_rate_overall = clamp01(skill.success_rate);
      }

      this._ensureMultiDimMetrics(merged);
      this.generalSkills.set(skill.name, merged);
    } else {
      // Add new skill
      const next = {
        ...skill,
        success_rate: (typeof skill.success_rate === 'number' ? clamp01(skill.success_rate) : 0.5),
        success_rate_overall: (typeof skill.success_rate_overall === 'number'
          ? clamp01(skill.success_rate_overall)
          : (typeof skill.success_rate === 'number' ? clamp01(skill.success_rate) : 0.5)
        ),
        success_rate_by_complexity: skill.success_rate_by_complexity || {},
        success_rate_by_task_type: skill.success_rate_by_task_type || {},
        avg_tokens_used: skill.avg_tokens_used ?? null,
        avg_latency_ms: skill.avg_latency_ms ?? null,
        confidence_interval: skill.confidence_interval || { lower: 0, upper: 1 },
        sample_count: Number.isInteger(skill.sample_count) ? skill.sample_count : 0,
        success_count: Number.isInteger(skill.success_count) ? skill.success_count : 0,
        tokens_sample_count: Number.isInteger(skill.tokens_sample_count) ? skill.tokens_sample_count : 0,
        latency_sample_count: Number.isInteger(skill.latency_sample_count) ? skill.latency_sample_count : 0,
        usage_count: skill.usage_count || 0,
        last_updated: Date.now()
      };
      this._ensureMultiDimMetrics(next);
      this.generalSkills.set(skill.name, next);
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
      const merged = {
        ...existing,
        ...skill,
        last_updated: Date.now()
      };

      if (skill.success_rate_overall !== undefined && skill.success_rate_overall !== null) {
        merged.success_rate_overall = clamp01(skill.success_rate_overall);
        merged.success_rate = clamp01(merged.success_rate_overall);
      } else if (skill.success_rate !== undefined && skill.success_rate !== null) {
        merged.success_rate = clamp01(skill.success_rate);
        merged.success_rate_overall = clamp01(skill.success_rate);
      }

      this._ensureMultiDimMetrics(merged);
      taskSkills.set(skill.name, merged);
    } else {
      // Add new skill
      const next = {
        ...skill,
        task_type: taskType,
        success_rate: (typeof skill.success_rate === 'number' ? clamp01(skill.success_rate) : 0.5),
        success_rate_overall: (typeof skill.success_rate_overall === 'number'
          ? clamp01(skill.success_rate_overall)
          : (typeof skill.success_rate === 'number' ? clamp01(skill.success_rate) : 0.5)
        ),
        success_rate_by_complexity: skill.success_rate_by_complexity || {},
        success_rate_by_task_type: skill.success_rate_by_task_type || {},
        avg_tokens_used: skill.avg_tokens_used ?? null,
        avg_latency_ms: skill.avg_latency_ms ?? null,
        confidence_interval: skill.confidence_interval || { lower: 0, upper: 1 },
        sample_count: Number.isInteger(skill.sample_count) ? skill.sample_count : 0,
        success_count: Number.isInteger(skill.success_count) ? skill.success_count : 0,
        tokens_sample_count: Number.isInteger(skill.tokens_sample_count) ? skill.tokens_sample_count : 0,
        latency_sample_count: Number.isInteger(skill.latency_sample_count) ? skill.latency_sample_count : 0,
        usage_count: skill.usage_count || 0,
        last_updated: Date.now()
      };
      this._ensureMultiDimMetrics(next);
      taskSkills.set(skill.name, next);
    }
    // Invalidate sorted cache
    this._invalidateCache();
  }

  /**
   * Configuration constants for querySkills() cap behavior
   */
  static DEFAULT_MAX_RESULTS = 5;
  static SOURCE_RATIO = 0.6;
  static ABSOLUTE_MAX_RESULTS = 20;

  /**
   * Query relevant skills for a task context
   * Returns hierarchical selection: General skills first, then task-specific
   * 
   * @param {Object} taskContext - Task context from OrchestrationAdvisor
   * @param {Object} options - Configuration options
   * @param {number} options.maxResults - Maximum number of results to return (default: 5, max: 20)
   * @returns {Array} Ranked list of relevant skills
   */
  querySkills(taskContext, { maxResults = SkillBank.DEFAULT_MAX_RESULTS } = {}) {
    const { task_type, complexity, error_type, description } = taskContext;
    const results = [];

    // Apply absolute ceiling to maxResults
    const effectiveMax = Math.min(maxResults, SkillBank.ABSOLUTE_MAX_RESULTS);
    
    // Calculate per-source cap based on SOURCE_RATIO
    const perSourceCap = Math.ceil(effectiveMax * SkillBank.SOURCE_RATIO);

    // Step 1: Always include high-success general skills
    const generalCandidates = Array.from(this.generalSkills.values())
      .filter(skill => this._matchesContext(skill, taskContext))
      .sort((a, b) => this._getContextualSuccessRate(b, taskContext) - this._getContextualSuccessRate(a, taskContext))
      .slice(0, perSourceCap); // Top N general skills (proportional to maxResults)

    results.push(...generalCandidates.map(s => ({ ...s, source: 'general' })));

    // Step 2: Add task-specific skills if available
    if (task_type && this.taskSpecificSkills.has(task_type)) {
      const taskSkills = Array.from(this.taskSpecificSkills.get(task_type).values())
        .filter(skill => this._matchesContext(skill, taskContext))
        .sort((a, b) => this._getContextualSuccessRate(b, taskContext) - this._getContextualSuccessRate(a, taskContext))
        .slice(0, perSourceCap); // Top N task-specific skills (proportional to maxResults)

      results.push(...taskSkills.map(s => ({ ...s, source: 'task-specific' })));
    }

    // Step 3: Rank by success_rate and return top effectiveMax
    const ranked = results
      .sort((a, b) => this._getContextualSuccessRate(b, taskContext) - this._getContextualSuccessRate(a, taskContext))
      .slice(0, effectiveMax);

    // Fail-open fallback: if strict context matching yields no candidates,
    // return top general skills instead of empty selection.
    if (ranked.length === 0) {
      return Array.from(this.generalSkills.values())
        .sort((a, b) => this._getContextualSuccessRate(b, taskContext) - this._getContextualSuccessRate(a, taskContext))
        .slice(0, effectiveMax)
        .map(s => ({ ...s, source: 'general' }));
    }

    return ranked;
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
   * Check if skill should be avoided for this task context
   * @private
   */
  _isAvoidContext(skill, taskContext) {
    const { task_type, error_type, description } = taskContext;
    
    if (!skill.selectionHints?.avoidWhen || skill.selectionHints.avoidWhen.length === 0) {
      return false;
    }

    const avoidTerms = skill.selectionHints.avoidWhen;
    
    // Check if any avoidWhen term matches task_type
    if (task_type && avoidTerms.some(term => task_type.toLowerCase().includes(term.toLowerCase()))) {
      return true;
    }

    // Check if any avoidWhen term matches error_type
    if (error_type && typeof error_type === 'string' && avoidTerms.some(term => 
      error_type.toLowerCase().includes(term.toLowerCase())
    )) {
      return true;
    }

    // Check if any avoidWhen term matches description
    if (description && avoidTerms.some(term => 
      description.toLowerCase().includes(term.toLowerCase())
    )) {
      return true;
    }

    return false;
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

    // Check avoidWhen BEFORE tag/keyword matching
    if (this._isAvoidContext(skill, taskContext)) {
      return false;
    }

    // Match by tags
    if (skill.tags) {
      const taskTypeMatch = task_type && skill.tags.includes(task_type);
      const complexityMatch = complexity && skill.tags.includes(complexity);
      const errorMatch = error_type && typeof error_type === 'string' && skill.tags.some(tag => 
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

    // Semantic matching fallback (additive — fires ONLY when keyword matching fails)
    // Uses synonym expansion and domain signal detection
    if (this.semanticMatcher && this.semanticMatcher.match(skill, taskContext)) {
      return true;
    }

    // No match found
    return false;
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

    // Backward compatibility: allow passing a full context object as the 3rd argument.
    let context = null;
    let taskTypeResolved = taskType;
    if (taskType && typeof taskType === 'object') {
      context = taskType;
      taskTypeResolved = context.task_type || context.taskType || null;
    }

    const complexity = context?.complexity || null;
    const tokensUsed = context ? (context.tokens_used ?? context.tokensUsed ?? null) : null;
    const latencyMs = context ? (context.avg_latency_ms ?? context.avgLatencyMs ?? context.latency_ms ?? context.latencyMs ?? null) : null;
    const recordSample = context
      ? Boolean(context.record_sample ?? context.recordSample ?? true)
      : true;

    // Find skill in general bank
    if (this.generalSkills.has(skillName)) {
      skill = this.generalSkills.get(skillName);
    }

    // Find skill in task-specific bank
    if (!skill && taskTypeResolved && this.taskSpecificSkills.has(taskTypeResolved)) {
      const taskSkills = this.taskSpecificSkills.get(taskTypeResolved);
      if (taskSkills.has(skillName)) {
        skill = taskSkills.get(skillName);
      }
    }

    if (!skill) {
      return false;
    }

    this._ensureMultiDimMetrics(skill);

    // Exponential moving average (alpha = 0.2 for gradual adjustment)
    const alpha = 0.2;
    const newRate = success ? 1.0 : 0.0;

    // Overall
    skill.success_rate_overall = clamp01(alpha * newRate + (1 - alpha) * skill.success_rate_overall);
    skill.success_rate = clamp01(skill.success_rate_overall); // keep legacy field synced

    if (recordSample) {
      skill.sample_count += 1;
      if (success) skill.success_count += 1;
      skill.confidence_interval = wilsonInterval(skill.success_count, skill.sample_count);
    }

    // Complexity bucket
    if (complexity && typeof complexity === 'string') {
      const bucket = ensureBucket(skill.success_rate_by_complexity, complexity, skill.success_rate_overall);
      bucket.success_rate = clamp01(alpha * newRate + (1 - alpha) * bucket.success_rate);
      if (recordSample) {
        bucket.sample_count += 1;
        if (success) bucket.success_count += 1;
        bucket.confidence_interval = wilsonInterval(bucket.success_count, bucket.sample_count);
      }
    }

    // Task-type bucket
    if (taskTypeResolved && typeof taskTypeResolved === 'string') {
      const bucket = ensureBucket(skill.success_rate_by_task_type, taskTypeResolved, skill.success_rate_overall);
      bucket.success_rate = clamp01(alpha * newRate + (1 - alpha) * bucket.success_rate);
      if (recordSample) {
        bucket.sample_count += 1;
        if (success) bucket.success_count += 1;
        bucket.confidence_interval = wilsonInterval(bucket.success_count, bucket.sample_count);
      }
    }

    // Efficiency metrics (streaming mean)
    const tokensNum = toFiniteOrNull(tokensUsed);
    if (recordSample && tokensNum !== null && tokensNum >= 0) {
      skill.tokens_sample_count += 1;
      if (skill.avg_tokens_used === null) {
        skill.avg_tokens_used = tokensNum;
      } else {
        skill.avg_tokens_used = skill.avg_tokens_used + (tokensNum - skill.avg_tokens_used) / skill.tokens_sample_count;
      }
    }

    const latencyNum = toFiniteOrNull(latencyMs);
    if (recordSample && latencyNum !== null && latencyNum >= 0) {
      skill.latency_sample_count += 1;
      if (skill.avg_latency_ms === null) {
        skill.avg_latency_ms = latencyNum;
      } else {
        skill.avg_latency_ms = skill.avg_latency_ms + (latencyNum - skill.avg_latency_ms) / skill.latency_sample_count;
      }
    }

    skill.last_updated = Date.now();

    return skill;  // Return skill object so learnFromOutcome can validate it (not boolean)
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

  getGeneralSkills() {
    return Array.from(this.generalSkills.values());
  }

  getTaskSpecificSkills(taskType) {
    if (!taskType || !this.taskSpecificSkills.has(taskType)) {
      return [];
    }
    return Array.from(this.taskSpecificSkills.get(taskType).values());
  }

  getSkill(skillName, taskType = null) {
    if (this.generalSkills.has(skillName)) {
      return this.generalSkills.get(skillName);
    }

    if (taskType && this.taskSpecificSkills.has(taskType)) {
      const taskSkills = this.taskSpecificSkills.get(taskType);
      if (taskSkills.has(skillName)) {
        return taskSkills.get(skillName);
      }
    }

    for (const taskSkills of this.taskSpecificSkills.values()) {
      if (taskSkills.has(skillName)) {
        return taskSkills.get(skillName);
      }
    }

    return null;
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
