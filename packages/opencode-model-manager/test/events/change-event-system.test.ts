// @ts-nocheck
const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');

const { ChangeEventSystem } = require('../../src/events/change-event-system');

function createModel(overrides = {}) {
  return {
    id: 'model-default',
    provider: 'openai',
    displayName: 'Default Model',
    contextTokens: 100000,
    capabilities: {
      chat: true,
      vision: false
    },
    ...overrides
  };
}

function createDiff(overrides = {}) {
  return {
    added: [],
    removed: [],
    modified: [],
    ...overrides
  };
}

describe('ChangeEventSystem', () => {
  let tempDir;
  let auditLogPath;
  let eventSystem;

  beforeEach(async () => {
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'model-manager-events-'));
    auditLogPath = path.join(tempDir, 'audit-log.json');
    eventSystem = new ChangeEventSystem({ auditLogPath });
  });

  afterEach(async () => {
    if (eventSystem) {
      await eventSystem.clearAuditLog();
    }

    await fsPromises.rm(tempDir, { recursive: true, force: true });
  });

  test('publishes model:added, model:removed, and model:changed with expected payloads', async () => {
    const addedEvents = [];
    const removedEvents = [];
    const changedEvents = [];

    eventSystem.subscribe('model:added', (payload) => {
      addedEvents.push(payload);
    });

    eventSystem.subscribe('model:removed', (payload) => {
      removedEvents.push(payload);
    });

    eventSystem.subscribe('model:changed', (payload) => {
      changedEvents.push(payload);
    });

    const diff = createDiff({
      added: [
        {
          type: 'added',
          classification: 'major',
          model: createModel({ id: 'gpt-5-mini', provider: 'openai' }),
          provider: 'openai',
          timestamp: 1_710_000_001_000
        }
      ],
      removed: [
        {
          type: 'removed',
          classification: 'major',
          model: createModel({ id: 'legacy-model', provider: 'openai' }),
          provider: 'openai',
          timestamp: 1_710_000_002_000
        }
      ],
      modified: [
        {
          type: 'modified',
          classification: 'minor',
          model: createModel({ id: 'gpt-5', provider: 'openai' }),
          changes: {
            'capabilities.vision': { old: false, new: true }
          },
          provider: 'openai',
          timestamp: 1_710_000_003_000
        }
      ]
    });

    const publishedEvents = await eventSystem.publishChanges(diff, 'snapshot-123');

    expect(publishedEvents).toHaveLength(3);
    expect(addedEvents).toHaveLength(1);
    expect(removedEvents).toHaveLength(1);
    expect(changedEvents).toHaveLength(1);

    expect(addedEvents[0]).toEqual({
      type: 'added',
      classification: 'major',
      provider: 'openai',
      model: expect.objectContaining({ id: 'gpt-5-mini' }),
      changes: null,
      timestamp: 1_710_000_001_000,
      snapshotId: 'snapshot-123'
    });

    expect(removedEvents[0]).toEqual({
      type: 'removed',
      classification: 'major',
      provider: 'openai',
      model: expect.objectContaining({ id: 'legacy-model' }),
      changes: null,
      timestamp: 1_710_000_002_000,
      snapshotId: 'snapshot-123'
    });

    expect(changedEvents[0]).toEqual({
      type: 'changed',
      classification: 'minor',
      provider: 'openai',
      model: expect.objectContaining({ id: 'gpt-5' }),
      changes: {
        'capabilities.vision': { old: false, new: true }
      },
      timestamp: 1_710_000_003_000,
      snapshotId: 'snapshot-123'
    });
  });

  test('supports multiple subscribers for downstream consumers', async () => {
    const firstSubscriberEvents = [];
    const secondSubscriberEvents = [];

    eventSystem.subscribe('model:added', (payload) => {
      firstSubscriberEvents.push(payload);
    });

    eventSystem.subscribe('model:added', (payload) => {
      secondSubscriberEvents.push(payload);
    });

    await eventSystem.publishChanges(
      createDiff({
        added: [
          {
            type: 'added',
            classification: 'major',
            model: createModel({ id: 'gpt-4.1-mini' }),
            provider: 'openai',
            timestamp: 1_710_000_004_000
          }
        ]
      }),
      'snapshot-multi-sub'
    );

    expect(firstSubscriberEvents).toHaveLength(1);
    expect(secondSubscriberEvents).toHaveLength(1);
    expect(firstSubscriberEvents[0].model.id).toBe('gpt-4.1-mini');
    expect(secondSubscriberEvents[0].model.id).toBe('gpt-4.1-mini');
  });

  test('persists audit log to disk and loads it across restarts', async () => {
    await eventSystem.publishChanges(
      createDiff({
        added: [
          {
            type: 'added',
            classification: 'major',
            model: createModel({ id: 'gpt-4.1' }),
            provider: 'openai',
            timestamp: 1_710_000_005_000
          }
        ]
      }),
      'snapshot-persist'
    );

    eventSystem = new ChangeEventSystem({ auditLogPath });
    const auditEntries = await eventSystem.getAuditLog();

    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]).toMatchObject({
      type: 'added',
      snapshotId: 'snapshot-persist',
      provider: 'openai'
    });
  });

  test('queries audit log by timestamp range', async () => {
    await eventSystem.publishChanges(
      createDiff({
        added: [
          {
            type: 'added',
            classification: 'major',
            model: createModel({ id: 'model-a' }),
            provider: 'openai',
            timestamp: 1_710_000_010_000
          }
        ]
      }),
      'snapshot-1'
    );

    await eventSystem.publishChanges(
      createDiff({
        modified: [
          {
            type: 'modified',
            classification: 'minor',
            model: createModel({ id: 'model-b' }),
            changes: { displayName: { old: 'Model B', new: 'Model B+' } },
            provider: 'openai',
            timestamp: 1_710_000_020_000
          }
        ]
      }),
      'snapshot-2'
    );

    await eventSystem.publishChanges(
      createDiff({
        removed: [
          {
            type: 'removed',
            classification: 'major',
            model: createModel({ id: 'model-c' }),
            provider: 'openai',
            timestamp: 1_710_000_030_000
          }
        ]
      }),
      'snapshot-3'
    );

    const midRangeEntries = await eventSystem.getAuditLog({
      startTime: 1_710_000_015_000,
      endTime: 1_710_000_025_000
    });
    const invalidRangeEntries = await eventSystem.getAuditLog({
      startTime: 1_710_000_050_000,
      endTime: 1_710_000_040_000
    });

    expect(midRangeEntries).toHaveLength(1);
    expect(midRangeEntries[0]).toMatchObject({
      type: 'changed',
      snapshotId: 'snapshot-2',
      timestamp: 1_710_000_020_000
    });
    expect(invalidRangeEntries).toEqual([]);
  });

  test('persists to audit log before emitting events', async () => {
    const observedPersistedState = [];

    eventSystem.subscribe('model:added', (payload) => {
      const persisted = JSON.parse(fs.readFileSync(auditLogPath, 'utf8'));
      const found = persisted.events.some((entry) => {
        return entry.model.id === payload.model.id && entry.snapshotId === payload.snapshotId;
      });

      observedPersistedState.push(found);
    });

    await eventSystem.publishChanges(
      createDiff({
        added: [
          {
            type: 'added',
            classification: 'major',
            model: createModel({ id: 'persist-before-emit' }),
            provider: 'openai',
            timestamp: 1_710_000_040_000
          }
        ]
      }),
      'snapshot-persist-before-emit'
    );

    expect(observedPersistedState).toEqual([true]);
  });

  test('handles empty diff and no subscribers', async () => {
    const noChangeResult = await eventSystem.publishChanges(createDiff(), 'snapshot-empty');
    const entriesAfterNoChange = await eventSystem.getAuditLog();

    expect(noChangeResult).toEqual([]);
    expect(entriesAfterNoChange).toEqual([]);

    await eventSystem.publishChanges(
      createDiff({
        added: [
          {
            type: 'added',
            classification: 'major',
            model: createModel({ id: 'no-subscriber-model' }),
            provider: 'openai',
            timestamp: 1_710_000_050_000
          }
        ]
      }),
      'snapshot-no-subscriber'
    );

    const entriesWithoutSubscribers = await eventSystem.getAuditLog();
    expect(entriesWithoutSubscribers).toHaveLength(1);
    expect(entriesWithoutSubscribers[0].model.id).toBe('no-subscriber-model');
  });
});
