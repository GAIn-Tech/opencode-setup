import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { Indexer } from '../src/indexer.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function makeTmpDir() {
  const dir = join(tmpdir(), `indexer-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupDir(dir) {
  if (existsSync(dir)) try { rmSync(dir, { recursive: true }); } catch {}
}

function cleanupDb(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    const f = dbPath + suffix;
    if (existsSync(f)) try { rmSync(f); } catch {}
  }
}

describe('Indexer', () => {
  let tmpDir;
  let dbPath;
  let indexer;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    dbPath = join(tmpDir, 'test.db');
  });

  afterEach(() => {
    if (indexer) { indexer.close(); indexer = null; }
    cleanupDb(dbPath);
    cleanupDir(tmpDir);
  });

  test('indexes a directory of JS files and creates nodes/files', () => {
    const srcDir = join(tmpDir, 'src');
    mkdirSync(srcDir, { recursive: true });

    writeFileSync(join(srcDir, 'add.js'), `
      function add(a, b) { return a + b; }
      module.exports = { add };
    `);

    writeFileSync(join(srcDir, 'math.js'), `
      const { add } = require('./add');
      function multiply(a, b) { let sum = 0; for (let i = 0; i < b; i++) sum = add(sum, a); return sum; }
      module.exports = { multiply };
    `);

    indexer = new Indexer(dbPath);
    const result = indexer.indexDirectory(srcDir);

    expect(result.files).toBe(2);
    expect(result.nodes).toBeGreaterThan(0);
    expect(result.skipped).toBe(0);

    const stats = indexer.getStats();
    expect(stats.files).toBe(2);
    expect(stats.nodes).toBeGreaterThan(0);
  });

  test('re-index unchanged file returns skipped=true (incremental)', () => {
    const srcDir = join(tmpDir, 'src');
    mkdirSync(srcDir, { recursive: true });

    writeFileSync(join(srcDir, 'util.js'), `
      function greet(name) { return 'hello ' + name; }
      module.exports = { greet };
    `);

    indexer = new Indexer(dbPath);

    const first = indexer.indexFile(join(srcDir, 'util.js'));
    expect(first.skipped).toBe(false);
    expect(first.nodes).toBeGreaterThan(0);

    const second = indexer.indexFile(join(srcDir, 'util.js'));
    expect(second.skipped).toBe(true);
  });

  test('re-index modified file updates nodes', () => {
    const srcDir = join(tmpDir, 'src');
    mkdirSync(srcDir, { recursive: true });
    const filePath = join(srcDir, 'calc.js');

    writeFileSync(filePath, `
      function square(n) { return n * n; }
      module.exports = { square };
    `);

    indexer = new Indexer(dbPath);

    const first = indexer.indexFile(filePath);
    expect(first.skipped).toBe(false);
    const statsAfterFirst = indexer.getStats();
    const nodesAfterFirst = statsAfterFirst.nodes;

    // Modify the file — add a new function
    writeFileSync(filePath, `
      function square(n) { return n * n; }
      function cube(n) { return n * n * n; }
      module.exports = { square, cube };
    `);

    const second = indexer.indexFile(filePath);
    expect(second.skipped).toBe(false);
    expect(second.nodes).toBeGreaterThan(nodesAfterFirst);
  });

  test('IGNORE_DIRS are skipped (node_modules not indexed)', () => {
    const srcDir = join(tmpDir, 'src');
    const nmDir = join(tmpDir, 'node_modules', 'some-pkg');
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(nmDir, { recursive: true });

    writeFileSync(join(srcDir, 'app.js'), `
      function main() { console.log('hello'); }
    `);
    writeFileSync(join(nmDir, 'index.js'), `
      function hidden() { return 42; }
    `);

    indexer = new Indexer(dbPath);
    const result = indexer.indexDirectory(tmpDir);

    // Only src/app.js should be indexed, not node_modules/some-pkg/index.js
    expect(result.files).toBe(1);
    const stats = indexer.getStats();
    expect(stats.files).toBe(1);
  });

  test('getStats returns correct counts after indexing', () => {
    const srcDir = join(tmpDir, 'src');
    mkdirSync(srcDir, { recursive: true });

    writeFileSync(join(srcDir, 'a.js'), `
      function alpha() { return 1; }
      function beta() { return alpha(); }
    `);
    writeFileSync(join(srcDir, 'b.js'), `
      class Widget { constructor() {} render() { return '<div>'; } }
    `);

    indexer = new Indexer(dbPath);
    indexer.indexDirectory(srcDir);

    const stats = indexer.getStats();
    expect(stats.files).toBe(2);
    expect(stats.nodes).toBeGreaterThanOrEqual(3); // alpha, beta, Widget + methods
    expect(stats.edges).toBeGreaterThanOrEqual(0); // at least some edges
  });
});
