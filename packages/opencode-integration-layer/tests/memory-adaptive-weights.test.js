import { describe, test, expect } from 'bun:test';
import {
  createAdaptiveScorer,
  recordMemoryOutcome,
  getAdaptiveTypeWeight,
} from '../src/memory-adaptive-weights.js';

describe('memory-adaptive-weights', () => {
  test('createAdaptiveScorer falls back to static scoring when no registry', async () => {
    const scorer = createAdaptiveScorer(null);
    const memory = {
      type: 'fact',
      importance: 0.8,
      timestamp: new Date().toISOString(),
      retention: 'perishable',
      entities: ['test'],
      content: 'test content',
    };

    const result = await scorer('test', memory);

    expect(result.total).toBeGreaterThan(0);
    expect(result.breakdown).toBeDefined();
  });

  test('createAdaptiveScorer uses registry when available', async () => {
    // Mock registry that returns values for the normalized key
    const mockRegistry = {
      get: (name) => {
        // Return value for any decay_half_life_days or decay_floor param
        if (name.includes('decay_half_life_days')) {
          return { current_value: 14 };
        }
        if (name.includes('decay_floor')) {
          return { current_value: 0.2 };
        }
        return null;
      },
    };

    const mockEngine = {
      hyperParamRegistry: mockRegistry,
      feedbackCollector: { record: () => {} },
    };

    const scorer = createAdaptiveScorer(mockEngine);
    const memory = {
      type: 'fact',
      importance: 0.8,
      timestamp: new Date().toISOString(),
      retention: 'perishable',
      entities: ['test'],
      content: 'test content',
    };

    const result = await scorer('test', memory, { taskType: 'coding' });

    expect(result.total).toBeGreaterThan(0);
    expect(result.breakdown._hyperParams).toBeDefined();
    expect(result.breakdown._hyperParams.source).toBe('adaptive');
    // halfLifeDays should be from registry (14) not default (7)
    expect(result.breakdown._hyperParams.halfLifeDays).toBe(14);
  });

  test('recordMemoryOutcome calls feedbackCollector', () => {
    let recorded = null;
    const mockEngine = {
      feedbackCollector: {
        record: (outcome) => {
          recorded = outcome;
        },
      },
    };

    recordMemoryOutcome(mockEngine, {
      memoryId: 'mem-1',
      accessed: true,
      useful: true,
      query: 'test query',
      taskType: 'coding',
    });

    expect(recorded.event_type).toBe('memory_access');
    expect(recorded.outcome).toBe('positive');
    expect(recorded.metadata.memory_id).toBe('mem-1');
  });

  test('recordMemoryOutcome fails open when no collector', () => {
    expect(() => recordMemoryOutcome({}, { memoryId: 'mem-1' })).not.toThrow();
    expect(() => recordMemoryOutcome({ feedbackCollector: null }, { memoryId: 'mem-1' })).not.toThrow();
  });

  test('getAdaptiveTypeWeight returns default when no registry', () => {
    expect(getAdaptiveTypeWeight(null, 'fact', 0.9)).toBe(0.9);
    expect(getAdaptiveTypeWeight({}, 'fact', 0.9)).toBe(0.9);
  });

  test('getAdaptiveTypeWeight returns registry value when available', () => {
    const registry = {
      get: (name) => {
        if (name === 'memory_type_weight_fact') {
          return { current_value: 0.95 };
        }
        return null;
      },
    };

    expect(getAdaptiveTypeWeight(registry, 'fact', 0.8)).toBe(0.95);
    expect(getAdaptiveTypeWeight(registry, 'unknown', 0.7)).toBe(0.7);
  });
});