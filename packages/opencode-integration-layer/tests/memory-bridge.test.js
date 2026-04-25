import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { MemoryBridge } from '../src/memory-bridge.js';
import crypto from 'node:crypto';

function makeRecord(overrides = {}) {
  const content = overrides.content || 'test content';
  return {
    id: overrides.id || crypto.randomUUID(),
    type: 'fact',
    project: 'sm_project_default',
    agent: 'test-agent',
    timestamp: new Date().toISOString(),
    importance: 0.7,
    entities: ['test-entity'],
    content,
    content_hash: crypto.createHash('sha256').update(content).digest('hex'),
    source_session_id: 'ses_123',
    retention: 'perishable',
    metadata: {},
    ...overrides,
  };
}

function createMockSupermemory() {
  const memoryStore = new Map();
  return {
    memoryStore,
    memory: mock(async (content, containerTag) => {
      const record = typeof content === 'string' ? JSON.parse(content) : content;
      memoryStore.set(record.id, record);
      return { id: record.id };
    }),
    recall: mock(async (query, containerTag, includeProfile) => {
      if (typeof query !== 'string') return [];
      const results = [];
      for (const record of memoryStore.values()) {
        if (record.content && record.content.includes(query)) {
          results.push(record);
        }
      }
      return results;
    }),
    whoAmI: mock(async () => ({ ok: true })),
  };
}

describe('MemoryBridge', () => {
  let mockSm;
  let bridge;

  beforeEach(() => {
    mockSm = createMockSupermemory();
    bridge = new MemoryBridge({
      supermemoryMemory: mockSm.memory,
      supermemoryRecall: mockSm.recall,
      supermemoryWhoAmI: mockSm.whoAmI,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
  });

  test('save writes to Supermemory and returns saved status', async () => {
    const record = makeRecord({ content: 'User prefers dark mode' });

    const result = await bridge.save(record);

    expect(result.status).toBe('saved');
    expect(result.id).toBe(record.id);
    expect(mockSm.memory).toHaveBeenCalled();
  });

  test('save detects duplicate via idempotency key', async () => {
    const record = makeRecord({ content: 'duplicate content' });

    // Pre-populate store
    mockSm.memoryStore.set(record.id, record);

    // Create a new bridge with recall that finds the duplicate
    const bridgeWithDuplicate = new MemoryBridge({
      supermemoryMemory: mockSm.memory,
      supermemoryRecall: mock(async (query, containerTag, includeProfile) => {
        // Return the record when queried by content_hash
        if (query === record.content_hash) {
          return [record];
        }
        return [];
      }),
      supermemoryWhoAmI: mockSm.whoAmI,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });

    const result = await bridgeWithDuplicate.save(record);

    expect(result.status).toBe('duplicate');
    expect(mockSm.memory).not.toHaveBeenCalled();
  });

  test('recall returns memories with ok status', async () => {
    const memories = [
      { id: '1', content: 'test preferences content' },
      { id: '2', content: 'test preferences data' },
    ];
    mockSm.memoryStore.set('1', memories[0]);
    mockSm.memoryStore.set('2', memories[1]);
    mockSm.recall = mock(async (query, containerTag, includeProfile) => {
      // Return all memories when queried (query matching is tested elsewhere)
      return memories;
    });

    const result = await bridge.recall('preferences', { project: 'x' });

    expect(result.status).toBe('ok');
    expect(result.memories.length).toBe(2);
  });

  test('recall returns degraded status when unavailable', async () => {
    bridge = new MemoryBridge({
      supermemoryMemory: null,
      supermemoryRecall: null,
      supermemoryWhoAmI: null,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });

    const result = await bridge.recall('query', { project: 'x' });

    expect(result.status).toBe('degraded');
    expect(result.memories.length).toBe(0);
  });

  test('save falls back to degraded queue when Supermemory unavailable', async () => {
    const degradedHandler = {
      write: mock(async (record) => ({ queued: true, written: false })),
    };

    bridge = new MemoryBridge({
      supermemoryMemory: mock(async () => { throw new Error('simulated failure'); }),
      supermemoryRecall: mock(async () => []),
      degradedHandler,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });

    const record = makeRecord({ content: 'queued content' });

    const result = await bridge.save(record);

    expect(result.status).toBe('queued');
    expect(degradedHandler.write).toHaveBeenCalled();
  });
});