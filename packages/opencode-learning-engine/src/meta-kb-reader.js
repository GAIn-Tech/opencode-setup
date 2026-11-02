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

/** Query safety guards to prevent CPU explosions on large indexes. */
const MAX_QUERY_FILES = 100;
const MAX_PATH_KEYS = 2000;
const MAX_PATH_ENTRIES_PER_MATCH = 100;
const MAX_ANTI_PATTERNS = 1000;
const MAX_CONVENTIONS = 1000;
const MAX_SUGGESTIONS = 200;
const MAX_WARNINGS = 100;
const MAX_CONVENTION_RESULTS = 100;
const MAX_QUERY_OPERATIONS = 50000;

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

    const rawFiles = Array.isArray(taskContext?.files) ? taskContext.files : [];
    const files = rawFiles
      .filter(file => typeof file === 'string' && file.length > 0)
      .slice(0, MAX_QUERY_FILES);
    const taskType = typeof taskContext?.task_type === 'string'
      ? taskContext.task_type.toLowerCase()
      : '';
    const description = typeof taskContext?.description === 'string'
      ? taskContext.description.toLowerCase()
      : '';

    const warnings = [];
    const suggestions = [];
    const conventions = [];
    const seenSuggestionIds = new Set();
    const seenWarningPatterns = new Set();
    const seenConventionNames = new Set();

    let operations = 0;
    const canContinue = () => operations < MAX_QUERY_OPERATIONS;
    const bumpOperation = () => {
      operations += 1;
      return canContinue();
    };

    const addSuggestion = (entry, matchedPath) => {
      if (!entry || typeof entry.id !== 'string' || seenSuggestionIds.has(entry.id)) return;
      if (suggestions.length >= MAX_SUGGESTIONS) return;
      seenSuggestionIds.add(entry.id);
      suggestions.push({
        type: 'path_match',
        id: entry.id,
        summary: entry.summary,
        risk_level: entry.risk_level,
        timestamp: entry.timestamp,
        matched_path: matchedPath,
        _score: this._score(entry),
      });
    };

    const addWarning = (ap, pattern) => {
      if (!pattern || seenWarningPatterns.has(pattern)) return;
      if (warnings.length >= MAX_WARNINGS) return;
      seenWarningPatterns.add(pattern);
      warnings.push({
        type: 'anti_pattern',
        pattern: ap.pattern,
        severity: ap.severity,
        description: ap.description,
        source_file: ap.file,
        _score: (RISK_WEIGHTS[ap.severity] || 1) * 10,
      });
    };

    const addConvention = (conv) => {
      const key = conv?.convention;
      if (!key || seenConventionNames.has(key)) return;
      if (conventions.length >= MAX_CONVENTION_RESULTS) return;
      seenConventionNames.add(key);
      conventions.push({
        type: 'convention',
        convention: conv.convention,
        description: conv.description,
        source_file: conv.file,
      });
    };

    // 1. Match files against by_affected_path (path prefix match)
    if (files.length > 0 && this.index.by_affected_path && typeof this.index.by_affected_path === 'object') {
      const pathEntries = Object.entries(this.index.by_affected_path).slice(0, MAX_PATH_KEYS);
      for (const file of files) {
        if (!canContinue() || suggestions.length >= MAX_SUGGESTIONS) break;
        const normalized = file.replace(/\\/g, '/');
        for (const [pathKey, entries] of pathEntries) {
          if (!canContinue() || suggestions.length >= MAX_SUGGESTIONS) break;
          if (!bumpOperation()) break;
          if (typeof pathKey !== 'string' || pathKey.length === 0 || !Array.isArray(entries)) continue;
          if (normalized.startsWith(pathKey) || normalized.includes(pathKey)) {
            const maxEntries = Math.min(entries.length, MAX_PATH_ENTRIES_PER_MATCH);
            for (let i = 0; i < maxEntries; i++) {
              if (!canContinue() || suggestions.length >= MAX_SUGGESTIONS) break;
              if (!bumpOperation()) break;
              const entry = entries[i];
              addSuggestion(entry, pathKey);
            }
          }
        }
      }
    }

    // 2. Match anti-patterns by keyword overlap with task_type + description
    if (Array.isArray(this.index.anti_patterns)) {
      const antiPatterns = this.index.anti_patterns.slice(0, MAX_ANTI_PATTERNS);
      for (const ap of antiPatterns) {
        if (!canContinue() || warnings.length >= MAX_WARNINGS) break;
        if (!bumpOperation()) break;
        const patternLower = (ap.pattern || '').toLowerCase();
        const descLower = (ap.description || '').toLowerCase();
        const matchesType = taskType && (patternLower.includes(taskType) || descLower.includes(taskType));
        const matchesDesc = description && (
          description.includes(patternLower) ||
          patternLower.split(/\s+/).some(word => word.length > 3 && description.includes(word))
        );

        if (matchesType || matchesDesc) {
          addWarning(ap, ap.pattern);
        }
      }
    }

    // 3. Match conventions relevant to affected paths
    if (files.length > 0 && Array.isArray(this.index.conventions)) {
      const conventionList = this.index.conventions.slice(0, MAX_CONVENTIONS);
      for (const conv of conventionList) {
        if (!canContinue() || conventions.length >= MAX_CONVENTION_RESULTS) break;
        if (!bumpOperation()) break;
        const convFile = (conv.file || '').replace(/\\/g, '/');
        // Convention is relevant if any file being touched is near the convention's source file
        let relevant = false;
        for (const f of files) {
          if (!canContinue()) break;
          if (!bumpOperation()) break;
          const normF = f.replace(/\\/g, '/');
          const prefix = this._pathPrefix(normF);
          const convPrefix = this._pathPrefix(convFile);
          if (prefix === convPrefix || convFile === 'AGENTS.md') {
            relevant = true;
            break;
          }
        }
        if (relevant) {
          addConvention(conv);
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

/**
 * Load project-specific KB from .sisyphus/kb/ directory.
 * Supports loading meta-knowledge from external projects.
 * 
 * @param {string} projectRoot - Path to project root
 * @returns {Object|null} Project KB data or null if not found
 */
function loadProjectKB(projectRoot) {
  const kbDir = path.join(projectRoot, '.sisyphus', 'kb');
  const metaPath = path.join(kbDir, 'meta-knowledge.json');
  
  try {
    if (!fs.existsSync(metaPath)) {
      return null;
    }
    const raw = fs.readFileSync(metaPath, 'utf-8');
    const parsed = JSON.parse(raw);
    
    // Validate schema
    if (!parsed.schema || !parsed.schema.startsWith('meta-kb')) {
      return null;
    }
    return { kbDir, data: parsed, loadedAt: Date.now() };
  } catch {
    return null;
  }
}

/**
 * Check if project has project-specific audit files.
 * 
 * @param {string} projectRoot - Path to project root
 * @returns {string[]} Array of audit file paths
 */
function getProjectAuditFiles(projectRoot) {
  const notepadsDir = path.join(projectRoot, '.sisyphus', 'notepads');
  const auditFiles = [];
  
  try {
    if (!fs.existsSync(notepadsDir)) {
      return auditFiles;
    }
    const files = fs.readdirSync(notepadsDir);
    for (const file of files) {
      if (file.startsWith('project-') && file.endsWith('.md')) {
        auditFiles.push(path.join(notepadsDir, file));
      }
    }
  } catch {
    // Fail-open: return empty array
  }
  
  return auditFiles;
}



/**
 * Read from global meta-KB for synthesis.
 * @returns {Object|null}
 */
function readFromGlobalKB() {
  const globalPath = path.join(
    __dirname, '..', '..', '..', '.sisyphus', 'kb', 'meta-knowledge.json'
  );
  try {
    if (!fs.existsSync(globalPath)) {
      return null;
    }
    const raw = fs.readFileSync(globalPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = {
  MetaKBReader,
  MAX_META_CONTEXT_TOKENS,
  MAX_CHARS,
  DEFAULT_INDEX_PATH,
  MAX_QUERY_FILES,
  MAX_PATH_KEYS,
  MAX_PATH_ENTRIES_PER_MATCH,
  MAX_ANTI_PATTERNS,
  MAX_CONVENTIONS,
  MAX_SUGGESTIONS,
  MAX_WARNINGS,
  MAX_CONVENTION_RESULTS,
  MAX_QUERY_OPERATIONS,
};

MetaKBReader.loadProjectKB = loadProjectKB;
MetaKBReader.getProjectAuditFiles = getProjectAuditFiles;
MetaKBReader.readFromGlobalKB = readFromGlobalKB;
