'use strict';

const MAX_META_CONTEXT_CHARS = 800;
const MAX_META_CONTEXT_ENTRIES = 3;
const RISK_WEIGHTS = { high: 3, medium: 2, low: 1 };
const HEADER = '<!-- META-KB CONTEXT -->\n';

function generateMetaContext(metaKBIndex, taskContext, maxChars = MAX_META_CONTEXT_CHARS) {
  if (!metaKBIndex || !taskContext) return '';

  const limit = Math.max(0, Math.floor(maxChars));
  if (limit === 0) return '';

  const files = Array.isArray(taskContext.files) ? taskContext.files : [];
  const byPath = metaKBIndex.by_affected_path;
  if (files.length === 0 || !byPath || typeof byPath !== 'object') return '';

  const matchedEntries = [];

  for (const file of files) {
    const normalizedFile = normalizePath(file);
    for (const [pathKey, entries] of Object.entries(byPath)) {
      if (!Array.isArray(entries)) continue;
      const normalizedPathKey = normalizePath(pathKey);
      if (!pathMatches(normalizedFile, normalizedPathKey)) continue;

      for (const entry of entries) {
        if (!entry || typeof entry !== 'object' || !entry.id || !entry.summary) continue;

        matchedEntries.push({
          id: entry.id,
          summary: entry.summary,
          riskLevel: normalizeRisk(entry.risk_level),
          timestamp: entry.timestamp || null,
          matchedPath: pathKey,
          score: scoreEntry(entry),
        });
      }
    }
  }

  if (matchedEntries.length === 0) return '';

  const ranked = dedupeById(matchedEntries)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return toTimestampMs(b.timestamp) - toTimestampMs(a.timestamp);
    })
    .slice(0, MAX_META_CONTEXT_ENTRIES);

  let block = HEADER;
  for (const entry of ranked) {
    block += `- [${entry.riskLevel.toUpperCase()}] ${entry.id}: ${entry.summary} (${entry.matchedPath})\n`;
  }

  if (block.length <= limit) {
    return block;
  }

  return block.slice(0, limit).trimEnd();
}

function dedupeById(entries) {
  const bestById = new Map();

  for (const entry of entries) {
    const existing = bestById.get(entry.id);
    if (!existing || entry.score > existing.score) {
      bestById.set(entry.id, entry);
    }
  }

  return [...bestById.values()];
}

function scoreEntry(entry) {
  const riskWeight = RISK_WEIGHTS[normalizeRisk(entry.risk_level)] || 1;
  const recency = toTimestampMs(entry.timestamp);
  return (riskWeight * 10000000000000) + recency;
}

function toTimestampMs(timestamp) {
  const value = Date.parse(timestamp || '');
  return Number.isFinite(value) ? value : 0;
}

function normalizeRisk(riskLevel) {
  const normalized = String(riskLevel || '').toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized;
  }
  return 'low';
}

function normalizePath(pathValue) {
  return String(pathValue || '').replace(/\\/g, '/');
}

function pathMatches(filePath, pathKey) {
  if (!filePath || !pathKey) return false;
  return filePath === pathKey || filePath.startsWith(`${pathKey}/`) || filePath.includes(pathKey);
}

module.exports = {
  generateMetaContext,
  MAX_META_CONTEXT_CHARS,
  MAX_META_CONTEXT_ENTRIES,
};
