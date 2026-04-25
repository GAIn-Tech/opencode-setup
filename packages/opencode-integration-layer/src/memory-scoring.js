'use strict';

/**
 * Deterministic Memory Scoring Pipeline.
 *
 * Computes importance scores without randomness:
 * - Base score from importance field (0-1)
 * - Recency decay: exponential with half-life of 7 days
 * - Entity overlap: boost if query entities match memory entities
 * - Type weighting: fact=1.0, pattern=0.9, decision=0.85, preference=0.8, error=0.95, session_context=0.6
 * - Core retention: recency is always 1.0 (never decays)
 *
 * Deterministic: same inputs → same outputs, no Math.random()
 */

const TYPE_WEIGHTS = {
  fact: 1.0,
  pattern: 0.9,
  decision: 0.85,
  preference: 0.8,
  error: 0.95,
  session_context: 0.6,
};

const DEFAULT_HALF_LIFE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Score a memory record against a query context.
 *
 * @param {object} memory - Memory record (with content, entities, type, timestamp, retention, importance)
 * @param {object} [options]
 * @param {string} [options.query] - Search/query text
 * @param {string[]} [options.queryEntities] - Entities extracted from query
 * @param {number} [options.halfLifeDays] - Recency half-life in days (default 7)
 * @param {object} [options.now] - Override "now" timestamp for testing (ms epoch)
 * @returns {Promise<{total: number, breakdown: object}>}
 */
async function scoreMemory(memory, options = {}) {
  const {
    query = '',
    queryEntities = [],
    halfLifeDays = DEFAULT_HALF_LIFE_DAYS,
    now = Date.now(),
  } = options;

  const breakdown = {};

  // 1. Base importance score (0-1)
  const importance = clampImportance(memory.importance ?? 0.5);
  breakdown.importance = importance;

  // 2. Recency decay
  const recency = computeRecency(memory.timestamp, now, halfLifeDays, memory.retention);
  breakdown.recency = recency;

  // 3. Entity overlap boost
  const entityOverlap = computeEntityOverlap(memory.entities || [], queryEntities);
  breakdown.entityOverlap = entityOverlap;

  // 4. Type weight
  const typeWeight = TYPE_WEIGHTS[memory.type] ?? 0.7;
  breakdown.typeWeight = typeWeight;

  // 5. Content relevance (simple keyword match)
  const contentRelevance = computeContentRelevance(memory.content || '', query);
  breakdown.contentRelevance = contentRelevance;

  // Total: geometric mean weighted combination
  // Using weighted sum: importance*0.3 + recency*0.25 + entity*0.2 + type*0.15 + content*0.1
  const total =
    importance * 0.3 +
    recency * 0.25 +
    entityOverlap * 0.2 +
    typeWeight * 0.15 +
    contentRelevance * 0.1;

  breakdown._weights = {
    importance: 0.3,
    recency: 0.25,
    entityOverlap: 0.2,
    typeWeight: 0.15,
    contentRelevance: 0.1,
  };

  return { total: Math.round(total * 1000) / 1000, breakdown };
}

/**
 * Compute recency score with exponential decay.
 * Core retention memories always get 1.0 (never decay).
 */
function computeRecency(timestamp, now, halfLifeDays, retention) {
  // Core memories never decay
  if (retention === 'core') {
    return 1.0;
  }

  if (!timestamp) {
    return 0.5; // Unknown timestamp → neutral
  }

  const ageMs = now - new Date(timestamp).getTime();
  if (ageMs < 0) {
    return 1.0; // Future timestamp → treat as fresh
  }

  const halfLifeMs = halfLifeDays * MS_PER_DAY;
  const decay = Math.pow(0.5, ageMs / halfLifeMs);

  return Math.round(decay * 1000) / 1000;
}

/**
 * Compute entity overlap between memory and query.
 * Returns 0-1 based on Jaccard similarity.
 */
function computeEntityOverlap(memoryEntities, queryEntities) {
  if (!Array.isArray(memoryEntities) || !Array.isArray(queryEntities)) {
    return 0;
  }
  if (memoryEntities.length === 0 || queryEntities.length === 0) {
    return 0;
  }

  const memorySet = new Set(memoryEntities.map(String));
  const querySet = new Set(queryEntities.map(String));

  let intersection = 0;
  for (const entity of querySet) {
    if (memorySet.has(entity)) {
      intersection++;
    }
  }

  const union = memorySet.size + querySet.size - intersection;
  if (union === 0) return 0;

  return Math.round((intersection / union) * 1000) / 1000;
}

/**
 * Compute content relevance via keyword overlap.
 * Simple: count query words present in content.
 */
function computeContentRelevance(content, query) {
  if (!content || !query) {
    return 0;
  }

  const contentLower = content.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

  if (words.length === 0) {
    return 0;
  }

  let matches = 0;
  for (const word of words) {
    if (contentLower.includes(word)) {
      matches++;
    }
  }

  return Math.round((matches / words.length) * 1000) / 1000;
}

/**
 * Clamp importance to [0, 1].
 */
function clampImportance(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  return Math.max(0, Math.min(1, numeric));
}

module.exports = {
  scoreMemory,
  computeRecency,
  computeEntityOverlap,
  computeContentRelevance,
  TYPE_WEIGHTS,
  DEFAULT_HALF_LIFE_DAYS,
};