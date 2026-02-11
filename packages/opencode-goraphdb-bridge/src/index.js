'use strict';

const GoraphDBClient = require('./client');
const {
  ALL_SCHEMAS,
  getAllDDL,
  getSchemaDDL,
  getQuery,
  getNodeTemplate,
  validateNodeProps,
} = require('./schemas');

/**
 * GraphDBBridge — Unified MCP wrapper over goraphdb REST API.
 *
 * Bridges three schema domains:
 * - session_error (opencode-memory-graph)
 * - runbook (opencode-runbooks)
 * - eval (opencode-eval-harness)
 *
 * Usage:
 *   const bridge = new GraphDBBridge({ host: 'localhost', port: 7687 });
 *   await bridge.initializeSchemas();
 *   const nodeId = await bridge.upsertNode('Session', { sessionId: 'abc', startedAt: Date.now() });
 */
class GraphDBBridge {
  /**
   * @param {Object} options - passed through to GoraphDBClient
   * @param {string} [options.host='localhost']
   * @param {number} [options.port=7687]
   * @param {string} [options.protocol='http']
   * @param {number} [options.timeout=10000]
   * @param {boolean} [options.validateProps=true] - validate node props against schema
   * @param {boolean} [options.autoInit=false] - auto-initialize schemas on first operation
   */
  constructor(options = {}) {
    this.client = new GoraphDBClient(options);
    this.validateProps = options.validateProps !== false;
    this.autoInit = options.autoInit || false;
    this._initialized = false;
    this._initPromise = null;
  }

  // ─── Schema Initialization ──────────────────────────────────────────

  /**
   * Initialize all schemas (constraints + indexes) on the goraphdb server.
   * Safe to call multiple times — uses CREATE ... IF NOT EXISTS.
   * @param {string[]} [schemaNames] - specific schemas to init, or all if omitted
   * @returns {Promise<{ executed: number, errors: string[] }>}
   */
  async initializeSchemas(schemaNames) {
    const ddlStatements = schemaNames
      ? schemaNames.flatMap((name) => getSchemaDDL(name))
      : getAllDDL();

    const errors = [];
    let executed = 0;

    for (const ddl of ddlStatements) {
      try {
        await this.client.cypher(ddl);
        executed++;
      } catch (err) {
        errors.push(`${ddl.substring(0, 60)}... → ${err.message}`);
      }
    }

    this._initialized = true;
    return { executed, errors, total: ddlStatements.length };
  }

  /**
   * Ensure schemas are initialized (lazy init for autoInit mode).
   */
  async _ensureInit() {
    if (this._initialized) return;
    if (!this.autoInit) return;
    if (!this._initPromise) {
      this._initPromise = this.initializeSchemas();
    }
    await this._initPromise;
  }

  // ─── Node Operations ──────────────────────────────────────────────

  /**
   * Upsert a node: create if not exists, merge properties if exists.
   * Uses MERGE on the first required property as the identity key.
   *
   * @param {string} type - Node type (e.g. 'Session', 'Error', 'TestCase', 'Model')
   * @param {Object} props - Node properties
   * @param {string} [schema] - Schema name for validation; auto-detected if omitted
   * @returns {Promise<Object>} - { id, labels, properties }
   */
  async upsertNode(type, props, schema) {
    await this._ensureInit();

    // Auto-detect schema from node type
    const schemaName = schema || this._detectSchema(type);

    // Validate properties if enabled
    if (this.validateProps && schemaName) {
      const validation = validateNodeProps(schemaName, type, props);
      if (!validation.valid) {
        throw new Error(
          `Node validation failed for ${type}: missing required props [${validation.missing.join(', ')}]`
        );
      }
    }

    // Get identity key (first required prop)
    const tpl = schemaName ? getNodeTemplate(schemaName, type) : null;
    const identityKey = tpl ? tpl.requiredProps[0] : Object.keys(props)[0];
    const identityValue = props[identityKey];

    if (identityValue === undefined) {
      throw new Error(`Identity key '${identityKey}' is required for ${type} node`);
    }

    // Build MERGE query
    const setProps = Object.keys(props)
      .filter((k) => k !== identityKey)
      .map((k) => `n.${k} = $props.${k}`)
      .join(', ');

    const query = `
      MERGE (n:${type} {${identityKey}: $identityValue})
      ${setProps ? `ON CREATE SET ${setProps}` : ''}
      ${setProps ? `ON MATCH SET ${setProps}` : ''}
      RETURN n
    `.trim();

    const result = await this.client.cypher(query, {
      identityValue,
      props,
    });

    return this._extractNode(result);
  }

  // ─── Edge Operations ──────────────────────────────────────────────

  /**
   * Upsert an edge between two nodes.
   * Creates the relationship if it doesn't exist, merges properties if it does.
   *
   * @param {string} fromId - Source node identity value
   * @param {string} toId - Target node identity value
   * @param {string} label - Relationship type (e.g. 'ENCOUNTERED', 'HAS_REMEDY')
   * @param {Object} [props={}] - Edge properties
   * @param {Object} [options={}] - { fromType, toType, fromKey, toKey }
   * @returns {Promise<Object>} - edge data
   */
  async upsertEdge(fromId, toId, label, props = {}, options = {}) {
    await this._ensureInit();

    const fromType = options.fromType || 'Node';
    const toType = options.toType || 'Node';
    const fromKey = options.fromKey || this._guessIdentityKey(fromType);
    const toKey = options.toKey || this._guessIdentityKey(toType);

    const setClause = Object.keys(props).length > 0
      ? `ON CREATE SET ${Object.keys(props).map((k) => `r.${k} = $props.${k}`).join(', ')}
         ON MATCH SET ${Object.keys(props).map((k) => `r.${k} = $props.${k}`).join(', ')}`
      : '';

    const query = `
      MATCH (a:${fromType} {${fromKey}: $fromId})
      MATCH (b:${toType} {${toKey}: $toId})
      MERGE (a)-[r:${label}]->(b)
      ${setClause}
      RETURN a, r, b
    `.trim();

    const result = await this.client.cypher(query, {
      fromId,
      toId,
      props,
    });

    return this._extractEdge(result);
  }

  // ─── Cypher Query ─────────────────────────────────────────────────

  /**
   * Execute a raw Cypher query with parameters.
   *
   * @param {string} query - Cypher query string
   * @param {Object} [params={}] - query parameters
   * @returns {Promise<Object>} - { records, summary }
   */
  async cypherQuery(query, params = {}) {
    await this._ensureInit();
    return this.client.cypher(query, params);
  }

  /**
   * Execute a named query from a schema.
   *
   * @param {string} schemaName - 'session_error' | 'runbook' | 'eval'
   * @param {string} queryName - query name within the schema
   * @param {Object} [params={}] - query parameters
   * @returns {Promise<Object>} - query results
   */
  async namedQuery(schemaName, queryName, params = {}) {
    const query = getQuery(schemaName, queryName);
    return this.cypherQuery(query, params);
  }

  // ─── Suggest (Convenience Queries) ────────────────────────────────

  /**
   * Convenience method for common graph queries.
   * Returns suggestions based on context and query type.
   *
   * @param {Object} context - contextual information
   * @param {string} queryType - type of suggestion query
   * @returns {Promise<Object>} - suggestion results
   *
   * Supported queryTypes:
   * - 'error_remedies'  — find remedies for an error { errorPattern, category }
   * - 'recurring_errors' — find recurring errors { minSessions }
   * - 'model_leaderboard' — model comparison { category }
   * - 'error_hotspots' — files with most errors { limit }
   * - 'unresolved' — unresolved errors across sessions
   * - 'failing_tests' — tests failing across models { limit }
   * - 'cost_analysis' — cost breakdown per model
   * - 'unremedied' — errors without known remedies
   */
  async suggest(context = {}, queryType) {
    await this._ensureInit();

    const queryMap = {
      // Session/Error domain
      error_remedies: {
        schema: 'runbook',
        query: 'findRemedies',
        params: { errorPattern: context.errorPattern || '.*', category: context.category || '' },
      },
      recurring_errors: {
        schema: 'session_error',
        query: 'recurringErrors',
        params: { minSessions: context.minSessions || 2 },
      },
      error_hotspots: {
        schema: 'session_error',
        query: 'errorHotspots',
        params: { limit: context.limit || 10 },
      },
      unresolved: {
        schema: 'session_error',
        query: 'unresolvedErrors',
        params: {},
      },

      // Runbook domain
      remedy_chain: {
        schema: 'runbook',
        query: 'remedyChain',
        params: { typeId: context.typeId || context.errorTypeId },
      },
      top_remedies: {
        schema: 'runbook',
        query: 'topRemedies',
        params: { limit: context.limit || 10 },
      },
      unremedied: {
        schema: 'runbook',
        query: 'unremediedErrors',
        params: {},
      },

      // Eval domain
      model_leaderboard: {
        schema: 'eval',
        query: 'modelLeaderboard',
        params: { category: context.category || 'general' },
      },
      model_results: {
        schema: 'eval',
        query: 'modelResults',
        params: { modelId: context.modelId },
      },
      failing_tests: {
        schema: 'eval',
        query: 'failingTests',
        params: { limit: context.limit || 10 },
      },
      cost_analysis: {
        schema: 'eval',
        query: 'costAnalysis',
        params: {},
      },
    };

    const mapping = queryMap[queryType];
    if (!mapping) {
      throw new Error(
        `Unknown query type '${queryType}'. Available: ${Object.keys(queryMap).join(', ')}`
      );
    }

    return this.namedQuery(mapping.schema, mapping.query, { ...mapping.params, ...context });
  }

  // ─── Bulk Operations ──────────────────────────────────────────────

  /**
   * Import a session with its errors from a JSON structure.
   *
   * @param {Object} sessionData - { session: {...}, errors: [{ error: {...}, file?: {...} }] }
   * @returns {Promise<{ sessionNode: Object, errorNodes: Object[], edges: Object[] }>}
   */
  async importSession(sessionData) {
    await this._ensureInit();

    const { session, errors = [] } = sessionData;
    const sessionNode = await this.upsertNode('Session', session, 'session_error');
    const errorNodes = [];
    const edges = [];

    for (const entry of errors) {
      const errorNode = await this.upsertNode('Error', entry.error, 'session_error');
      errorNodes.push(errorNode);

      const edge = await this.upsertEdge(
        session.sessionId,
        entry.error.errorHash,
        'ENCOUNTERED',
        { timestamp: entry.timestamp || new Date().toISOString(), context: entry.context },
        { fromType: 'Session', toType: 'Error', fromKey: 'sessionId', toKey: 'errorHash' }
      );
      edges.push(edge);

      if (entry.file) {
        const fileNode = await this.upsertNode('File', entry.file, 'session_error');
        const fileEdge = await this.upsertEdge(
          entry.error.errorHash,
          entry.file.path,
          'OCCURRED_IN',
          { lineNumber: entry.lineNumber, column: entry.column },
          { fromType: 'Error', toType: 'File', fromKey: 'errorHash', toKey: 'path' }
        );
        edges.push(fileEdge);
      }

      if (entry.resolved) {
        const resolveEdge = await this.upsertEdge(
          session.sessionId,
          entry.error.errorHash,
          'RESOLVED',
          { resolvedAt: entry.resolvedAt || new Date().toISOString(), resolutionMethod: entry.resolutionMethod },
          { fromType: 'Session', toType: 'Error', fromKey: 'sessionId', toKey: 'errorHash' }
        );
        edges.push(resolveEdge);
      }
    }

    return { sessionNode, errorNodes, edges };
  }

  // ─── Utility Methods ──────────────────────────────────────────────

  /**
   * Check connection to goraphdb server.
   * @returns {Promise<boolean>}
   */
  async ping() {
    try {
      await this.client.health();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get server info.
   * @returns {Promise<Object>}
   */
  async serverInfo() {
    return this.client.info();
  }

  /**
   * Get available schemas and their queries.
   * @returns {Object} schema registry summary
   */
  getSchemaRegistry() {
    const registry = {};
    for (const [name, schema] of Object.entries(ALL_SCHEMAS)) {
      registry[name] = {
        description: schema.description,
        nodeTypes: Object.keys(schema.nodeTemplates),
        edgeTypes: Object.keys(schema.edgeTemplates),
        queries: Object.keys(schema.queries),
      };
    }
    return registry;
  }

  // ─── Internal Helpers ─────────────────────────────────────────────

  /**
   * Detect which schema a node type belongs to.
   */
  _detectSchema(type) {
    for (const [name, schema] of Object.entries(ALL_SCHEMAS)) {
      if (schema.nodeTemplates[type]) return name;
    }
    return null;
  }

  /**
   * Guess the identity key for a node type.
   */
  _guessIdentityKey(type) {
    const schemaName = this._detectSchema(type);
    if (schemaName) {
      const tpl = getNodeTemplate(schemaName, type);
      return tpl.requiredProps[0];
    }
    // Fallback conventions
    const conventions = {
      Session: 'sessionId',
      Error: 'errorHash',
      File: 'path',
      ErrorType: 'typeId',
      Remedy: 'remedyId',
      Runbook: 'runbookId',
      TestCase: 'testId',
      Model: 'modelId',
      Result: 'resultId',
      TestSuite: 'suiteId',
    };
    return conventions[type] || 'id';
  }

  /**
   * Extract node from Cypher result.
   */
  _extractNode(result) {
    if (result && result.records && result.records.length > 0) {
      const record = result.records[0];
      return record.n || record[Object.keys(record)[0]] || record;
    }
    return result;
  }

  /**
   * Extract edge from Cypher result.
   */
  _extractEdge(result) {
    if (result && result.records && result.records.length > 0) {
      const record = result.records[0];
      return {
        from: record.a || null,
        relationship: record.r || null,
        to: record.b || null,
      };
    }
    return result;
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = GraphDBBridge;
module.exports.GraphDBBridge = GraphDBBridge;
module.exports.GoraphDBClient = GoraphDBClient;
module.exports.schemas = require('./schemas');
