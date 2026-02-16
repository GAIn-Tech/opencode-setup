'use strict';

const { EventEmitter } = require('events');
const { NodeStore } = require('./node-store');
const { EdgeStore, EDGE_TYPES, DIRECTION } = require('./edge-store');

/**
 * MemoryGraphV3 — Enhanced graph engine with transactions and live events.
 *
 * Composes NodeStore (multi-type LRU) and EdgeStore (dual-indexed edges).
 * Provides atomic transactions via beginTransaction/commit/rollback.
 * Emits events for live change streaming.
 *
 * Events:
 *   - 'node-added'    (node)
 *   - 'node-updated'  (node)
 *   - 'node-removed'  (node)
 *   - 'edge-added'    (edge)
 *   - 'edge-updated'  (edge)
 *   - 'edge-removed'  (edge)
 *   - 'transaction-commit'  ({ nodeOps, edgeOps })
 *   - 'transaction-rollback' ({ reason })
 */
class MemoryGraphV3 extends EventEmitter {
  /**
   * @param {object} [opts]
   * @param {object} [opts.capacities]  Override NodeStore LRU capacities.
   */
  constructor(opts = {}) {
    super();

    /** @type {NodeStore} */
    this.nodes = new NodeStore(opts.capacities);

    /** @type {EdgeStore} */
    this.edges = new EdgeStore();

    /** @type {{ active: boolean, nodeOps: object[], edgeOps: object[], snapshot: object|null }} */
    this._tx = { active: false, nodeOps: [], edgeOps: [], snapshot: null };

    // Wire cascade eviction: when a node is evicted, remove its edges
    this.nodes.onEvict((evictedNode) => {
      const removedEdges = this.edges.removeEdgesForNode(evictedNode.id);
      this.emit('node-removed', evictedNode);
      for (const edge of removedEdges) {
        this.emit('edge-removed', edge);
      }
    });

    // Wire edge removal events
    this.edges.onRemove((edge) => {
      // Only emit if not already emitting from cascade (avoid double emit)
      // The cascade path emits its own 'edge-removed' events
    });
  }

  // ─── Node Operations ────────────────────────────────────────────────────

  /**
   * Add or update a node.
   * @param {string} id    Node ID ("type:identifier").
   * @param {object} [data]  Node data.
   * @returns {object}  The stored node.
   */
  addNode(id, data = {}) {
    const existed = this.nodes.has(id);
    const node = this.nodes.set(id, data);

    if (this._tx.active) {
      this._tx.nodeOps.push({ op: existed ? 'update' : 'add', node });
    }

    this.emit(existed ? 'node-updated' : 'node-added', node);
    return node;
  }

  /**
   * Get a node by ID.
   * @param {string} id
   * @returns {object|undefined}
   */
  getNode(id) {
    return this.nodes.get(id);
  }

  /**
   * Remove a node and cascade-remove all connected edges.
   * @param {string} id
   * @returns {boolean}
   */
  removeNode(id) {
    const node = this.nodes.peek(id);
    if (!node) return false;

    if (this._tx.active) {
      this._tx.nodeOps.push({ op: 'remove', node });
    }

    // Remove connected edges first
    const removedEdges = this.edges.removeEdgesForNode(id);
    for (const edge of removedEdges) {
      if (this._tx.active) {
        this._tx.edgeOps.push({ op: 'remove', edge });
      }
      this.emit('edge-removed', edge);
    }

    // Remove the node
    this.nodes.delete(id);
    this.emit('node-removed', node);
    return true;
  }

  // ─── Edge Operations ────────────────────────────────────────────────────

  /**
   * Add or update an edge.
   * @param {string} from
   * @param {string} to
   * @param {string} type
   * @param {number} [weight=1]
   * @param {object} [extraData]
   * @returns {object}  The edge.
   */
  addEdge(from, to, type, weight = 1, extraData = {}) {
    const { edge, created } = this.edges.addEdge(from, to, type, weight, extraData);

    if (this._tx.active) {
      this._tx.edgeOps.push({ op: created ? 'add' : 'update', edge });
    }

    this.emit(created ? 'edge-added' : 'edge-updated', edge);
    return edge;
  }

  /**
   * Get edges for a node.
   * @param {string} id
   * @param {string} [direction='both']
   * @param {string} [type]
   * @returns {object[]}
   */
  getEdges(id, direction = DIRECTION.BOTH, type) {
    return this.edges.getEdges(id, direction, type);
  }

  /**
   * Remove a specific edge.
   * @param {string} from
   * @param {string} to
   * @param {string} type
   * @returns {boolean}
   */
  removeEdge(from, to, type) {
    const edge = this.edges.getEdge(from, to, type);
    const removed = this.edges.removeEdge(from, to, type);

    if (removed && edge) {
      if (this._tx.active) {
        this._tx.edgeOps.push({ op: 'remove', edge });
      }
      this.emit('edge-removed', edge);
    }

    return removed;
  }

  // ─── Transaction API ────────────────────────────────────────────────────

  /**
   * Begin a transaction. All subsequent add/remove operations are tracked.
   * Only one transaction can be active at a time.
   *
   * @throws {Error}  If a transaction is already active.
   */
  beginTransaction() {
    if (this._tx.active) {
      throw new Error('Transaction already active. Commit or rollback first.');
    }

    // Snapshot current state for rollback
    this._tx = {
      active: true,
      nodeOps: [],
      edgeOps: [],
      snapshot: this._takeSnapshot(),
    };
  }

  /**
   * Commit the current transaction. Clears the operation log.
   *
   * @returns {{ nodeOps: number, edgeOps: number }}  Summary of operations.
   * @throws {Error}  If no transaction is active.
   */
  commit() {
    if (!this._tx.active) {
      throw new Error('No active transaction to commit.');
    }

    const summary = {
      nodeOps: this._tx.nodeOps.length,
      edgeOps: this._tx.edgeOps.length,
    };

    this.emit('transaction-commit', {
      nodeOps: this._tx.nodeOps,
      edgeOps: this._tx.edgeOps,
    });

    this._tx = { active: false, nodeOps: [], edgeOps: [], snapshot: null };
    return summary;
  }

  /**
   * Rollback the current transaction. Restores the graph to its pre-transaction state.
   *
   * @param {string} [reason]  Optional reason for rollback.
   * @throws {Error}  If no transaction is active.
   */
  rollback(reason) {
    if (!this._tx.active) {
      throw new Error('No active transaction to rollback.');
    }

    const snapshot = this._tx.snapshot;
    if (snapshot) {
      this._restoreSnapshot(snapshot);
    }

    this.emit('transaction-rollback', { reason: reason || 'explicit rollback' });
    this._tx = { active: false, nodeOps: [], edgeOps: [], snapshot: null };
  }

  /**
   * Check if a transaction is active.
   * @returns {boolean}
   */
  get inTransaction() {
    return this._tx.active;
  }

  // ─── Query Helpers ──────────────────────────────────────────────────────

  /**
   * Get neighbors of a node (nodes connected by edges).
   * @param {string} id
   * @param {string} [direction='both']
   * @param {string} [edgeType]
   * @returns {object[]}  Array of neighbor nodes.
   */
  neighbors(id, direction = DIRECTION.BOTH, edgeType) {
    const edges = this.getEdges(id, direction, edgeType);
    const neighborIds = new Set();

    for (const edge of edges) {
      if (edge.from === id) neighborIds.add(edge.to);
      if (edge.to === id) neighborIds.add(edge.from);
    }

    const nodes = [];
    for (const nid of neighborIds) {
      const node = this.nodes.peek(nid);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  /**
   * Get the degree of a node (number of connected edges).
   * @param {string} id
   * @param {string} [direction='both']
   * @returns {number}
   */
  degree(id, direction = DIRECTION.BOTH) {
    return this.getEdges(id, direction).length;
  }

  /**
   * Get comprehensive graph statistics.
   * @returns {object}
   */
  stats() {
    return {
      nodes: this.nodes.stats(),
      edges: this.edges.stats(),
      inTransaction: this._tx.active,
    };
  }

  /**
   * Clear the entire graph.
   */
  clear() {
    this.nodes.clear();
    this.edges.clear();
    this._tx = { active: false, nodeOps: [], edgeOps: [], snapshot: null };
  }

  // ─── Backward Compatibility ─────────────────────────────────────────────

  /**
   * Export graph in the v2-compatible format: { nodes: [], edges: [], meta: {} }
   * @returns {{ nodes: object[], edges: object[], meta: object }}
   */
  toV2Format() {
    const nodeStats = this.nodes.stats();
    const allNodes = [];
    const allEdges = this.edges.allEdges();

    for (const type of ['session', 'error', 'tool', 'model', 'agent']) {
      const typeNodes = this.nodes.getByType(type);
      for (const node of typeNodes) {
        // Flatten to v2 shape: { id, type, ...data, ...meta_fields }
        allNodes.push({
          id: node.id,
          type: node.type,
          ...node.data,
          created: node.meta.created,
          updated: node.meta.updated,
        });
      }
    }

    const v2Edges = allEdges.map((e) => ({
      from: e.from,
      to: e.to,
      type: e.type,
      weight: e.weight,
      created: e.meta.created,
      updated: e.meta.updated,
    }));

    return {
      nodes: allNodes,
      edges: v2Edges,
      meta: {
        ...nodeStats,
        totalEdges: allEdges.length,
        built_at: new Date().toISOString(),
        version: 3,
      },
    };
  }

  // ─── Internal: Snapshot / Restore ───────────────────────────────────────

  /**
   * Take a snapshot of the current graph state for transaction rollback.
   * Captures all nodes and edges as deep copies.
   *
   * @returns {{ nodes: Map<string, object>, edges: Map<string, object> }}
   */
  _takeSnapshot() {
    // Snapshot all nodes from global index
    const nodeSnapshot = new Map();
    for (const id of this.nodes.allIds()) {
      const node = this.nodes.peek(id);
      if (node) {
        nodeSnapshot.set(id, JSON.parse(JSON.stringify(node)));
      }
    }

    // Snapshot all edges
    const edgeSnapshot = new Map();
    for (const edge of this.edges) {
      const key = `${edge.from}|${edge.to}|${edge.type}`;
      edgeSnapshot.set(key, JSON.parse(JSON.stringify(edge)));
    }

    return { nodes: nodeSnapshot, edges: edgeSnapshot };
  }

  /**
   * Restore graph state from a snapshot.
   * @param {{ nodes: Map<string, object>, edges: Map<string, object> }} snapshot
   */
  _restoreSnapshot(snapshot) {
    // Clear current state
    this.nodes.clear();
    this.edges.clear();

    // Restore nodes
    for (const [id, node] of snapshot.nodes) {
      this.nodes.set(id, node.data);
      // Overwrite meta to match snapshot exactly
      const restored = this.nodes.peek(id);
      if (restored) {
        restored.meta = { ...node.meta };
      }
    }

    // Restore edges
    for (const [, edge] of snapshot.edges) {
      const { from, to, type, weight, meta, ...extra } = edge;
      const result = this.edges.addEdge(from, to, type, weight, extra);
      // Overwrite meta to match snapshot
      result.edge.meta = { ...meta };
    }
  }
}

module.exports = { MemoryGraphV3, EDGE_TYPES, DIRECTION };
