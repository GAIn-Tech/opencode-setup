# Codebase Memory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `packages/opencode-codebase-memory` — a CLI-first codebase structure indexer that parses JS/TS files into a SQLite graph, exposing query/impact/search commands for agents, integrated with the existing learning/memory pipeline.

**Architecture:** Tree-sitter-free: uses `@typescript-eslint/typescript-estree` (MIT, pure JS) to parse JS/TS/JSX/TSX into AST nodes. Symbol nodes and call edges are stored in SQLite (bun:sqlite) per repo. CLI (`opencode-codebase`) exposes all commands with `--json` for structured agent consumption. Regex fallback for Python/other languages. No new MCP process — agents shell out via bash tool.

**Tech Stack:** Bun (runtime), bun:sqlite (graph store), @typescript-eslint/typescript-estree (AST parser), FTS5 virtual table (full-text search), CJS module format (matches rest of codebase)

---

## Task 1: Package scaffold

**Files:**
- Create: `packages/opencode-codebase-memory/package.json`
- Create: `packages/opencode-codebase-memory/src/index.js` (empty stub)
- Create: `packages/opencode-codebase-memory/src/cli.mjs` (empty stub)

**Step 1: Create package.json**

```json
{
  "name": "opencode-codebase-memory",
  "version": "1.0.0",
  "description": "Codebase structure memory: indexes JS/TS symbols and call graphs into SQLite for agent query",
  "main": "src/index.js",
  "type": "commonjs",
  "bin": {
    "opencode-codebase": "./src/cli.mjs"
  },
  "scripts": {
    "test": "bun test test/"
  },
  "license": "MIT",
  "engines": { "bun": ">=1.3.0" },
  "dependencies": {
    "@typescript-eslint/typescript-estree": "^8.0.0",
    "typescript": "^5.0.0"
  },
  "devDependencies": {}
}
```

**Step 2: Install dependencies**

Run from `packages/opencode-codebase-memory/`:
```bash
bun install
```

Expected: `node_modules/` created with typescript-estree.

**Step 3: Create empty src/index.js stub**

```js
'use strict';
// CodebaseMemory — main entry point
// Exports: CodebaseMemory class
module.exports = { CodebaseMemory: class {} };
```

**Step 4: Create empty src/cli.mjs stub**

```js
#!/usr/bin/env bun
console.log('opencode-codebase v1.0.0');
```

**Step 5: Verify stub runs**

```bash
bun run src/cli.mjs
```
Expected: prints version string.

**Step 6: Commit**

```bash
git add packages/opencode-codebase-memory/
git commit -m "feat(codebase-memory): scaffold package with dependencies"
```

---

## Task 2: SQLite schema + GraphStore

**Files:**
- Create: `packages/opencode-codebase-memory/src/graph-store.js`
- Create: `packages/opencode-codebase-memory/test/graph-store.test.js`

**Step 1: Write failing tests**

```js
// test/graph-store.test.js
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { GraphStore } from '../src/graph-store.js';
import { rmSync, existsSync } from 'fs';

const TEST_DB = '/tmp/test-codebase-memory.db';

describe('GraphStore', () => {
  let store;
  beforeEach(() => { store = new GraphStore(TEST_DB); });
  afterEach(() => { store.close(); if (existsSync(TEST_DB)) rmSync(TEST_DB); });

  test('initializes schema without error', () => {
    expect(() => new GraphStore(TEST_DB)).not.toThrow();
  });

  test('upsertNode stores and retrieves a node', () => {
    store.upsertNode({ id: 'abc123', name: 'foo', kind: 'function', file: 'src/a.js', line: 10, signature: 'foo(x)', language: 'javascript' });
    const node = store.getNode('abc123');
    expect(node.name).toBe('foo');
    expect(node.kind).toBe('function');
  });

  test('upsertEdge stores and retrieves edges', () => {
    store.upsertNode({ id: 'n1', name: 'foo', kind: 'function', file: 'src/a.js', line: 1, language: 'javascript' });
    store.upsertNode({ id: 'n2', name: 'bar', kind: 'function', file: 'src/a.js', line: 5, language: 'javascript' });
    store.upsertEdge({ from_id: 'n1', to_id: 'n2', kind: 'calls', file: 'src/a.js', line: 2 });
    const edges = store.getEdgesFrom('n1');
    expect(edges.length).toBe(1);
    expect(edges[0].kind).toBe('calls');
  });

  test('search returns matching nodes via FTS', () => {
    store.upsertNode({ id: 'n3', name: 'validateToken', kind: 'function', file: 'src/auth.js', line: 1, signature: 'validateToken(token)', language: 'javascript' });
    store.rebuildFts();
    const results = store.search('validateToken');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('validateToken');
  });

  test('getBlastRadius returns transitive callers up to depth', () => {
    store.upsertNode({ id: 'a', name: 'a', kind: 'function', file: 'f.js', line: 1, language: 'js' });
    store.upsertNode({ id: 'b', name: 'b', kind: 'function', file: 'f.js', line: 5, language: 'js' });
    store.upsertNode({ id: 'c', name: 'c', kind: 'function', file: 'f.js', line: 9, language: 'js' });
    store.upsertEdge({ from_id: 'b', to_id: 'a', kind: 'calls', file: 'f.js', line: 6 });
    store.upsertEdge({ from_id: 'c', to_id: 'b', kind: 'calls', file: 'f.js', line: 10 });
    const radius = store.getBlastRadius('a', 3);
    expect(radius.map(r => r.name)).toContain('b');
    expect(radius.map(r => r.name)).toContain('c');
  });

  test('upsertFile tracks file metadata', () => {
    store.upsertFile({ path: 'src/a.js', mtime: 1234, size: 500, hash: 'abc', language: 'javascript' });
    const file = store.getFile('src/a.js');
    expect(file.hash).toBe('abc');
  });
});
```

**Step 2: Run tests — verify they fail**

```bash
bun test test/graph-store.test.js
```
Expected: `Cannot find module '../src/graph-store.js'`

**Step 3: Implement graph-store.js**

```js
// src/graph-store.js
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
    // Find node(s) matching name or id
    let rootIds = [];
    const byId = this.getNode(symbolIdOrName);
    if (byId) {
      rootIds = [symbolIdOrName];
    } else {
      rootIds = this.getNodeByName(symbolIdOrName).map(n => n.id);
    }
    if (!rootIds.length) return [];

    // Recursive CTE: find all callers transitively
    const placeholders = rootIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      WITH RECURSIVE callers(id, depth) AS (
        SELECT to_id, 0 FROM edges WHERE from_id IN (${placeholders}) AND kind = 'calls'
        UNION ALL
        SELECT e.to_id, c.depth + 1
        FROM edges e JOIN callers c ON e.from_id = c.id
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
```

**Step 4: Run tests — verify they pass**

```bash
bun test test/graph-store.test.js
```
Expected: all 5 tests pass.

**Step 5: Commit**

```bash
git add packages/opencode-codebase-memory/src/graph-store.js packages/opencode-codebase-memory/test/graph-store.test.js
git commit -m "feat(codebase-memory): SQLite graph store with FTS5 and blast radius CTE"
```

---

## Task 3: JS/TS AST Parser

**Files:**
- Create: `packages/opencode-codebase-memory/src/parser.js`
- Create: `packages/opencode-codebase-memory/test/parser.test.js`

**Step 1: Write failing tests**

```js
// test/parser.test.js
import { test, expect, describe } from 'bun:test';
import { parseFile } from '../src/parser.js';
import { writeFileSync, unlinkSync } from 'fs';

const TMP = '/tmp/test-parse.ts';

describe('parseFile', () => {
  test('extracts function declarations', () => {
    writeFileSync(TMP, `
      export function validateToken(token: string): boolean {
        return token.length > 0;
      }
    `);
    const { nodes } = parseFile(TMP);
    const fn = nodes.find(n => n.name === 'validateToken');
    expect(fn).toBeDefined();
    expect(fn.kind).toBe('function');
    expect(fn.signature).toContain('validateToken');
    unlinkSync(TMP);
  });

  test('extracts class and method declarations', () => {
    writeFileSync(TMP, `
      class AuthService {
        login(user: string) { return true; }
      }
    `);
    const { nodes } = parseFile(TMP);
    const cls = nodes.find(n => n.kind === 'class');
    const method = nodes.find(n => n.name === 'login');
    expect(cls).toBeDefined();
    expect(cls.name).toBe('AuthService');
    expect(method).toBeDefined();
    expect(method.kind).toBe('method');
    unlinkSync(TMP);
  });

  test('extracts call expressions as edges', () => {
    writeFileSync(TMP, `
      function foo() { bar(); baz(); }
      function bar() {}
      function baz() {}
    `);
    const { edges } = parseFile(TMP);
    const kinds = edges.map(e => e.kind);
    expect(kinds).toContain('calls');
    const targets = edges.map(e => e.to_name);
    expect(targets).toContain('bar');
    expect(targets).toContain('baz');
    unlinkSync(TMP);
  });

  test('extracts import edges', () => {
    writeFileSync(TMP, `import { foo } from './foo.js';`);
    const { edges } = parseFile(TMP);
    const imp = edges.find(e => e.kind === 'imports');
    expect(imp).toBeDefined();
    unlinkSync(TMP);
  });

  test('returns empty for unparseable file gracefully', () => {
    writeFileSync(TMP, '<<< NOT VALID >>>');
    const result = parseFile(TMP);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    unlinkSync(TMP);
  });
});
```

**Step 2: Run tests — verify they fail**

```bash
bun test test/parser.test.js
```
Expected: `Cannot find module '../src/parser.js'`

**Step 3: Implement parser.js**

```js
// src/parser.js
'use strict';
const { parse } = require('@typescript-eslint/typescript-estree');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SUPPORTED_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts']);

function nodeId(file, line, name) {
  return crypto.createHash('sha256').update(`${file}:${line}:${name}`).digest('hex').slice(0, 16);
}

function getSignature(node, name) {
  const params = (node.params || []).map(p => {
    if (p.type === 'Identifier') return p.typeAnnotation ? `${p.name}: ${typeStr(p.typeAnnotation.typeAnnotation)}` : p.name;
    if (p.type === 'AssignmentPattern') return p.left?.name ?? '...';
    if (p.type === 'RestElement') return `...${p.argument?.name ?? ''}`;
    return '...';
  }).join(', ');
  return `${name}(${params})`;
}

function typeStr(node) {
  if (!node) return 'any';
  if (node.type === 'TSStringKeyword') return 'string';
  if (node.type === 'TSNumberKeyword') return 'number';
  if (node.type === 'TSBooleanKeyword') return 'boolean';
  if (node.type === 'TSTypeReference') return node.typeName?.name ?? 'unknown';
  return 'any';
}

function extractDocstring(comments, line) {
  if (!comments) return null;
  const preceding = comments.filter(c => c.type === 'Block' && c.loc.end.line === line - 1);
  return preceding.length ? preceding[preceding.length - 1].value.trim().split('\n')[0].replace(/^\*+\s?/, '') : null;
}

function parseFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) return { nodes: [], edges: [] };

  let src;
  try { src = fs.readFileSync(filePath, 'utf-8'); } catch { return { nodes: [], edges: [] }; }

  let ast;
  try {
    ast = parse(src, {
      jsx: ext === '.jsx' || ext === '.tsx',
      loc: true,
      comment: true,
      errorOnUnknownASTType: false,
      allowInvalidAST: true,
    });
  } catch {
    return { nodes: [], edges: [] };
  }

  const nodes = [];
  const edges = [];
  const nodesByName = new Map(); // name -> id (for call resolution)

  function visit(node, parentId = null, parentName = null) {
    if (!node || typeof node !== 'object') return;

    // Function / method declarations
    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression' ||
      node.type === 'TSDeclareFunction'
    ) {
      const name = node.id?.name ?? parentName ?? '<anonymous>';
      const line = node.loc?.start.line ?? 0;
      const id = nodeId(filePath, line, name);
      const kind = parentId ? 'method' : 'function';
      const sig = getSignature(node, name);
      const doc = extractDocstring(ast.comments, line);
      nodes.push({ id, name, kind, file: filePath, line, signature: sig, docstring: doc, language: ext.slice(1) });
      nodesByName.set(name, id);

      // Recurse into body to find calls
      if (node.body) visitForCalls(node.body, id);
      return; // don't double-visit body
    }

    // Class declaration
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      const name = node.id?.name ?? '<anonymous>';
      const line = node.loc?.start.line ?? 0;
      const id = nodeId(filePath, line, name);
      nodes.push({ id, name, kind: 'class', file: filePath, line, signature: name, language: ext.slice(1) });
      nodesByName.set(name, id);

      // Extends
      if (node.superClass?.name) {
        edges.push({ from_id: id, to_id: null, to_name: node.superClass.name, kind: 'extends', file: filePath, line });
      }

      // Methods
      if (node.body?.body) {
        for (const member of node.body.body) {
          if (member.type === 'MethodDefinition' || member.type === 'PropertyDefinition') {
            const mName = member.key?.name ?? member.key?.value ?? '<method>';
            const mLine = member.loc?.start.line ?? 0;
            const mId = nodeId(filePath, mLine, `${name}.${mName}`);
            const mSig = member.value ? getSignature(member.value, mName) : mName;
            nodes.push({ id: mId, name: mName, kind: 'method', file: filePath, line: mLine, signature: mSig, language: ext.slice(1) });
            edges.push({ from_id: id, to_id: mId, to_name: mName, kind: 'contains', file: filePath, line: mLine });
            if (member.value?.body) visitForCalls(member.value.body, mId);
          }
        }
      }
      return;
    }

    // Variable declarations (const foo = () => ...)
    if (node.type === 'VariableDeclarator' && node.init &&
        (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')) {
      const name = node.id?.name;
      if (name) {
        const line = node.loc?.start.line ?? 0;
        const id = nodeId(filePath, line, name);
        const sig = getSignature(node.init, name);
        nodes.push({ id, name, kind: 'function', file: filePath, line, signature: sig, language: ext.slice(1) });
        nodesByName.set(name, id);
        if (node.init.body) visitForCalls(node.init.body, id);
      }
      return;
    }

    // Import declarations
    if (node.type === 'ImportDeclaration') {
      const src2 = node.source?.value;
      if (src2) {
        const importerPseudoId = nodeId(filePath, 0, 'FILE');
        edges.push({ from_id: importerPseudoId, to_id: null, to_name: src2, kind: 'imports', file: filePath, line: node.loc?.start.line ?? 0 });
      }
      return;
    }

    // Recurse children
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(c => visit(c, parentId, parentName));
      else if (child && typeof child === 'object' && child.type) visit(child, parentId, parentName);
    }
  }

  function visitForCalls(body, callerId) {
    if (!body) return;
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'CallExpression') {
        const callee = node.callee;
        const calleeName = callee.type === 'Identifier' ? callee.name
          : callee.type === 'MemberExpression' ? `${callee.object?.name ?? ''}.${callee.property?.name ?? ''}` : null;
        if (calleeName) {
          edges.push({ from_id: callerId, to_id: null, to_name: calleeName, kind: 'calls', file: filePath, line: node.loc?.start.line ?? 0 });
        }
      }
      for (const key of Object.keys(node)) {
        if (key === 'parent') continue;
        const child = node[key];
        if (Array.isArray(child)) child.forEach(walk);
        else if (child && typeof child === 'object' && child.type) walk(child);
      }
    };
    walk(body);
  }

  visit(ast.body ? { type: 'Program', body: ast.body } : ast);

  // Resolve to_name → to_id where possible (same file)
  for (const edge of edges) {
    if (!edge.to_id && edge.to_name && nodesByName.has(edge.to_name)) {
      edge.to_id = nodesByName.get(edge.to_name);
    }
  }

  return { nodes, edges };
}

module.exports = { parseFile, SUPPORTED_EXTENSIONS };
```

**Step 4: Run tests — verify they pass**

```bash
bun test test/parser.test.js
```
Expected: 5/5 pass.

**Step 5: Commit**

```bash
git add packages/opencode-codebase-memory/src/parser.js packages/opencode-codebase-memory/test/parser.test.js
git commit -m "feat(codebase-memory): JS/TS AST parser with function/class/call/import extraction"
```

---

## Task 4: Indexer (walks repo, delegates to parser, writes to GraphStore)

**Files:**
- Create: `packages/opencode-codebase-memory/src/indexer.js`
- Create: `packages/opencode-codebase-memory/test/indexer.test.js`

**Step 1: Write failing tests**

```js
// test/indexer.test.js
import { test, expect, describe, afterEach } from 'bun:test';
import { Indexer } from '../src/indexer.js';
import { GraphStore } from '../src/graph-store.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';

const TEST_DIR = '/tmp/test-indexer-repo';
const TEST_DB = '/tmp/test-indexer.db';

describe('Indexer', () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    if (existsSync(TEST_DB)) rmSync(TEST_DB);
  });

  test('indexes a directory and produces nodes', () => {
    mkdirSync(`${TEST_DIR}/src`, { recursive: true });
    writeFileSync(`${TEST_DIR}/src/auth.ts`, `
      export function login(user: string) { return validate(user); }
      function validate(user: string) { return user.length > 0; }
    `);
    const store = new GraphStore(TEST_DB);
    const indexer = new Indexer(store);
    const stats = indexer.indexDirectory(TEST_DIR);
    expect(stats.filesIndexed).toBeGreaterThan(0);
    expect(stats.nodesAdded).toBeGreaterThan(0);
    store.close();
  });

  test('incremental re-index skips unchanged files', () => {
    mkdirSync(`${TEST_DIR}/src`, { recursive: true });
    writeFileSync(`${TEST_DIR}/src/foo.js`, `function foo() {}`);
    const store = new GraphStore(TEST_DB);
    const indexer = new Indexer(store);
    const first = indexer.indexDirectory(TEST_DIR);
    const second = indexer.indexDirectory(TEST_DIR);
    expect(second.filesSkipped).toBeGreaterThan(0);
    store.close();
  });

  test('respects .gitignore patterns', () => {
    mkdirSync(`${TEST_DIR}/node_modules/some-pkg`, { recursive: true });
    writeFileSync(`${TEST_DIR}/node_modules/some-pkg/index.js`, `function vendored() {}`);
    writeFileSync(`${TEST_DIR}/app.js`, `function app() {}`);
    const store = new GraphStore(TEST_DB);
    const indexer = new Indexer(store);
    indexer.indexDirectory(TEST_DIR);
    const nodes = store.getNodeByName('vendored');
    expect(nodes.length).toBe(0); // node_modules skipped
    store.close();
  });
});
```

**Step 2: Run tests — verify they fail**

```bash
bun test test/indexer.test.js
```

**Step 3: Implement indexer.js**

```js
// src/indexer.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseFile, SUPPORTED_EXTENSIONS } = require('./parser.js');

// Default ignore patterns (no gitignore parsing needed for v1 — just hardcoded)
const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', '.cache',
  'coverage', '.turbo', '.bun', '__pycache__', '.venv', 'venv'
]);

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

class Indexer {
  constructor(store) {
    this.store = store;
  }

  indexDirectory(dirPath) {
    const stats = { filesIndexed: 0, filesSkipped: 0, nodesAdded: 0, edgesAdded: 0, errors: [] };
    const files = this._collectFiles(dirPath);

    for (const filePath of files) {
      try {
        const stat = fs.statSync(filePath);
        const hash = hashFile(filePath);
        const relPath = path.relative(dirPath, filePath);
        const existing = this.store.getFile(relPath);

        if (existing && existing.hash === hash) {
          stats.filesSkipped++;
          continue;
        }

        // Clear stale data for this file
        this.store.clearFile(relPath);

        // Parse
        const ext = path.extname(filePath).toLowerCase().slice(1);
        const { nodes, edges } = parseFile(filePath);

        // Normalize file paths to relative
        const normalizedNodes = nodes.map(n => ({ ...n, file: relPath }));
        const normalizedEdges = edges.map(e => ({ ...e, file: relPath }));

        for (const node of normalizedNodes) this.store.upsertNode(node);
        for (const edge of normalizedEdges) {
          if (edge.to_id || edge.to_name) this.store.upsertEdge(edge);
        }

        this.store.upsertFile({ path: relPath, mtime: stat.mtimeMs, size: stat.size, hash, language: ext });

        stats.filesIndexed++;
        stats.nodesAdded += normalizedNodes.length;
        stats.edgesAdded += normalizedEdges.length;
      } catch (err) {
        stats.errors.push({ file: filePath, error: err.message });
      }
    }

    // Rebuild FTS after batch
    try { this.store.rebuildFts(); } catch {}

    return stats;
  }

  _collectFiles(dirPath) {
    const result = [];
    const walk = (dir) => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!IGNORE_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (SUPPORTED_EXTENSIONS.has(ext)) result.push(path.join(dir, entry.name));
        }
      }
    };
    walk(dirPath);
    return result;
  }
}

module.exports = { Indexer };
```

**Step 4: Run tests — verify they pass**

```bash
bun test test/indexer.test.js
```
Expected: 3/3 pass.

**Step 5: Commit**

```bash
git add packages/opencode-codebase-memory/src/indexer.js packages/opencode-codebase-memory/test/indexer.test.js
git commit -m "feat(codebase-memory): Indexer with incremental re-index and node_modules skip"
```

---

## Task 5: CodebaseMemory main class + repo registry

**Files:**
- Modify: `packages/opencode-codebase-memory/src/index.js`
- Create: `packages/opencode-codebase-memory/test/index.test.js`

**Step 1: Write failing tests**

```js
// test/index.test.js
import { test, expect, describe, afterEach } from 'bun:test';
import { CodebaseMemory } from '../src/index.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

const TEST_REPO = '/tmp/test-cm-repo';
const TEST_STATE_DIR = '/tmp/test-cm-state';

describe('CodebaseMemory', () => {
  afterEach(() => {
    if (existsSync(TEST_REPO)) rmSync(TEST_REPO, { recursive: true });
    if (existsSync(TEST_STATE_DIR)) rmSync(TEST_STATE_DIR, { recursive: true });
  });

  test('analyze() indexes a repo and registers it', () => {
    mkdirSync(`${TEST_REPO}/src`, { recursive: true });
    writeFileSync(`${TEST_REPO}/src/app.js`, `function main() { run(); }\nfunction run() {}`);
    const cm = new CodebaseMemory({ stateDir: TEST_STATE_DIR });
    const result = cm.analyze(TEST_REPO);
    expect(result.filesIndexed).toBeGreaterThan(0);
    const repos = cm.listRepos();
    expect(repos.some(r => r.path === TEST_REPO)).toBe(true);
    cm.close();
  });

  test('query() returns node and edges', () => {
    mkdirSync(`${TEST_REPO}/src`, { recursive: true });
    writeFileSync(`${TEST_REPO}/src/app.js`, `function main() { run(); }\nfunction run() {}`);
    const cm = new CodebaseMemory({ stateDir: TEST_STATE_DIR });
    cm.analyze(TEST_REPO);
    const result = cm.query('main', TEST_REPO);
    expect(result).not.toBeNull();
    expect(result.node?.name).toBe('main');
    cm.close();
  });

  test('search() returns matching symbols', () => {
    mkdirSync(`${TEST_REPO}/src`, { recursive: true });
    writeFileSync(`${TEST_REPO}/src/auth.ts`, `export function validateToken(t: string) { return true; }`);
    const cm = new CodebaseMemory({ stateDir: TEST_STATE_DIR });
    cm.analyze(TEST_REPO);
    const results = cm.search('validateToken', TEST_REPO);
    expect(results.length).toBeGreaterThan(0);
    cm.close();
  });

  test('impact() returns blast radius', () => {
    mkdirSync(`${TEST_REPO}/src`, { recursive: true });
    writeFileSync(`${TEST_REPO}/src/app.js`, `function caller() { target(); }\nfunction target() {}`);
    const cm = new CodebaseMemory({ stateDir: TEST_STATE_DIR });
    cm.analyze(TEST_REPO);
    const result = cm.impact('target', TEST_REPO);
    expect(Array.isArray(result)).toBe(true);
    cm.close();
  });
});
```

**Step 2: Run — verify fail**

```bash
bun test test/index.test.js
```

**Step 3: Implement src/index.js**

```js
// src/index.js
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { GraphStore } = require('./graph-store.js');
const { Indexer } = require('./indexer.js');

const DEFAULT_STATE_DIR = path.join(os.homedir(), '.opencode', 'codebase-memory');
const REGISTRY_FILE = 'repos.json';

function repoHash(repoPath) {
  return crypto.createHash('sha256').update(path.resolve(repoPath)).digest('hex').slice(0, 12);
}

class CodebaseMemory {
  constructor({ stateDir = DEFAULT_STATE_DIR } = {}) {
    this.stateDir = stateDir;
    fs.mkdirSync(stateDir, { recursive: true });
    this._stores = new Map(); // repoPath -> GraphStore
    this._registry = this._loadRegistry();
  }

  _registryPath() { return path.join(this.stateDir, REGISTRY_FILE); }

  _loadRegistry() {
    try { return JSON.parse(fs.readFileSync(this._registryPath(), 'utf-8')); } catch { return {}; }
  }

  _saveRegistry() {
    fs.writeFileSync(this._registryPath(), JSON.stringify(this._registry, null, 2));
  }

  _getStore(repoPath) {
    const resolved = path.resolve(repoPath);
    if (!this._stores.has(resolved)) {
      const dbPath = path.join(this.stateDir, `${repoHash(resolved)}.db`);
      this._stores.set(resolved, new GraphStore(dbPath));
    }
    return this._stores.get(resolved);
  }

  analyze(repoPath) {
    const resolved = path.resolve(repoPath);
    const store = this._getStore(resolved);
    const indexer = new Indexer(store);
    const stats = indexer.indexDirectory(resolved);
    const storeStats = store.getStats();

    this._registry[resolved] = {
      path: resolved,
      hash: repoHash(resolved),
      indexed_at: new Date().toISOString(),
      stats: storeStats,
    };
    this._saveRegistry();
    return { ...stats, ...storeStats };
  }

  query(symbolName, repoPath) {
    const store = this._getStore(path.resolve(repoPath));
    const nodes = store.getNodeByName(symbolName);
    if (!nodes.length) return null;
    const node = nodes[0];
    const callees = store.getEdgesFrom(node.id);
    const callers = store.getEdgesTo(node.id);
    return { node, callees, callers };
  }

  context(filePath, line, repoPath) {
    const store = this._getStore(path.resolve(repoPath));
    const rel = path.relative(path.resolve(repoPath), path.resolve(filePath));
    // Find node closest to given line in this file
    const stmt = store.db.prepare(
      'SELECT * FROM nodes WHERE file = ? ORDER BY ABS(line - ?) LIMIT 1'
    );
    const node = stmt.get(rel, line);
    if (!node) return null;
    const callees = store.getEdgesFrom(node.id);
    const callers = store.getEdgesTo(node.id);
    return { node, callees, callers };
  }

  impact(symbolName, repoPath, depth = 3) {
    const store = this._getStore(path.resolve(repoPath));
    return store.getBlastRadius(symbolName, depth);
  }

  search(query, repoPath, opts = {}) {
    const store = this._getStore(path.resolve(repoPath));
    return store.search(query, opts.limit ?? 20);
  }

  detectChanges(repoPath, since) {
    const store = this._getStore(path.resolve(repoPath));
    const sinceTs = since ? new Date(since).getTime() : 0;
    const stmt = store.db.prepare('SELECT * FROM files WHERE mtime > ? ORDER BY mtime DESC');
    const changedFiles = stmt.all(sinceTs);
    // For each changed file, find its symbols
    const affectedSymbols = [];
    for (const file of changedFiles) {
      const nodes = store.db.prepare('SELECT name, kind FROM nodes WHERE file = ?').all(file.path);
      affectedSymbols.push({ file: file.path, symbols: nodes });
    }
    return { changedFiles, affectedSymbols };
  }

  listRepos() {
    return Object.values(this._registry);
  }

  getStats(repoPath) {
    const store = this._getStore(path.resolve(repoPath));
    return store.getStats();
  }

  // Learning pipeline integration: enrich error context with blast radius
  enrichErrorContext(errorFiles, repoPath) {
    if (!repoPath || !this._registry[path.resolve(repoPath)]) return null;
    const results = {};
    for (const file of errorFiles) {
      const store = this._getStore(path.resolve(repoPath));
      const nodes = store.db.prepare('SELECT * FROM nodes WHERE file LIKE ?').all(`%${path.basename(file)}%`);
      const hotNodes = nodes.slice(0, 5);
      results[file] = {
        symbols: hotNodes.map(n => n.name),
        blast_radius: hotNodes.flatMap(n => store.getBlastRadius(n.id, 2)).map(n => n.name),
      };
    }
    return results;
  }

  close() {
    for (const store of this._stores.values()) store.close();
    this._stores.clear();
  }
}

module.exports = { CodebaseMemory };
```

**Step 4: Run tests — verify they pass**

```bash
bun test test/index.test.js
```

**Step 5: Commit**

```bash
git add packages/opencode-codebase-memory/src/index.js packages/opencode-codebase-memory/test/index.test.js
git commit -m "feat(codebase-memory): CodebaseMemory class with analyze/query/search/impact/detectChanges"
```

---

## Task 6: CLI (`opencode-codebase`)

**Files:**
- Modify: `packages/opencode-codebase-memory/src/cli.mjs`

No separate test file — CLI is thin shell over CodebaseMemory. Manual smoke-test only.

**Step 1: Implement cli.mjs**

```js
#!/usr/bin/env bun
// src/cli.mjs
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const { CodebaseMemory } = require('./index.js');

const [,, cmd, ...args] = process.argv;
const flags = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const [k, v] = args[i].slice(2).split('=');
    flags[k] = v ?? (args[i + 1]?.startsWith('--') ? true : args[++i] ?? true);
  } else {
    positional.push(args[i]);
  }
}

const json = !!flags.json;
const out = json ? (d) => console.log(JSON.stringify(d, null, 2)) : (d) => console.log(JSON.stringify(d, null, 2));

const cm = new CodebaseMemory();

function findRepo(explicit) {
  if (explicit) return explicit;
  const repos = cm.listRepos();
  if (repos.length === 1) return repos[0].path;
  if (repos.length === 0) { console.error('No repos indexed. Run: opencode-codebase analyze [path]'); process.exit(1); }
  // default to cwd if it's registered
  const cwd = process.cwd();
  const match = repos.find(r => cwd.startsWith(r.path));
  if (match) return match.path;
  console.error(`Multiple repos indexed. Specify --repo=<path>. Indexed: ${repos.map(r => r.path).join(', ')}`);
  process.exit(1);
}

switch (cmd) {
  case 'analyze': {
    const target = positional[0] ?? process.cwd();
    console.error(`Indexing ${target}...`);
    const result = cm.analyze(target);
    out({ status: 'ok', ...result });
    break;
  }

  case 'query': {
    const symbol = positional[0];
    if (!symbol) { console.error('Usage: opencode-codebase query <symbol> [--repo=<path>]'); process.exit(1); }
    const repo = findRepo(flags.repo);
    const result = cm.query(symbol, repo);
    if (!result) { out({ error: `Symbol '${symbol}' not found` }); process.exit(1); }
    out(result);
    break;
  }

  case 'context': {
    const [file, line] = positional;
    if (!file) { console.error('Usage: opencode-codebase context <file> <line> [--repo=<path>]'); process.exit(1); }
    const repo = findRepo(flags.repo);
    const result = cm.context(file, parseInt(line) || 1, repo);
    out(result ?? { error: 'No symbol found at that location' });
    break;
  }

  case 'impact': {
    const symbol = positional[0];
    if (!symbol) { console.error('Usage: opencode-codebase impact <symbol> [--depth=3] [--repo=<path>]'); process.exit(1); }
    const repo = findRepo(flags.repo);
    const depth = parseInt(flags.depth) || 3;
    const result = cm.impact(symbol, repo, depth);
    out({ symbol, depth, affected: result });
    break;
  }

  case 'search': {
    const query = positional.join(' ');
    if (!query) { console.error('Usage: opencode-codebase search <query> [--repo=<path>]'); process.exit(1); }
    const repo = findRepo(flags.repo);
    const result = cm.search(query, repo, { limit: parseInt(flags.limit) || 20 });
    out({ query, results: result });
    break;
  }

  case 'detect-changes': {
    const repo = findRepo(flags.repo);
    const result = cm.detectChanges(repo, flags.since);
    out(result);
    break;
  }

  case 'list-repos': {
    out(cm.listRepos());
    break;
  }

  case 'health': {
    const repos = cm.listRepos();
    const health = repos.map(r => ({ ...r, stats: cm.getStats(r.path) }));
    out({ repos: health, total: repos.length });
    break;
  }

  default:
    console.log(`opencode-codebase v1.0.0

Commands:
  analyze [path]              Index/re-index a repo (default: cwd)
  query <symbol>              Get node + callers/callees for a symbol
  context <file> <line>       Get symbol at file:line
  impact <symbol>             Blast radius of changing a symbol
  search <query>              BM25 full-text search over symbols
  detect-changes [--since=X]  Files + symbols changed since timestamp
  list-repos                  List all indexed repos
  health                      DB stats for all indexed repos

Flags:
  --repo=<path>   Target repo (auto-detected if only one indexed)
  --depth=N       Traversal depth for impact (default: 3)
  --limit=N       Result limit for search (default: 20)
  --json          Force JSON output (default: always JSON)
`);
}

cm.close();
```

**Step 2: Make executable (Unix) / verify runs on Windows**

```bash
bun run src/cli.mjs analyze .
```
Expected: JSON output with `filesIndexed`, `nodes`, `edges`.

```bash
bun run src/cli.mjs health
```
Expected: JSON with repo stats.

**Step 3: Commit**

```bash
git add packages/opencode-codebase-memory/src/cli.mjs
git commit -m "feat(codebase-memory): CLI with analyze/query/context/impact/search/detect-changes"
```

---

## Task 7: Wire into learning pipeline

**Files:**
- Modify: `scripts/ingest-sessions.mjs` — call `enrichErrorContext` after pattern extraction
- Modify: `scripts/system-health.mjs` — add Codebase Memory subsystem check
- Modify: `bun run setup` (root `package.json`) — add `analyze` step

**Step 1: Add to ingest-sessions.mjs**

At the top, after other requires, add:
```js
// Codebase Memory enrichment (optional — skip if not indexed)
let codebaseMemory = null;
try {
  const { CodebaseMemory } = require('../packages/opencode-codebase-memory/src/index.js');
  codebaseMemory = new CodebaseMemory();
} catch {}
```

After `processDelegationLog(skillRL)` completes, add:
```js
// Enrich error patterns with blast radius context
if (codebaseMemory) {
  const repos = codebaseMemory.listRepos();
  if (repos.length > 0) {
    const allAntiPatterns = engine.antiPatterns.getAll?.() ?? [];
    for (const ap of allAntiPatterns) {
      const files = ap.context?.files ?? [];
      if (files.length > 0) {
        const enriched = codebaseMemory.enrichErrorContext(files, repos[0].path);
        if (enriched) ap.context.blast_radius = enriched;
      }
    }
  }
  codebaseMemory.close();
}
```

**Step 2: Add Codebase Memory section to system-health.mjs**

After the Runbooks section, add a new async function:
```js
async function auditCodebaseMemory() {
  try {
    const { CodebaseMemory } = require('../packages/opencode-codebase-memory/src/index.js');
    const cm = new CodebaseMemory();
    const repos = cm.listRepos();
    cm.close();
    if (repos.length === 0) return { status: 'WARNING', message: 'No repos indexed. Run: opencode-codebase analyze', repos: 0 };
    const totalNodes = repos.reduce((s, r) => s + (r.stats?.nodes ?? 0), 0);
    return { status: 'HEALTHY', repos: repos.length, totalNodes, message: `${repos.length} repo(s) indexed, ${totalNodes} symbols` };
  } catch {
    return { status: 'WARNING', message: 'Package not yet installed' };
  }
}
```

Call it in the main health loop and add to the overall score.

**Step 3: Add analyze to setup script**

In root `package.json`, find the `setup` script and append:
```
&& node -e "try { const {CodebaseMemory} = require('./packages/opencode-codebase-memory/src/index.js'); new CodebaseMemory().analyze('.').then?.(()=>{}); console.log('[setup] codebase-memory indexed'); } catch(e) { console.log('[setup] codebase-memory: skip (', e.message, ')'); }"
```

(Wrapped in try/catch so setup doesn't fail if package isn't ready yet.)

**Step 4: Run full test suite to verify nothing broken**

```bash
bun test
```
Expected: all prior tests pass. New codebase-memory tests pass.

**Step 5: Commit**

```bash
git add scripts/ingest-sessions.mjs scripts/system-health.mjs package.json
git commit -m "feat(codebase-memory): wire into learning pipeline and system health check"
```

---

## Task 8: Run, smoke test, verify health

**Step 1: Install package globally (optional) or use via bun run**

```bash
bun run packages/opencode-codebase-memory/src/cli.mjs analyze .
```

Expected: JSON with filesIndexed > 0, nodes > 0.

**Step 2: Query a known symbol**

```bash
bun run packages/opencode-codebase-memory/src/cli.mjs query CodebaseMemory
```

Expected: JSON with node details + callees/callers.

**Step 3: Run system health**

```bash
node scripts/system-health.mjs
```

Expected: Codebase Memory shows HEALTHY with repo count and node count.

**Step 4: Run ingest-sessions**

```bash
node scripts/ingest-sessions.mjs
```

Expected: no errors, blast radius enrichment logged.

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(codebase-memory): complete - SQLite graph, AST parser, CLI, pipeline integration"
```

---

## Inter-Memory Protocol (reference)

| Memory System | What it stores | Write when | Query when |
|--------------|---------------|-----------|-----------|
| `opencode-codebase-memory` | Symbol nodes + call graph per repo | `analyze` on setup/CI | Agent needs structure context, blast radius |
| `opencode-memory-graph` | Session→error bipartite graph | Error occurs in session | Debugging, pattern detection |
| Supermemory | User preferences, project decisions | User says "remember..." | Cross-session facts, preferences |

**No overlap. No duplication.**
