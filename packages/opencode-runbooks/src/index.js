'use strict';

const runbooksData = require('./runbooks.json');
const { remedies } = require('./remedies');

/**
 * Runbooks — pluginized auto-remediation based on error signatures.
 *
 * Usage:
 *   const { Runbooks } = require('opencode-runbooks');
 *   const rb = new Runbooks();
 *   const match = rb.matchError('MCP command unavailable');
 *   const remedy = rb.getRemedy(match.id);
 *   const result = rb.executeRemedy(match.id, { mcpName: 'supermemory' });
 */
class Runbooks {
  /**
   * @param {object} [options]
   * @param {object} [options.customPatterns] - Additional patterns to merge (same schema as runbooks.json patterns)
   * @param {object} [options.customRemedies] - Additional remedy functions { name: fn(ctx) }
   */
  constructor(options = {}) {
    this.patterns = { ...runbooksData.patterns };
    this.remedies = { ...remedies };

    // Merge custom patterns
    if (options.customPatterns) {
      for (const [id, pattern] of Object.entries(options.customPatterns)) {
        this.patterns[id] = { id, ...pattern };
      }
    }

    // Merge custom remedies
    if (options.customRemedies) {
      Object.assign(this.remedies, options.customRemedies);
    }

    // Pre-build keyword index for fast matching
    this._keywordIndex = this._buildKeywordIndex();
  }

  /**
   * Build an inverted index: keyword -> [pattern_id, ...]
   * @private
   */
  _buildKeywordIndex() {
    const index = new Map();
    for (const [id, pattern] of Object.entries(this.patterns)) {
      for (const keyword of pattern.keywords) {
        const lower = keyword.toLowerCase();
        if (!index.has(lower)) index.set(lower, []);
        index.get(lower).push(id);
      }
    }
    return index;
  }

  /**
   * Normalize an error input into a searchable string.
   * Accepts: string, Error object, or { message, code, ... } object.
   * @private
   */
  _normalizeError(error) {
    if (typeof error === 'string') return error.toLowerCase();
    if (error instanceof Error) return `${error.message} ${error.code || ''}`.toLowerCase();
    if (error && typeof error === 'object') {
      const parts = [error.message, error.code, error.error, error.statusCode, error.status];
      return parts.filter(Boolean).join(' ').toLowerCase();
    }
    return String(error).toLowerCase();
  }

  /**
   * Match an error against known patterns using fuzzy keyword matching.
   * Returns the best matching pattern or null.
   *
   * @param {string|Error|object} error - Error to match
   * @returns {{ id: string, score: number, pattern: object } | null}
   */
  matchError(error) {
    const normalized = this._normalizeError(error);
    const scores = {};

    // Score each pattern by keyword hits
    for (const [keyword, patternIds] of this._keywordIndex) {
      if (normalized.includes(keyword)) {
        for (const id of patternIds) {
          // Weight by keyword length (longer keywords = more specific = higher score)
          const weight = keyword.length >= 6 ? 3 : keyword.length >= 3 ? 2 : 1;
          scores[id] = (scores[id] || 0) + weight;
        }
      }
    }

    // Also do direct ID match (e.g., error code "RATE_LIMIT" in the string)
    for (const id of Object.keys(this.patterns)) {
      if (normalized.includes(id.toLowerCase())) {
        scores[id] = (scores[id] || 0) + 10; // Strong bonus for direct ID match
      }
    }

    if (Object.keys(scores).length === 0) return null;

    // Find the best match
    const bestId = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
    const pattern = this.patterns[bestId];

    // Calculate confidence: score relative to total possible keywords for this pattern
    const maxPossible = pattern.keywords.reduce(
      (sum, kw) => sum + (kw.length >= 6 ? 3 : kw.length >= 3 ? 2 : 1),
      0
    );
    const confidence = Math.min(1, scores[bestId] / maxPossible);

    return {
      id: bestId,
      score: scores[bestId],
      confidence,
      pattern,
    };
  }

  /**
   * Match all patterns that exceed a minimum score threshold.
   *
   * @param {string|Error|object} error - Error to match
   * @param {number} [minScore=2] - Minimum score to include
   * @returns {Array<{ id: string, score: number, pattern: object }>}
   */
  matchAll(error, minScore = 2) {
    const normalized = this._normalizeError(error);
    const scores = {};

    for (const [keyword, patternIds] of this._keywordIndex) {
      if (normalized.includes(keyword)) {
        for (const id of patternIds) {
          const weight = keyword.length >= 6 ? 3 : keyword.length >= 3 ? 2 : 1;
          scores[id] = (scores[id] || 0) + weight;
        }
      }
    }

    for (const id of Object.keys(this.patterns)) {
      if (normalized.includes(id.toLowerCase())) {
        scores[id] = (scores[id] || 0) + 10;
      }
    }

    return Object.entries(scores)
      .filter(([, score]) => score >= minScore)
      .sort((a, b) => b[1] - a[1])
      .map(([id, score]) => ({
        id,
        score,
        pattern: this.patterns[id],
      }));
  }

  /**
   * Get the remedy details for a known error ID.
   *
   * @param {string} errorId - Error pattern ID (e.g., 'MCP_NOT_FOUND')
   * @returns {{ id: string, remedy: string, instructions: string, description: string, severity: string, hasExecutor: boolean } | null}
   */
  getRemedy(errorId) {
    const pattern = this.patterns[errorId];
    if (!pattern) return null;

    return {
      id: pattern.id,
      remedy: pattern.remedy,
      instructions: pattern.instructions,
      description: pattern.description,
      severity: pattern.severity,
      message: pattern.message,
      hasExecutor: typeof this.remedies[pattern.remedy] === 'function',
    };
  }

  /**
   * Execute a remedy function for a given error ID.
   * Returns the remedy result (action + instructions), never auto-fixes without consent.
   *
   * @param {string} errorId - Error pattern ID
   * @param {object} [context={}] - Context to pass to the remedy function
   * @returns {{ action: string, status: string, details: object } | { action: 'error', status: 'no_remedy', details: object }}
   */
  executeRemedy(errorId, context = {}) {
    const pattern = this.patterns[errorId];
    if (!pattern) {
      return {
        action: 'error',
        status: 'unknown_error_id',
        details: { errorId, message: `No pattern found for error ID '${errorId}'.` },
      };
    }

    const remedyFn = this.remedies[pattern.remedy];
    if (typeof remedyFn !== 'function') {
      return {
        action: 'error',
        status: 'no_executor',
        details: {
          errorId,
          remedyName: pattern.remedy,
          message: `No executor function for remedy '${pattern.remedy}'. Manual instructions: ${pattern.instructions}`,
        },
      };
    }

    try {
      return remedyFn(context);
    } catch (err) {
      return {
        action: 'error',
        status: 'execution_failed',
        details: {
          errorId,
          remedyName: pattern.remedy,
          error: err.message,
          message: `Remedy execution failed. Fallback: ${pattern.instructions}`,
        },
      };
    }
  }

  /**
   * Convenience: match an error and execute the best remedy in one call.
   *
   * @param {string|Error|object} error - Error to diagnose
   * @param {object} [context={}] - Context for the remedy
   * @returns {{ match: object|null, remedy: object|null, result: object|null }}
   */
  diagnose(error, context = {}) {
    const match = this.matchError(error);
    if (!match) {
      return { match: null, remedy: null, result: null };
    }

    const remedy = this.getRemedy(match.id);
    const result = this.executeRemedy(match.id, context);

    return { match, remedy, result };
  }

  /**
   * List all registered error patterns.
   * @returns {Array<{ id: string, message: string, severity: string, remedy: string }>}
   */
  listPatterns() {
    return Object.values(this.patterns).map((p) => ({
      id: p.id,
      message: p.message,
      severity: p.severity,
      remedy: p.remedy,
    }));
  }

  /**
   * Register a new error pattern at runtime.
   *
   * @param {string} id - Unique error pattern ID
   * @param {object} pattern - { keywords, message, severity, remedy, description, instructions }
   * @param {function} [remedyFn] - Optional remedy executor function
   */
  registerPattern(id, pattern, remedyFn) {
    this.patterns[id] = { id, ...pattern };
    if (remedyFn) {
      this.remedies[pattern.remedy || id] = remedyFn;
    }
    // Rebuild index
    this._keywordIndex = this._buildKeywordIndex();
  }
}

module.exports = { Runbooks };
