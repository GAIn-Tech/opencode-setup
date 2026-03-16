'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { GraphStore } = require('./graph-store');
const { parseFile, SUPPORTED_EXTENSIONS } = require('./parser');

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', '.bun']);

class Indexer {
  constructor(dbPath) {
    this.store = new GraphStore(dbPath);
  }

  /** Walk dir recursively, return array of absolute file paths with supported extensions */
  _walk(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...this._walk(full));
      else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name))) results.push(full);
    }
    return results;
  }

  /** Hash file content for change detection (truncated sha256) */
  _hash(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 16);
  }

  /** Index a single file. Skips if content hash unchanged (incremental). */
  indexFile(filePath) {
    const stat = fs.statSync(filePath);
    const hash = this._hash(filePath);
    const existing = this.store.getFile(filePath);
    if (existing && existing.hash === hash) return { skipped: true };

    this.store.clearFile(filePath);
    const { nodes, edges } = parseFile(filePath);

    const idMap = {};
    for (const node of nodes) {
      this.store.upsertNode(node);
      idMap[node.name] = node.id;
    }

    // Resolve cross-file to_name → to_id best-effort
    for (const edge of edges) {
      if (!edge.to_id && edge.to_name && idMap[edge.to_name]) {
        edge.to_id = idMap[edge.to_name];
      }
      if (edge.from_id && edge.to_id) this.store.upsertEdge(edge);
    }

    this.store.upsertFile({
      path: filePath,
      mtime: stat.mtimeMs,
      size: stat.size,
      hash,
      language: path.extname(filePath).slice(1),
    });

    return { skipped: false, nodes: nodes.length, edges: edges.length };
  }

  /** Index all supported files in a directory tree */
  indexDirectory(dir) {
    const files = this._walk(dir);
    const results = { files: 0, nodes: 0, edges: 0, skipped: 0 };
    for (const f of files) {
      const r = this.indexFile(f);
      results.files++;
      if (r.skipped) { results.skipped++; continue; }
      results.nodes += r.nodes || 0;
      results.edges += r.edges || 0;
    }
    this.store.rebuildFts();
    return results;
  }

  getStats() { return this.store.getStats(); }
  close() { this.store.close(); }
}

module.exports = { Indexer };
