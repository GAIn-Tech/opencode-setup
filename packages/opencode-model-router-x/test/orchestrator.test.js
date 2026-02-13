const { describe, test, expect } = require('bun:test');

const Orchestrator = require('../src/strategies/orchestrator.js');

function createStrategy({ name, priority, shouldApply = () => true, selectModel = async () => null }) {
  return {
    getName: () => name,
    getPriority: () => priority,
    shouldApply,
    selectModel,
  };
}

describe('Orchestrator', () => {
  test('sorts strategies by descending priority', () => {
    const low = createStrategy({ name: 'low', priority: 10 });
    const high = createStrategy({ name: 'high', priority: 200 });
    const mid = createStrategy({ name: 'mid', priority: 50 });
    const orchestrator = new Orchestrator([low, high, mid]);

    expect(orchestrator.getStrategyOrder().map((entry) => entry.name)).toEqual(['high', 'mid', 'low']);
  });

  test('returns first applicable non-null selection', async () => {
    const skipped = createStrategy({
      name: 'skipped',
      priority: 100,
      shouldApply: () => false,
    });
    const selected = createStrategy({
      name: 'selected',
      priority: 90,
      selectModel: async () => ({ provider: 'openai', model_id: 'gpt-4o-mini' }),
    });
    const fallback = createStrategy({
      name: 'fallback',
      priority: 10,
      selectModel: async () => ({ provider: 'groq', model_id: 'llama-3.1-70b' }),
    });

    const orchestrator = new Orchestrator([fallback, selected, skipped]);
    const result = await orchestrator.selectModel({ task_type: 'feature' }, {});

    expect(result.provider).toBe('openai');
    expect(result.model_id).toBe('gpt-4o-mini');
    expect(result.strategy).toBe('selected');
  });

  test('continues when a strategy throws and still finds fallback selection', async () => {
    const throwsInShouldApply = createStrategy({
      name: 'throwsInShouldApply',
      priority: 200,
      shouldApply: () => {
        throw new Error('broken shouldApply');
      },
    });
    const throwsInSelect = createStrategy({
      name: 'throwsInSelect',
      priority: 150,
      selectModel: async () => {
        throw new Error('broken selectModel');
      },
    });
    const fallback = createStrategy({
      name: 'fallback',
      priority: 10,
      selectModel: async () => ({ provider: 'groq', model_id: 'llama-3.1-70b' }),
    });

    const orchestrator = new Orchestrator([throwsInShouldApply, throwsInSelect, fallback]);
    const result = await orchestrator.selectModel({ task_type: 'fix' }, {});

    expect(result.provider).toBe('groq');
    expect(result.strategy).toBe('fallback');
  });

  test('throws when no strategy returns a selection', async () => {
    const noneA = createStrategy({ name: 'noneA', priority: 2, selectModel: async () => null });
    const noneB = createStrategy({ name: 'noneB', priority: 1, selectModel: async () => null });
    const orchestrator = new Orchestrator([noneA, noneB]);

    await expect(orchestrator.selectModel({ task_type: 'plan' }, {})).rejects.toThrow('No applicable strategy found for task');
  });
});
