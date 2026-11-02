// @ts-nocheck
const { describe, test, expect } = require('bun:test');

const { DiffEngine } = require('../../src/diff/diff-engine');

function createModel(overrides = {}) {
  return {
    id: 'model-default',
    provider: 'openai',
    displayName: 'Default Model',
    description: 'Default description',
    contextTokens: 100000,
    outputTokens: 4096,
    deprecated: false,
    capabilities: {
      chat: true,
      vision: false,
      tools: false
    },
    pricing: {
      input: 2,
      output: 8
    },
    ...overrides
  };
}

function createSnapshot(models, overrides = {}) {
  return {
    id: overrides.id || `snapshot-${Math.random().toString(16).slice(2)}`,
    timestamp: overrides.timestamp || 1_710_000_000_000,
    provider: overrides.provider || 'openai',
    models: Array.isArray(models) ? models : [],
    rawPayloadHash: overrides.rawPayloadHash || 'snapshot-hash',
    metadata: overrides.metadata || { modelCount: Array.isArray(models) ? models.length : 0 }
  };
}

describe('DiffEngine', () => {
  test('detects added models as major changes', () => {
    const engine = new DiffEngine();
    const oldSnapshot = createSnapshot([
      createModel({ id: 'gpt-5' })
    ]);
    const newSnapshot = createSnapshot([
      createModel({ id: 'gpt-5' }),
      createModel({ id: 'gpt-5-mini' })
    ], { timestamp: 1_710_000_100_000 });

    const diff = engine.compare(oldSnapshot, newSnapshot);

    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toEqual([]);
    expect(diff.modified).toEqual([]);
    expect(diff.added[0]).toMatchObject({
      type: 'added',
      classification: 'major',
      provider: 'openai',
      timestamp: 1_710_000_100_000
    });
    expect(diff.added[0].model.id).toBe('gpt-5-mini');
  });

  test('detects removed models as major changes', () => {
    const engine = new DiffEngine();
    const oldSnapshot = createSnapshot([
      createModel({ id: 'gpt-5' }),
      createModel({ id: 'gpt-5-mini' })
    ]);
    const newSnapshot = createSnapshot([
      createModel({ id: 'gpt-5' })
    ], { timestamp: 1_710_000_200_000 });

    const diff = engine.compare(oldSnapshot, newSnapshot);

    expect(diff.added).toEqual([]);
    expect(diff.removed).toHaveLength(1);
    expect(diff.modified).toEqual([]);
    expect(diff.removed[0]).toMatchObject({
      type: 'removed',
      classification: 'major',
      provider: 'openai',
      timestamp: 1_710_000_200_000
    });
    expect(diff.removed[0].model.id).toBe('gpt-5-mini');
  });

  test('detects modified models with capability and pricing field changes', () => {
    const engine = new DiffEngine();
    const oldSnapshot = createSnapshot([
      createModel({
        id: 'gpt-5',
        capabilities: { chat: true, vision: false, tools: false },
        pricing: { input: 2, output: 8 }
      })
    ]);
    const newSnapshot = createSnapshot([
      createModel({
        id: 'gpt-5',
        capabilities: { chat: true, vision: false, tools: true },
        pricing: { input: 2, output: 10 }
      })
    ], { timestamp: 1_710_000_300_000 });

    const diff = engine.compare(oldSnapshot, newSnapshot);

    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0]).toMatchObject({
      type: 'modified',
      classification: 'minor',
      provider: 'openai',
      timestamp: 1_710_000_300_000
    });
    expect(diff.modified[0].changes).toMatchObject({
      'capabilities.tools': { old: false, new: true },
      'pricing.output': { old: 8, new: 10 }
    });
  });

  test('classifies deprecated status and significant context shifts as major', () => {
    const engine = new DiffEngine();
    const baseline = createModel({
      id: 'gpt-5',
      contextTokens: 100000,
      deprecated: false
    });

    const deprecatedChange = createModel({
      id: 'gpt-5',
      contextTokens: 100000,
      deprecated: true
    });
    const largeContextChange = createModel({
      id: 'gpt-5',
      contextTokens: 130000,
      deprecated: false
    });

    expect(engine.classifyChange(baseline, deprecatedChange)).toBe('major');
    expect(engine.classifyChange(baseline, largeContextChange)).toBe('major');
  });

  test('classifies metadata updates and small context shifts as minor', () => {
    const engine = new DiffEngine();
    const baseline = createModel({
      id: 'gpt-5',
      displayName: 'GPT-5',
      description: 'Primary model',
      contextTokens: 100000
    });
    const metadataChange = createModel({
      id: 'gpt-5',
      displayName: 'GPT-5 Updated',
      description: 'Primary model with metadata update',
      contextTokens: 100000
    });
    const smallContextChange = createModel({
      id: 'gpt-5',
      contextTokens: 115000
    });

    expect(engine.classifyChange(baseline, metadataChange)).toBe('minor');
    expect(engine.classifyChange(baseline, smallContextChange)).toBe('minor');
  });

  test('returns field-level changes in detectFieldChanges', () => {
    const engine = new DiffEngine();
    const oldModel = createModel({
      id: 'gpt-5',
      displayName: 'GPT-5',
      capabilities: { chat: true, tools: false }
    });
    const newModel = createModel({
      id: 'gpt-5',
      displayName: 'GPT-5.1',
      capabilities: { chat: true, tools: true }
    });

    const changes = engine.detectFieldChanges(oldModel, newModel);

    expect(changes).toEqual({
      displayName: { old: 'GPT-5', new: 'GPT-5.1' },
      'capabilities.tools': { old: false, new: true }
    });
  });

  test('handles empty, identical, and null snapshots', () => {
    const engine = new DiffEngine();
    const emptyDiff = engine.compare(createSnapshot([]), createSnapshot([]));
    const model = createModel({ id: 'gpt-5' });
    const identicalDiff = engine.compare(
      createSnapshot([model]),
      createSnapshot([{ ...model }])
    );
    const nullToSnapshot = engine.compare(null, createSnapshot([model]));
    const snapshotToNull = engine.compare(createSnapshot([model]), null);

    expect(emptyDiff).toEqual({ added: [], removed: [], modified: [] });
    expect(identicalDiff).toEqual({ added: [], removed: [], modified: [] });
    expect(nullToSnapshot.added).toHaveLength(1);
    expect(snapshotToNull.removed).toHaveLength(1);
  });

  test('detects multiple additions, removals, and modifications in one comparison', () => {
    const engine = new DiffEngine();
    const oldSnapshot = createSnapshot([
      createModel({ id: 'a', displayName: 'Model A', contextTokens: 100000 }),
      createModel({ id: 'b', displayName: 'Model B', contextTokens: 50000 }),
      createModel({ id: 'c', displayName: 'Model C', contextTokens: 75000 })
    ]);
    const newSnapshot = createSnapshot([
      createModel({ id: 'a', displayName: 'Model A+', contextTokens: 108000 }),
      createModel({ id: 'c', displayName: 'Model C', contextTokens: 75000 }),
      createModel({ id: 'd', displayName: 'Model D', contextTokens: 32000 })
    ]);

    const diff = engine.compare(oldSnapshot, newSnapshot);

    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(1);
    expect(diff.modified).toHaveLength(1);
    expect(diff.added[0].model.id).toBe('d');
    expect(diff.removed[0].model.id).toBe('b');
    expect(diff.modified[0].model.id).toBe('a');
  });

  test('maintains >95% classification accuracy on known good and bad change cases', () => {
    const engine = new DiffEngine();
    const baseline = createModel({
      id: 'gpt-5',
      displayName: 'GPT-5',
      description: 'General model',
      contextTokens: 100000,
      deprecated: false
    });

    const cases = [
      {
        name: 'metadata display name change',
        oldModel: baseline,
        newModel: { ...baseline, displayName: 'GPT-5 Updated' },
        expected: 'minor'
      },
      {
        name: 'metadata description change',
        oldModel: baseline,
        newModel: { ...baseline, description: 'General model with updates' },
        expected: 'minor'
      },
      {
        name: 'small context increase',
        oldModel: baseline,
        newModel: { ...baseline, contextTokens: 119000 },
        expected: 'minor'
      },
      {
        name: 'small context decrease',
        oldModel: baseline,
        newModel: { ...baseline, contextTokens: 82000 },
        expected: 'minor'
      },
      {
        name: 'capability flag change',
        oldModel: baseline,
        newModel: {
          ...baseline,
          capabilities: { ...baseline.capabilities, tools: true }
        },
        expected: 'minor'
      },
      {
        name: 'pricing change',
        oldModel: baseline,
        newModel: {
          ...baseline,
          pricing: { ...baseline.pricing, output: 10 }
        },
        expected: 'minor'
      },
      {
        name: 'deprecated toggled true',
        oldModel: baseline,
        newModel: { ...baseline, deprecated: true },
        expected: 'major'
      },
      {
        name: 'deprecated toggled false',
        oldModel: { ...baseline, deprecated: true },
        newModel: { ...baseline, deprecated: false },
        expected: 'major'
      },
      {
        name: 'large context increase',
        oldModel: baseline,
        newModel: { ...baseline, contextTokens: 150000 },
        expected: 'major'
      },
      {
        name: 'large context decrease',
        oldModel: baseline,
        newModel: { ...baseline, contextTokens: 70000 },
        expected: 'major'
      },
      {
        name: 'availability from missing old model',
        oldModel: null,
        newModel: baseline,
        expected: 'major'
      },
      {
        name: 'availability to missing new model',
        oldModel: baseline,
        newModel: null,
        expected: 'major'
      }
    ];

    const correct = cases.filter((entry) => {
      const actual = engine.classifyChange(entry.oldModel, entry.newModel);
      return actual === entry.expected;
    }).length;

    const accuracy = correct / cases.length;

    expect(accuracy).toBeGreaterThan(0.95);
  });
});
