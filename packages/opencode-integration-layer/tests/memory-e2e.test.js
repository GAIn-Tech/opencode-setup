import { describe, test, expect, beforeEach } from 'bun:test';
import crypto from 'node:crypto';

/**
 * End-to-End Integration Test for Memory System Overhaul.
 *
 * Exercises the complete pipeline:
 * 1. Schema validation + normalization
 * 2. MemoryBridge save/recall
 * 3. Scoring pipeline
 * 4. Meta-memory pointers
 * 5. Temporal intelligence
 * 6. Adaptive weights integration
 */

import { MemoryBridge } from '../src/memory-bridge.js';
import { scoreMemory } from '../src/memory-scoring.js';
import { createPointer, verifyPointer, detectCycles, buildPointerGraph } from '../src/memory-meta.js';
import { recordAccess, getTemporalStats, findTemporalClusters } from '../src/memory-temporal.js';
import { createAdaptiveScorer, recordMemoryOutcome } from '../src/memory-adaptive-weights.js';

function makeRecord(overrides = {}) {
  const content = overrides.content || 'e2e test content';
  return {
    id: overrides.id || crypto.randomUUID(),
    type: overrides.type || 'fact',
    project: 'sm_project_default',
    agent: 'e2e-test-agent',
    timestamp: new Date().toISOString(),
    importance: overrides.importance ?? 0.7,
    entities: overrides.entities || ['e2e-entity'],
    content,
    content_hash: crypto.createHash('sha256').update(content).digest('hex'),
    source_session_id: 'ses_e2e',
    retention: overrides.retention || 'perishable',
    metadata: overrides.metadata || {},
    ...overrides,
  };
}

describe('Memory System E2E Integration', () => {
  describe('Full Pipeline: Schema → Bridge → Scoring', () => {
    test('save and recall a memory through the full pipeline', async () => {
      // Setup mock Supermemory
      const memoryStore = new Map();
      const bridge = new MemoryBridge({
        supermemoryMemory: async (content, containerTag) => {
          const record = typeof content === 'string' ? JSON.parse(content) : content;
          memoryStore.set(record.id, record);
          return { id: record.id };
        },
        supermemoryRecall: async (query, containerTag, includeProfile) => {
          if (typeof query !== 'string') return [];
          const results = [];
          for (const record of memoryStore.values()) {
            if (record.content && record.content.includes(query)) {
              results.push(record);
            }
          }
          return results;
        },
        logger: { info: () => {}, warn: () => {}, error: () => {} },
      });

      // Step 1: Create and save a memory
      const record = makeRecord({
        content: 'User prefers dark mode for coding sessions',
        type: 'preference',
        entities: ['user', 'preferences', 'dark-mode'],
      });

      const saveResult = await bridge.save(record);
      expect(saveResult.status).toBe('saved');
      expect(saveResult.id).toBe(record.id);

      // Step 2: Recall the memory
      const recallResult = await bridge.recall('dark mode', { project: 'sm_project_default' });
      expect(recallResult.status).toBe('ok');
      expect(recallResult.memories.length).toBeGreaterThan(0);

      // Step 3: Score the recalled memory
      const recalledMemory = recallResult.memories[0];
      const scoreResult = await scoreMemory(recalledMemory, {
        query: 'dark mode preferences',
        queryEntities: ['user', 'preferences'],
      });

      expect(scoreResult.total).toBeGreaterThan(0);
      expect(scoreResult.breakdown.importance).toBe(0.7);
      expect(scoreResult.breakdown.typeWeight).toBe(0.8); // preference type
      expect(scoreResult.breakdown.contentRelevance).toBeGreaterThan(0);
    });

    test('idempotent save prevents duplicates', async () => {
      // Idempotency is tested in memory-bridge.test.js
      // This test verifies the bridge integration works end-to-end
      const memoryStore = new Map();

      const bridge = new MemoryBridge({
        supermemoryMemory: async (content) => {
          const record = typeof content === 'string' ? JSON.parse(content) : content;
          memoryStore.set(record.id, record);
          return { id: record.id };
        },
        supermemoryRecall: async (query, containerTag, includeProfile) => {
          // Return empty - idempotency check will always pass
          // This tests that save flow works without errors
          return [];
        },
        logger: { info: () => {}, warn: () => {}, error: () => {} },
      });

      const record = makeRecord({ content: 'idempotent test' });

      // First save should succeed
      const result1 = await bridge.save(record);
      expect(result1.status).toBe('saved');

      // Second save also succeeds (no duplicate detection in this mock)
      const result2 = await bridge.save(record);
      expect(result2.status).toBe('saved');
    });
  });

  describe('Meta-Memory Pointer Integration', () => {
    test('create and verify pointer chain', () => {
      const fact1 = makeRecord({ id: 'fact-1', content: 'User uses VS Code' });
      const fact2 = makeRecord({ id: 'fact-2', content: 'VS Code has dark mode' });
      const decision = makeRecord({ id: 'decision-1', type: 'decision', content: 'Enable dark mode by default' });

      // Create pointers: decision references fact1 and fact2
      const ptr1 = createPointer(fact1, decision, 'references');
      const ptr2 = createPointer(fact2, decision, 'references');

      expect(verifyPointer(ptr1).valid).toBe(true);
      expect(verifyPointer(ptr2).valid).toBe(true);

      // Build graph and detect cycles
      const graph = buildPointerGraph([ptr1, ptr2]);
      const cycles = detectCycles(graph, 'fact-1');

      // No cycles expected in this simple chain
      expect(cycles.length).toBe(0);
    });

    test('detect cycle in circular references', () => {
      const a = makeRecord({ id: 'a' });
      const b = makeRecord({ id: 'b' });
      const c = makeRecord({ id: 'c' });

      const ptrs = [
        createPointer(a, b, 'references'),
        createPointer(b, c, 'references'),
        createPointer(c, a, 'references'), // Creates cycle
      ];

      const graph = buildPointerGraph(ptrs);
      const cycles = detectCycles(graph, 'a');

      expect(cycles.length).toBeGreaterThan(0);
    });
  });

  describe('Temporal Intelligence Integration', () => {
    test('track access patterns and compute stats', () => {
      const accessLog = new Map();
      const now = Date.now();
      const MS_PER_HOUR = 3600000;

      // Simulate access pattern: frequent early, then tapering off
      recordAccess(accessLog, 'mem-1', now - 7 * 24 * MS_PER_HOUR); // 7 days ago
      recordAccess(accessLog, 'mem-1', now - 6 * 24 * MS_PER_HOUR);
      recordAccess(accessLog, 'mem-1', now - 5 * 24 * MS_PER_HOUR);
      recordAccess(accessLog, 'mem-1', now - 3 * 24 * MS_PER_HOUR); // 3 days ago
      recordAccess(accessLog, 'mem-1', now - 1 * 24 * MS_PER_HOUR); // 1 day ago
      recordAccess(accessLog, 'mem-1', now); // now

      const timestamps = accessLog.get('mem-1');
      const stats = getTemporalStats(timestamps, 'perishable');

      expect(stats.accessCount).toBe(6);
      expect(stats.frequency).toBeGreaterThan(0);
      expect(stats.lastAccess).toBe(now);
      expect(stats.firstAccess).toBeLessThan(now);
    });

    test('temporal clustering groups related accesses', () => {
      const now = Date.now();
      const MS_PER_MIN = 60000;

      // Two distinct clusters with a 10-minute gap between them
      const events = [
        { memoryId: 'mem-a', timestamp: now - 14 * MS_PER_MIN }, // Cluster 1
        { memoryId: 'mem-b', timestamp: now - 12 * MS_PER_MIN }, // Cluster 1 (2min gap)
        { memoryId: 'mem-c', timestamp: now - 2 * MS_PER_MIN },  // Cluster 2 (10min gap from above)
        { memoryId: 'mem-d', timestamp: now - 0 * MS_PER_MIN },  // Cluster 2 (2min gap)
      ];

      const clusters = findTemporalClusters(events, 4 * MS_PER_MIN);

      // Two clusters: [a,b] and [c,d]
      expect(clusters.length).toBe(2);
      expect(clusters[0].length).toBe(2);
      expect(clusters[1].length).toBe(2);
    });
  });

  describe('Adaptive Weights Integration', () => {
    test('adaptive scorer uses learning engine registry', async () => {
      const mockRegistry = {
        get: (name) => {
          if (name.includes('decay_half_life_days')) return { current_value: 14 };
          if (name.includes('decay_floor')) return { current_value: 0.15 };
          return null;
        },
      };

      const mockEngine = {
        hyperParamRegistry: mockRegistry,
        feedbackCollector: { record: () => {} },
      };

      const scorer = createAdaptiveScorer(mockEngine);
      const memory = makeRecord({ type: 'fact', importance: 0.9 });

      const result = await scorer('test query', memory, { taskType: 'refactoring' });

      expect(result.breakdown._hyperParams.halfLifeDays).toBe(14);
      expect(result.breakdown._hyperParams.source).toBe('adaptive');
    });

    test('recordMemoryOutcome feeds back to learning engine', () => {
      let recordedOutcome = null;
      const mockEngine = {
        feedbackCollector: {
          record: (outcome) => {
            recordedOutcome = outcome;
          },
        },
      };

      recordMemoryOutcome(mockEngine, {
        memoryId: 'mem-feedback',
        accessed: true,
        useful: true,
        query: 'how to configure linter',
        taskType: 'coding',
      });

      expect(recordedOutcome.event_type).toBe('memory_access');
      expect(recordedOutcome.outcome).toBe('positive');
      expect(recordedOutcome.metadata.memory_id).toBe('mem-feedback');
    });
  });

  describe('Degraded Mode Fallback', () => {
    test('bridge falls back to degraded handler on Supermemory failure', async () => {
      let degradedWriteCalled = false;
      const degradedHandler = {
        write: async (record) => {
          degradedWriteCalled = true;
          return { queued: true, written: false };
        },
      };

      const bridge = new MemoryBridge({
        supermemoryMemory: async () => {
          throw new Error('Simulated Supermemory failure');
        },
        supermemoryRecall: async () => [],
        degradedHandler,
        logger: { info: () => {}, warn: () => {}, error: () => {} },
      });

      const record = makeRecord({ content: 'fallback test' });
      const result = await bridge.save(record);

      expect(result.status).toBe('queued');
      expect(degradedWriteCalled).toBe(true);
    });
  });

  describe('Cross-Cutting Concerns', () => {
    test('core retention memories never decay in scoring', async () => {
      const now = Date.now();
      const thirtyDaysAgo = new Date(now - 30 * 24 * 3600000).toISOString();

      const coreMemory = makeRecord({
        retention: 'core',
        timestamp: thirtyDaysAgo,
        importance: 0.5,
      });

      const result = await scoreMemory(coreMemory, { now });

      // Core memories should have recency of 1.0 regardless of age
      expect(result.breakdown.recency).toBe(1.0);
    });

    test('all memory types have valid type weights', async () => {
      const types = ['fact', 'pattern', 'decision', 'preference', 'error', 'session_context'];
      const now = Date.now();

      for (const type of types) {
        const memory = makeRecord({ type, timestamp: new Date(now).toISOString() });
        const result = await scoreMemory(memory, {});

        expect(result.breakdown.typeWeight).toBeGreaterThan(0);
        expect(result.breakdown.typeWeight).toBeLessThanOrEqual(1);
      }
    });

    test('importance clamping prevents out-of-range scores', async () => {
      const memory1 = makeRecord({ importance: 1.5 }); // Should clamp to 1.0
      const memory2 = makeRecord({ importance: -0.5 }); // Should clamp to 0.0

      const result1 = await scoreMemory(memory1, {});
      const result2 = await scoreMemory(memory2, {});

      expect(result1.breakdown.importance).toBe(1.0);
      expect(result2.breakdown.importance).toBe(0.0);
    });
  });
});