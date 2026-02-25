'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Error keyword patterns used to detect errors in message content.
 * Matches against message text (case-insensitive where noted).
 */
const ERROR_KEYWORDS = [
  { pattern: /\bError\b/i, type: 'Error', severity: 'error' },
  { pattern: /\bENOENT\b/, type: 'ENOENT', severity: 'error' },
  { pattern: /\bfailed\b/i, type: 'Failed', severity: 'error' },
  { pattern: /\btimeout\b/i, type: 'Timeout', severity: 'warning' },
  { pattern: /\breject(?:ed)?\b/i, type: 'Rejected', severity: 'error' },
  { pattern: /\bENOTFOUND\b/, type: 'ENOTFOUND', severity: 'error' },
  { pattern: /\bECONNREFUSED\b/, type: 'ECONNREFUSED', severity: 'error' },
  { pattern: /\bEPERM\b/, type: 'EPERM', severity: 'error' },
  { pattern: /\bEACCES\b/, type: 'EACCES', severity: 'error' },
  { pattern: /\bstack trace\b/i, type: 'StackTrace', severity: 'error' },
  { pattern: /\bpanic\b/i, type: 'Panic', severity: 'critical' },
  { pattern: /\bcrash(?:ed)?\b/i, type: 'Crash', severity: 'critical' },
  { pattern: /\bsyntax\s*error\b/i, type: 'SyntaxError', severity: 'error' },
  { pattern: /\btype\s*error\b/i, type: 'TypeError', severity: 'error' },
  { pattern: /\breference\s*error\b/i, type: 'ReferenceError', severity: 'error' },
  { pattern: /\bmodule\s*not\s*found\b/i, type: 'ModuleNotFound', severity: 'error' },
  { pattern: /\bcommand\s*not\s*found\b/i, type: 'CommandNotFound', severity: 'warning' },
  { pattern: /\bpermission\s*denied\b/i, type: 'PermissionDenied', severity: 'error' },
  { pattern: /\bexception\b/i, type: 'Exception', severity: 'error' },
  { pattern: /\babort(?:ed)?\b/i, type: 'Aborted', severity: 'error' },
];

/**
 * Tool usage patterns — detect which MCP/CLI tools were invoked.
 */
const TOOL_PATTERNS = [
  { pattern: /\bmcp_bash\b/, tool: 'bash' },
  { pattern: /\bmcp_read\b/, tool: 'read' },
  { pattern: /\bmcp_write\b/, tool: 'write' },
  { pattern: /\bmcp_edit\b/, tool: 'edit' },
  { pattern: /\bmcp_glob\b/, tool: 'glob' },
  { pattern: /\bmcp_grep\b/, tool: 'grep' },
  { pattern: /\bmcp_lsp_/, tool: 'lsp' },
  { pattern: /\bgit\s+(commit|push|pull|status|diff|log|rebase)\b/, tool: 'git' },
  { pattern: /\bnpm\s+(install|run|test|build)\b/, tool: 'npm' },
  { pattern: /\bmcp_ast_grep/, tool: 'ast-grep' },
];

/**
 * BackfillEngine — parses historical OpenCode session logs and builds
 * graph entries (nodes + edges) for retroactive import into the memory graph.
 *
 * Reads from: ~/.opencode/messages/{session_id}/{msg_id}.json
 *
 * Message JSON schema:
 *   { id, sessionID, role, time: { created }, agent, model: { providerID, modelID }, path: { cwd } }
 *   Optional: parts[] (array of message content parts)
 */
class BackfillEngine {
  /**
   * @param {object} [opts]
   * @param {object} [opts.bridge]  GoraphdbBridge instance for persistence (optional).
   */
  constructor(opts = {}) {
    this._bridge = opts.bridge || null;
  }

  /**
   * Backfill graph from OpenCode session logs directory.
   *
   * Scans ~/.opencode/messages/{session_id}/ directories, reads all
   * message JSONs, extracts session metadata, error patterns, and tool usage,
   * then builds graph nodes and edges.
   *
   * @param {string} [logsDir]  Override default logs directory.
   * @returns {Promise<{ sessions_processed: number, errors_found: number, edges_created: number, tools_detected: number, entries: object[] }>}
   */
  /**
   * Backfill graph from OpenCode session logs directory.
   * 
   * MEMORY OPTIMIZATION: Processes sessions in batches and syncs to graph
   * incrementally to prevent memory exhaustion on large log directories.
   *
   * @param {string} [logsDir]  Override default logs directory.
   * @param {object} [opts]  Options for backfill processing.
   * @param {number} [opts.batchSize=10]  Number of sessions to process per batch.
   * @param {boolean} [opts.streamToGraph=true]  Sync entries to graph after each batch (frees memory).
   * @returns {Promise<{ sessions_processed: number, errors_found: number, edges_created: number, tools_detected: number, entries: object[] }>}
   */
  async backfillFromLogs(logsDir, opts = {}) {
    const { batchSize = 10, streamToGraph = true } = opts;
    const dir = logsDir || path.join(os.homedir(), '.opencode', 'messages');

    if (!fs.existsSync(dir)) {
      return { sessions_processed: 0, errors_found: 0, edges_created: 0, tools_detected: 0, entries: [] };
    }

    const sessionDirs = fs.readdirSync(dir).filter((name) => {
      const fullPath = path.join(dir, name);
      return fs.statSync(fullPath).isDirectory() && name.startsWith('ses_');
    });

    const edgeKeys = new Set();
    let errorsFound = 0;
    let toolsDetected = 0;
    
    // Only accumulate entries if NOT streaming to graph (for backward compat)
    const finalEntries = streamToGraph ? [] : [];

    // Process sessions in batches to prevent memory exhaustion
    for (let i = 0; i < sessionDirs.length; i += batchSize) {
      const batch = sessionDirs.slice(i, i + batchSize);
      const batchEntries = [];

      for (const sessionDir of batch) {
        const sessionPath = path.join(dir, sessionDir);
        const result = this._processSession(sessionPath, sessionDir);
        batchEntries.push(...result.entries);
        errorsFound += result.errorsFound;
        toolsDetected += result.toolsDetected;
      }

      // Count unique edges from this batch
      for (const entry of batchEntries) {
        edgeKeys.add(`${entry.session_id}::${entry.error_type}`);
      }

      // Stream batch to goraphdb if bridge available (frees memory after each batch)
      if (this._bridge && batchEntries.length > 0 && streamToGraph) {
        await this._syncToGraph(batchEntries, edgeKeys);
        // batchEntries will be GC'd after this iteration
      } else if (!streamToGraph) {
        finalEntries.push(...batchEntries);
      }
    }

    // If not streaming, sync all at once (legacy behavior)
    if (this._bridge && finalEntries.length > 0 && !streamToGraph) {
      await this._syncToGraph(finalEntries, edgeKeys);
    }

    return {
      sessions_processed: sessionDirs.length,
      errors_found: errorsFound,
      edges_created: edgeKeys.size,
      tools_detected: toolsDetected,
      entries: streamToGraph ? [] : finalEntries, // Empty array when streaming (already persisted)
    };
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  /**
   * Process a single session directory — read all message JSONs and extract
   * error patterns + tool usage.
   *
   * @private
   * @param {string} sessionPath  Full path to session directory.
   * @param {string} sessionId    Session directory name (= session ID).
   * @returns {{ entries: object[], errorsFound: number, toolsDetected: number }}
   */
  _processSession(sessionPath, sessionId) {
    const entries = [];
    let errorsFound = 0;
    let toolsDetected = 0;

    const msgFiles = fs.readdirSync(sessionPath).filter((f) => f.endsWith('.json'));

    for (const msgFile of msgFiles) {
      const msgPath = path.join(sessionPath, msgFile);
      let msg;

      try {
        const raw = fs.readFileSync(msgPath, 'utf-8');
        msg = JSON.parse(raw);
      } catch (_err) {
        continue; // Skip malformed JSON
      }

      const timestamp = msg.time && msg.time.created
        ? new Date(msg.time.created).toISOString()
        : new Date().toISOString();

      const sessionMeta = {
        session_id: msg.sessionID || sessionId,
        message_id: msg.id || msgFile.replace('.json', ''),
        timestamp,
        role: msg.role || 'unknown',
        agent: msg.agent || 'unknown',
        model: msg.model ? `${msg.model.providerID}/${msg.model.modelID}` : 'unknown',
        provider: msg.model ? msg.model.providerID : 'unknown',
        cwd: msg.path ? msg.path.cwd : null,
      };

      // Extract text content from message parts (if present)
      const textContent = this._extractTextContent(msg);

      // Detect error patterns in text content
      const errors = this._detectErrors(textContent);
      for (const error of errors) {
        entries.push({
          ...sessionMeta,
          error_type: error.type,
          message: error.match,
          severity: error.severity,
        });
        errorsFound++;
      }

      // Detect tool usage patterns
      const tools = this._detectTools(textContent);
      toolsDetected += tools.length;

      // If no errors found in this message, still record the session node
      // (will be useful for session-level metadata)
      if (errors.length === 0 && entries.filter((e) => e.session_id === sessionMeta.session_id).length === 0) {
        // Create a placeholder entry so this session appears in the graph
        entries.push({
          ...sessionMeta,
          error_type: '_session_meta',
          message: `Session with ${msgFiles.length} messages, agent: ${sessionMeta.agent}, model: ${sessionMeta.model}`,
          severity: 'info',
        });
      }
    }

    return { entries, errorsFound, toolsDetected };
  }

  /**
   * Extract all text content from a message, including parts if present.
   *
   * @private
   * @param {object} msg  Parsed message JSON.
   * @returns {string}    Combined text content.
   */
  _extractTextContent(msg) {
    const chunks = [];

    // Direct content field
    if (typeof msg.content === 'string') {
      chunks.push(msg.content);
    }

    // Parts array (OpenCode assistant messages)
    if (Array.isArray(msg.parts)) {
      for (const part of msg.parts) {
        if (typeof part === 'string') {
          chunks.push(part);
        } else if (part && typeof part.text === 'string') {
          chunks.push(part.text);
        } else if (part && typeof part.content === 'string') {
          chunks.push(part.content);
        } else if (part && part.type === 'tool-invocation' && part.toolName) {
          chunks.push(`tool:${part.toolName}`);
        } else if (part && part.type === 'tool-result' && typeof part.result === 'string') {
          chunks.push(part.result);
        }
      }
    }

    // Tool calls array
    if (Array.isArray(msg.toolCalls)) {
      for (const tc of msg.toolCalls) {
        if (tc.name) chunks.push(`tool:${tc.name}`);
        if (typeof tc.result === 'string') chunks.push(tc.result);
      }
    }

    return chunks.join('\n');
  }

  /**
   * Detect error patterns in text content.
   *
   * @private
   * @param {string} text  Combined text content from message.
   * @returns {{ type: string, match: string, severity: string }[]}
   */
  _detectErrors(text) {
    if (!text || text.length === 0) return [];

    const found = [];
    const seenTypes = new Set();

    for (const { pattern, type, severity } of ERROR_KEYWORDS) {
      const match = text.match(pattern);
      if (match && !seenTypes.has(type)) {
        seenTypes.add(type);

        // Extract context around the match (up to 120 chars)
        const idx = match.index;
        const start = Math.max(0, idx - 40);
        const end = Math.min(text.length, idx + match[0].length + 80);
        const context = text.substring(start, end).replace(/[\n\r]+/g, ' ').trim();

        found.push({ type, match: context, severity });
      }
    }

    return found;
  }

  /**
   * Detect tool usage patterns in text content.
   *
   * @private
   * @param {string} text  Combined text content from message.
   * @returns {{ tool: string }[]}
   */
  _detectTools(text) {
    if (!text || text.length === 0) return [];

    const found = [];
    const seenTools = new Set();

    for (const { pattern, tool } of TOOL_PATTERNS) {
      if (pattern.test(text) && !seenTools.has(tool)) {
        seenTools.add(tool);
        found.push({ tool });
      }
    }

    return found;
  }

  /**
   * Sync backfill entries to goraphdb via bridge.
   *
   * @private
   * @param {object[]} entries  Array of backfill entries.
   * @returns {Promise<void>}
   */
  async _syncToGraph(entries) {
    if (!this._bridge) return;

    const sessionMap = new Map();
    const errorMap = new Map();
    const edgeMap = new Map();

    for (const entry of entries) {
      const { session_id, timestamp, error_type, message, agent, model, severity } = entry;
      if (!session_id || !error_type) continue;

      // Session node
      if (!sessionMap.has(session_id)) {
        sessionMap.set(session_id, {
          id: session_id,
          first_seen: timestamp,
          last_seen: timestamp,
          agent: agent || 'unknown',
          model: model || 'unknown',
          error_count: 0,
        });
      }
      const sess = sessionMap.get(session_id);
      if (timestamp > sess.last_seen) sess.last_seen = timestamp;
      if (timestamp < sess.first_seen) sess.first_seen = timestamp;
      sess.error_count += 1;

      // Error node
      if (!errorMap.has(error_type)) {
        errorMap.set(error_type, {
          id: error_type,
          count: 0,
          first_seen: timestamp,
          last_seen: timestamp,
          severity: severity || 'error',
        });
      }
      const err = errorMap.get(error_type);
      err.count += 1;
      if (timestamp > err.last_seen) err.last_seen = timestamp;
      if (timestamp < err.first_seen) err.first_seen = timestamp;

      // Edge: Session -[HIT_ERROR]-> Error
      const edgeKey = `${session_id}::${error_type}`;
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, {
          weight: 0,
          first_seen: timestamp,
          last_seen: timestamp,
          messages: [],
        });
      }
      const edge = edgeMap.get(edgeKey);
      edge.weight += 1;
      if (timestamp > edge.last_seen) edge.last_seen = timestamp;
      if (timestamp < edge.first_seen) edge.first_seen = timestamp;
      if (message && edge.messages.length < 5) {
        edge.messages.push(message);
      }
    }

    // Upsert to goraphdb
    try {
      for (const [, data] of sessionMap) {
        await this._bridge.upsertNode('Session', data);
      }
      for (const [, data] of errorMap) {
        await this._bridge.upsertNode('Error', data);
      }
      for (const [key, data] of edgeMap) {
        const [from, to] = key.split('::');
        await this._bridge.upsertEdge('HIT_ERROR', from, to, data);
      }
    } catch (_err) {
      // Graceful degradation — goraphdb may not be running
    }
  }
}

module.exports = { BackfillEngine, ERROR_KEYWORDS, TOOL_PATTERNS };
