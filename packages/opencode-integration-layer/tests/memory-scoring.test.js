import { describe, test, expect } from 'bun:test';
import {
  scoreMemory,
  computeRecency,
  computeEntityOverlap,
  computeContentRelevance,
  TYPE_WEIGHTS,
  DEFAULT_HALF_LIFE_DAYS,
} from '../src/memory-scoring.js';

describe('memory-scoring', () => {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  test('TYPE_WEIGHTS has all required memory types', () => {
    expect(TYPE_WEIGHTS.fact).toBe(1.0);
    expect(TYPE_WEIGHTS.pattern).toBe(0.9);
    expect(TYPE_WEIGHTS.decision).toBe(0.85);
    expect(TYPE_WEIGHTS.preference).toBe(0.8);
    expect(TYPE_WEIGHTS.error).toBe(0.95);
    expect(TYPE_WEIGHTS.session_context).toBe(0.6);
  });

  test('DEFAULT_HALF_LIFE_DAYS is 7', () => {
    expect(DEFAULT_HALF_LIFE_DAYS).toBe(7);
  });

  test('computeRecency returns 1.0 for core retention', () => {
    const now = Date.now();
    expect(computeRecency(new Date(now - 30 * MS_PER_DAY).toISOString(), now, 7, 'core')).toBe(1.0);
  });

  test('computeRecency returns 1.0 for future timestamp', () => {
    const now = Date.now();
    const future = new Date(now + MS_PER_DAY).toISOString();
    expect(computeRecency(future, now, 7, 'perishable')).toBe(1.0);
  });

  test('computeRecency returns 0.5 for missing timestamp', () => {
    expect(computeRecency(null, Date.now(), 7, 'perishable')).toBe(0.5);
    expect(computeRecency(undefined, Date.now(), 7, 'perishable')).toBe(0.5);
  });

  test('computeRecency applies exponential decay', () => {
    const now = Date.now();
    // Exactly at half-life (7 days ago) → should be ~0.5
    const halfLifeAgo = new Date(now - 7 * MS_PER_DAY).toISOString();
    const score = computeRecency(halfLifeAgo, now, 7, 'perishable');
    expect(score).toBeGreaterThan(0.4);
    expect(score).toBeLessThan(0.6);
  });

  test('computeEntityOverlap returns 0 for empty arrays', () => {
    expect(computeEntityOverlap([], [])).toBe(0);
    expect(computeEntityOverlap(['a'], [])).toBe(0);
    expect(computeEntityOverlap([], ['a'])).toBe(0);
  });

  test('computeEntityOverlap computes Jaccard similarity', () => {
    // Shared: ['x'], Union: ['x', 'y', 'z'] → 1/3
    expect(computeEntityOverlap(['x', 'y'], ['x', 'z'])).toBeCloseTo(0.333, 2);
    // Complete overlap: 2/2 = 1
    expect(computeEntityOverlap(['a', 'b'], ['a', 'b'])).toBe(1.0);
    // No overlap: 0/3 = 0
    expect(computeEntityOverlap(['x', 'y'], ['a', 'b', 'c'])).toBe(0);
  });

  test('computeContentRelevance returns 0 for empty inputs', () => {
    expect(computeContentRelevance('', 'query')).toBe(0);
    expect(computeContentRelevance('content', '')).toBe(0);
    expect(computeContentRelevance(null, 'query')).toBe(0);
  });

  test('computeContentRelevance computes keyword overlap', () => {
    const content = 'User prefers dark mode for coding';
    // 'dark' and 'mode' are in content (2/3 words match)
    const score = computeContentRelevance(content, 'dark mode preference');
    expect(score).toBeGreaterThan(0.5);
  });

  test('scoreMemory returns breakdown with all components', async () => {
    const memory = {
      type: 'fact',
      importance: 0.8,
      timestamp: new Date().toISOString(),
      retention: 'perishable',
      entities: ['user', 'preference'],
      content: 'User prefers dark mode',
    };

    const result = await scoreMemory(memory, {
      query: 'dark mode',
      queryEntities: ['user'],
    });

    expect(result.breakdown).toBeDefined();
    expect(result.breakdown.importance).toBe(0.8);
    expect(result.breakdown.recency).toBe(1.0);
    expect(result.breakdown.entityOverlap).toBeGreaterThan(0);
    expect(result.breakdown.typeWeight).toBe(1.0);
    expect(result.breakdown.contentRelevance).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
    expect(result.total).toBeLessThanOrEqual(1);
  });

  test('scoreMemory is deterministic', async () => {
    const memory = {
      type: 'preference',
      importance: 0.7,
      timestamp: new Date().toISOString(),
      retention: 'perishable',
      entities: ['test'],
      content: 'deterministic test content',
    };

    const result1 = await scoreMemory(memory, { query: 'test content' });
    const result2 = await scoreMemory(memory, { query: 'test content' });

    expect(result1.total).toBe(result2.total);
    expect(result1.breakdown.recency).toBe(result2.breakdown.recency);
  });

  test('scoreMemory handles unknown type with default weight', async () => {
    const memory = {
      type: 'unknown_type',
      importance: 0.5,
      timestamp: new Date().toISOString(),
      retention: 'perishable',
      entities: [],
      content: 'test',
    };

    const result = await scoreMemory(memory, {});
    expect(result.breakdown.typeWeight).toBe(0.7); // Default
  });
});