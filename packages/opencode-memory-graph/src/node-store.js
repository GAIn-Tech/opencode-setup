'use strict';

/**
 * NodeStore — Multi-type LRU node storage for Memory Graph v3.
 *
 * Manages separate LRU maps per node type with configurable capacity limits.
 * Provides a unified get/set API that routes to the correct map based on ID prefix.
 *
 * Node shape: { id, type, data: {}, meta: { created, updated } }
 * ID format:  "type:identifier" (e.g., "session:abc123", "error:TypeError")
 */

// ─── LRUMap Implementation ─────────────────────────────────────────────────

/**
 * Simple LRU cache using Map's insertion-order guarantee.
 * On access (get/set), entries are moved to the end (most recent).
 * Eviction removes from the front (least recent).
 */
class LRUMap {
  /**
   * @param {number} capacity  Maximum number of entries.
   */
  constructor(capacity) {
    if (!Number.isFinite(capacity) || capacity < 1) {
      throw new Error(`LRUMap capacity must be a positive integer, got: ${capacity}`);
    }
    this._capacity = capacity;
    this._map = new Map();
  }

  /** @returns {number} Current number of entries. */
  get size() {
    return this._map.size;
  }

  /** @returns {number} Maximum capacity. */
  get capacity() {
    return this._capacity;
  }

  /**
   * Get a value and promote it to most-recently-used.
   * @param {string} key
   * @returns {*} The value, or undefined if not found.
   */
  get(key) {
    if (!this._map.has(key)) return undefined;
    const value = this._map.get(key);
    // Move to end (most recent)
    this._map.delete(key);
    this._map.set(key, value);
    return value;
  }

  /**
   * Set a value. Evicts LRU entry if at capacity.
   * @param {string} key
   * @param {*} value
   * @returns {{ evicted: boolean, evictedKey?: string, evictedValue?: * }}
   */
  set(key, value) {
    let result = { evicted: false };

    // If key exists, remove it first (will be re-added at end)
    if (this._map.has(key)) {
      this._map.delete(key);
    } else if (this._map.size >= this._capacity) {
      // Evict LRU (first entry in Map)
      const firstKey = this._map.keys().next().value;
      const firstValue = this._map.get(firstKey);
      this._map.delete(firstKey);
      result = { evicted: true, evictedKey: firstKey, evictedValue: firstValue };
    }

    this._map.set(key, value);
    return result;
  }

  /**
   * Check if a key exists (does NOT promote).
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this._map.has(key);
  }

  /**
   * Delete a key.
   * @param {string} key
   * @returns {boolean} True if the key existed.
   */
  delete(key) {
    return this._map.delete(key);
  }

  /**
   * Peek at a value without promoting it.
   * @param {string} key
   * @returns {*}
   */
  peek(key) {
    return this._map.get(key);
  }

  /** Clear all entries. */
  clear() {
    this._map.clear();
  }

  /** @returns {IterableIterator<string>} */
  keys() {
    return this._map.keys();
  }

  /** @returns {IterableIterator<*>} */
  values() {
    return this._map.values();
  }

  /** @returns {IterableIterator<[string, *]>} */
  entries() {
    return this._map.entries();
  }

  /** @returns {IterableIterator<[string, *]>} */
  [Symbol.iterator]() {
    return this._map[Symbol.iterator]();
  }

  /**
   * Iterate with forEach.
   * @param {function} callback
   */
  forEach(callback) {
    this._map.forEach(callback);
  }
}

// ─── Node Type Configuration ────────────────────────────────────────────────

/** Default LRU capacity per node type */
const DEFAULT_CAPACITIES = {
  session: 5000,
  error: 3000,
  tool: 500,
  model: 100,
  agent: 200,
};

/** Recognized node type prefixes */
const NODE_TYPES = Object.keys(DEFAULT_CAPACITIES);

// ─── NodeStore ──────────────────────────────────────────────────────────────

class NodeStore {
  /**
   * @param {object} [capacities]  Override default capacities per type.
   *   e.g., { session: 10000, error: 5000 }
   */
  constructor(capacities = {}) {
    /** @type {Map<string, LRUMap>} Type → LRUMap */
    this._stores = new Map();

    /** @type {Map<string, *>} Global index: id → node (for fast cross-type lookup) */
    this._globalIndex = new Map();

    /** @type {function[]} Eviction listeners */
    this._onEvict = [];

    // Initialize one LRUMap per type
    const mergedCaps = { ...DEFAULT_CAPACITIES, ...capacities };
    for (const [type, cap] of Object.entries(mergedCaps)) {
      this._stores.set(type, new LRUMap(cap));
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * Get a node by ID. Routes to the correct LRU map based on ID prefix.
   *
   * @param {string} id  Node ID in "type:identifier" format.
   * @returns {object|undefined}  The node, or undefined.
   */
  get(id) {
    const { type, localId } = this._parseId(id);
    const store = this._stores.get(type);
    if (!store) return undefined;
    return store.get(localId);
  }

  /**
   * Set (upsert) a node. Routes to the correct LRU map.
   * Automatically stamps meta.created (on insert) and meta.updated (always).
   *
   * @param {string} id    Node ID in "type:identifier" format.
   * @param {object} data  Node data payload.
   * @returns {object}  The stored node.
   */
  set(id, data = {}) {
    const { type, localId } = this._parseId(id);
    const store = this._stores.get(type);
    if (!store) {
      throw new Error(`Unknown node type "${type}" in ID "${id}". Known types: ${NODE_TYPES.join(', ')}`);
    }

    const now = new Date().toISOString();
    const existing = store.peek(localId);

    const node = {
      id,
      type,
      data: { ...(existing ? existing.data : {}), ...data },
      meta: {
        created: existing ? existing.meta.created : now,
        updated: now,
      },
    };

    const result = store.set(localId, node);
    this._globalIndex.set(id, node);

    // Handle eviction
    if (result.evicted && result.evictedValue) {
      const evictedNode = result.evictedValue;
      this._globalIndex.delete(evictedNode.id);
      for (const listener of this._onEvict) {
        listener(evictedNode);
      }
    }

    return node;
  }

  /**
   * Check if a node exists.
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    const { type, localId } = this._parseId(id);
    const store = this._stores.get(type);
    return store ? store.has(localId) : false;
  }

  /**
   * Delete a node.
   * @param {string} id
   * @returns {boolean}  True if the node existed.
   */
  delete(id) {
    const { type, localId } = this._parseId(id);
    const store = this._stores.get(type);
    if (!store) return false;
    const existed = store.delete(localId);
    if (existed) {
      this._globalIndex.delete(id);
    }
    return existed;
  }

  /**
   * Get all nodes of a specific type.
   * @param {string} type  Node type (e.g., 'session', 'error').
   * @returns {object[]}   Array of nodes.
   */
  getByType(type) {
    const store = this._stores.get(type);
    if (!store) return [];
    return Array.from(store.values());
  }

  /**
   * Get the total count of all nodes across all types.
   * @returns {number}
   */
  get totalSize() {
    let total = 0;
    for (const store of this._stores.values()) {
      total += store.size;
    }
    return total;
  }

  /**
   * Get size info per type.
   * @returns {object}  { session: { size, capacity }, error: { size, capacity }, ... }
   */
  stats() {
    const stats = {};
    for (const [type, store] of this._stores) {
      stats[type] = { size: store.size, capacity: store.capacity };
    }
    stats.total = this.totalSize;
    return stats;
  }

  /**
   * Register an eviction listener. Called when a node is evicted from an LRU map.
   * @param {function} listener  Called with (evictedNode).
   */
  onEvict(listener) {
    this._onEvict.push(listener);
  }

  /**
   * Manually trigger eviction for a type. Removes the LRU entry.
   * @param {string} type
   * @returns {object|null}  The evicted node, or null if the store was empty.
   */
  evict(type) {
    const store = this._stores.get(type);
    if (!store || store.size === 0) return null;

    const firstKey = store.keys().next().value;
    const node = store.peek(firstKey);
    store.delete(firstKey);

    if (node) {
      this._globalIndex.delete(node.id);
      for (const listener of this._onEvict) {
        listener(node);
      }
    }

    return node || null;
  }

  /**
   * Look up a node from the global index (O(1), no LRU promotion).
   * @param {string} id
   * @returns {object|undefined}
   */
  peek(id) {
    return this._globalIndex.get(id);
  }

  /**
   * Get all node IDs.
   * @returns {string[]}
   */
  allIds() {
    return Array.from(this._globalIndex.keys());
  }

  /**
   * Clear all stores.
   */
  clear() {
    for (const store of this._stores.values()) {
      store.clear();
    }
    this._globalIndex.clear();
  }

  /**
   * Register a new node type at runtime.
   * @param {string} type
   * @param {number} capacity
   */
  registerType(type, capacity) {
    if (this._stores.has(type)) {
      throw new Error(`Node type "${type}" is already registered.`);
    }
    this._stores.set(type, new LRUMap(capacity));
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  /**
   * Parse an ID into type and local identifier.
   * @param {string} id  "type:localId"
   * @returns {{ type: string, localId: string }}
   */
  _parseId(id) {
    if (typeof id !== 'string' || !id.includes(':')) {
      throw new Error(`Invalid node ID "${id}". Expected format: "type:identifier" (e.g., "session:abc123")`);
    }
    const colonIdx = id.indexOf(':');
    const type = id.substring(0, colonIdx);
    const localId = id.substring(colonIdx + 1);
    if (!localId) {
      throw new Error(`Invalid node ID "${id}". Identifier after ":" cannot be empty.`);
    }
    return { type, localId };
  }
}

module.exports = { NodeStore, LRUMap, DEFAULT_CAPACITIES, NODE_TYPES };
