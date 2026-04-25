import { describe, test, expect } from 'bun:test';
import {
  recordAccess,
  computeAccessFrequency,
  computeAccessVelocity,
  findTemporalClusters,
  computeOptimalRecallWindow,
  getTemporalStats,
  MS_PER_HOUR,
  MS_PER_DAY,
} from '../src/memory-temporal.js';

describe('memory-temporal', () => {
  const now = Date.now();

  test('recordAccess adds timestamp to log', () => {
    const accessLog = new Map();
    recordAccess(accessLog, 'mem-1', now);
    recordAccess(accessLog, 'mem-1', now + MS_PER_HOUR);

    expect(accessLog.get('mem-1').length).toBe(2);
  });

  test('recordAccess throws for non-Map accessLog', () => {
    expect(() => recordAccess({}, 'mem-1', now)).toThrow();
  });

  test('computeAccessFrequency returns 0 for empty timestamps', () => {
    expect(computeAccessFrequency([])).toBe(0);
    expect(computeAccessFrequency(null)).toBe(0);
  });

  test('computeAccessFrequency calculates accesses per day', () => {
    const timestamps = [
      now - 1 * MS_PER_DAY,
      now - 2 * MS_PER_DAY,
      now - 3 * MS_PER_DAY,
    ];

    const freq = computeAccessFrequency(timestamps, 7);
    expect(freq).toBeGreaterThan(0);
    expect(freq).toBeLessThanOrEqual(7);
  });

  test('computeAccessVelocity returns 0 for insufficient data', () => {
    expect(computeAccessVelocity([])).toBe(0);
    expect(computeAccessVelocity([now, now - MS_PER_DAY])).toBe(0);
  });

  test('computeAccessVelocity detects increasing access', () => {
    const timestamps = [];
    // First half: 1 access per week
    for (let i = 0; i < 2; i++) {
      timestamps.push(now - (20 + i * 7) * MS_PER_DAY);
    }
    // Second half: 3 accesses per week
    for (let i = 0; i < 6; i++) {
      timestamps.push(now - (3 + i * 4) * MS_PER_DAY);
    }

    const velocity = computeAccessVelocity(timestamps, 30);
    expect(velocity).toBeGreaterThan(0);
  });

  test('findTemporalClusters returns empty for no events', () => {
    expect(findTemporalClusters([])).toEqual([]);
    expect(findTemporalClusters(null)).toEqual([]);
  });

  test('findTemporalClusters groups events within window', () => {
    const MS_PER_MIN = 60 * 1000;
    // a and b are 2min apart (same cluster), c and d are 2min apart (same cluster)
    // But a/b cluster is 12min away from c/d cluster (different cluster with 5min window)
    const events = [
      { memoryId: 'a', timestamp: now - 14 * MS_PER_MIN },
      { memoryId: 'b', timestamp: now - 12 * MS_PER_MIN },
      { memoryId: 'c', timestamp: now - 2 * MS_PER_MIN },
      { memoryId: 'd', timestamp: now - 0 * MS_PER_MIN },
    ];

    const clusters = findTemporalClusters(events, 5 * MS_PER_MIN);
    expect(clusters.length).toBe(2);
    expect(clusters[0].length).toBe(2);
    expect(clusters[1].length).toBe(2);
  });

  test('computeOptimalRecallWindow returns 0 for never-accessed', () => {
    expect(computeOptimalRecallWindow([], 'perishable')).toBe(0);
  });

  test('computeOptimalRecallWindow respects core retention', () => {
    const timestamps = [now - 72 * MS_PER_HOUR]; // 3 days ago

    const window = computeOptimalRecallWindow(timestamps, 'core');
    expect(window).toBe(0); // Should surface (48h interval, 72h since access)
  });

  test('computeOptimalRecallWindow respects ephemeral retention', () => {
    const timestamps = [now - 2 * 3600000]; // 2 hours ago

    const window = computeOptimalRecallWindow(timestamps, 'ephemeral');
    expect(window).toBeGreaterThan(1.9);
    expect(window).toBeLessThan(2.1);
  });

  test('getTemporalStats returns complete stats', () => {
    const timestamps = [
      now - 10 * MS_PER_DAY,
      now - 5 * MS_PER_DAY,
      now - 1 * MS_PER_DAY,
    ];

    const stats = getTemporalStats(timestamps, 'perishable');

    expect(stats.accessCount).toBe(3);
    expect(stats.frequency).toBeGreaterThan(0);
    expect(stats.velocity).toBeDefined();
    expect(stats.recallWindowHours).toBeGreaterThanOrEqual(0);
    expect(stats.lastAccess).toBe(now - 1 * MS_PER_DAY);
    expect(stats.firstAccess).toBe(now - 10 * MS_PER_DAY);
  });
});