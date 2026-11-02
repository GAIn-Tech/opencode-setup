import { describe, expect, test } from 'bun:test';
import { HierarchyPlacer } from '../src/hierarchy-placer.js';

describe('HierarchyPlacer', () => {
  test('determineLevel returns premium for strong metrics', () => {
    const placer = new HierarchyPlacer();
    const result = placer.determineLevel('model-a', {
      benchmarkScore: 0.92,
      latency: 400,
      reliability: 0.995,
      cost: 5
    });

    expect(result.level).toBe('premium');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test('determineLevel returns economy for lower benchmark score', () => {
    const placer = new HierarchyPlacer();
    const result = placer.determineLevel('model-b', {
      benchmarkScore: 0.45,
      latency: 2000,
      reliability: 0.92,
      cost: 1
    });

    expect(result.level).toBe('economy');
  });

  test('determineLevel falls back when no level requirements are met', () => {
    const placer = new HierarchyPlacer();
    const result = placer.determineLevel('model-c', {
      benchmarkScore: 0.1,
      latency: 9000,
      reliability: 0.4,
      cost: 1
    });

    expect(result.level).toBe('fallback');
  });

  test('determineLevels handles batch map', () => {
    const placer = new HierarchyPlacer();
    const results = placer.determineLevels({
      alpha: { benchmarkScore: 0.9, latency: 500, reliability: 0.995 },
      beta: { benchmarkScore: 0.65, latency: 1500, reliability: 0.97 },
      gamma: { benchmarkScore: 0.45, latency: 2500, reliability: 0.92 }
    });

    expect(results.alpha.level).toBe('premium');
    expect(results.beta.level).toBe('standard');
    expect(results.gamma.level).toBe('economy');
  });

  test('suggestChanges returns promotion and demotion suggestions', () => {
    const placer = new HierarchyPlacer();
    const suggestions = placer.suggestChanges(
      {
        alpha: { level: 'standard' },
        beta: { level: 'premium' }
      },
      {
        alpha: { benchmarkScore: 0.9, latency: 600, reliability: 0.995 },
        beta: { benchmarkScore: 0.45, latency: 2500, reliability: 0.91 }
      }
    );

    expect(suggestions).toHaveLength(2);
    const alphaSuggestion = suggestions.find((entry) => entry.modelId === 'alpha');
    const betaSuggestion = suggestions.find((entry) => entry.modelId === 'beta');
    expect(alphaSuggestion.direction).toBe('promote');
    expect(betaSuggestion.direction).toBe('demote');
  });

  test('getModelsAtLevel filters hierarchy by requested level', () => {
    const placer = new HierarchyPlacer();
    const hierarchy = {
      alpha: { level: 'premium' },
      beta: { level: 'standard' },
      gamma: { level: 'premium' }
    };

    expect(placer.getModelsAtLevel(hierarchy, 'premium')).toEqual(['alpha', 'gamma']);
  });

  test('calculateConfidence increases when metrics exceed thresholds', () => {
    const placer = new HierarchyPlacer();
    const rules = placer.rules.standard;
    const confidence = placer.calculateConfidence(
      { benchmarkScore: 0.85, latency: 500, reliability: 0.99 },
      rules
    );

    expect(confidence).toBeGreaterThan(0.5);
    expect(confidence).toBeLessThanOrEqual(1);
  });
});
