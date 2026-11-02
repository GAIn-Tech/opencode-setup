'use strict';
const { Database } = require('bun:sqlite');
const path = require('path');
const fs = require('fs');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  file TEXT NOT NULL,
  line INTEGER,
  col INTEGER,
  signature TEXT,
  docstring TEXT,
  language TEXT,
  body_hash TEXT,
  indexed_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS edges (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  file TEXT,
  line INTEGER,
  PRIMARY KEY (from_id, to_id, kind)
);

CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  mtime INTEGER,
  size INTEGER,
  hash TEXT,
  language TEXT,
  indexed_at INTEGER DEFAULT (unixepoch())
);

CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
  name, signature, docstring, file,
  content='nodes',
  content_rowid='rowid'
);

CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
`;

class GraphStore {
  constructor(dbPath) {
    const dir = path.dirname(dbPath);
    if (dir !== '.' && dir !== '/tmp') fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(dbPath);
    this.db.exec('PRAGMA journal_mode=WAL;');
    this.db.exec(SCHEMA);
    this._prepareStatements();
  }

  _prepareStatements() {
    this._stmts = {
      upsertNode: this.db.prepare(`
        INSERT INTO nodes (id, name, kind, file, line, col, signature, docstring, language, body_hash)
        VALUES ($id, $name, $kind, $file, $line, $col, $signature, $docstring, $language, $body_hash)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, kind=excluded.kind, file=excluded.file,
          line=excluded.line, signature=excluded.signature, docstring=excluded.docstring,
          body_hash=excluded.body_hash, indexed_at=unixepoch()
      `),
      getNode: this.db.prepare('SELECT * FROM nodes WHERE id = ?'),
      getNodeByName: this.db.prepare('SELECT * FROM nodes WHERE name = ? ORDER BY file'),
      upsertEdge: this.db.prepare(`
        INSERT OR REPLACE INTO edges (from_id, to_id, kind, file, line)
        VALUES ($from_id, $to_id, $kind, $file, $line)
      `),
      getEdgesFrom: this.db.prepare('SELECT * FROM edges WHERE from_id = ?'),
      getEdgesTo: this.db.prepare('SELECT * FROM edges WHERE to_id = ?'),
      upsertFile: this.db.prepare(`
        INSERT INTO files (path, mtime, size, hash, language)
        VALUES ($path, $mtime, $size, $hash, $language)
        ON CONFLICT(path) DO UPDATE SET
          mtime=excluded.mtime, size=excluded.size, hash=excluded.hash, indexed_at=unixepoch()
      `),
      getFile: this.db.prepare('SELECT * FROM files WHERE path = ?'),
      allFiles: this.db.prepare('SELECT * FROM files'),
      deleteNodesForFile: this.db.prepare('DELETE FROM nodes WHERE file = ?'),
      deleteEdgesForFile: this.db.prepare('DELETE FROM edges WHERE file = ?'),
      nodeCount: this.db.prepare('SELECT COUNT(*) as n FROM nodes'),
      edgeCount: this.db.prepare('SELECT COUNT(*) as n FROM edges'),
      fileCount: this.db.prepare('SELECT COUNT(*) as n FROM files'),
    };
  }

  upsertNode(node) {
    this._stmts.upsertNode.run({
      $id: node.id, $name: node.name, $kind: node.kind, $file: node.file,
      $line: node.line ?? null, $col: node.col ?? null,
      $signature: node.signature ?? null, $docstring: node.docstring ?? null,
      $language: node.language ?? null, $body_hash: node.body_hash ?? null
    });
  }

  getNode(id) { return this._stmts.getNode.get(id); }
  getNodeByName(name) { return this._stmts.getNodeByName.all(name); }
  getEdgesFrom(fromId) { return this._stmts.getEdgesFrom.all(fromId); }
  getEdgesTo(toId) { return this._stmts.getEdgesTo.all(toId); }

  upsertEdge(edge) {
    this._stmts.upsertEdge.run({
      $from_id: edge.from_id, $to_id: edge.to_id, $kind: edge.kind,
      $file: edge.file ?? null, $line: edge.line ?? null
    });
  }

  upsertFile(file) {
    this._stmts.upsertFile.run({
      $path: file.path, $mtime: file.mtime ?? null, $size: file.size ?? null,
      $hash: file.hash ?? null, $language: file.language ?? null
    });
  }

  getFile(filePath) { return this._stmts.getFile.get(filePath); }
  getAllFiles() { return this._stmts.allFiles.all(); }

  clearFile(filePath) {
    this._stmts.deleteNodesForFile.run(filePath);
    this._stmts.deleteEdgesForFile.run(filePath);
  }

  rebuildFts() {
    this.db.exec("INSERT INTO symbols_fts(symbols_fts) VALUES('rebuild')");
  }

  search(query, limit = 20) {
    const stmt = this.db.prepare(`
      SELECT n.* FROM nodes n
      JOIN symbols_fts f ON n.rowid = f.rowid
      WHERE symbols_fts MATCH ?
      ORDER BY rank LIMIT ?
    `);
    return stmt.all(query + '*', limit);
  }

  getBlastRadius(symbolIdOrName, depth = 3) {
    let rootIds = [];
    const byId = this.getNode(symbolIdOrName);
    if (byId) {
      rootIds = [symbolIdOrName];
    } else {
      rootIds = this.getNodeByName(symbolIdOrName).map(n => n.id);
    }
    if (!rootIds.length) return [];

    const placeholders = rootIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      WITH RECURSIVE callers(id, depth) AS (
        SELECT from_id, 0 FROM edges WHERE to_id IN (${placeholders}) AND kind = 'calls'
        UNION ALL
        SELECT e.from_id, c.depth + 1
        FROM edges e JOIN callers c ON e.to_id = c.id
        WHERE c.depth < ?
      )
      SELECT DISTINCT n.* FROM nodes n
      JOIN callers c ON n.id = c.id
    `);
    return stmt.all(...rootIds, depth);
  }

  getStats() {
    return {
      nodes: this._stmts.nodeCount.get().n,
      edges: this._stmts.edgeCount.get().n,
      files: this._stmts.fileCount.get().n,
    };
  }

  close() { this.db.close(); }
}

module.exports = { GraphStore };
