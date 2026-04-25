import { describe, test, expect } from 'bun:test';
import {
  createPointer,
  verifyPointer,
  detectCycles,
  buildPointerGraph,
  findPointers,
  getPointerStats,
  VALID_POINTER_TYPES,
} from '../src/memory-meta.js';

describe('memory-meta', () => {
  test('VALID_POINTER_TYPES has all required types', () => {
    expect(VALID_POINTER_TYPES).toContain('references');
    expect(VALID_POINTER_TYPES).toContain('derived_from');
    expect(VALID_POINTER_TYPES).toContain('contradicts');
    expect(VALID_POINTER_TYPES).toContain('similar_to');
    expect(VALID_POINTER_TYPES).toContain('parent_of');
  });

  test('createPointer creates valid pointer', () => {
    const source = { id: 'src-1', content_hash: 'hash1' };
    const target = { id: 'tgt-1' };

    const pointer = createPointer(source, target, 'references');

    expect(pointer.id).toBeDefined();
    expect(pointer.source_id).toBe('src-1');
    expect(pointer.target_id).toBe('tgt-1');
    expect(pointer.type).toBe('references');
    expect(pointer.weight).toBe(0.8);
    expect(pointer.integrity_hash).toBeDefined();
    expect(pointer.created_at).toBeDefined();
  });

  test('createPointer throws for invalid pointer type', () => {
    const source = { id: 'src-1' };
    const target = { id: 'tgt-1' };

    expect(() => createPointer(source, target, 'invalid_type')).toThrow();
  });

  test('createPointer throws for missing id fields', () => {
    const source = { id: 'src-1' };
    const target = {};

    expect(() => createPointer(source, target, 'references')).toThrow();
  });

  test('createPointer clamps weight to [0, 1]', () => {
    const source = { id: 'src-1' };
    const target = { id: 'tgt-1' };

    const p1 = createPointer(source, target, 'references', { weight: 1.5 });
    expect(p1.weight).toBe(1.0);

    const p2 = createPointer(source, target, 'references', { weight: -0.5 });
    expect(p2.weight).toBe(0.0);

    const p3 = createPointer(source, target, 'references', { weight: 0.5 });
    expect(p3.weight).toBe(0.5);
  });

  test('verifyPointer validates integrity', () => {
    const source = { id: 'src-1' };
    const target = { id: 'tgt-1' };
    const pointer = createPointer(source, target, 'references');

    const result = verifyPointer(pointer);
    expect(result.valid).toBe(true);
  });

  test('verifyPointer detects tampering', () => {
    const source = { id: 'src-1' };
    const target = { id: 'tgt-1' };
    const pointer = createPointer(source, target, 'references');

    // Tamper with weight
    pointer.weight = 0.1;

    const result = verifyPointer(pointer);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('integrity hash mismatch');
  });

  test('verifyPointer rejects missing fields', () => {
    const result = verifyPointer({ id: 'p1' });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('missing required fields');
  });

  test('buildPointerGraph creates adjacency list', () => {
    const pointers = [
      { source_id: 'a', target_id: 'b', type: 'references' },
      { source_id: 'a', target_id: 'c', type: 'derived_from' },
      { source_id: 'b', target_id: 'c', type: 'contradicts' },
    ];

    const graph = buildPointerGraph(pointers);

    expect(graph.get('a').length).toBe(2);
    expect(graph.get('b').length).toBe(1);
    expect(graph.get('c')).toBeUndefined();
  });

  test('detectCycles finds no cycle in DAG', () => {
    const pointers = [
      { source_id: 'a', target_id: 'b', type: 'references' },
      { source_id: 'b', target_id: 'c', type: 'references' },
    ];
    const graph = buildPointerGraph(pointers);

    const cycles = detectCycles(graph, 'a');
    expect(cycles.length).toBe(0);
  });

  test('detectCycles finds cycle in cyclic graph', () => {
    const pointers = [
      { source_id: 'a', target_id: 'b', type: 'references' },
      { source_id: 'b', target_id: 'c', type: 'references' },
      { source_id: 'c', target_id: 'a', type: 'references' },
    ];
    const graph = buildPointerGraph(pointers);

    const cycles = detectCycles(graph, 'a');
    expect(cycles.length).toBeGreaterThan(0);
  });

  test('findPointers returns outgoing pointers', () => {
    const pointers = [
      { source_id: 'a', target_id: 'b', type: 'references' },
      { source_id: 'a', target_id: 'c', type: 'derived_from' },
      { source_id: 'b', target_id: 'a', type: 'contradicts' },
    ];

    const outgoing = findPointers(pointers, 'a', 'outgoing');
    expect(outgoing.length).toBe(2);
    expect(outgoing.every((p) => p.source_id === 'a')).toBe(true);
  });

  test('findPointers returns incoming pointers', () => {
    const pointers = [
      { source_id: 'a', target_id: 'b', type: 'references' },
      { source_id: 'b', target_id: 'a', type: 'contradicts' },
    ];

    const incoming = findPointers(pointers, 'a', 'incoming');
    expect(incoming.length).toBe(1);
    expect(incoming[0].source_id).toBe('b');
  });

  test('getPointerStats returns correct counts', () => {
    const pointers = [
      { source_id: 'a', target_id: 'b', type: 'references' },
      { source_id: 'a', target_id: 'c', type: 'derived_from' },
      { source_id: 'b', target_id: 'a', type: 'contradicts' },
    ];

    const stats = getPointerStats(pointers, 'a');

    expect(stats.outgoing).toBe(2);
    expect(stats.incoming).toBe(1);
    expect(stats.total).toBe(3);
    expect(stats.byType.references).toBe(1);
    expect(stats.byType.derived_from).toBe(1);
    expect(stats.byType.contradicts).toBe(1);
  });
});