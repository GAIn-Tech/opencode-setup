/**
 * opencode-learning-engine
 *
 * Learns from opencode sessions to improve orchestration decisions.
 * HEAVILY weighted toward anti-pattern detection and avoidance.
 *
 * Architecture:
 *   AntiPatternCatalog    — Tracks failures (STRONG warnings)
 *   PositivePatternTracker — Tracks successes (SOFT suggestions)
 *   PatternExtractor       — Parses session logs to find patterns
 *   OrchestrationAdvisor   — Combines patterns into actionable advice
 *   LearningEngine         — Unified API wrapping all components
 */

const { AntiPatternCatalog, VALID_TYPES: ANTI_PATTERN_TYPES, SEVERITY_WEIGHTS } = require('./anti-patterns');
const { PositivePatternTracker, VALID_TYPES: POSITIVE_PATTERN_TYPES } = require('./positive-patterns');
const { PatternExtractor } = require('./pattern-extractor');
const { OrchestrationAdvisor, AGENT_CAPABILITIES, SKILL_AFFINITY } = require('./orchestration-advisor');

class LearningEngine {
  /**
   * @param {Object} [options]
   * @param {boolean} [options.autoLoad=true] - Load persisted data on construction
   * @param {boolean} [options.autoSave=true] - Auto-save after mutations
   */
  constructor(options = {}) {
    const { autoLoad = true, autoSave = true } = options;

    this.antiPatterns = new AntiPatternCatalog();
    this.positivePatterns = new PositivePatternTracker();
    this.extractor = new PatternExtractor();
    this.advisor = new OrchestrationAdvisor(this.antiPatterns, this.positivePatterns);

    this.autoSave = autoSave;
    this.sessionLog = []; // Track which sessions have been ingested

    if (autoLoad) {
      this.load();
    }
  }

  // ===== SESSION INGESTION =====

  /**
   * Ingest a single session's logs, extracting and storing patterns.
   * @param {string} sessionId
   * @returns {{ anti_patterns_found: number, positive_patterns_found: number, session_id: string }}
   */
  ingestSession(sessionId) {
    const result = this.extractor.extractFromSession(sessionId);

    if (result.error) {
      return {
        session_id: sessionId,
        error: result.error,
        anti_patterns_found: 0,
        positive_patterns_found: 0,
      };
    }

    // Store extracted anti-patterns (HEAVILY weighted)
    for (const ap of result.anti_patterns) {
      this.antiPatterns.addAntiPattern(ap);
    }

    // Store extracted positive patterns
    for (const pp of result.positive_patterns) {
      this.positivePatterns.addPositivePattern(pp);
    }

    this.sessionLog.push({
      session_id: sessionId,
      ingested_at: new Date().toISOString(),
      anti_patterns_found: result.anti_patterns.length,
      positive_patterns_found: result.positive_patterns.length,
      message_count: result.message_count,
    });

    if (this.autoSave) {
      this.save();
    }

    return {
      session_id: sessionId,
      anti_patterns_found: result.anti_patterns.length,
      positive_patterns_found: result.positive_patterns.length,
      message_count: result.message_count,
    };
  }

  /**
   * Ingest all available sessions.
   * Also runs cross-session analysis (repeated_mistake detection).
   * @returns {{ sessions_analyzed: number, total_anti: number, total_positive: number, cross_session: number }}
   */
  ingestAllSessions() {
    const fullResult = this.extractor.extractFromAllSessions();

    // Store all patterns
    for (const session of fullResult.sessions) {
      for (const ap of session.anti_patterns) {
        this.antiPatterns.addAntiPattern(ap);
      }
      for (const pp of session.positive_patterns) {
        this.positivePatterns.addPositivePattern(pp);
      }
    }

    // Cross-session anti-patterns (repeated_mistake)
    for (const csap of fullResult.cross_session_anti_patterns) {
      this.antiPatterns.addAntiPattern(csap);
    }

    this.sessionLog.push({
      type: 'bulk_ingest',
      ingested_at: new Date().toISOString(),
      sessions_analyzed: fullResult.sessions_analyzed,
      total_anti: fullResult.total_anti_patterns,
      total_positive: fullResult.total_positive_patterns,
    });

    if (this.autoSave) {
      this.save();
    }

    return {
      sessions_analyzed: fullResult.sessions_analyzed,
      total_anti: fullResult.total_anti_patterns,
      total_positive: fullResult.total_positive_patterns,
      cross_session: fullResult.cross_session_anti_patterns.length,
    };
  }

  // ===== ADVISE =====

  /**
   * Get orchestration advice for a task context.
   * Combines anti-pattern warnings (STRONG) with positive suggestions (SOFT).
   *
   * @param {Object} taskContext - See OrchestrationAdvisor.advise()
   * @returns {Object} Advice with warnings, suggestions, routing, risk_score
   */
  advise(taskContext) {
    return this.advisor.advise(taskContext);
  }

  /**
   * Record the outcome of a previously advised task.
   * @param {string} adviceId
   * @param {Object} outcome - { success, description, tokens_used, time_taken_ms, failure_reason }
   */
  learnFromOutcome(adviceId, outcome) {
    const result = this.advisor.learnFromOutcome(adviceId, outcome);
    if (this.autoSave) {
      this.save();
    }
    return result;
  }

  // ===== DIRECT PATTERN ACCESS =====

  /**
   * Manually add an anti-pattern.
   * @param {Object} pattern - { type, description, severity, context }
   */
  addAntiPattern(pattern) {
    const result = this.antiPatterns.addAntiPattern(pattern);
    if (this.autoSave) this.save();
    return result;
  }

  /**
   * Manually add a positive pattern.
   * @param {Object} pattern - { type, description, success_rate, context }
   */
  addPositivePattern(pattern) {
    const result = this.positivePatterns.addPositivePattern(pattern);
    if (this.autoSave) this.save();
    return result;
  }

  // ===== REPORTING =====

  /**
   * Get a comprehensive report of all learned patterns and insights.
   */
  getReport() {
    const insights = this.advisor.getInsights();
    const antiStats = this.antiPatterns.getStats();
    const posStats = this.positivePatterns.getStats();

    return {
      engine_version: '1.0.0',
      generated_at: new Date().toISOString(),
      sessions_ingested: this.sessionLog.length,
      anti_patterns: {
        total: antiStats.total,
        by_type: antiStats.by_type,
        by_severity: antiStats.by_severity,
        total_weight: antiStats.total_weight,
        hotspots: antiStats.most_frequent,
        top_severe: this.antiPatterns.getSevere('high').slice(0, 5).map((p) => ({
          type: p.type,
          description: p.description,
          severity: p.severity,
          occurrences: p.occurrences,
        })),
      },
      positive_patterns: {
        total: posStats.total,
        by_type: posStats.by_type,
        avg_success_rate: posStats.avg_success_rate,
        top_strategies: posStats.top_strategies,
      },
      insights: insights.summary,
      outcome_tracking: insights.outcome_tracking,
      recommendations: insights.recommendations,
      asymmetry_note:
        'Anti-pattern data is weighted 3-5x heavier than positive patterns. ' +
        'Warnings are STRONG (should block/pause). Suggestions are SOFT (can ignore).',
    };
  }

  // ===== PERSISTENCE =====

  /**
   * Save all state to disk.
   */
  save() {
    this.antiPatterns.save();
    this.positivePatterns.save();
  }

  /**
   * Load persisted state from disk.
   */
  load() {
    // AntiPatternCatalog and PositivePatternTracker auto-load in constructor
    // This method is for explicit reload
    this.antiPatterns._load();
    this.positivePatterns._load();
  }
}

// ===== EXPORTS =====

module.exports = {
  LearningEngine,
  AntiPatternCatalog,
  PositivePatternTracker,
  PatternExtractor,
  OrchestrationAdvisor,
  // Constants
  ANTI_PATTERN_TYPES,
  POSITIVE_PATTERN_TYPES,
  SEVERITY_WEIGHTS,
  AGENT_CAPABILITIES,
  SKILL_AFFINITY,
};
