'use strict';

/**
 * Meta-Context Injector for Skill Loading
 *
 * Generates a concise markdown block of relevant meta-KB context
 * to inject into skill prompts. Hard-capped at 200 tokens (~800 chars).
 *
 * Returns empty string if no relevant context or meta-KB unavailable.
 */

/** Hard ceiling: 200 tokens ≈ 800 chars (4 chars/token). */
const MAX_META_CONTEXT_CHARS = 800;

/** Max entries to include in the context block. */
const MAX_ENTRIES = 3;

/** Risk level weights for ranking (higher = more important). */
const RISK_WEIGHTS = { high: 3, medium: 2, low: 1 };

/**
 * Generate a markdown block of relevant meta-KB context for a skill prompt.
 *
 * @param {Object|null} metaKBIndex - The loaded meta-knowledge-index.json object
 * @param {Object} taskContext - Task context from selectTools()
 * @param {string[]} [taskContext.files] - Files being touched
 * @param {string} [taskContext.taskType] - Task type
 * @param {string} [taskContext.prompt] - User prompt text
 * @param {number} [maxChars=800] - Max characters for the output block
 * @returns {string} Markdown context block, or empty string if nothing relevant
 */
function generateMetaContext(metaKBIndex, taskContext, maxChars) {
  if (!metaKBIndex || !taskContext) return '';

  const limit = typeof maxChars === 'number' ? maxChars : MAX_META_CONTEXT_CHARS;
  const files = taskContext.files || [];
  const taskType = (taskContext.taskType || taskContext.task_type || '').toLowerCase();
  const prompt = (taskContext.prompt || '').toLowerCase();

  const entries = [];

  // 1. Match anti-patterns by task type or prompt keywords
  if (Array.isArray(metaKBIndex.anti_patterns)) {
    for (const ap of metaKBIndex.anti_patterns) {
      const patternLower = (ap.pattern || '').toLowerCase();
      const descLower = (ap.description || '').toLowerCase();

      const matchesType = taskType && (
        patternLower.includes(taskType) || descLower.includes(taskType)
      );
      const matchesPrompt = prompt && (
        prompt.includes(patternLower) ||
        patternLower.split(/\s+/).some(w => w.length > 3 && prompt.includes(w))
      );

      if (matchesType || matchesPrompt) {
        entries.push({
          type: 'warning',
          text: `${ap.severity?.toUpperCase() || 'WARN'}: ${ap.pattern} — ${ap.description}`,
          score: (RISK_WEIGHTS[ap.severity] || 1) * 10,
        });
      }
    }
  }

  // 2. Match path-based entries
  if (files.length > 0 && metaKBIndex.by_affected_path) {
    for (const file of files) {
      const normalized = file.replace(/\\/g, '/');
      for (const [pathKey, pathEntries] of Object.entries(metaKBIndex.by_affected_path)) {
        if (normalized.startsWith(pathKey) || normalized.includes(pathKey)) {
          for (const entry of pathEntries) {
            entries.push({
              type: 'note',
              text: `${entry.risk_level?.toUpperCase() || 'LOW'}: ${entry.summary}`,
              score: (RISK_WEIGHTS[entry.risk_level] || 1) + _recencyBonus(entry.timestamp),
            });
          }
        }
      }
    }
  }

  // 3. Match conventions
  if (files.length > 0 && Array.isArray(metaKBIndex.conventions)) {
    for (const conv of metaKBIndex.conventions) {
      const convFile = (conv.file || '').replace(/\\/g, '/');
      const relevant = files.some(f => {
        const normF = f.replace(/\\/g, '/');
        return convFile === 'AGENTS.md' || _pathPrefix(normF) === _pathPrefix(convFile);
      });
      if (relevant) {
        entries.push({
          type: 'convention',
          text: conv.convention,
          score: 1,
        });
      }
    }
  }

  if (entries.length === 0) return '';

  // Sort by score descending, take top MAX_ENTRIES
  entries.sort((a, b) => b.score - a.score);
  const topEntries = entries.slice(0, MAX_ENTRIES);

  // Format as markdown block
  let block = '<!-- META-KB CONTEXT -->\n';
  for (const entry of topEntries) {
    const prefix = entry.type === 'warning' ? '⚠' : entry.type === 'convention' ? '📏' : 'ℹ';
    block += `${prefix} ${entry.text}\n`;
  }
  block += '<!-- /META-KB CONTEXT -->';

  // Truncate to maxChars (closing tag is 25 chars + 1 newline = 26)
  const closingTag = '\n<!-- /META-KB CONTEXT -->';
  if (block.length > limit) {
    block = block.slice(0, limit - closingTag.length) + closingTag;
  }

  return block;
}

/**
 * Recency bonus for scoring entries.
 * @private
 */
function _recencyBonus(timestamp) {
  if (!timestamp) return 0;
  const age = Date.now() - new Date(timestamp).getTime();
  const days = age / (1000 * 60 * 60 * 24);
  if (days < 7) return 5;
  if (days < 30) return 3;
  if (days < 90) return 1;
  return 0;
}

/**
 * Get first two path segments as grouping key.
 * @private
 */
function _pathPrefix(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length >= 2) return parts.slice(0, 2).join('/');
  return parts[0] || normalized;
}

module.exports = { generateMetaContext, MAX_META_CONTEXT_CHARS, MAX_ENTRIES };
