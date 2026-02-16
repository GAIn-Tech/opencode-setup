'use strict';

/**
 * EdgeStore — Dual-indexed graph edge storage for Memory Graph v3.
 *
 * Maintains edges with two indexes for fast traversal:
 *   - outIndex: fromID → [edges]  (outgoing edges from a node)
 *   - inIndex:  toID   → [edges]  (incoming edges to a node)
 *
 * Edge shape: { from, to, type, weight, meta: { created, updated } }
 * Edge types: ENCOUNTERED, USES_MODEL, USES_TOOL, ORCHESTRATES, CHILD_OF
 */

// ─── Edge Types ─────────────────────────────────────────────────────────────

const EDGE_TYPES = Object.freeze({
  ENCOUNTERED: 'ENCOUNTERED',
  USES_MODEL: 'USES_MODEL',
  USES_TOOL: 'USES_TOOL',
  ORCHESTRATES: 'ORCHESTRATES',
  CHILD_OF: 'CHILD_OF',
});

const VALID_EDGE_TYPES = new Set(Object.values(EDGE_TYPES));

/** Direction constants for getEdges */
const DIRECTION = Object.freeze({
  OUT: 'out',
  IN: 'in',
  BOTH: 'both',
});

// ─── EdgeStore ──────────────────────────────────────────────────────────────

class EdgeStore {
  constructor() {
    /**
     * Primary storage: edgeKey → edge object.
     * Key format: "from|to|type"
     * @type {Map<string, object>}
     */
    this._edges = new Map();

    /**
     * Outgoing index: fromID → Set<edgeKey>
     * @type {Map<string, Set<string>>}
     */
    this._outIndex = new Map();

    /**
     * Incoming index: toID → Set<edgeKey>
     * @type {Map<string, Set<string>>}
     */
    this._inIndex = new Map();

    /** @type {function[]} Edge eviction/removal listeners */
    this._onRemove = [];
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * Add or update an edge. Deduplication by (from, to, type).
   * If the edge already exists, weight is updated and meta.updated is stamped.
   *
   * @param {string} from    Source node ID.
   * @param {string} to      Target node ID.
   * @param {string} type    Edge type (must be a valid EDGE_TYPE).
   * @param {number} [weight=1]  Edge weight.
   * @param {object} [extraData]  Additional data merged into the edge.
   * @returns {{ edge: object, created: boolean }}
   */
  addEdge(from, to, type, weight = 1, extraData = {}) {
    if (!from || !to) {
      throw new Error(`Edge requires both "from" and "to" node IDs. Got from="${from}", to="${to}"`);
    }
    if (!VALID_EDGE_TYPES.has(type)) {
      throw new Error(
        `Invalid edge type "${type}". Valid types: ${Array.from(VALID_EDGE_TYPES).join(', ')}`
      );
    }

    const key = this._edgeKey(from, to, type);
    const now = new Date().toISOString();
    const existing = this._edges.get(key);

    if (existing) {
      // Update existing edge
      existing.weight = weight;
      existing.meta.updated = now;
      Object.assign(existing, extraData, { from, to, type, weight, meta: existing.meta });
      return { edge: existing, created: false };
    }

    // Create new edge
    const edge = {
      from,
      to,
      type,
      weight,
      ...extraData,
      meta: {
        created: now,
        updated: now,
      },
    };

    this._edges.set(key, edge);

    // Update outIndex
    if (!this._outIndex.has(from)) {
      this._outIndex.set(from, new Set());
    }
    this._outIndex.get(from).add(key);

    // Update inIndex
    if (!this._inIndex.has(to)) {
      this._inIndex.set(to, new Set());
    }
    this._inIndex.get(to).add(key);

    return { edge, created: true };
  }

  /**
   * Get edges connected to a node.
   *
   * @param {string} id         Node ID.
   * @param {string} [direction='both']  'out', 'in', or 'both'.
   * @param {string} [type]     Filter by edge type (optional).
   * @returns {object[]}        Array of edge objects.
   */
  getEdges(id, direction = DIRECTION.BOTH, type) {
    const edges = [];

    if (direction === DIRECTION.OUT || direction === DIRECTION.BOTH) {
      const outKeys = this._outIndex.get(id);
      if (outKeys) {
        for (const key of outKeys) {
          const edge = this._edges.get(key);
          if (edge && (!type || edge.type === type)) {
            edges.push(edge);
          }
        }
      }
    }

    if (direction === DIRECTION.IN || direction === DIRECTION.BOTH) {
      const inKeys = this._inIndex.get(id);
      if (inKeys) {
        for (const key of inKeys) {
          const edge = this._edges.get(key);
          if (edge && (!type || edge.type === type)) {
            edges.push(edge);
          }
        }
      }
    }

    return edges;
  }

  /**
   * Get a specific edge by from, to, and type.
   * @param {string} from
   * @param {string} to
   * @param {string} type
   * @returns {object|undefined}
   */
  getEdge(from, to, type) {
    return this._edges.get(this._edgeKey(from, to, type));
  }

  /**
   * Check if a specific edge exists.
   * @param {string} from
   * @param {string} to
   * @param {string} type
   * @returns {boolean}
   */
  hasEdge(from, to, type) {
    return this._edges.has(this._edgeKey(from, to, type));
  }

  /**
   * Remove a specific edge.
   * @param {string} from
   * @param {string} to
   * @param {string} type
   * @returns {boolean}  True if the edge existed.
   */
  removeEdge(from, to, type) {
    const key = this._edgeKey(from, to, type);
    const edge = this._edges.get(key);
    if (!edge) return false;

    this._edges.delete(key);
    this._removeFromIndex(this._outIndex, from, key);
    this._removeFromIndex(this._inIndex, to, key);

    for (const listener of this._onRemove) {
      listener(edge);
    }

    return true;
  }

  /**
   * Cascade eviction: remove ALL edges connected to a node (both directions).
   * Called when a node is evicted from NodeStore.
   *
   * @param {string} nodeId  The node being removed.
   * @returns {object[]}     Array of removed edges.
   */
  removeEdgesForNode(nodeId) {
    const removed = [];

    // Remove outgoing edges
    const outKeys = this._outIndex.get(nodeId);
    if (outKeys) {
      for (const key of Array.from(outKeys)) {
        const edge = this._edges.get(key);
        if (edge) {
          this._edges.delete(key);
          this._removeFromIndex(this._inIndex, edge.to, key);
          removed.push(edge);
          for (const listener of this._onRemove) {
            listener(edge);
          }
        }
      }
      this._outIndex.delete(nodeId);
    }

    // Remove incoming edges
    const inKeys = this._inIndex.get(nodeId);
    if (inKeys) {
      for (const key of Array.from(inKeys)) {
        const edge = this._edges.get(key);
        if (edge) {
          this._edges.delete(key);
          this._removeFromIndex(this._outIndex, edge.from, key);
          removed.push(edge);
          for (const listener of this._onRemove) {
            listener(edge);
          }
        }
      }
      this._inIndex.delete(nodeId);
    }

    return removed;
  }

  /**
   * Get the total number of edges.
   * @returns {number}
   */
  get size() {
    return this._edges.size;
  }

  /**
   * Get all edges as an array.
   * @returns {object[]}
   */
  allEdges() {
    return Array.from(this._edges.values());
  }

  /**
   * Get all edges of a specific type.
   * @param {string} type
   * @returns {object[]}
   */
  getByType(type) {
    const result = [];
    for (const edge of this._edges.values()) {
      if (edge.type === type) {
        result.push(edge);
      }
    }
    return result;
  }

  /**
   * Get statistics.
   * @returns {object}
   */
  stats() {
    const typeCounts = {};
    for (const edge of this._edges.values()) {
      typeCounts[edge.type] = (typeCounts[edge.type] || 0) + 1;
    }
    return {
      totalEdges: this._edges.size,
      outIndexSize: this._outIndex.size,
      inIndexSize: this._inIndex.size,
      byType: typeCounts,
    };
  }

  /**
   * Register a removal listener.
   * @param {function} listener  Called with (removedEdge).
   */
  onRemove(listener) {
    this._onRemove.push(listener);
  }

  /**
   * Clear all edges and indexes.
   */
  clear() {
    this._edges.clear();
    this._outIndex.clear();
    this._inIndex.clear();
  }

  /**
   * Iterate all edges.
   * @returns {IterableIterator<object>}
   */
  [Symbol.iterator]() {
    return this._edges.values();
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  /**
   * Generate a unique edge key.
   * @param {string} from
   * @param {string} to
   * @param {string} type
   * @returns {string}
   */
  _edgeKey(from, to, type) {
    return `${from}|${to}|${type}`;
  }

  /**
   * Remove a key from an index Set. Cleans up empty Sets.
   * @param {Map<string, Set<string>>} index
   * @param {string} id
   * @param {string} key
   */
  _removeFromIndex(index, id, key) {
    const set = index.get(id);
    if (set) {
      set.delete(key);
      if (set.size === 0) {
        index.delete(id);
      }
    }
  }
}

module.exports = { EdgeStore, EDGE_TYPES, VALID_EDGE_TYPES, DIRECTION };
