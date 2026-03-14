import { describe, expect, test } from 'bun:test';
import { ModelComparator } from '../src/model-comparator.js';

describe('ModelComparator', () => {
  test('compare returns weighted scores and winner with full data', () => {
    const comparator = new ModelComparator();
    const data = {
      benchmarks: {
        alpha: { passAt1: 0.8, passAt10: 0.9 },
        beta: { passAt1: 0.6, passAt10: 0.7 }
      },
      cost: { alpha: 2, beta: 4 },
      latency: { alpha: 800, beta: 1200 },
      reliability: { alpha: 0.99, beta: 0.95 }
    };

    const result = comparator.compare('alpha', 'beta', data);
    expect(result.modelA).toBeGreaterThan(result.modelB);
    expect(result.winner).toBe('alpha');
    expect(result.breakdown).toHaveProperty('benchmark');
    expect(result.breakdown).toHaveProperty('cost');
    expect(result.breakdown).toHaveProperty('latency');
    expect(result.breakdown).toHaveProperty('reliability');
  });

  test('compare handles missing data gracefully', () => {
    const comparator = new ModelComparator();
    const result = comparator.compare('alpha', 'beta', {});
    expect(result.modelA).toBe(0);
    expect(result.modelB).toBe(0);
    expect(result.winner).toBe('tie');
  });

  test('compareBenchmarks computes normalized scores', () => {
    const comparator = new ModelComparator();
    const result = comparator.compareBenchmarks(
      { passAt1: 0.8, passAt10: 0.9 },
      { passAt1: 0.2, passAt10: 0.3 }
    );
    expect(result.modelA).toBeGreaterThan(result.modelB);
    expect(result.modelA + result.modelB).toBeCloseTo(1);
  });

  test('compareCost favors lower cost model', () => {
    const comparator = new ModelComparator();
    const result = comparator.compareCost(1.25, 2.5);
    expect(result.modelA).toBe(1);
    expect(result.modelB).toBe(0.5);
  });

  test('compareLatency favors lower latency model', () => {
    const comparator = new ModelComparator();
    const result = comparator.compareLatency(600, 900);
    expect(result.modelA).toBe(1);
    expect(result.modelB).toBe(0.5);
  });

  test('rank sorts three models by score descending', () => {
    const comparator = new ModelComparator();
    const rankings = comparator.rank(['alpha', 'beta', 'gamma'], {
      benchmarks: {
        alpha: { passAt1: 0.8, passAt10: 0.9 },
        beta: { passAt1: 0.6, passAt10: 0.7 },
        gamma: { passAt1: 0.2, passAt10: 0.3 }
      }
    });

    expect(rankings).toHaveLength(3);
    expect(rankings[0].modelId).toBe('alpha');
    expect(rankings[2].modelId).toBe('gamma');
  });

  test('custom weights influence final winner', () => {
    const comparator = new ModelComparator({
      weights: {
        benchmark: 0.1,
        cost: 0.7,
        latency: 0.1,
        reliability: 0.1
      }
    });

    const result = comparator.compare('alpha', 'beta', {
      benchmarks: {
        alpha: { passAt1: 0.9, passAt10: 0.95 },
        beta: { passAt1: 0.7, passAt10: 0.8 }
      },
      cost: { alpha: 10, beta: 1 },
      latency: { alpha: 500, beta: 900 },
      reliability: { alpha: 0.99, beta: 0.98 }
    });

    expect(result.winner).toBe('beta');
  });
});
