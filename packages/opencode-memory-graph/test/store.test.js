'use strict';

/**
 * Rigorous tests for Memory Graph v3 data structures.
 * Tests: NodeStore, EdgeStore, MemoryGraphV3
 * Includes 10K+ node performance tests.
 *
 * Run: node test/store.test.js
 */

const { NodeStore, LRUMap, DEFAULT_CAPACITIES } = require('../src/node-store');
const { EdgeStore, EDGE_TYPES, DIRECTION } = require('../src/edge-store');
const { MemoryGraphV3 } = require('../src/graph-v3');

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(message);
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq(actual, expected, message) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    const msg = `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
    failures.push(msg);
    console.error(`  FAIL: ${msg}`);
  }
}

function assertThrows(fn, message) {
  try {
    fn();
    failed++;
    failures.push(`${message} — expected throw, but didn't`);
    console.error(`  FAIL: ${message} — expected throw`);
  } catch (e) {
    passed++;
  }
}

function section(name) {
  console.log(`\n═══ ${name} ═══`);
}

// ═══════════════════════════════════════════════════════════════════════════
// LRUMap Tests
// ═══════════════════════════════════════════════════════════════════════════

section('LRUMap');

{
  // Basic get/set
  const lru = new LRUMap(3);
  lru.set('a', 1);
  lru.set('b', 2);
  lru.set('c', 3);
  assertEq(lru.size, 3, 'LRU size after 3 inserts');
  assertEq(lru.get('a'), 1, 'LRU get returns correct value');
  assertEq(lru.get('missing'), undefined, 'LRU get missing returns undefined');
}

{
  // LRU eviction order
  const lru = new LRUMap(3);
  lru.set('a', 1);
  lru.set('b', 2);
  lru.set('c', 3);
  // 'a' is LRU, adding 'd' should evict 'a'
  const result = lru.set('d', 4);
  assert(result.evicted, 'LRU evicts when at capacity');
  assertEq(result.evictedKey, 'a', 'LRU evicts least recently used key');
  assertEq(result.evictedValue, 1, 'LRU evicted value is correct');
  assertEq(lru.has('a'), false, 'Evicted key no longer present');
  assertEq(lru.size, 3, 'LRU size stays at capacity after eviction');
}

{
  // Access promotes to MRU
  const lru = new LRUMap(3);
  lru.set('a', 1);
  lru.set('b', 2);
  lru.set('c', 3);
  lru.get('a'); // promote 'a' to MRU
  const result = lru.set('d', 4); // should evict 'b' (now LRU)
  assertEq(result.evictedKey, 'b', 'LRU evicts correctly after access promotion');
  assert(lru.has('a'), 'Promoted key survives eviction');
}

{
  // peek does NOT promote
  const lru = new LRUMap(3);
  lru.set('a', 1);
  lru.set('b', 2);
  lru.set('c', 3);
  lru.peek('a'); // should NOT promote
  const result = lru.set('d', 4); // should still evict 'a'
  assertEq(result.evictedKey, 'a', 'peek does not promote');
}

{
  // Update existing key (no eviction)
  const lru = new LRUMap(3);
  lru.set('a', 1);
  lru.set('b', 2);
  lru.set('c', 3);
  const result = lru.set('b', 20);
  assertEq(result.evicted, false, 'Updating existing key does not evict');
  assertEq(lru.get('b'), 20, 'Updated value is correct');
  assertEq(lru.size, 3, 'Size unchanged after update');
}

{
  // delete
  const lru = new LRUMap(3);
  lru.set('a', 1);
  lru.set('b', 2);
  assert(lru.delete('a'), 'delete returns true for existing');
  assert(!lru.delete('z'), 'delete returns false for missing');
  assertEq(lru.size, 1, 'size after delete');
}

{
  // clear
  const lru = new LRUMap(5);
  lru.set('a', 1);
  lru.set('b', 2);
  lru.clear();
  assertEq(lru.size, 0, 'clear resets size to 0');
}

{
  // Invalid capacity
  assertThrows(() => new LRUMap(0), 'LRUMap rejects capacity 0');
  assertThrows(() => new LRUMap(-1), 'LRUMap rejects negative capacity');
  assertThrows(() => new LRUMap(NaN), 'LRUMap rejects NaN capacity');
}

{
  // Iterator
  const lru = new LRUMap(5);
  lru.set('a', 1);
  lru.set('b', 2);
  const entries = Array.from(lru);
  assertEq(entries.length, 2, 'Iterator yields correct count');
  assertEq(entries[0][0], 'a', 'Iterator first key correct');
}

// ═══════════════════════════════════════════════════════════════════════════
// NodeStore Tests
// ═══════════════════════════════════════════════════════════════════════════

section('NodeStore');

{
  // Basic set/get
  const store = new NodeStore();
  const node = store.set('session:abc', { name: 'test' });
  assertEq(node.id, 'session:abc', 'Node ID preserved');
  assertEq(node.type, 'session', 'Node type extracted from ID');
  assertEq(node.data.name, 'test', 'Node data stored');
  assert(node.meta.created, 'Node has meta.created');
  assert(node.meta.updated, 'Node has meta.updated');
}

{
  // Get retrieves correctly
  const store = new NodeStore();
  store.set('error:TypeError', { count: 5 });
  const got = store.get('error:TypeError');
  assertEq(got.data.count, 5, 'get retrieves stored data');
  assertEq(got.type, 'error', 'get returns correct type');
}

{
  // Get missing returns undefined
  const store = new NodeStore();
  assertEq(store.get('session:missing'), undefined, 'get missing returns undefined');
}

{
  // Update existing node merges data
  const store = new NodeStore();
  store.set('tool:grep', { usage: 1 });
  const updated = store.set('tool:grep', { usage: 2, extra: 'yes' });
  assertEq(updated.data.usage, 2, 'Update overwrites existing field');
  assertEq(updated.data.extra, 'yes', 'Update adds new field');
}

{
  // has / delete
  const store = new NodeStore();
  store.set('model:gpt4', { name: 'GPT-4' });
  assert(store.has('model:gpt4'), 'has returns true for existing');
  assert(!store.has('model:gpt5'), 'has returns false for missing');
  assert(store.delete('model:gpt4'), 'delete returns true');
  assert(!store.has('model:gpt4'), 'has returns false after delete');
  assert(!store.delete('model:gpt4'), 'delete returns false for already deleted');
}

{
  // getByType
  const store = new NodeStore();
  store.set('session:a', {});
  store.set('session:b', {});
  store.set('error:e1', {});
  const sessions = store.getByType('session');
  assertEq(sessions.length, 2, 'getByType returns correct count');
  const errors = store.getByType('error');
  assertEq(errors.length, 1, 'getByType returns correct count for errors');
  const tools = store.getByType('tool');
  assertEq(tools.length, 0, 'getByType returns empty for unused type');
}

{
  // totalSize
  const store = new NodeStore();
  store.set('session:a', {});
  store.set('error:e1', {});
  store.set('tool:t1', {});
  assertEq(store.totalSize, 3, 'totalSize counts all nodes');
}

{
  // stats
  const store = new NodeStore();
  store.set('session:a', {});
  store.set('session:b', {});
  const stats = store.stats();
  assertEq(stats.session.size, 2, 'stats shows correct session size');
  assertEq(stats.session.capacity, DEFAULT_CAPACITIES.session, 'stats shows correct capacity');
  assertEq(stats.total, 2, 'stats shows correct total');
}

{
  // LRU eviction
  const store = new NodeStore({ session: 3 });
  store.set('session:a', {});
  store.set('session:b', {});
  store.set('session:c', {});
  // Fill to capacity, next insert should evict 'session:a'
  store.set('session:d', {});
  assert(!store.has('session:a'), 'LRU eviction removes oldest session');
  assert(store.has('session:d'), 'New session is present after eviction');
  assertEq(store.getByType('session').length, 3, 'Size stays at capacity');
}

{
  // Eviction callback
  const store = new NodeStore({ session: 2 });
  const evicted = [];
  store.onEvict((node) => evicted.push(node));

  store.set('session:x', {});
  store.set('session:y', {});
  store.set('session:z', {}); // should evict session:x
  assertEq(evicted.length, 1, 'Eviction callback called once');
  assertEq(evicted[0].id, 'session:x', 'Eviction callback receives evicted node');
}

{
  // Manual evict
  const store = new NodeStore();
  store.set('session:a', {});
  store.set('session:b', {});
  const evicted = store.evict('session');
  assert(evicted !== null, 'evict returns the evicted node');
  assertEq(evicted.id, 'session:a', 'evict removes LRU entry');
  assertEq(store.getByType('session').length, 1, 'Size decremented after evict');
}

{
  // Global index / peek
  const store = new NodeStore();
  store.set('agent:build', { role: 'builder' });
  const peeked = store.peek('agent:build');
  assert(peeked !== undefined, 'peek finds node in global index');
  assertEq(peeked.data.role, 'builder', 'peek returns correct data');
}

{
  // allIds
  const store = new NodeStore();
  store.set('session:a', {});
  store.set('error:e1', {});
  const ids = store.allIds();
  assertEq(ids.length, 2, 'allIds returns all node IDs');
  assert(ids.includes('session:a'), 'allIds includes session:a');
  assert(ids.includes('error:e1'), 'allIds includes error:e1');
}

{
  // Invalid ID format
  const store = new NodeStore();
  assertThrows(() => store.set('nocolon', {}), 'Rejects ID without colon');
  assertThrows(() => store.set('session:', {}), 'Rejects ID with empty identifier');
}

{
  // Unknown type on set
  const store = new NodeStore();
  assertThrows(() => store.set('unknown:x', {}), 'Rejects unknown node type');
}

{
  // registerType
  const store = new NodeStore();
  store.registerType('custom', 50);
  store.set('custom:test', { val: 1 });
  assertEq(store.get('custom:test').data.val, 1, 'Custom type works after registerType');
  assertThrows(() => store.registerType('session', 100), 'Cannot register existing type');
}

{
  // clear
  const store = new NodeStore();
  store.set('session:a', {});
  store.set('error:e1', {});
  store.clear();
  assertEq(store.totalSize, 0, 'clear resets all stores');
  assertEq(store.allIds().length, 0, 'clear resets global index');
}

// ═══════════════════════════════════════════════════════════════════════════
// EdgeStore Tests
// ═══════════════════════════════════════════════════════════════════════════

section('EdgeStore');

{
  // Basic addEdge
  const store = new EdgeStore();
  const { edge, created } = store.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED, 3);
  assert(created, 'addEdge returns created=true for new edge');
  assertEq(edge.from, 'session:a', 'Edge from is correct');
  assertEq(edge.to, 'error:e1', 'Edge to is correct');
  assertEq(edge.type, EDGE_TYPES.ENCOUNTERED, 'Edge type is correct');
  assertEq(edge.weight, 3, 'Edge weight is correct');
  assert(edge.meta.created, 'Edge has meta.created');
}

{
  // Duplicate detection (update)
  const store = new EdgeStore();
  store.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED, 1);
  const { edge, created } = store.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED, 5);
  assert(!created, 'Duplicate edge returns created=false');
  assertEq(edge.weight, 5, 'Duplicate edge updates weight');
  assertEq(store.size, 1, 'No duplicate stored');
}

{
  // Different types are different edges
  const store = new EdgeStore();
  store.addEdge('session:a', 'tool:grep', EDGE_TYPES.USES_TOOL);
  store.addEdge('session:a', 'tool:grep', EDGE_TYPES.ENCOUNTERED);
  assertEq(store.size, 2, 'Different types create separate edges');
}

{
  // getEdges — outgoing
  const store = new EdgeStore();
  store.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  store.addEdge('session:a', 'error:e2', EDGE_TYPES.ENCOUNTERED);
  store.addEdge('session:b', 'error:e1', EDGE_TYPES.ENCOUNTERED);

  const outA = store.getEdges('session:a', DIRECTION.OUT);
  assertEq(outA.length, 2, 'getEdges OUT returns correct count');

  const outB = store.getEdges('session:b', DIRECTION.OUT);
  assertEq(outB.length, 1, 'getEdges OUT for session:b');
}

{
  // getEdges — incoming
  const store = new EdgeStore();
  store.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  store.addEdge('session:b', 'error:e1', EDGE_TYPES.ENCOUNTERED);

  const inE1 = store.getEdges('error:e1', DIRECTION.IN);
  assertEq(inE1.length, 2, 'getEdges IN returns correct count');
}

{
  // getEdges — both
  const store = new EdgeStore();
  store.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  store.addEdge('error:e1', 'tool:grep', EDGE_TYPES.USES_TOOL);

  const both = store.getEdges('error:e1', DIRECTION.BOTH);
  assertEq(both.length, 2, 'getEdges BOTH returns in + out');
}

{
  // getEdges — type filter
  const store = new EdgeStore();
  store.addEdge('session:a', 'model:gpt4', EDGE_TYPES.USES_MODEL);
  store.addEdge('session:a', 'tool:grep', EDGE_TYPES.USES_TOOL);
  store.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);

  const models = store.getEdges('session:a', DIRECTION.OUT, EDGE_TYPES.USES_MODEL);
  assertEq(models.length, 1, 'getEdges with type filter');
  assertEq(models[0].to, 'model:gpt4', 'Type filter returns correct edge');
}

{
  // getEdge / hasEdge
  const store = new EdgeStore();
  store.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  assert(store.hasEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED), 'hasEdge returns true');
  assert(!store.hasEdge('session:a', 'error:e2', EDGE_TYPES.ENCOUNTERED), 'hasEdge returns false');
  const edge = store.getEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  assertEq(edge.weight, 1, 'getEdge returns the edge');
}

{
  // removeEdge
  const store = new EdgeStore();
  store.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  assert(store.removeEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED), 'removeEdge returns true');
  assertEq(store.size, 0, 'Edge removed');
  assert(!store.removeEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED), 'removeEdge returns false for missing');
}

{
  // removeEdge cleans indexes
  const store = new EdgeStore();
  store.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  store.removeEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  assertEq(store.getEdges('session:a', DIRECTION.OUT).length, 0, 'outIndex cleaned after removeEdge');
  assertEq(store.getEdges('error:e1', DIRECTION.IN).length, 0, 'inIndex cleaned after removeEdge');
}

{
  // removeEdgesForNode (cascade eviction)
  const store = new EdgeStore();
  store.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  store.addEdge('session:a', 'error:e2', EDGE_TYPES.ENCOUNTERED);
  store.addEdge('session:b', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  store.addEdge('error:e1', 'tool:grep', EDGE_TYPES.USES_TOOL);

  const removed = store.removeEdgesForNode('error:e1');
  assertEq(removed.length, 3, 'removeEdgesForNode removes all connected edges');
  assertEq(store.size, 1, 'Only unrelated edge remains');
  assert(store.hasEdge('session:a', 'error:e2', EDGE_TYPES.ENCOUNTERED), 'Unrelated edge survives');
}

{
  // onRemove listener
  const store = new EdgeStore();
  const removed = [];
  store.onRemove((e) => removed.push(e));
  store.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  store.removeEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  assertEq(removed.length, 1, 'onRemove called on removeEdge');
}

{
  // Invalid edge type
  const store = new EdgeStore();
  assertThrows(
    () => store.addEdge('session:a', 'error:e1', 'INVALID_TYPE'),
    'Rejects invalid edge type'
  );
}

{
  // Missing from/to
  const store = new EdgeStore();
  assertThrows(() => store.addEdge('', 'error:e1', EDGE_TYPES.ENCOUNTERED), 'Rejects empty from');
  assertThrows(() => store.addEdge('session:a', '', EDGE_TYPES.ENCOUNTERED), 'Rejects empty to');
}

{
  // allEdges / getByType
  const store = new EdgeStore();
  store.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  store.addEdge('session:a', 'model:gpt4', EDGE_TYPES.USES_MODEL);
  assertEq(store.allEdges().length, 2, 'allEdges returns all');
  assertEq(store.getByType(EDGE_TYPES.USES_MODEL).length, 1, 'getByType filters correctly');
}

{
  // stats
  const store = new EdgeStore();
  store.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  store.addEdge('session:a', 'tool:grep', EDGE_TYPES.USES_TOOL);
  const stats = store.stats();
  assertEq(stats.totalEdges, 2, 'stats totalEdges');
  assertEq(stats.byType[EDGE_TYPES.ENCOUNTERED], 1, 'stats byType ENCOUNTERED');
  assertEq(stats.byType[EDGE_TYPES.USES_TOOL], 1, 'stats byType USES_TOOL');
}

{
  // clear
  const store = new EdgeStore();
  store.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  store.clear();
  assertEq(store.size, 0, 'clear resets edge store');
}

{
  // Iterator
  const store = new EdgeStore();
  store.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  store.addEdge('session:a', 'error:e2', EDGE_TYPES.ENCOUNTERED);
  const all = Array.from(store);
  assertEq(all.length, 2, 'Symbol.iterator works');
}

// ═══════════════════════════════════════════════════════════════════════════
// MemoryGraphV3 Tests
// ═══════════════════════════════════════════════════════════════════════════

section('MemoryGraphV3');

{
  // Construction
  const g = new MemoryGraphV3();
  assert(g.nodes instanceof NodeStore, 'Composes NodeStore');
  assert(g.edges instanceof EdgeStore, 'Composes EdgeStore');
}

{
  // addNode / getNode
  const g = new MemoryGraphV3();
  const node = g.addNode('session:test', { name: 'my session' });
  assertEq(node.id, 'session:test', 'addNode returns correct node');
  const got = g.getNode('session:test');
  assertEq(got.data.name, 'my session', 'getNode retrieves data');
}

{
  // addEdge / getEdges
  const g = new MemoryGraphV3();
  g.addNode('session:a', {});
  g.addNode('error:e1', {});
  const edge = g.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED, 2);
  assertEq(edge.weight, 2, 'addEdge stores weight');

  const edges = g.getEdges('session:a', DIRECTION.OUT);
  assertEq(edges.length, 1, 'getEdges returns edges');
}

{
  // removeNode cascades to edges
  const g = new MemoryGraphV3();
  g.addNode('session:a', {});
  g.addNode('error:e1', {});
  g.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  g.removeNode('session:a');
  assertEq(g.edges.size, 0, 'removeNode cascade-removes edges');
}

{
  // Events
  const g = new MemoryGraphV3();
  const events = [];
  g.on('node-added', (n) => events.push({ type: 'node-added', id: n.id }));
  g.on('node-updated', (n) => events.push({ type: 'node-updated', id: n.id }));
  g.on('edge-added', (e) => events.push({ type: 'edge-added', from: e.from }));
  g.on('edge-updated', (e) => events.push({ type: 'edge-updated', from: e.from }));
  g.on('node-removed', (n) => events.push({ type: 'node-removed', id: n.id }));
  g.on('edge-removed', (e) => events.push({ type: 'edge-removed', from: e.from }));

  g.addNode('session:a', {});
  g.addNode('session:a', { updated: true }); // update
  g.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  g.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED, 5); // update
  g.removeEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);

  assert(events.some((e) => e.type === 'node-added'), 'Emits node-added');
  assert(events.some((e) => e.type === 'node-updated'), 'Emits node-updated');
  assert(events.some((e) => e.type === 'edge-added'), 'Emits edge-added');
  assert(events.some((e) => e.type === 'edge-updated'), 'Emits edge-updated');
  assert(events.some((e) => e.type === 'edge-removed'), 'Emits edge-removed');
}

{
  // LRU eviction cascade events
  const g = new MemoryGraphV3({ capacities: { session: 2 } });
  const removedNodes = [];
  const removedEdges = [];
  g.on('node-removed', (n) => removedNodes.push(n));
  g.on('edge-removed', (e) => removedEdges.push(e));

  g.addNode('session:a', {});
  g.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  g.addNode('session:b', {});
  // This should evict session:a and its edges
  g.addNode('session:c', {});

  assertEq(removedNodes.length, 1, 'LRU eviction emits node-removed');
  assertEq(removedNodes[0].id, 'session:a', 'Correct node evicted');
  assertEq(removedEdges.length, 1, 'LRU eviction cascade emits edge-removed');
}

{
  // neighbors
  const g = new MemoryGraphV3();
  g.addNode('session:a', {});
  g.addNode('error:e1', {});
  g.addNode('error:e2', {});
  g.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  g.addEdge('session:a', 'error:e2', EDGE_TYPES.ENCOUNTERED);

  const nbrs = g.neighbors('session:a');
  assertEq(nbrs.length, 2, 'neighbors returns connected nodes');
}

{
  // degree
  const g = new MemoryGraphV3();
  g.addNode('session:a', {});
  g.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  g.addEdge('session:a', 'error:e2', EDGE_TYPES.ENCOUNTERED);
  assertEq(g.degree('session:a', DIRECTION.OUT), 2, 'degree counts edges');
  assertEq(g.degree('session:a', DIRECTION.IN), 0, 'degree IN is 0 for source');
}

// ─── Transaction Tests ──────────────────────────────────────────────────────

section('Transactions');

{
  // Begin / Commit
  const g = new MemoryGraphV3();
  g.beginTransaction();
  assert(g.inTransaction, 'inTransaction is true after begin');

  g.addNode('session:tx1', { val: 1 });
  g.addEdge('session:tx1', 'error:e1', EDGE_TYPES.ENCOUNTERED);

  const summary = g.commit();
  assert(!g.inTransaction, 'inTransaction is false after commit');
  assertEq(summary.nodeOps, 1, 'Commit summary has nodeOps count');
  assertEq(summary.edgeOps, 1, 'Commit summary has edgeOps count');

  // Data persists after commit
  assert(g.getNode('session:tx1') !== undefined, 'Node persists after commit');
}

{
  // Rollback restores state
  const g = new MemoryGraphV3();
  g.addNode('session:pre', { val: 'original' });
  g.addEdge('session:pre', 'error:e1', EDGE_TYPES.ENCOUNTERED);

  g.beginTransaction();
  g.addNode('session:new', { val: 'should be gone' });
  g.addNode('session:pre', { val: 'modified' });
  g.addEdge('session:new', 'error:e2', EDGE_TYPES.ENCOUNTERED);
  g.removeNode('session:pre');

  g.rollback('test rollback');

  assert(!g.inTransaction, 'inTransaction false after rollback');
  assert(g.getNode('session:pre') !== undefined, 'Pre-existing node restored after rollback');
  assertEq(g.getNode('session:pre').data.val, 'original', 'Node data restored to original');
  assert(g.getNode('session:new') === undefined, 'New node gone after rollback');
  assertEq(g.edges.size, 1, 'Edge count restored after rollback');
}

{
  // Double begin throws
  const g = new MemoryGraphV3();
  g.beginTransaction();
  assertThrows(() => g.beginTransaction(), 'Cannot begin transaction twice');
  g.rollback();
}

{
  // Commit/rollback without begin throws
  const g = new MemoryGraphV3();
  assertThrows(() => g.commit(), 'Cannot commit without begin');
  assertThrows(() => g.rollback(), 'Cannot rollback without begin');
}

{
  // Transaction events
  const g = new MemoryGraphV3();
  let commitEvent = null;
  let rollbackEvent = null;
  g.on('transaction-commit', (data) => { commitEvent = data; });
  g.on('transaction-rollback', (data) => { rollbackEvent = data; });

  g.beginTransaction();
  g.addNode('session:x', {});
  g.commit();
  assert(commitEvent !== null, 'transaction-commit event emitted');
  assertEq(commitEvent.nodeOps.length, 1, 'Commit event has ops');

  g.beginTransaction();
  g.rollback('oops');
  assert(rollbackEvent !== null, 'transaction-rollback event emitted');
  assertEq(rollbackEvent.reason, 'oops', 'Rollback event has reason');
}

// ─── toV2Format ──────────────────────────────────────────────────────────

section('Backward Compatibility (toV2Format)');

{
  const g = new MemoryGraphV3();
  g.addNode('session:a', { name: 'Session A' });
  g.addNode('error:e1', { count: 3 });
  g.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED, 3);

  const v2 = g.toV2Format();
  assertEq(v2.nodes.length, 2, 'v2 format has correct node count');
  assertEq(v2.edges.length, 1, 'v2 format has correct edge count');
  assert(v2.meta.version === 3, 'v2 format meta has version 3');

  const sessionNode = v2.nodes.find((n) => n.id === 'session:a');
  assert(sessionNode, 'v2 session node exists');
  assertEq(sessionNode.type, 'session', 'v2 node has type');
  assertEq(sessionNode.name, 'Session A', 'v2 node data flattened');
  assert(sessionNode.created, 'v2 node has created timestamp');

  const edge = v2.edges[0];
  assertEq(edge.from, 'session:a', 'v2 edge from');
  assertEq(edge.to, 'error:e1', 'v2 edge to');
  assertEq(edge.weight, 3, 'v2 edge weight');
  assertEq(edge.type, EDGE_TYPES.ENCOUNTERED, 'v2 edge type');
}

// ─── stats ──────────────────────────────────────────────────────────────

{
  const g = new MemoryGraphV3();
  g.addNode('session:a', {});
  g.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  const stats = g.stats();
  assert(stats.nodes, 'stats has nodes');
  assert(stats.edges, 'stats has edges');
  assertEq(stats.inTransaction, false, 'stats shows transaction state');
}

{
  // clear
  const g = new MemoryGraphV3();
  g.addNode('session:a', {});
  g.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  g.clear();
  assertEq(g.nodes.totalSize, 0, 'clear resets nodes');
  assertEq(g.edges.size, 0, 'clear resets edges');
}

// ═══════════════════════════════════════════════════════════════════════════
// Performance Tests (10K+ nodes)
// ═══════════════════════════════════════════════════════════════════════════

section('Performance (10K+ nodes)');

{
  // 10K session nodes
  const store = new NodeStore();
  const start = Date.now();
  for (let i = 0; i < 10000; i++) {
    store.set(`session:perf_${i}`, { index: i, name: `Session ${i}` });
  }
  const insertTime = Date.now() - start;
  console.log(`  10K node inserts: ${insertTime}ms`);
  assert(insertTime < 5000, `10K node inserts under 5s (got ${insertTime}ms)`);
  // session capacity is 5000, so only 5000 should remain
  assertEq(store.getByType('session').length, 5000, '10K inserts with 5K capacity = 5K remaining');
}

{
  // 10K lookups
  const store = new NodeStore();
  for (let i = 0; i < 5000; i++) {
    store.set(`session:lookup_${i}`, { index: i });
  }
  const start = Date.now();
  for (let i = 0; i < 10000; i++) {
    store.get(`session:lookup_${i % 5000}`);
  }
  const lookupTime = Date.now() - start;
  console.log(`  10K node lookups: ${lookupTime}ms`);
  assert(lookupTime < 2000, `10K lookups under 2s (got ${lookupTime}ms)`);
}

{
  // 10K edges with index traversal
  // Use 200 sessions × 50 errors = 10000 unique combos, no duplication
  const edgeStore = new EdgeStore();
  const start = Date.now();
  for (let s = 0; s < 200; s++) {
    for (let e = 0; e < 50; e++) {
      edgeStore.addEdge(
        `session:s_${s}`,
        `error:e_${e}`,
        EDGE_TYPES.ENCOUNTERED,
        s + e
      );
    }
  }
  const insertTime = Date.now() - start;
  const totalInserted = 200 * 50;
  console.log(`  ${totalInserted} edge inserts (all unique): ${insertTime}ms`);
  assertEq(edgeStore.size, 10000, '10K unique edges inserted');
  assert(insertTime < 3000, `10K edge inserts under 3s (got ${insertTime}ms)`);

  // Traversal performance
  const traverseStart = Date.now();
  for (let i = 0; i < 200; i++) {
    edgeStore.getEdges(`session:s_${i}`, DIRECTION.OUT);
  }
  const traverseTime = Date.now() - traverseStart;
  console.log(`  200 edge traversals: ${traverseTime}ms`);
  assert(traverseTime < 500, `200 traversals under 500ms (got ${traverseTime}ms)`);

  // Each session should have 50 outgoing edges
  const edges = edgeStore.getEdges('session:s_0', DIRECTION.OUT);
  assertEq(edges.length, 50, 'Each session has 50 outgoing edges');
}

{
  // 10K+ full graph operations
  const g = new MemoryGraphV3({ capacities: { session: 5000, error: 3000 } });
  const start = Date.now();

  // Add 5000 sessions + 1000 errors + edges
  for (let i = 0; i < 5000; i++) {
    g.addNode(`session:full_${i}`, { index: i });
  }
  for (let i = 0; i < 1000; i++) {
    g.addNode(`error:full_${i}`, { count: i });
  }
  for (let i = 0; i < 10000; i++) {
    g.addEdge(
      `session:full_${i % 5000}`,
      `error:full_${i % 1000}`,
      EDGE_TYPES.ENCOUNTERED,
      1
    );
  }
  const totalTime = Date.now() - start;
  console.log(`  Full graph (5K sessions + 1K errors + 10K edges): ${totalTime}ms`);
  assert(totalTime < 10000, `Full graph build under 10s (got ${totalTime}ms)`);

  // toV2Format performance
  const v2Start = Date.now();
  const v2 = g.toV2Format();
  const v2Time = Date.now() - v2Start;
  console.log(`  toV2Format export: ${v2Time}ms`);
  assert(v2Time < 3000, `toV2Format under 3s (got ${v2Time}ms)`);
  assert(v2.nodes.length > 0, 'v2 export has nodes');
  assert(v2.edges.length > 0, 'v2 export has edges');
}

{
  // Cascade eviction under load
  const g = new MemoryGraphV3({ capacities: { session: 100 } });
  for (let i = 0; i < 100; i++) {
    g.addNode(`session:cas_${i}`, {});
    g.addEdge(`session:cas_${i}`, 'error:common', EDGE_TYPES.ENCOUNTERED);
  }
  assertEq(g.edges.size, 100, '100 edges before cascade');

  // Adding 50 more sessions should evict 50 old ones and their edges
  for (let i = 100; i < 150; i++) {
    g.addNode(`session:cas_${i}`, {});
  }
  // Some edges should have been cascade-removed
  assert(g.edges.size < 100, 'Cascade eviction reduced edge count');
}

// ═══════════════════════════════════════════════════════════════════════════
// Edge Type Coverage
// ═══════════════════════════════════════════════════════════════════════════

section('Edge Type Coverage');

{
  const g = new MemoryGraphV3();
  g.addNode('session:a', {});

  // All edge types
  g.addEdge('session:a', 'error:e1', EDGE_TYPES.ENCOUNTERED);
  g.addEdge('session:a', 'model:gpt4', EDGE_TYPES.USES_MODEL);
  g.addEdge('session:a', 'tool:grep', EDGE_TYPES.USES_TOOL);
  g.addEdge('session:a', 'agent:build', EDGE_TYPES.ORCHESTRATES);
  g.addEdge('agent:build', 'session:a', EDGE_TYPES.CHILD_OF);

  assertEq(g.edges.size, 5, 'All 5 edge types created');

  // Filter by type
  const models = g.getEdges('session:a', DIRECTION.OUT, EDGE_TYPES.USES_MODEL);
  assertEq(models.length, 1, 'Filter by USES_MODEL');
  assertEq(models[0].to, 'model:gpt4', 'USES_MODEL target correct');

  const tools = g.getEdges('session:a', DIRECTION.OUT, EDGE_TYPES.USES_TOOL);
  assertEq(tools.length, 1, 'Filter by USES_TOOL');

  const orchestrates = g.getEdges('session:a', DIRECTION.OUT, EDGE_TYPES.ORCHESTRATES);
  assertEq(orchestrates.length, 1, 'Filter by ORCHESTRATES');

  const childOf = g.getEdges('session:a', DIRECTION.IN, EDGE_TYPES.CHILD_OF);
  assertEq(childOf.length, 1, 'Filter by CHILD_OF (incoming)');
}

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════');
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  ✗ ${f}`);
  }
}

console.log('══════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
