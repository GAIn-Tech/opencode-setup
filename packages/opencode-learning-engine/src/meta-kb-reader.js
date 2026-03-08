'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Default path to the meta-knowledge index, relative to repo root.
 * Resolved from this file's location: src/ -> opencode-learning-engine/ -> packages/ -> root/
 */
const DEFAULT_INDEX_PATH = path.join(
  __dirname, '..', '..', '..', 'opencode-config', 'meta-knowledge-index.json'
);

/** Hard ceiling per Metis directive: max 200 tokens of meta-context per skill prompt. */
const MAX_META_CONTEXT_TOKENS = 200;
const APPROX_CHARS_PER_TOKEN = 4;
const MAX_CHARS = MAX_META_CONTEXT_TOKENS * APPROX_CHARS_PER_TOKEN;

/** Risk level weights for ranking (higher = more important). */
const RISK_WEIGHTS = { high: 3, medium: 2, low: 1 };

/** Max age in ms before index is considered stale (24 hours). */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

class MetaKBReader {
  /**
   * @param {string} [indexPath] - Path to meta-knowledge-index.json
   */
  constructor(indexPath) {
    this.indexPath = indexPath || DEFAULT_INDEX_PATH;
    this.index = null;
    this.loadedAt = null;
  }

  /**
   * Load the meta-KB index into memory.
   * Fail-open: returns false if file is unavailable or malformed.
   * @returns {boolean} true if loaded successfully
   */
  load() {
    try {
      if (!fs.existsSync(this.indexPath)) {
        return false;
      }
      const raw = fs.readFileSync(this.indexPath, 'utf-8');
      const parsed = JSON.parse(raw);

      // Basic validation: must have schema_version and by_category
      if (!parsed.schema_version || !parsed.by_category) {
        return false;
      }

      this.index = parsed;
      this.loadedAt = Date.now();
      return true;
    } catch {
      // Fail-open: don't crash if index is corrupt or unreadable
      this.index = null;
      return false;
    }
  }

  /**
   * Check if the loaded index is stale (> 24 hours old based on generated_at).
   * Returns false if no index is loaded.
   * @returns {boolean}
   */
  isStale() {
    if (!this.index || !this.index.generated_at) return false;
    const generatedAt = new Date(this.index.generated_at).getTime();
    if (isNaN(generatedAt)) return false;
    return (Date.now() - generatedAt) > STALE_THRESHOLD_MS;
  }

  /**
   * Query the meta-KB for entries relevant to a task context.
   * Returns empty arrays if no index is loaded (fail-open).
   *
   * @param {Object} taskContext - Same shape as OrchestrationAdvisor.advise() input
   * @param {string} [taskContext.task_type] - e.g. 'debug', 'refactor', 'feature'
   * @param {string[]} [taskContext.files] - Files being touched
   * @param {string} [taskContext.description] - Natural language task description
   * @returns {{ warnings: Object[], suggestions: Object[], conventions: Object[] }}
   */
  query(taskContext) {
    const empty = { warnings: [], suggestions: [], conventions: [] };
    if (!this.index) return empty;

    const files = taskContext?.files || [];
    const taskType = taskContext?.task_type || '';
    const description = (taskContext?.description || '').toLowerCase();

    const warnings = [];
    const suggestions = [];
    const conventions = [];

    // 1. Match files against by_affected_path (path prefix match)
    if (files.length > 0 && this.index.by_affected_path) {
      for (const file of files) {
        const normalized = file.replace(/\\/g, '/');
        for (const [pathKey, entries] of Object.entries(this.index.by_affected_path)) {
          if (normalized.startsWith(pathKey) || normalized.includes(pathKey)) {
            for (const entry of entries) {
              suggestions.push({
                type: 'path_match',
                id: entry.id,
                summary: entry.summary,
                risk_level: entry.risk_level,
                timestamp: entry.timestamp,
                matched_path: pathKey,
                _score: this._score(entry),
              });
            }
          }
        }
      }
    }

    // 2. Match anti-patterns by keyword overlap with task_type + description
    if (this.index.anti_patterns) {
      for (const ap of this.index.anti_patterns) {
        const patternLower = (ap.pattern || '').toLowerCase();
        const descLower = (ap.description || '').toLowerCase();
        const matchesType = taskType && (patternLower.includes(taskType) || descLower.includes(taskType));
        const matchesDesc = description && (
          description.includes(patternLower) ||
          patternLower.split(/\s+/).some(word => word.length > 3 && description.includes(word))
        );

        if (matchesType || matchesDesc) {
          warnings.push({
            type: 'anti_pattern',
            pattern: ap.pattern,
            severity: ap.severity,
            description: ap.description,
            source_file: ap.file,
            _score: (RISK_WEIGHTS[ap.severity] || 1) * 10,
          });
        }
      }
    }

    // 3. Match conventions relevant to affected paths
    if (files.length > 0 && this.index.conventions) {
      for (const conv of this.index.conventions) {
        const convFile = (conv.file || '').replace(/\\/g, '/');
        // Convention is relevant if any file being touched is near the convention's source file
        const relevant = files.some(f => {
          const normF = f.replace(/\\/g, '/');
          const prefix = this._pathPrefix(normF);
          const convPrefix = this._pathPrefix(convFile);
          return prefix === convPrefix || convFile === 'AGENTS.md'; // root conventions apply everywhere
        });
        if (relevant) {
          conventions.push({
            type: 'convention',
            convention: conv.convention,
            description: conv.description,
            source_file: conv.file,
          });
        }
      }
    }

    // 4. Sort by score/relevance, deduplicate, and truncate to MAX_CHARS
    const rankedWarnings = this._dedup(warnings, 'pattern').sort((a, b) => (b._score || 0) - (a._score || 0));
    const rankedSuggestions = this._dedup(suggestions, 'id').sort((a, b) => (b._score || 0) - (a._score || 0));
    const rankedConventions = this._dedup(conventions, 'convention');

    // Truncate combined output to MAX_CHARS
    return this._truncate({
      warnings: rankedWarnings.map(w => { delete w._score; return w; }),
      suggestions: rankedSuggestions.map(s => { delete s._score; return s; }),
      conventions: rankedConventions,
    });
  }

  /**
   * Score an entry based on recency and risk level.
   * @private
   */
  _score(entry) {
    const riskWeight = RISK_WEIGHTS[entry.risk_level] || 1;
    let recencyBonus = 0;
    if (entry.timestamp) {
      const age = Date.now() - new Date(entry.timestamp).getTime();
      const days = age / (1000 * 60 * 60 * 24);
      if (days < 7) recencyBonus = 5;
      else if (days < 30) recencyBonus = 3;
      else if (days < 90) recencyBonus = 1;
    }
    return riskWeight + recencyBonus;
  }

  /**
   * Get the first two path segments as grouping key.
   * @private
   */
  _pathPrefix(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length >= 2) return parts.slice(0, 2).join('/');
    return parts[0] || normalized;
  }

  /**
   * Deduplicate entries by a key field.
   * @private
   */
  _dedup(arr, keyField) {
    const seen = new Set();
    return arr.filter(item => {
      const key = item[keyField];
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Truncate the combined output to MAX_CHARS (~200 tokens).
   * Removes items from the end of each array until under budget.
   * @private
   */
  _truncate(result) {
    let json = JSON.stringify(result);
    if (json.length <= MAX_CHARS) return result;

    // Progressively trim: suggestions first (lowest priority), then conventions, then warnings
    const trimOrder = ['suggestions', 'conventions', 'warnings'];
    for (const key of trimOrder) {
      while (result[key].length > 0 && JSON.stringify(result).length > MAX_CHARS) {
        result[key].pop();
      }
    }

    return result;
  }
}

module.exports = { MetaKBReader, MAX_META_CONTEXT_TOKENS, MAX_CHARS, DEFAULT_INDEX_PATH };
