'use strict';

const crypto = require('node:crypto');

/**
 * Meta-Memory Pointer Layer.
 *
 * Manages cross-references between memory records:
 * - Pointer types: references, derived_from, contradicts, similar_to, parent_of
 * - Pointer format: { id, type, target_id, weight (0-1), metadata }
 * - Cycle detection: prevents circular references
 * - Pointer integrity: SHA-256 hash of pointer chain
 */

/**
 * Create a meta-memory pointer between two records.
 *
 * @param {object} source - Source memory record { id, content_hash }
 * @param {object} target - Target memory record { id }
 * @param {string} pointerType - One of: references, derived_from, contradicts, similar_to, parent_of
 * @param {object} [metadata] - Optional metadata
 * @returns {object} Pointer record
 */
function createPointer(source, target, pointerType, metadata = {}) {
  if (!source?.id || !target?.id) {
    throw new Error('[MetaMemory] source and target must have id field');
  }

  const VALID_TYPES = ['references', 'derived_from', 'contradicts', 'similar_to', 'parent_of'];
  if (!VALID_TYPES.includes(pointerType)) {
    throw new Error(`[MetaMemory] invalid pointer type: ${pointerType}. Must be one of: ${VALID_TYPES.join(', ')}`);
  }

  const pointer = {
    id: crypto.randomUUID(),
    source_id: source.id,
    target_id: target.id,
    type: pointerType,
    weight: clampWeight(metadata.weight ?? 0.8),
    metadata: metadata.extra || {},
    created_at: new Date().toISOString(),
  };

  // Compute integrity hash
  pointer.integrity_hash = computePointerHash(pointer);

  return pointer;
}

/**
 * Compute SHA-256 hash of pointer for integrity verification.
 */
function computePointerHash(pointer) {
  const data = `${pointer.source_id}:${pointer.target_id}:${pointer.type}:${pointer.weight}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Verify pointer integrity.
 */
function verifyPointer(pointer) {
  if (!pointer?.id || !pointer?.source_id || !pointer?.target_id) {
    return { valid: false, error: 'missing required fields' };
  }

  const expected = computePointerHash(pointer);
  if (pointer.integrity_hash !== expected) {
    return { valid: false, error: 'integrity hash mismatch' };
  }

  return { valid: true };
}

/**
 * Detect cycles in pointer graph using DFS.
 * Returns array of cycle paths if found.
 *
 * @param {Map<string, object[]>} graph - Map of record_id → array of pointers
 * @param {string} startId - Starting record ID
 * @returns {string[][]} Array of cycle paths (each path is array of IDs)
 */
function detectCycles(graph, startId) {
  const cycles = [];
  const visited = new Set();
  const recursionStack = new Set();
  const path = [];

  function dfs(nodeId, currentPath) {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    currentPath.push(nodeId);

    const pointers = graph.get(nodeId) || [];
    for (const pointer of pointers) {
      const targetId = pointer.target_id;

      if (!visited.has(targetId)) {
        dfs(targetId, [...currentPath]);
      } else if (recursionStack.has(targetId)) {
        // Found cycle
        const cycleStart = currentPath.indexOf(targetId);
        const cyclePath = currentPath.slice(cycleStart);
        cyclePath.push(targetId); // Close the cycle
        cycles.push(cyclePath);
      }
    }

    recursionStack.delete(nodeId);
  }

  dfs(startId, path);
  return cycles;
}

/**
 * Build pointer graph from array of pointers.
 *
 * @param {object[]} pointers - Array of pointer records
 * @returns {Map<string, object[]>} Adjacency list
 */
function buildPointerGraph(pointers) {
  const graph = new Map();

  for (const pointer of pointers) {
    if (!graph.has(pointer.source_id)) {
      graph.set(pointer.source_id, []);
    }
    graph.get(pointer.source_id).push(pointer);
  }

  return graph;
}

/**
 * Find all pointers referencing a specific record.
 *
 * @param {object[]} pointers - All pointers
 * @param {string} recordId - Target record ID
 * @param {string} [direction] - 'outgoing' (source→target) or 'incoming' (target→source)
 * @returns {object[]} Matching pointers
 */
function findPointers(pointers, recordId, direction = 'outgoing') {
  return pointers.filter((p) => {
    if (direction === 'outgoing') {
      return p.source_id === recordId;
    } else if (direction === 'incoming') {
      return p.target_id === recordId;
    }
    return p.source_id === recordId || p.target_id === recordId;
  });
}

/**
 * Get pointer statistics for a record.
 */
function getPointerStats(pointers, recordId) {
  const outgoing = findPointers(pointers, recordId, 'outgoing');
  const incoming = findPointers(pointers, recordId, 'incoming');

  const byType = {};
  for (const p of [...outgoing, ...incoming]) {
    byType[p.type] = (byType[p.type] || 0) + 1;
  }

  return {
    outgoing: outgoing.length,
    incoming: incoming.length,
    total: outgoing.length + incoming.length,
    byType,
  };
}

function clampWeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.8;
  return Math.max(0, Math.min(1, numeric));
}

module.exports = {
  createPointer,
  verifyPointer,
  detectCycles,
  buildPointerGraph,
  findPointers,
  getPointerStats,
  VALID_POINTER_TYPES: ['references', 'derived_from', 'contradicts', 'similar_to', 'parent_of'],
};