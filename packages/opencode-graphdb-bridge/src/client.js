'use strict';

const fetch = require('node-fetch');

// Size guard constant: 10MB max for JSON responses
const MAX_JSON_SIZE = 10 * 1024 * 1024;

/**
 * Safe JSON parse with size guard to prevent OOM.
 * @param {string} content - JSON string to parse
 * @param {number} [maxSize=MAX_JSON_SIZE] - Max allowed size in bytes
 * @returns {object} Parsed JSON object
 * @throws {Error} If content exceeds size limit
 */
function safeJsonParse(content, maxSize = MAX_JSON_SIZE) {
  const sizeBytes = Buffer.byteLength(content, 'utf-8');
  if (sizeBytes > maxSize) {
    throw new Error(`JSON response exceeds size limit: ${sizeBytes} > ${maxSize} bytes (consider streaming)`);
  }
  return JSON.parse(content);
}

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
    this.retries = Number.isFinite(options.retries) ? options.retries : 2;
    this.retryDelayMs = Number.isFinite(options.retryDelayMs) ? options.retryDelayMs : 250;
    this.maxRetryDelayMs = Number.isFinite(options.maxRetryDelayMs) ? options.maxRetryDelayMs : 5000;
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
    const maxAttempts = Math.max(0, this.retries) + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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
           parsed = safeJsonParse(body);
         } catch {
           parsed = { raw: body };
         }

        if (!response.ok) {
          const err = new Error(
            `GoraphDB ${response.status}: ${parsed.error || parsed.message || body}`
          );
          err.status = response.status;
          err.body = parsed;
          const retryDelay = this._getRetryDelay(response, attempt);
          if (this._shouldRetry(err, attempt) && retryDelay !== null) {
            await this._sleep(retryDelay);
            continue;
          }
          throw err;
        }

        return parsed;
      } catch (err) {
        clearTimeout(timeoutId);
        let normalizedErr = err;
        if (err && err.name === 'AbortError') {
          normalizedErr = new Error(`GoraphDB request timed out after ${this.timeout}ms: ${url}`);
          normalizedErr.code = 'ETIMEDOUT';
        } else if (err && err.code === 'ECONNREFUSED') {
          normalizedErr = new Error(
            `Cannot connect to GoraphDB at ${this.baseUrl}. Is the server running?`
          );
          normalizedErr.code = 'ECONNREFUSED';
        }

        const retryDelay = this._getRetryDelay(null, attempt);
        if (this._shouldRetry(normalizedErr, attempt) && retryDelay !== null) {
          await this._sleep(retryDelay);
          continue;
        }

        throw normalizedErr;
      }
    }

    throw new Error(`GoraphDB request failed after ${maxAttempts} attempts: ${url}`);
  }

  _shouldRetry(error, attempt) {
    if (attempt >= this.retries) return false;
    if (!error) return false;
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') return true;
    const status = error.status;
    if (status === 429) return true;
    if (typeof status === 'number' && status >= 500) return true;
    return false;
  }

  _getRetryDelay(response, attempt) {
    if (attempt >= this.retries) return null;
    let retryAfterMs = null;
    if (response && response.headers) {
      const header = response.headers.get('retry-after');
      if (header) {
        const parsed = Number.parseInt(String(header), 10);
        if (Number.isFinite(parsed)) {
          retryAfterMs = Math.max(parsed * 1000, this.retryDelayMs);
        }
      }
    }
    const backoff = this.retryDelayMs * Math.pow(2, attempt);
    return Math.min(retryAfterMs ?? backoff, this.maxRetryDelayMs);
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
