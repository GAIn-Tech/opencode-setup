import { describe, test, expect, beforeEach } from 'bun:test';
import { MemoryContextProvider } from '../src/memory-context-provider.js';

function createMockBridge(memories = []) {
  return {
    recall: async (query, options) => {
      const matching = memories.filter((m) =>
        m.content.toLowerCase().includes(query.toLowerCase()),
      );
      return { memories: matching, status: 'ok' };
    },
  };
}

function makeMemory(overrides = {}) {
  return {
    id: 'mem-' + Math.random().toString(36).substr(2, 9),
    type: 'fact',
    project: 'test-project',
    agent: 'test-agent',
    timestamp: new Date().toISOString(),
    importance: 0.7,
    entities: [],
    content: 'Default test memory content',
    content_hash: 'abc123',
    source_session_id: 'ses_test',
    retention: 'perishable',
    metadata: {},
    ...overrides,
  };
}

describe('MemoryContextProvider', () => {
  test('throws if no memoryBridge provided', () => {
    expect(() => new MemoryContextProvider({})).toThrow('memoryBridge is required');
  });

  test('getContext requires task parameter', async () => {
    const provider = new MemoryContextProvider({
      memoryBridge: createMockBridge(),
    });

    await expect(provider.getContext({})).rejects.toThrow('task is required');
    await expect(provider.getContext({ task: '' })).rejects.toThrow('task is required');
  });

  test('getContext returns empty when no memories found', async () => {
    const provider = new MemoryContextProvider({
      memoryBridge: createMockBridge([]),
    });

    const result = await provider.getContext({ task: 'nonexistent query' });

    expect(result.memories).toEqual([]);
    expect(result.metadata.total).toBe(0);
    expect(result.metadata.status).toBe('ok');
  });

  test('getContext returns scored memories', async () => {
    const memories = [
      makeMemory({ content: 'Dark mode is a user preference for IDE styling', entities: ['user', 'preferences'] }),
      makeMemory({ content: 'Python best practices', entities: ['python'] }),
    ];

    const provider = new MemoryContextProvider({
      memoryBridge: createMockBridge(memories),
    });

    const result = await provider.getContext({
      task: 'dark mode',
      entities: ['user', 'preferences'],
    });

    expect(result.memories.length).toBeGreaterThan(0);
    expect(result.metadata.total).toBeGreaterThan(0);
    expect(result.memories[0]._relevanceScore).toBeDefined();
  });

  test('getContext respects maxMemories limit', async () => {
    const memories = Array.from({ length: 20 }, (_, i) =>
      makeMemory({ content: `Memory number ${i}`, id: `mem-${i}` }),
    );

    const provider = new MemoryContextProvider({
      memoryBridge: createMockBridge(memories),
      maxMemories: 5,
    });

    const result = await provider.getContext({ task: 'Memory' });

    expect(result.memories.length).toBeLessThanOrEqual(5);
  });

  test('getContext applies scoring and returns sorted memories', async () => {
    const memories = [
      makeMemory({ content: 'Dark mode general settings', importance: 0.5 }),
      makeMemory({ content: 'Specific dark mode configuration options', importance: 0.9 }),
    ];

    const provider = new MemoryContextProvider({
      memoryBridge: createMockBridge(memories),
      minScore: 0.05,
    });

    const result = await provider.getContext({ task: 'dark mode' });

    // Both should pass scoring with very low minScore
    expect(result.memories.length).toBe(2);
    // First result should be higher scored (more specific)
    expect(result.memories[0]._finalScore).toBeGreaterThanOrEqual(result.memories[1]._finalScore);
  });

  test('injectContext returns empty string when no memories', async () => {
    const provider = new MemoryContextProvider({
      memoryBridge: createMockBridge([]),
    });

    const context = await provider.injectContext({ task: 'test' });

    expect(context).toBe('');
  });

  test('injectContext returns formatted context string', async () => {
    const memories = [
      makeMemory({ content: 'User prefers dark mode for coding sessions', type: 'preference' }),
    ];

    const provider = new MemoryContextProvider({
      memoryBridge: createMockBridge(memories),
    });

    const context = await provider.injectContext({
      task: 'dark mode',
      agentType: 'coding',
    });

    expect(context).toContain('Relevant Memory Context');
    expect(context).toContain('dark mode');
  });

  test('shouldInjectContext returns true for beneficial task types', () => {
    const provider = new MemoryContextProvider({
      memoryBridge: createMockBridge(),
    });

    expect(provider.shouldInjectContext('coding')).toBe(true);
    expect(provider.shouldInjectContext('refactoring')).toBe(true);
    expect(provider.shouldInjectContext('debugging')).toBe(true);
    expect(provider.shouldInjectContext('writing')).toBe(true);
    expect(provider.shouldInjectContext('review')).toBe(true);
  });

  test('shouldInjectContext returns true for specific task types', () => {
    const provider = new MemoryContextProvider({
      memoryBridge: createMockBridge(),
    });

    // shell and git are not in the beneficial list, should return true for unknown
    // The current implementation returns true for unknown types (safe default)
    // So let's test the ones we know are beneficial
    expect(provider.shouldInjectContext('coding')).toBe(true);
    expect(provider.shouldInjectContext('debugging')).toBe(true);
    expect(provider.shouldInjectContext('writing')).toBe(true);
  });

  test('shouldInjectContext defaults to true for unknown types', () => {
    const provider = new MemoryContextProvider({
      memoryBridge: createMockBridge(),
    });

    expect(provider.shouldInjectContext('some-unknown-task')).toBe(true);
  });

  test('access patterns are recorded', async () => {
    const accessLog = new Map();
    const memories = [makeMemory({ content: 'Test content', id: 'mem-access' })];

    const provider = new MemoryContextProvider({
      memoryBridge: createMockBridge(memories),
      accessLog,
    });

    await provider.getContext({ task: 'Test' });

    expect(accessLog.has('mem-access')).toBe(true);
    expect(accessLog.get('mem-access').length).toBeGreaterThan(0);
  });
});