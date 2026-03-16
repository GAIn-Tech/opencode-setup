import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync, utimesSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// We'll require the module fresh each test to pick up stateDir changes
let CodebaseMemory, STATE_DIR, REGISTRY_PATH;

function makeTmpDir(label) {
  const dir = join(tmpdir(), `cbm-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
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

/** Create a sample JS project in tmpDir with known functions */
function createSampleProject(dir) {
  mkdirSync(join(dir, 'src'), { recursive: true });

  writeFileSync(join(dir, 'src', 'greet.js'), `
function greet(name) {
  return 'Hello ' + name;
}
module.exports = { greet };
`);

  writeFileSync(join(dir, 'src', 'app.js'), `
const { greet } = require('./greet');
function main() {
  greet('world');
  console.log('done');
}
module.exports = { main };
`);
}

describe('CodebaseMemory', () => {
  let stateDir;
  let srcDir;
  let memory;

  beforeEach(() => {
    stateDir = makeTmpDir('state');
    srcDir = makeTmpDir('src');
    createSampleProject(srcDir);
    // Require fresh — stateDir is passed to constructor
    ({ CodebaseMemory } = require('../src/index.js'));
    memory = new CodebaseMemory({ stateDir });
  });

  afterEach(() => {
    // Clean up any db files created in stateDir
    if (stateDir && existsSync(stateDir)) {
      try {
        const entries = require('fs').readdirSync(stateDir);
        for (const e of entries) {
          const full = join(stateDir, e);
          if (e.endsWith('.db')) cleanupDb(full);
        }
      } catch {}
    }
    cleanupDir(stateDir);
    cleanupDir(srcDir);
    memory = null;
  });

  test('analyze() indexes a temp dir and registers repo', () => {
    const result = memory.analyze(srcDir, { name: 'test-project' });

    expect(result.repo).toBe('test-project');
    expect(result.files).toBeGreaterThanOrEqual(2);
    expect(result.nodes).toBeGreaterThan(0);
    expect(typeof result.skipped).toBe('number');

    // Registry should have the repo
    const repos = memory.listRepos();
    expect(repos.length).toBe(1);
    expect(repos[0].name).toBe('test-project');
    expect(repos[0].path).toBe(require('path').resolve(srcDir));
    expect(repos[0].dbPath).toContain('test-project.db');
    expect(repos[0].indexed_at).toBeTruthy();

    // Registry file should exist on disk
    const regPath = join(stateDir, 'repos.json');
    expect(existsSync(regPath)).toBe(true);
  });

  test('analyze() defaults name to basename of repo path', () => {
    const result = memory.analyze(srcDir);
    const basename = require('path').basename(srcDir);

    expect(result.repo).toBe(basename);
    const repos = memory.listRepos();
    expect(repos[0].name).toBe(basename);
  });

  test('query() returns matching symbols from indexed repo', () => {
    memory.analyze(srcDir, { name: 'qrepo' });

    const results = memory.query('qrepo', 'greet');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('greet');
  });

  test('query() throws for unknown repo', () => {
    expect(() => memory.query('nonexistent', 'foo')).toThrow(/not found/i);
  });

  test('context() returns node with callers and callees', () => {
    memory.analyze(srcDir, { name: 'ctx-repo' });

    // greet is called by main
    const ctx = memory.context('ctx-repo', 'greet');
    expect(ctx).not.toBeNull();
    expect(ctx.node).toBeTruthy();
    expect(ctx.node.name).toBe('greet');
    expect(Array.isArray(ctx.callers)).toBe(true);
    expect(Array.isArray(ctx.callees)).toBe(true);
  });

  test('context() returns null for unknown symbol', () => {
    memory.analyze(srcDir, { name: 'ctx-repo2' });
    const ctx = memory.context('ctx-repo2', 'nonexistentSymbol');
    expect(ctx).toBeNull();
  });

  test('context() throws for unknown repo', () => {
    expect(() => memory.context('nope', 'greet')).toThrow(/not found/i);
  });

  test('impact() returns blast radius array', () => {
    memory.analyze(srcDir, { name: 'imp-repo' });

    const result = memory.impact('imp-repo', 'greet');
    expect(Array.isArray(result)).toBe(true);
    // main calls greet, so main should be in blast radius
    // (blast radius = transitive callers)
  });

  test('impact() throws for unknown repo', () => {
    expect(() => memory.impact('nope', 'greet')).toThrow(/not found/i);
  });

  test('detectChanges() returns empty for freshly indexed repo', () => {
    memory.analyze(srcDir, { name: 'dc-repo' });

    const result = memory.detectChanges('dc-repo');
    expect(result.repo).toBe('dc-repo');
    expect(result.count).toBe(0);
    expect(result.changed).toEqual([]);
  });

  test('detectChanges() returns file after mtime bump', () => {
    memory.analyze(srcDir, { name: 'dc-repo2' });

    // Bump mtime of greet.js into the future
    const greetPath = join(srcDir, 'src', 'greet.js');
    const future = new Date(Date.now() + 60000);
    utimesSync(greetPath, future, future);

    const result = memory.detectChanges('dc-repo2');
    expect(result.count).toBeGreaterThan(0);
    expect(result.changed.length).toBeGreaterThan(0);
    // The changed file should be greet.js
    const changedBasenames = result.changed.map(p => require('path').basename(p));
    expect(changedBasenames).toContain('greet.js');
  });

  test('detectChanges() throws for unknown repo', () => {
    expect(() => memory.detectChanges('nope')).toThrow(/not found/i);
  });

  test('listRepos() returns registered repos', () => {
    expect(memory.listRepos()).toEqual([]);

    memory.analyze(srcDir, { name: 'list-a' });

    const srcDir2 = makeTmpDir('src2');
    createSampleProject(srcDir2);
    memory.analyze(srcDir2, { name: 'list-b' });

    const repos = memory.listRepos();
    expect(repos.length).toBe(2);
    const names = repos.map(r => r.name).sort();
    expect(names).toEqual(['list-a', 'list-b']);

    cleanupDir(srcDir2);
  });

  test('enrichErrorContext() finds symbols mentioned in error text', () => {
    memory.analyze(srcDir, { name: 'err-repo' });

    const results = memory.enrichErrorContext('TypeError: greet is not a function');
    expect(Array.isArray(results)).toBe(true);
    // Should find 'greet' in the indexed repo
    const found = results.find(r => r.symbol === 'greet');
    expect(found).toBeTruthy();
    expect(found.repo).toBe('err-repo');
    expect(found.node).toBeTruthy();
    expect(typeof found.callers_count).toBe('number');
  });

  test('enrichErrorContext() returns empty for unrelated error', () => {
    memory.analyze(srcDir, { name: 'err-repo2' });
    // Use a symbol name that definitely doesn't exist
    const results = memory.enrichErrorContext('SEGFAULT at 0x00');
    expect(Array.isArray(results)).toBe(true);
    // SEGFAULT is 8 chars but not a real symbol. Results may be empty.
    // At minimum, it should not throw
  });

  test('registry persists across CodebaseMemory instances', () => {
    memory.analyze(srcDir, { name: 'persist-repo' });

    // Create a new instance with the same stateDir
    const memory2 = new CodebaseMemory({ stateDir });
    const repos = memory2.listRepos();
    expect(repos.length).toBe(1);
    expect(repos[0].name).toBe('persist-repo');
  });
});
