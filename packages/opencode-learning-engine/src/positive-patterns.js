/**
 * PositivePatternTracker — Tracks successful strategies and recommends them.
 *
 * Types: efficient_debug, creative_solution, good_delegation, clean_refactor, fast_resolution
 *
 * Persists to ~/.opencode/learning/positive-patterns.json
 *
 * NOTE: Positive patterns are SOFT suggestions. Anti-patterns are STRONG warnings.
 * This asymmetry is intentional — avoiding failure matters more than repeating success.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PERSIST_DIR = path.join(os.homedir(), '.opencode', 'learning');
const PERSIST_FILE = path.join(PERSIST_DIR, 'positive-patterns.json');

const VALID_TYPES = [
  'efficient_debug',
  'creative_solution',
  'good_delegation',
  'clean_refactor',
  'fast_resolution',
];

class PositivePatternTracker {
  constructor() {
    this.patterns = [];
    this._load();
  }

  /**
   * Record a successful pattern.
   * @param {Object} pattern
   * @param {string} pattern.type - One of VALID_TYPES
   * @param {string} pattern.description - What worked
   * @param {number} [pattern.success_rate=1.0] - 0.0–1.0 confidence
   * @param {Object} [pattern.context] - Task context (task_type, files, agent, etc.)
   * @returns {Object} Stored pattern
   */
  addPositivePattern({ type, description, success_rate = 1.0, context = {} }) {
    if (!VALID_TYPES.includes(type)) {
      throw new Error(
        `Invalid positive pattern type "${type}". Must be one of: ${VALID_TYPES.join(', ')}`
      );
    }
    if (!description || typeof description !== 'string') {
      throw new Error('description is required and must be a string');
    }

    const rate = Math.max(0, Math.min(1, Number(success_rate) || 1.0));

    // Merge with existing similar pattern
    const existing = this._findSimilar(type, description);
    if (existing) {
      existing.occurrences += 1;
      // Rolling average of success rate
      existing.success_rate =
        (existing.success_rate * (existing.occurrences - 1) + rate) /
        existing.occurrences;
      existing.success_rate =
        Math.round(existing.success_rate * 1000) / 1000;
      existing.last_seen = new Date().toISOString();
      existing.contexts = existing.contexts || [existing.context];
      existing.contexts.push(context);
      if (existing.contexts.length > 10) {
        existing.contexts = existing.contexts.slice(-10);
      }
      this.save();
      return existing;
    }

    const entry = {
      id: `pp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      description,
      success_rate: rate,
      context: { ...context },
      timestamp: new Date().toISOString(),
      occurrences: 1,
    };

    this.patterns.push(entry);
    this.save();
    return entry;
  }

  /**
   * Get recommendations for a given task context.
   * Returns positive patterns sorted by relevance to the task.
   *
   * @param {Object} taskContext
   * @param {string} [taskContext.task_type] - debug, refactor, feature, etc.
   * @param {string[]} [taskContext.files] - Files involved
   * @param {string} [taskContext.agent] - Agent being used
   * @param {string[]} [taskContext.skills] - Skills loaded
   * @returns {Object[]} Ranked recommendations (SOFT suggestions)
   */
  getRecommendations(taskContext = {}) {
    const scored = this.patterns.map((p) => {
      let relevance = 0;

      // Task type match
      if (
        taskContext.task_type &&
        p.context &&
        p.context.task_type === taskContext.task_type
      ) {
        relevance += 3;
      }

      // Type → task_type affinity
      const typeAffinity = {
        efficient_debug: ['debug', 'fix', 'bugfix'],
        creative_solution: ['feature', 'design', 'architecture'],
        good_delegation: ['complex', 'multi-step', 'parallel'],
        clean_refactor: ['refactor', 'cleanup', 'reorganize'],
        fast_resolution: ['quick', 'trivial', 'hotfix'],
      };

      if (
        taskContext.task_type &&
        typeAffinity[p.type] &&
        typeAffinity[p.type].includes(taskContext.task_type)
      ) {
        relevance += 2;
      }

      // File overlap
      if (taskContext.files && p.context && p.context.files) {
        const overlap = taskContext.files.filter((f) =>
          p.context.files.some(
            (pf) =>
              f === pf ||
              path.dirname(f) === path.dirname(pf) ||
              path.extname(f) === path.extname(pf)
          )
        ).length;
        relevance += overlap * 0.5;
      }

      // Agent match
      if (
        taskContext.agent &&
        p.context &&
        p.context.agent === taskContext.agent
      ) {
        relevance += 1;
      }

      // Weight by success rate and occurrences
      const score =
        relevance * p.success_rate * (1 + Math.log2(p.occurrences || 1));

      return { ...p, relevance_score: Math.round(score * 100) / 100 };
    });

    return scored
      .filter((p) => p.relevance_score > 0)
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, 5); // Top 5 soft suggestions
  }

  /**
   * Get the best strategies for a specific task type.
   * @param {string} taskType
   * @param {number} [topN=5]
   * @returns {Object[]}
   */
  getTopStrategies(taskType, topN = 5) {
    return this.patterns
      .filter(
        (p) =>
          (p.context && p.context.task_type === taskType) ||
          this._typeMatchesTask(p.type, taskType)
      )
      .sort((a, b) => {
        // Primary: success_rate, Secondary: occurrences
        const scoreA = a.success_rate * (1 + Math.log2(a.occurrences || 1));
        const scoreB = b.success_rate * (1 + Math.log2(b.occurrences || 1));
        return scoreB - scoreA;
      })
      .slice(0, topN);
  }

  /**
   * Get summary statistics.
   */
  getStats() {
    const byType = {};
    let totalSuccessRate = 0;

    for (const p of this.patterns) {
      byType[p.type] = (byType[p.type] || 0) + 1;
      totalSuccessRate += p.success_rate;
    }

    return {
      total: this.patterns.length,
      by_type: byType,
      avg_success_rate: this.patterns.length
        ? Math.round((totalSuccessRate / this.patterns.length) * 1000) / 1000
        : 0,
      top_strategies: this.patterns
        .sort((a, b) => b.success_rate * b.occurrences - a.success_rate * a.occurrences)
        .slice(0, 3)
        .map((p) => ({
          type: p.type,
          description: p.description,
          success_rate: p.success_rate,
          occurrences: p.occurrences,
        })),
    };
  }

  // --- Persistence ---

  save() {
    try {
      fs.mkdirSync(PERSIST_DIR, { recursive: true });
      const data = {
        version: '1.0.0',
        updated_at: new Date().toISOString(),
        count: this.patterns.length,
        patterns: this.patterns,
      };
      fs.writeFileSync(PERSIST_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      if (process.env.DEBUG) {
        console.error('[PositivePatternTracker] save error:', err.message);
      }
    }
  }

  // --- Private ---

  _load() {
    try {
      if (fs.existsSync(PERSIST_FILE)) {
        const raw = fs.readFileSync(PERSIST_FILE, 'utf8');
        const data = JSON.parse(raw);
        this.patterns = Array.isArray(data.patterns) ? data.patterns : [];
      }
    } catch (err) {
      this.patterns = [];
      if (process.env.DEBUG) {
        console.error('[PositivePatternTracker] load error:', err.message);
      }
    }
  }

  _findSimilar(type, description) {
    return this.patterns.find(
      (p) => p.type === type && p.description === description
    );
  }

  _typeMatchesTask(patternType, taskType) {
    const map = {
      efficient_debug: ['debug', 'fix', 'bugfix'],
      creative_solution: ['feature', 'design'],
      good_delegation: ['complex', 'multi-step'],
      clean_refactor: ['refactor', 'cleanup'],
      fast_resolution: ['quick', 'trivial', 'hotfix'],
    };
    return (map[patternType] || []).includes(taskType);
  }
}

module.exports = { PositivePatternTracker, VALID_TYPES };
