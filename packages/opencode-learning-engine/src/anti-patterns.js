/**
 * AntiPatternCatalog — Heavily weighted anti-pattern tracking for opencode sessions.
 *
 * Types: failed_debug, inefficient_solution, repeated_mistake, wrong_tool,
 *        type_suppression, shotgun_debug, broken_state
 *
 * Persists to ~/.opencode/learning/anti-patterns.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Optional dependency — fail-open if hyper-param registry package is unavailable.
let HyperParameterRegistry;
try {
  ({ HyperParameterRegistry } = require('opencode-hyper-param-learner'));
} catch {
  HyperParameterRegistry = null;
}

const PERSIST_DIR = path.join(os.homedir(), '.opencode', 'learning');
const PERSIST_FILE = path.join(PERSIST_DIR, 'anti-patterns.json');

const VALID_TYPES = [
  'failed_debug',
  'inefficient_solution',
  'repeated_mistake',
  'wrong_tool',
  'type_suppression',
  'shotgun_debug',
  'broken_state',
  'quota_exhaustion_risk',
];

// Severity weights — anti-patterns are HEAVILY weighted.
// NOTE: Runtime may override these via HyperParameterRegistry (fail-open).
const SEVERITY_WEIGHTS = {
  critical: 10,
  high: 7,
  medium: 4,
  low: 2,
  info: 1,
};

const SEVERITY_WEIGHT_BOUNDS = {
  soft: { min: 1, max: 15 },
  hard: { min: 0.5, max: 20 },
};

function clampNumber(value, min, max, fallback = min) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

class AntiPatternCatalog {
  /**
   * @param {Object} options - Constructor options
   * @param {boolean} options.skipLoad - Skip loading from disk (for testing)
   */
  constructor(options = {}) {
    this.patterns = [];
    this.index = { byType: {}, bySession: {}, bySeverity: {} };

    // Hyper-parameter registry integration (Task 4: hyper-param-learning-system).
    // Fail-open: if registry cannot be constructed/loaded, defaults are used.
    this.hyperParams = null;
    this._initSeverityWeightRegistry();

    if (!options.skipLoad) {
      this._load();
    }
  }

  _initSeverityWeightRegistry() {
    if (!HyperParameterRegistry) return;

    try {
      this.hyperParams = new HyperParameterRegistry();
    } catch {
      this.hyperParams = null;
      return;
    }

    // Register learnable parameters (per task_type grouping) if missing.
    // Name format: severity_weight_{severity}
    for (const [severity, defaultWeight] of Object.entries(SEVERITY_WEIGHTS)) {
      const name = `severity_weight_${severity}`;

      try {
        if (!this.hyperParams.has(name)) {
          this.hyperParams.register({
            name,
            current_value: clampNumber(
              defaultWeight,
              SEVERITY_WEIGHT_BOUNDS.hard.min,
              SEVERITY_WEIGHT_BOUNDS.hard.max
            ),
            learning_config: {
              adaptation_strategy: 'ema',
              triggers: {
                outcome_type: 'failure',
                min_samples: 10,
                confidence_threshold: 0.8,
              },
              bounds: {
                soft: { ...SEVERITY_WEIGHT_BOUNDS.soft },
                hard: { ...SEVERITY_WEIGHT_BOUNDS.hard },
              },
              exploration_policy: {
                enabled: false,
                epsilon: 0,
                annealing_rate: 0,
              },
            },
            grouping: {
              group_by_task_type: true,
              group_by_complexity: false,
              aggregate_function: 'mean',
            },
            individual_tracking: {
              per_session: false,
              per_task: true,
            },
          });
        }
      } catch {
        // Fail-open: registry may be readonly or validate may fail; keep defaults.
      }
    }
  }

  _getSeverityWeight(severity) {
    const defaultWeight = SEVERITY_WEIGHTS[severity];
    if (!defaultWeight) return SEVERITY_WEIGHTS.medium;

    if (!this.hyperParams) return defaultWeight;

    try {
      const param = this.hyperParams.get(`severity_weight_${severity}`);
      const raw = param && typeof param.current_value === 'number' ? param.current_value : defaultWeight;
      const clamped = clampNumber(
        raw,
        SEVERITY_WEIGHT_BOUNDS.hard.min,
        SEVERITY_WEIGHT_BOUNDS.hard.max,
        defaultWeight
      );

      if (clamped !== raw && process.env.DEBUG) {
        console.warn(
          `[AntiPatternCatalog] Clamped severity weight for ${severity}: ${raw} → ${clamped}`
        );
      }

      return clamped;
    } catch {
      return defaultWeight;
    }
  }

  /**
   * Add an anti-pattern to the catalog.
   * @param {Object} pattern
   * @param {string} pattern.type - One of VALID_TYPES
   * @param {string} pattern.description - Human-readable description
   * @param {string} pattern.severity - critical | high | medium | low | info
   * @param {Object} pattern.context - Freeform context (session_id, files, tokens, etc.)
   * @returns {Object} The stored pattern with id and timestamp
   */
  addAntiPattern({ type, description, severity = 'medium', context = {} }) {
    if (!VALID_TYPES.includes(type)) {
      throw new Error(
        `Invalid anti-pattern type "${type}". Must be one of: ${VALID_TYPES.join(', ')}`
      );
    }
    if (!description || typeof description !== 'string') {
      throw new Error('description is required and must be a string');
    }
    if (!SEVERITY_WEIGHTS[severity]) {
      throw new Error(
        `Invalid severity "${severity}". Must be one of: ${Object.keys(SEVERITY_WEIGHTS).join(', ')}`
      );
    }

    const entry = {
      id: `ap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      description,
      severity,
      weight: this._getSeverityWeight(severity),
      context: { ...context },
      timestamp: new Date().toISOString(),
      occurrences: 1,
    };

    // Check for duplicate/similar patterns — merge if close match
    const existing = this._findSimilar(entry);
    if (existing) {
      existing.occurrences += 1;
      existing.weight = Math.min(existing.weight + this._getSeverityWeight(severity) * 0.5, 50);
      existing.last_seen = entry.timestamp;
      existing.contexts = existing.contexts || [existing.context];
      existing.contexts.push(context);
      // Cap stored contexts at 10 to avoid unbounded growth
      if (existing.contexts.length > 10) {
        existing.contexts = existing.contexts.slice(-10);
      }
      this._rebuildIndex();
      this.save();
      return existing;
    }

    this.patterns.push(entry);
    this._addToIndex(entry);
    this.save();
    return entry;
  }

  /**
   * Get anti-patterns, optionally filtered.
   * @param {Object} [filter]
   * @param {string} [filter.type]
   * @param {string} [filter.severity]
   * @param {string} [filter.session_id]
   * @param {string} [filter.since] - ISO date string
   * @returns {Object[]}
   */
  getAntiPatterns(filter = {}) {
    let results = [...this.patterns];

    if (filter.type) {
      results = results.filter((p) => p.type === filter.type);
    }
    if (filter.severity) {
      results = results.filter((p) => p.severity === filter.severity);
    }
    if (filter.session_id) {
      results = results.filter(
        (p) => p.context && p.context.session_id === filter.session_id
      );
    }
    if (filter.since) {
      const since = new Date(filter.since).getTime();
      results = results.filter((p) => new Date(p.timestamp).getTime() >= since);
    }

    // Always sort by weight descending (anti-patterns are HEAVILY weighted)
    return results.sort((a, b) => b.weight - a.weight);
  }

  /**
   * Get the most frequently occurring anti-patterns.
   * @param {number} [topN=10]
   * @returns {Object[]}
   */
  getFrequent(topN = 10) {
    return [...this.patterns]
      .sort((a, b) => {
        // Primary: occurrences, Secondary: weight
        if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
        return b.weight - a.weight;
      })
      .slice(0, topN);
  }

  /**
   * Get anti-patterns at or above a minimum severity.
   * @param {string} [minSeverity='medium']
   * @returns {Object[]}
   */
  getSevere(minSeverity = 'medium') {
    const minWeight = this._getSeverityWeight(minSeverity) || 4;
    return this.patterns
      .filter((p) => this._getSeverityWeight(p.severity) >= minWeight)
      .sort((a, b) => b.weight - a.weight);
  }

  /**
   * Check if a proposed action matches a known anti-pattern.
   * Returns warnings if the context resembles known failures.
   *
   * @param {Object} context - Current action context
   * @param {string} [context.action] - What the agent is about to do
   * @param {string} [context.tool] - Tool being used
   * @param {string[]} [context.files] - Files being touched
   * @param {string} [context.error_type] - Error being addressed
   * @param {number} [context.attempt_number] - Which attempt this is
   * @returns {{ should_warn: boolean, warnings: Object[], risk_score: number }}
   */
  shouldWarn(context = {}) {
    const warnings = [];
    let riskScore = 0;

    for (const pattern of this.patterns) {
      let matchScore = 0;

      // Check for shotgun_debug: multiple edits to same file
      if (
        pattern.type === 'shotgun_debug' &&
        context.attempt_number &&
        context.attempt_number >= 3
      ) {
        matchScore += 3 * pattern.weight;
      }

      // Check for repeated_mistake: same error type recurring
      if (
        pattern.type === 'repeated_mistake' &&
        context.error_type &&
        pattern.context.error_type === context.error_type
      ) {
        matchScore += 4 * pattern.weight;
      }

      // Check for wrong_tool: tool mismatch
      if (
        pattern.type === 'wrong_tool' &&
        context.tool &&
        pattern.context.tool === context.tool &&
        pattern.context.task_type === context.task_type
      ) {
        matchScore += 2 * pattern.weight;
      }

      // Check for type_suppression: ignoring type errors
      if (
        pattern.type === 'type_suppression' &&
        context.action &&
        (context.action.includes('any') ||
          context.action.includes('ignore') ||
          context.action.includes('suppress') ||
          context.action.includes('ts-ignore'))
      ) {
        matchScore += 5 * pattern.weight;
      }

      // Check for broken_state: not verifying build after changes
      if (
        pattern.type === 'broken_state' &&
        context.files &&
        pattern.context.files &&
        context.files.some((f) =>
          pattern.context.files.some(
            (pf) =>
              f === pf || path.dirname(f) === path.dirname(pf)
          )
        )
      ) {
        matchScore += 2 * pattern.weight;
      }

      // Check for inefficient_solution: high token burn
      if (
        pattern.type === 'inefficient_solution' &&
        context.task_type &&
        pattern.context.task_type === context.task_type
      ) {
        matchScore += 1.5 * pattern.weight;
      }

      // Boost by occurrences — repeated anti-patterns are LOUDER warnings
      matchScore *= 1 + Math.log2(pattern.occurrences || 1);

      if (matchScore > 0) {
        riskScore += matchScore;
        warnings.push({
          pattern_id: pattern.id,
          type: pattern.type,
          description: pattern.description,
          severity: pattern.severity,
          match_score: Math.round(matchScore * 100) / 100,
          advice: this._generateAdvice(pattern, context),
          // Attribution for discriminative routing penalties
          context: {
            modelId: context?.modelId || null,
            provider: context?.provider || null,
            tool: context?.tool || null,
            sessionId: context?.sessionId || null,
          },
        });
      }
    }

    // Sort warnings by match_score descending
    warnings.sort((a, b) => b.match_score - a.match_score);

    return {
      should_warn: riskScore > 5,
      warnings: warnings.slice(0, 10), // Top 10 warnings max
      risk_score: Math.round(riskScore * 100) / 100,
    };
  }

  /**
   * Get summary statistics.
   */
  getStats() {
    const byType = {};
    const bySeverity = {};
    let totalWeight = 0;

    for (const p of this.patterns) {
      byType[p.type] = (byType[p.type] || 0) + 1;
      bySeverity[p.severity] = (bySeverity[p.severity] || 0) + 1;
      totalWeight += p.weight;
    }

    return {
      total: this.patterns.length,
      by_type: byType,
      by_severity: bySeverity,
      total_weight: totalWeight,
      avg_weight: this.patterns.length
        ? Math.round((totalWeight / this.patterns.length) * 100) / 100
        : 0,
      most_frequent: this.getFrequent(3).map((p) => ({
        type: p.type,
        occurrences: p.occurrences,
        description: p.description,
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
      const tempFile = `${PERSIST_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tempFile, PERSIST_FILE);
    } catch (err) {
      // Silently fail on write errors — don't break the agent
      if (process.env.DEBUG) {
        console.error('[AntiPatternCatalog] save error:', err.message);
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
        this._rebuildIndex();
      }
    } catch (err) {
      // Backup corrupted file before resetting
      if (fs.existsSync(PERSIST_FILE)) {
        const backupPath = PERSIST_FILE + '.backup.' + Date.now();
        try {
          fs.copyFileSync(PERSIST_FILE, backupPath);
          console.warn(`[AntiPatternCatalog] Corrupted file backed up to: ${backupPath}`);
        } catch (backupErr) {
          console.error('[AntiPatternCatalog] Failed to backup corrupted file:', backupErr.message);
        }
      }
      this.patterns = [];
      // Note: this class doesn't extend EventEmitter, so emit is replaced with console.warn
      console.warn('[AntiPatternCatalog] Failed to load patterns, reset to empty:', err.message);
      if (process.env.DEBUG) {
        console.error('[AntiPatternCatalog] load error:', err.message);
      }
    }
  }

  _addToIndex(entry) {
    // By type
    if (!this.index.byType[entry.type]) this.index.byType[entry.type] = [];
    this.index.byType[entry.type].push(entry.id);
    // By severity
    if (!this.index.bySeverity[entry.severity])
      this.index.bySeverity[entry.severity] = [];
    this.index.bySeverity[entry.severity].push(entry.id);
    // By session
    if (entry.context && entry.context.session_id) {
      const sid = entry.context.session_id;
      if (!this.index.bySession[sid]) this.index.bySession[sid] = [];
      this.index.bySession[sid].push(entry.id);
    }
  }

  _rebuildIndex() {
    this.index = { byType: {}, bySession: {}, bySeverity: {} };
    for (const entry of this.patterns) {
      this._addToIndex(entry);
    }
  }

  _findSimilar(entry) {
    return this.patterns.find(
      (p) =>
        p.type === entry.type &&
        p.description === entry.description &&
        p.severity === entry.severity
    );
  }

  _generateAdvice(pattern, context) {
    const adviceMap = {
      shotgun_debug:
        'STOP. Read the error carefully. Use systematic debugging (binary search, logging) instead of random edits.',
      failed_debug:
        'Previous debug attempt failed in similar context. Consider a different approach entirely.',
      repeated_mistake:
        `This mistake has occurred ${pattern.occurrences} time(s). Establish a checklist or automated check.`,
      wrong_tool:
        `Tool "${pattern.context.tool}" was ineffective for this task type before. Consider alternatives.`,
      type_suppression:
        'Do NOT suppress type errors. Fix the root cause. @ts-ignore and `any` are technical debt.',
      inefficient_solution:
        'Similar task was solved inefficiently before. Look for existing patterns or libraries first.',
      broken_state:
        'Previous changes to this area left build broken. Run verification BEFORE and AFTER changes.',
      quota_exhaustion_risk:
        'Provider quota is near critical levels. Use quota-aware-routing and consider less expensive providers.',
    };
    return adviceMap[pattern.type] || 'Review past failures before proceeding.';
  }
}

module.exports = { AntiPatternCatalog, VALID_TYPES, SEVERITY_WEIGHTS };
