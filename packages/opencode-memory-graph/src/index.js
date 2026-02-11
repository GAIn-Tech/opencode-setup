'use strict';

const path = require('path');
const { parseLog, parseLogs, buildGraph } = require('./graph-builder');
const { toJSON, toDOT, toCSV, writeExport } = require('./exporter');

/**
 * MemoryGraph — session-to-error graph builder from OpenCode logs.
 *
 * Usage:
 *   const mg = new MemoryGraph();
 *   mg.buildGraph('~/.opencode/logs/');
 *   mg.getErrorFrequency();               // Map<error_type, count>
 *   mg.getSessionPath('ses_abc123');       // ordered error sequence
 *   mg.export('dot', './graph.dot');       // write Graphviz file
 */
class MemoryGraph {
  constructor() {
    /** @type {{ nodes: object[], edges: object[], meta: object } | null} */
    this._graph = null;
    /** @type {object[]} */
    this._entries = [];
  }

  // ─── Core API ───────────────────────────────────────────────────────────

  /**
   * Build the session→error graph from log file(s), directory, or raw array.
   *
   * @param {string|string[]|object[]} source
   *   - string / string[]  → file path(s) or directory (parsed via parseLog/parseLogs)
   *   - object[]           → already-parsed entries [{session_id, timestamp, error_type, message}]
   * @returns {{ nodes: object[], edges: object[], meta: object }}
   */
  buildGraph(source) {
    if (Array.isArray(source) && source.length > 0 && typeof source[0] === 'object') {
      this._entries = source;
    } else {
      this._entries = parseLogs(source);
    }

    this._graph = buildGraph(this._entries);
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

  // ─── Query API ──────────────────────────────────────────────────────────

  /**
   * Get error frequency map, sorted descending by count.
   * @returns {{ error_type: string, count: number, first_seen: string, last_seen: string }[]}
   */
  getErrorFrequency() {
    this._ensureBuilt();
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
   *
   * @param {string} sessionId
   * @returns {{ error_type: string, timestamp: string, message: string }[]}
   */
  getSessionPath(sessionId) {
    this._ensureBuilt();

    // Pull from raw entries for ordering fidelity
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
   * @returns {string[]}
   */
  getSessions() {
    this._ensureBuilt();
    return this._graph.nodes.filter((n) => n.type === 'session').map((n) => n.id);
  }

  /**
   * List all error types in the graph.
   * @returns {string[]}
   */
  getErrorTypes() {
    this._ensureBuilt();
    return this._graph.nodes.filter((n) => n.type === 'error').map((n) => n.id);
  }

  /**
   * Get edges for a specific session (which errors it hit and how often).
   * @param {string} sessionId
   * @returns {{ error_type: string, weight: number, first_seen: string, last_seen: string }[]}
   */
  getSessionErrors(sessionId) {
    this._ensureBuilt();
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
   * @param {string} errorType
   * @returns {{ session_id: string, weight: number }[]}
   */
  getErrorSessions(errorType) {
    this._ensureBuilt();
    return this._graph.edges
      .filter((e) => e.to === errorType)
      .map((e) => ({ session_id: e.from, weight: e.weight }))
      .sort((a, b) => b.weight - a.weight);
  }

  // ─── Export API ─────────────────────────────────────────────────────────

  /**
   * Export the graph to a file or return as string.
   *
   * @param {'json'|'dot'|'csv'} format
   * @param {string} [outputPath]  If omitted, returns the string content.
   * @param {object} [opts]        Format-specific options passed to exporter.
   * @returns {string}             The exported content (also written to file if outputPath given).
   */
  export(format, outputPath, opts = {}) {
    this._ensureBuilt();

    let content;
    switch (format) {
      case 'json':
        content = toJSON(this._graph, opts);
        break;
      case 'dot':
        content = toDOT(this._graph, opts);
        break;
      case 'csv':
        content = toCSV(this._graph, opts);
        break;
      default:
        throw new Error(`Unsupported export format: "${format}". Use "json", "dot", or "csv".`);
    }

    if (outputPath) {
      writeExport(content, outputPath);
    }

    return content;
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  /** @private */
  _ensureBuilt() {
    if (!this._graph) {
      throw new Error('Graph not built yet. Call buildGraph() first.');
    }
  }
}

module.exports = { MemoryGraph, parseLog, parseLogs, buildGraph, toJSON, toDOT, toCSV };
