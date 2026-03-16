'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Indexer } = require('./indexer');
const { GraphStore } = require('./graph-store');

const DEFAULT_STATE_DIR = path.join(os.homedir(), '.opencode', 'codebase-memory');

class CodebaseMemory {
  /**
   * @param {object} [opts]
   * @param {string} [opts.stateDir] - Override state dir (for testing). Defaults to ~/.opencode/codebase-memory
   */
  constructor({ stateDir } = {}) {
    this.stateDir = stateDir || DEFAULT_STATE_DIR;
    this.registryPath = path.join(this.stateDir, 'repos.json');
    this.registry = this._loadRegistry();
  }

  _ensureStateDir() {
    fs.mkdirSync(this.stateDir, { recursive: true });
  }

  _loadRegistry() {
    this._ensureStateDir();
    if (!fs.existsSync(this.registryPath)) return {};
    try { return JSON.parse(fs.readFileSync(this.registryPath, 'utf-8')); }
    catch { return {}; }
  }

  _saveRegistry() {
    this._ensureStateDir();
    fs.writeFileSync(this.registryPath, JSON.stringify(this.registry, null, 2));
  }

  /**
   * Analyze/index a repo. name defaults to basename(repoPath).
   * @param {string} repoPath
   * @param {object} [opts]
   * @param {string} [opts.name]
   * @returns {{ repo: string, files: number, nodes: number, edges: number, skipped: number }}
   */
  analyze(repoPath, { name } = {}) {
    const absPath = path.resolve(repoPath);
    const repoName = name || path.basename(absPath);
    const dbPath = path.join(this.stateDir, `${repoName}.db`);
    const indexer = new Indexer(dbPath);
    const result = indexer.indexDirectory(absPath);
    indexer.close();
    this.registry[repoName] = {
      name: repoName,
      path: absPath,
      dbPath,
      indexed_at: new Date().toISOString(),
    };
    this._saveRegistry();
    return { repo: repoName, ...result };
  }

  /**
   * Full-text search across symbols in a repo.
   * @param {string} repoName
   * @param {string} searchTerm
   * @param {object} [opts]
   * @param {number} [opts.limit=20]
   * @returns {Array}
   */
  query(repoName, searchTerm, { limit = 20 } = {}) {
    const repo = this.registry[repoName];
    if (!repo) throw new Error(`Repo '${repoName}' not found. Run analyze first.`);
    const store = new GraphStore(repo.dbPath);
    const results = store.search(searchTerm, limit);
    store.close();
    return results;
  }

  /**
   * Get a symbol + its callers/callees.
   * @param {string} repoName
   * @param {string} symbolName
   * @returns {{ node: object, callers: Array, callees: Array } | null}
   */
  context(repoName, symbolName) {
    const repo = this.registry[repoName];
    if (!repo) throw new Error(`Repo '${repoName}' not found.`);
    const store = new GraphStore(repo.dbPath);
    const nodes = store.getNodeByName(symbolName);
    if (!nodes || nodes.length === 0) { store.close(); return null; }
    const node = nodes[0];
    const callers = store.getEdgesTo(node.id);
    const callees = store.getEdgesFrom(node.id);
    store.close();
    return { node, callers, callees };
  }

  /**
   * Blast radius: who would be affected if symbolName changes.
   * @param {string} repoName
   * @param {string} symbolName
   * @param {object} [opts]
   * @param {number} [opts.depth=3]
   * @returns {Array}
   */
  impact(repoName, symbolName, { depth = 3 } = {}) {
    const repo = this.registry[repoName];
    if (!repo) throw new Error(`Repo '${repoName}' not found.`);
    const store = new GraphStore(repo.dbPath);
    const result = store.getBlastRadius(symbolName, depth);
    store.close();
    return result;
  }

  /**
   * Detect files changed since last index (mtime comparison).
   * @param {string} repoName
   * @returns {{ repo: string, changed: string[], count: number }}
   */
  detectChanges(repoName) {
    const repo = this.registry[repoName];
    if (!repo) throw new Error(`Repo '${repoName}' not found.`);
    const store = new GraphStore(repo.dbPath);
    const files = store.getAllFiles();
    store.close();
    const changed = [];
    for (const f of files) {
      try {
        const stat = fs.statSync(f.path);
        if (stat.mtimeMs > f.mtime) changed.push(f.path);
      } catch {
        // File deleted or inaccessible — counts as changed
        changed.push(f.path);
      }
    }
    return { repo: repoName, changed, count: changed.length };
  }

  /**
   * List all registered repos.
   * @returns {Array<{ name: string, path: string, dbPath: string, indexed_at: string }>}
   */
  listRepos() {
    return Object.values(this.registry);
  }

  /**
   * Enrich error context: extract potential symbol names from error text,
   * look them up across all indexed repos.
   * @param {string} errorText
   * @returns {Array<{ repo: string, symbol: string, node: object, callers_count: number }>}
   */
  enrichErrorContext(errorText) {
    // Extract potential symbol names (CamelCase, camelCase, snake_case identifiers, 3+ chars)
    const matches = errorText.match(/\b([A-Za-z_$][A-Za-z0-9_$]{2,})\b/g) || [];
    const symbols = [...new Set(matches)].slice(0, 5);
    const results = [];
    for (const [name, repo] of Object.entries(this.registry)) {
      const store = new GraphStore(repo.dbPath);
      for (const sym of symbols) {
        const nodes = store.getNodeByName(sym);
        if (nodes && nodes.length > 0) {
          const node = nodes[0];
          const callers = store.getEdgesTo(node.id);
          results.push({ repo: name, symbol: sym, node, callers_count: callers.length });
        }
      }
      store.close();
    }
    return results;
  }
}

module.exports = {
  CodebaseMemory,
  STATE_DIR: DEFAULT_STATE_DIR,
  REGISTRY_PATH: path.join(DEFAULT_STATE_DIR, 'repos.json'),
};
