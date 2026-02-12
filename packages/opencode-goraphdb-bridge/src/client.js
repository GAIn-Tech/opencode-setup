'use strict';

const fetch = require('node-fetch');

/**
 * GoraphDB REST Client
 * Low-level HTTP client for goraphdb server communication.
 * All methods return Promises.
 */
class GoraphDBClient {
  /**
   * @param {Object} options
   * @param {string} [options.host='localhost'] - goraphdb server host
   * @param {number} [options.port=7687] - goraphdb server port
   * @param {string} [options.protocol='http'] - http or https
   * @param {number} [options.timeout=10000] - request timeout in ms
   * @param {Object} [options.headers={}] - additional headers
   */
  constructor(options = {}) {
    this.host = options.host || process.env.GORAPHDB_HOST || 'localhost';
    this.port = options.port || parseInt(process.env.GORAPHDB_PORT, 10) || 7687;
    this.protocol = options.protocol || process.env.GORAPHDB_PROTOCOL || 'http';
    this.timeout = options.timeout || 10000;
    this.headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    };
    this.baseUrl = `${this.protocol}://${this.host}:${this.port}`;
  }

  /**
   * Internal fetch wrapper with error handling and timeout.
   * @param {string} path - API path (e.g. /api/nodes)
   * @param {Object} options - fetch options
   * @returns {Promise<Object>} parsed JSON response
   */
  async _request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...this.headers, ...options.headers },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const body = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = { raw: body };
      }

      if (!response.ok) {
        const err = new Error(
          `GoraphDB ${response.status}: ${parsed.error || parsed.message || body}`
        );
        err.status = response.status;
        err.body = parsed;
        throw err;
      }

      return parsed;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`GoraphDB request timed out after ${this.timeout}ms: ${url}`);
        timeoutErr.code = 'ETIMEDOUT';
        throw timeoutErr;
      }
      if (err.code === 'ECONNREFUSED') {
        const connErr = new Error(
          `Cannot connect to GoraphDB at ${this.baseUrl}. Is the server running?`
        );
        connErr.code = 'ECONNREFUSED';
        throw connErr;
      }
      throw err;
    }
  }

  // ─── Node Operations ──────────────────────────────────────────────

  /**
   * Create or update a node.
   * @param {Object} node - { labels: string[], properties: Object }
   * @returns {Promise<Object>} created/updated node with id
   */
  async createNode(node) {
    return this._request('/api/nodes', {
      method: 'POST',
      body: JSON.stringify(node),
    });
  }

  /**
   * Get a node by ID.
   * @param {string} id - node identifier
   * @returns {Promise<Object>} node data
   */
  async getNode(id) {
    return this._request(`/api/nodes/${encodeURIComponent(id)}`, {
      method: 'GET',
    });
  }

  /**
   * Update node properties.
   * @param {string} id - node identifier
   * @param {Object} properties - properties to merge
   * @returns {Promise<Object>} updated node
   */
  async updateNode(id, properties) {
    return this._request(`/api/nodes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });
  }

  /**
   * Delete a node by ID.
   * @param {string} id - node identifier
   * @returns {Promise<Object>} deletion confirmation
   */
  async deleteNode(id) {
    return this._request(`/api/nodes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // ─── Edge Operations ──────────────────────────────────────────────

  /**
   * Create or update an edge between two nodes.
   * @param {Object} edge - { from: string, to: string, label: string, properties: Object }
   * @returns {Promise<Object>} created/updated edge
   */
  async createEdge(edge) {
    return this._request('/api/edges', {
      method: 'POST',
      body: JSON.stringify(edge),
    });
  }

  /**
   * Get edges for a node.
   * @param {string} nodeId - source node ID
   * @param {Object} [options] - { direction: 'in'|'out'|'both', label: string }
   * @returns {Promise<Object[]>} array of edges
   */
  async getEdges(nodeId, options = {}) {
    const params = new URLSearchParams();
    if (options.direction) params.set('direction', options.direction);
    if (options.label) params.set('label', options.label);
    const qs = params.toString();
    return this._request(
      `/api/nodes/${encodeURIComponent(nodeId)}/edges${qs ? '?' + qs : ''}`,
      { method: 'GET' }
    );
  }

  // ─── Cypher Operations ────────────────────────────────────────────

  /**
   * Execute a Cypher query.
   * @param {string} query - Cypher query string
   * @param {Object} [params={}] - query parameters
   * @returns {Promise<Object>} query results { records, summary }
   */
  async cypher(query, params = {}) {
    return this._request('/api/cypher', {
      method: 'POST',
      body: JSON.stringify({ query, parameters: params }),
    });
  }

  // ─── Health / Info ────────────────────────────────────────────────

  /**
   * Check server health.
   * @returns {Promise<Object>} health status
   */
  async health() {
    return this._request('/api/health', { method: 'GET' });
  }

  /**
   * Get server info/version.
   * @returns {Promise<Object>} server metadata
   */
  async info() {
    return this._request('/api/info', { method: 'GET' });
  }
}

module.exports = GoraphDBClient;
