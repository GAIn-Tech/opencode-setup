'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Log entry format (expected from OpenCode runtime):
 *   { session_id, timestamp, error_type, message }
 *
 * Supported raw formats:
 *   - JSON lines  (one JSON object per line)
 *   - JSON array  (single array of objects)
 *   - TSV/CSV     (session_id\ttimestamp\terror_type\tmessage)
 */

// ─── Parsing ────────────────────────────────────────────────────────────────

/**
 * Parse a single log file into an array of structured entries.
 * @param {string} logFilePath  Absolute or relative path to log file.
 * @returns {{ session_id: string, timestamp: string, error_type: string, message: string }[]}
 */
function parseLog(logFilePath) {
  const resolved = path.resolve(logFilePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Log file not found: ${resolved}`);
  }

  const raw = fs.readFileSync(resolved, 'utf-8').trim();
  if (!raw) return [];

  // Try JSON array first
  if (raw.startsWith('[')) {
    return normalizeEntries(JSON.parse(raw));
  }

  // Try JSON-lines
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines[0].startsWith('{')) {
    return normalizeEntries(lines.map((l) => JSON.parse(l)));
  }

  // Fallback: TSV / CSV  (session_id  timestamp  error_type  message)
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const hasHeader = /session.id/i.test(lines[0]);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return normalizeEntries(
    dataLines.map((line) => {
      const parts = line.split(delimiter).map((s) => s.trim().replace(/^"|"$/g, ''));
      return {
        session_id: parts[0],
        timestamp: parts[1],
        error_type: parts[2],
        message: parts.slice(3).join(delimiter),
      };
    }),
  );
}

/**
 * Parse multiple log files or directories.
 * @param {string|string[]} sources  File path(s) or directory path(s).
 * @returns {object[]}
 */
function parseLogs(sources) {
  const paths = Array.isArray(sources) ? sources : [sources];
  const entries = [];

  for (const p of paths) {
    const resolved = path.resolve(p);
    if (!fs.existsSync(resolved)) continue;

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(resolved).filter((f) => /\.(log|jsonl?|csv|tsv)$/i.test(f));
      for (const f of files) {
        entries.push(...parseLog(path.join(resolved, f)));
      }
    } else {
      entries.push(...parseLog(resolved));
    }
  }

  return entries;
}

// ─── Graph Construction ─────────────────────────────────────────────────────

/**
 * Build a bipartite graph from an array of log entries and sync to goraphdb.
 *
 * Nodes:
 *   - type "session"  → one per unique session_id
 *   - type "error"    → one per unique error_type
 *
 * Edges:
 *   - from session → error, weighted by occurrence count
 *   - carries first_seen / last_seen timestamps
 *
 * @param {object[]} entries  Array of { session_id, timestamp, error_type, message }.
 * @param {GoraphdbBridge | null} bridge  Bridge instance for syncing to goraphdb (optional).
 * @returns {Promise<{ nodes: object[], edges: object[], meta: object }>}
 */
/**
 * Build error knowledge graph from session entries with memory-safe Map limits.
 * 
 * MEMORY OPTIMIZATION: Limits Map growth with LRU eviction to prevent unbounded memory
 * consumption when processing thousands of sessions. Old/inactive entries are evicted.
 *
 * @param {object[]} entries  Array of { session_id, timestamp, error_type, message }.
 * @param {object | null} bridge  Bridge instance for syncing to goraphdb (optional).
 * @param {object} [opts]  Options for graph building.
 * @param {number} [opts.maxSessions=1000]  Max session nodes before LRU eviction.
 * @param {number} [opts.maxErrors=500]  Max error type nodes before LRU eviction.
 * @param {number} [opts.maxEdges=5000]  Max edges before LRU eviction.
 * @returns {Promise<{ nodes: object[], edges: object[], meta: object }>}
 */
async function buildGraphWithBridge(entries, bridge, opts = {}) {
  const { maxSessions = 1000, maxErrors = 500, maxEdges = 5000 } = opts;
  
  if (!Array.isArray(entries) || entries.length === 0) {
    return { nodes: [], edges: [], meta: { sessions: 0, errors: 0, total_entries: 0 } };
  }

  const sessionMap = new Map(); // session_id → { first_seen, last_seen, error_count }
  const errorMap = new Map();   // error_type → { count, first_seen, last_seen }
  const edgeMap = new Map();    // "session::error" → { weight, first_seen, last_seen, messages }

  for (const entry of entries) {
    const { session_id, timestamp, error_type, message } = entry;
    if (!session_id || !error_type) continue;

    const ts = timestamp || new Date().toISOString();

    // Session node (with LRU eviction)
    if (!sessionMap.has(session_id)) {
      // Evict oldest session if at capacity (LRU = first entry in Map)
      if (sessionMap.size >= maxSessions) {
        const firstKey = sessionMap.keys().next().value;
        sessionMap.delete(firstKey);
      }
      sessionMap.set(session_id, { first_seen: ts, last_seen: ts, error_count: 0 });
    }
    const sess = sessionMap.get(session_id);
    sess.last_seen = ts > sess.last_seen ? ts : sess.last_seen;
    sess.first_seen = ts < sess.first_seen ? ts : sess.first_seen;
    sess.error_count += 1;
    // Move to end for LRU (delete + re-set)
    sessionMap.delete(session_id);
    sessionMap.set(session_id, sess);

    // Error node (with LRU eviction)
    if (!errorMap.has(error_type)) {
      if (errorMap.size >= maxErrors) {
        const firstKey = errorMap.keys().next().value;
        errorMap.delete(firstKey);
      }
      errorMap.set(error_type, { count: 0, first_seen: ts, last_seen: ts });
    }
    const err = errorMap.get(error_type);
    err.count += 1;
    err.last_seen = ts > err.last_seen ? ts : err.last_seen;
    err.first_seen = ts < err.first_seen ? ts : err.first_seen;
    // Move to end for LRU
    errorMap.delete(error_type);
    errorMap.set(error_type, err);

    // Edge (with LRU eviction)
    const edgeKey = `${session_id}::${error_type}`;
    if (!edgeMap.has(edgeKey)) {
      if (edgeMap.size >= maxEdges) {
        const firstKey = edgeMap.keys().next().value;
        edgeMap.delete(firstKey);
      }
      edgeMap.set(edgeKey, { weight: 0, first_seen: ts, last_seen: ts, messages: [] });
    }
    const edge = edgeMap.get(edgeKey);
    edge.weight += 1;
    edge.last_seen = ts > edge.last_seen ? ts : edge.last_seen;
    edge.first_seen = ts < edge.first_seen ? ts : edge.first_seen;
    if (message && edge.messages.length < 5) {
      edge.messages.push(message);
    }
    // Move to end for LRU
    edgeMap.delete(edgeKey);
    edgeMap.set(edgeKey, edge);
  }

  // Sync to goraphdb if bridge is available
  if (bridge) {
    // Create/upsert all nodes
    for (const [id, data] of sessionMap) {
      await bridge.upsertNode('Session', { id, ...data });
    }
    for (const [id, data] of errorMap) {
      await bridge.upsertNode('Error', { id, ...data });
    }

    // Create/upsert all edges
    for (const [key, data] of edgeMap) {
      const parts = key.split('::');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        console.warn(`[GraphBuilder] Invalid edge key format: "${key}", skipping`);
        continue;
      }
      const [from, to] = parts;
      await bridge.upsertEdge('ENCOUNTERED', from, to, data);
    }
  }

  // Assemble nodes
  const nodes = [];
  for (const [id, data] of sessionMap) {
    nodes.push({ id, type: 'session', ...data });
  }
  for (const [id, data] of errorMap) {
    nodes.push({ id, type: 'error', ...data });
  }

  // Assemble edges
  const edges = [];
  for (const [key, data] of edgeMap) {
    const [from, to] = key.split('::');
    edges.push({ from, to, ...data });
  }

  // Sort edges by weight descending for convenience
  edges.sort((a, b) => b.weight - a.weight);

  return {
    nodes,
    edges,
    meta: {
      sessions: sessionMap.size,
      errors: errorMap.size,
      total_entries: entries.length,
      built_at: new Date().toISOString(),
    },
  };
}

/**
 * Legacy buildGraph function for backward compatibility.
 * @deprecated Use buildGraphWithBridge instead.
 * @param {object[]} entries
 * @returns {{ nodes: object[], edges: object[], meta: object }}
 */
function buildGraph(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { nodes: [], edges: [], meta: { sessions: 0, errors: 0, total_entries: 0 } };
  }

  const sessionMap = new Map();
  const errorMap = new Map();
  const edgeMap = new Map();

  for (const entry of entries) {
    const { session_id, timestamp, error_type, message } = entry;
    if (!session_id || !error_type) continue;

    const ts = timestamp || new Date().toISOString();

    if (!sessionMap.has(session_id)) {
      sessionMap.set(session_id, { first_seen: ts, last_seen: ts, error_count: 0 });
    }
    const sess = sessionMap.get(session_id);
    sess.last_seen = ts > sess.last_seen ? ts : sess.last_seen;
    sess.first_seen = ts < sess.first_seen ? ts : sess.first_seen;
    sess.error_count += 1;

    if (!errorMap.has(error_type)) {
      errorMap.set(error_type, { count: 0, first_seen: ts, last_seen: ts });
    }
    const err = errorMap.get(error_type);
    err.count += 1;
    err.last_seen = ts > err.last_seen ? ts : err.last_seen;
    err.first_seen = ts < err.first_seen ? ts : err.first_seen;

    const edgeKey = `${session_id}::${error_type}`;
    if (!edgeMap.has(edgeKey)) {
      edgeMap.set(edgeKey, { weight: 0, first_seen: ts, last_seen: ts, messages: [] });
    }
    const edge = edgeMap.get(edgeKey);
    edge.weight += 1;
    edge.last_seen = ts > edge.last_seen ? ts : edge.last_seen;
    edge.first_seen = ts < edge.first_seen ? ts : edge.first_seen;
    if (message && edge.messages.length < 5) {
      edge.messages.push(message);
    }
  }

  const nodes = [];
  for (const [id, data] of sessionMap) {
    nodes.push({ id, type: 'session', ...data });
  }
  for (const [id, data] of errorMap) {
    nodes.push({ id, type: 'error', ...data });
  }

  const edges = [];
  for (const [key, data] of edgeMap) {
    const [from, to] = key.split('::');
    edges.push({ from, to, ...data });
  }

  edges.sort((a, b) => b.weight - a.weight);

  return {
    nodes,
    edges,
    meta: {
      sessions: sessionMap.size,
      errors: errorMap.size,
      total_entries: entries.length,
      built_at: new Date().toISOString(),
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeEntries(arr) {
  return arr
    .map((e) => ({
      session_id: e.session_id || e.sessionId || e.session || '',
      timestamp: e.timestamp || e.ts || e.time || e.date || '',
      error_type: e.error_type || e.errorType || e.error || e.type || '',
      message: e.message || e.msg || e.description || '',
    }))
    .filter((e) => e.session_id && e.error_type);
}

module.exports = { parseLog, parseLogs, buildGraph, buildGraphWithBridge, normalizeEntries };
