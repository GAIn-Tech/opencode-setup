'use strict';

const path = require('path');
const { parseLog, parseLogs, buildGraphWithBridge } = require('./graph-builder');
const { toJSON, toDOT, toCSV, writeExport } = require('./exporter');
const { GraphActivator } = require('./activator');
const { BackfillEngine } = require('./backfill');

// Lazy-load bridge to avoid hard dependency during testing
let GoraphdbBridge;
try {
  GoraphdbBridge = require('opencode-goraphdb-bridge').GoraphdbBridge;
} catch (e) {
  // Bridge not available; will use fallback
  GoraphdbBridge = null;
}

/**
 * MemoryGraph — session-to-error graph builder from OpenCode logs with goraphdb persistence.
 *
 * Usage:
 *   const mg = new MemoryGraph();
 *   await mg.buildGraph('~/.opencode/logs/');
 *   mg.getErrorFrequency();               // Array of {error_type, count, first_seen, last_seen}
 *   mg.getSessionPath('ses_abc123');       // ordered error sequence
 *   mg.export('dot', './graph.dot');       // write Graphviz file
 */
class MemoryGraph {
  constructor(bridgeConfig = {}) {
    /** @type {GoraphdbBridge | null} */
    this._bridge = GoraphdbBridge ? new GoraphdbBridge(bridgeConfig) : null;
    /** @type {{ nodes: object[], edges: object[] , meta: object } | null} */
    this._graph = null;
    /** @type {object[]} */
    this._entries = [];

    // Activation system — ON by default to collect learning data
    this._backfillEngine = new BackfillEngine({ bridge: this._bridge });
    this._activator = new GraphActivator({
      backfillEngine: this._backfillEngine,
      bridge: this._bridge,
    });
    this._activated = true;
    
    // Performance indexes for O(1) lookups instead of O(n) filters
    this._indexes = {
      byType: new Map(),        // node type → array of nodes
      bySession: new Map(),     // session_id → session node
      byError: new Map(),       // error_type → array of error nodes
      byTimestamp: [],          // sorted array of nodes by timestamp
    };
  }

  // ─── Core API ───────────────────────────────────────────────────────────

  /**
   * Build the session→error graph from log file(s), directory, or raw array.
   * Automatically syncs data to goraphdb backend if available.
   *
   * @param {string|string[]|object[]} source
   *   - string / string[]  → file path(s) or directory (parsed via parseLog/parseLogs)
   *   - object[]           → already-parsed entries [{session_id, timestamp, error_type, message}]
   * @returns {Promise<{ nodes: object[], edges: object[], meta: object }>}
   */
  async buildGraph(source) {
    if (Array.isArray(source) && source.length > 0 && typeof source[0] === 'object') {
      this._entries = source;
    } else {
      this._entries = parseLogs(source);
    }

    // When active: persist to goraphdb via bridge
    // When inactive: in-memory only (bridge=null), existing behavior preserved
    const effectiveBridge = this._activator.isActive() ? this._bridge : null;
    this._graph = await buildGraphWithBridge(this._entries, effectiveBridge);
    
    // Rebuild indexes for O(1) queries (async to avoid blocking)
    await this._rebuildIndexes();
    
    // P2: Learning Feedback Loop - Auto-ingest error patterns into LearningEngine
    await this._ingestPatternsToLearningEngine();
    
    return this._graph;
  }

  /**
   * P2: Auto-ingest frequent error patterns into LearningEngine
   * @private
   */
  async _ingestPatternsToLearningEngine() {
    let LearningEngine;
    try {
      LearningEngine = require('opencode-learning-engine');
    } catch (e) {
      return; // Learning engine not available
    }
    
    const frequentErrors = this.getErrorFrequency();
    if (!frequentErrors || frequentErrors.length === 0) {
      return;
    }
    
    try {
      const le = new LearningEngine();
      for (const error of frequentErrors.slice(0, 10)) {
        if (error.count >= 3) {
          await le.record({
            type: 'anti_pattern',
            pattern: error.error_type,
            context: {
              source: 'memory-graph',
              count: error.count,
              firstSeen: error.first_seen,
              lastSeen: error.last_seen
            },
            severity: error.count > 10 ? 'high' : error.count > 5 ? 'medium' : 'low'
          });
        }
      }
    } catch (e) {
      console.warn('[MemoryGraph] Failed to ingest patterns to LearningEngine:', e.message);
      // Emit error event for monitoring
      if (this.emit) {
        this.emit('learningIngestError', { error: e.message, errorCount: frequentErrors?.length || 0 });
      }
    }
  }

  /**
   * Synchronously build graph (fallback for backward compatibility).
   * Note: Does not sync to goraphdb. Use async buildGraph() for full functionality.
   *
   * @param {string|string[]|object[]} source
   * @returns {{ nodes: object[], edges: object[], meta: object }}
   */
  buildGraphSync(source) {
    if (Array.isArray(source) && source.length > 0 && typeof source[0] === 'object') {
      this._entries = source;
    } else {
      this._entries = parseLogs(source);
    }

    const { buildGraph } = require('./graph-builder');
    this._graph = buildGraph(this._entries);
    
    // Rebuild indexes for O(1) queries (async, non-blocking)
    this._rebuildIndexes().catch(err => 
      console.warn('[MemoryGraph] Index rebuild failed:', err.message)
    );
    return this._graph;
  }

  /**
   * Get the current graph (throws if buildGraph hasn't been called).
   * @returns {{ nodes: object[], edges: object[], meta: object }}
   */
  getGraph() {
    this._ensureBuilt();
    return this._graph;
  }

  /**
   * Rebuild performance indexes for O(1) lookups.
   * Uses async chunked processing to avoid blocking event loop.
   * @returns {Promise<void>}
   */
  async _rebuildIndexes() {
    if (!this._graph) return;
    
    // Reset indexes
    this._indexes = {
      byType: new Map(),
      bySession: new Map(),
      byError: new Map(),
      byTimestamp: [],
    };
    
    // Chunk size for non-blocking processing
    const CHUNK_SIZE = 500;
    const nodes = this._graph.nodes;
    
    // Process in chunks with setImmediate to avoid blocking
    for (let i = 0; i < nodes.length; i += CHUNK_SIZE) {
      const chunk = nodes.slice(i, i + CHUNK_SIZE);
      
      // Process chunk synchronously
      for (const node of chunk) {
        // Index by type
        if (!this._indexes.byType.has(node.type)) {
          this._indexes.byType.set(node.type, []);
        }
        this._indexes.byType.get(node.type).push(node);
        
        // Index by session
        if (node.type === 'session' && node.id) {
          this._indexes.bySession.set(node.id, node);
        }
        
        // Index by error type
        if (node.type === 'error' && node.error_type) {
          if (!this._indexes.byError.has(node.error_type)) {
            this._indexes.byError.set(node.error_type, []);
          }
          this._indexes.byError.get(node.error_type).push(node);
        }
        
        // Index by timestamp
        if (node.timestamp) {
          this._indexes.byTimestamp.push({ node, ts: new Date(node.timestamp).getTime() });
        }
      }
      
      // Yield to event loop between chunks
      if (i + CHUNK_SIZE < nodes.length) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    // Sort by timestamp
    this._indexes.byTimestamp.sort((a, b) => b.ts - a.ts);
  }

  /**
   * Get indexed nodes by type - O(1) instead of O(n) filter
   * @param {string} type - node type (session, error, model, provider)
   * @returns {object[]}
   */
  getNodesByType(type) {
    this._ensureBuilt();
    return this._indexes.byType.get(type) || [];
  }

  /**
   * Get session node by ID - O(1) lookup
   * @param {string} sessionId
   * @returns {object|null}
   */
  getSessionById(sessionId) {
    this._ensureBuilt();
    return this._indexes.bySession.get(sessionId) || null;
  }

  /**
   * Get errors by type - O(1) lookup
   * @param {string} errorType
   * @returns {object[]}
   */
  getErrorsByType(errorType) {
    this._ensureBuilt();
    return this._indexes.byError.get(errorType) || [];
  }

  // ─── Query API ──────────────────────────────────────────────────────────

  /**
   * Get error frequency map, sorted descending by count.
   * Queries goraphdb backend via Cypher if available, otherwise uses in-memory graph.
   * @returns {Promise<{ error_type: string, count: number, first_seen: string, last_seen: string }[]>}
   */
  async getErrorFrequency() {
    this._ensureBuilt();
    if (this._bridge) {
      return this._bridge.queryErrorFrequency();
    }
    // Fallback: use in-memory graph
    return this._graph.nodes
      .filter((n) => n.type === 'error')
      .map((n) => ({
        error_type: n.id,
        count: n.count,
        first_seen: n.first_seen,
        last_seen: n.last_seen,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get the sequence of errors encountered in a specific session, ordered by timestamp.
   * Queries goraphdb backend via Cypher if available, otherwise uses in-memory entries.
   *
   * @param {string} sessionId
   * @returns {Promise<{ error_type: string, timestamp: string, message: string }[]>}
   */
  async getSessionPath(sessionId) {
    this._ensureBuilt();
    if (this._bridge) {
      return this._bridge.querySessionPath(sessionId);
    }
    // Fallback: use in-memory entries
    return this._entries
      .filter((e) => e.session_id === sessionId)
      .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
      .map((e) => ({
        error_type: e.error_type,
        timestamp: e.timestamp,
        message: e.message,
      }));
  }

  /**
   * List all session IDs in the graph.
   * Queries goraphdb backend via Cypher if available, otherwise uses in-memory graph.
   * @returns {Promise<string[]>}
   */
  async getSessions() {
    this._ensureBuilt();
    if (this._bridge) {
      return this._bridge.querySessions();
    }
    // Fallback: use in-memory graph
    return this._graph.nodes.filter((n) => n.type === 'session').map((n) => n.id);
  }

  /**
   * List all error types in the graph.
   * Queries goraphdb backend via Cypher if available, otherwise uses in-memory graph.
   * @returns {Promise<string[]>}
   */
  async getErrorTypes() {
    this._ensureBuilt();
    if (this._bridge) {
      return this._bridge.queryErrorTypes();
    }
    // Fallback: use in-memory graph
    return this._graph.nodes.filter((n) => n.type === 'error').map((n) => n.id);
  }

  /**
   * Get edges for a specific session (which errors it hit and how often).
   * Queries goraphdb backend via Cypher if available, otherwise uses in-memory graph.
   * @param {string} sessionId
   * @returns {Promise<{ error_type: string, weight: number, first_seen: string, last_seen: string }[]>}
   */
  async getSessionErrors(sessionId) {
    this._ensureBuilt();
    if (this._bridge) {
      return this._bridge.querySessionErrors(sessionId);
    }
    // Fallback: use in-memory graph
    return this._graph.edges
      .filter((e) => e.from === sessionId)
      .map((e) => ({
        error_type: e.to,
        weight: e.weight,
        first_seen: e.first_seen,
        last_seen: e.last_seen,
      }))
      .sort((a, b) => b.weight - a.weight);
  }

  /**
   * Get sessions that encountered a specific error type.
   * Queries goraphdb backend via Cypher if available, otherwise uses in-memory graph.
   * @param {string} errorType
   * @returns {Promise<{ session_id: string, weight: number }[]>}
   */
  async getErrorSessions(errorType) {
    this._ensureBuilt();
    if (this._bridge) {
      return this._bridge.queryErrorSessions(errorType);
    }
    // Fallback: use in-memory graph
    return this._graph.edges
      .filter((e) => e.to === errorType)
      .map((e) => ({ session_id: e.from, weight: e.weight }))
      .sort((a, b) => b.weight - a.weight);
  }

  // ─── Export API ─────────────────────────────────────────────────────────

  /**
   * Export the graph to a file or return as string.
   * Fetches data from goraphdb backend if available, otherwise uses in-memory graph.
   *
   * @param {'json'|'dot'|'csv'} format
   * @param {string} [outputPath]  If omitted, returns the string content.
   * @param {object} [opts]        Format-specific options passed to exporter.
   * @returns {Promise<string>}    The exported content (also written to file if outputPath given).
   */
  async export(format, outputPath, opts = {}) {
    this._ensureBuilt();

    // Fetch fresh graph data from goraphdb or use in-memory
    let graph = this._graph;
    if (this._bridge) {
      graph = await this._bridge.exportGraph();
    }

    let content;
    switch (format) {
      case 'json':
        content = toJSON(graph, opts);
        break;
      case 'dot':
        content = toDOT(graph, opts);
        break;
      case 'csv':
        content = toCSV(graph, opts);
        break;
      default:
        throw new Error(`Unsupported export format: "${format}". Use "json", "dot", or "csv".`);
    }

    if (outputPath) {
      writeExport(content, outputPath);
    }

    return content;
  }

  // ─── Activation API ─────────────────────────────────────────────────────

  /**
   * Activate graph-memory collection. OFF by default.
   * When activated: auto-backfills from historical OpenCode session logs
   * and enables goraphdb persistence for future buildGraph() calls.
   *
   * @param {object} [opts]
   * @param {string} [opts.logsDir]      Override logs directory for backfill.
   * @param {boolean} [opts.skipBackfill] Skip automatic backfill on activation.
   * @returns {Promise<{ activated: boolean, backfill: object|null }>}
   */
  async activate(opts = {}) {
    return this._activator.activate(opts);
  }

  /**
   * Deactivate graph-memory collection.
   * Data persists in goraphdb — only stops future collection.
   * buildGraph() still works in-memory when inactive.
   *
   * @returns {{ deactivated: boolean }}
   */
  deactivate() {
    return this._activator.deactivate();
  }

  /**
   * Check whether graph-memory collection is currently active.
   * @returns {boolean}
   */
  isActive() {
    return this._activator.isActive();
  }

  /**
   * Run retroactive backfill from historical OpenCode session logs.
   * Can be called independently of activate() for manual backfill.
   *
   * @param {string} [logsDir]  Override default logs directory.
   * @returns {Promise<{ sessions_processed: number, errors_found: number, edges_created: number, tools_detected: number, entries: object[] }>}
   */
  async backfill(logsDir) {
    return this._backfillEngine.backfillFromLogs(logsDir);
  }

  /**
   * Get activation status with metadata.
   * @returns {{ active: boolean, sessions_tracked: number, last_backfill: string|null }}
   */
  activationStatus() {
    return this._activator.status();
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  /** @private */
  _ensureBuilt() {
    if (!this._graph) {
      throw new Error('Graph not built yet. Call buildGraph() first.');
    }
  }
}

module.exports = {
  MemoryGraph,
  GraphActivator,
  BackfillEngine,
  parseLog,
  parseLogs,
  buildGraphWithBridge,
  toJSON,
  toDOT,
  toCSV,
};
