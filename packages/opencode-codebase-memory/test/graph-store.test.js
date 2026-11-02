import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { GraphStore } from '../src/graph-store.js';
import { rmSync, existsSync } from 'fs';

const TEST_DB = '/tmp/test-codebase-memory.db';

function cleanupDb() {
  for (const suffix of ['', '-wal', '-shm']) {
    const f = TEST_DB + suffix;
    if (existsSync(f)) try { rmSync(f); } catch {}
  }
}

describe('GraphStore', () => {
  let store;
  beforeEach(() => { cleanupDb(); store = new GraphStore(TEST_DB); });
  afterEach(() => { store.close(); cleanupDb(); });

  test('initializes schema without error', () => {
    const store2 = new GraphStore(TEST_DB);
    expect(store2).toBeDefined();
    store2.close();
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
