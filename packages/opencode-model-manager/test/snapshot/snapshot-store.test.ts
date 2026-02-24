// @ts-nocheck
const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { SnapshotStore } = require('../../src/snapshot/snapshot-store');

const DAY_MS = 24 * 60 * 60 * 1000;

async function saveAtTimestamp(store, timestamp, provider, models, rawPayload) {
  const originalNow = Date.now;
  Date.now = () => timestamp;

  try {
    return await store.save(provider, models, rawPayload);
  } finally {
    Date.now = originalNow;
  }
}

describe('SnapshotStore', () => {
  let tempDir;
  let store;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'model-manager-snapshot-'));
    store = new SnapshotStore({
      storagePath: tempDir,
      retentionDays: 30
    });
  });

  afterEach(async () => {
    if (store) {
      await store.clear();
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('saves snapshots with required schema and reads latest snapshot', async () => {
    const models = [
      { id: 'gpt-5', provider: 'openai' },
      { id: 'gpt-5-mini', provider: 'openai' }
    ];

    const snapshotId = await saveAtTimestamp(
      store,
      1_700_000_000_000,
      'openai',
      models,
      {
        data: [{ id: 'gpt-5' }, { id: 'gpt-5-mini' }],
        discoveryDuration: 87
      }
    );

    const latest = await store.getLatest('openai');

    expect(snapshotId).toMatch(/^[0-9a-f-]{36}$/);
    expect(latest).not.toBeNull();
    expect(latest.id).toBe(snapshotId);
    expect(latest.timestamp).toBe(1_700_000_000_000);
    expect(latest.provider).toBe('openai');
    expect(latest.models).toEqual(models);
    expect(latest.rawPayloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(latest.metadata).toEqual({
      discoveryDuration: 87,
      modelCount: 2
    });
  });

  test('queries snapshots by provider and time range', async () => {
    const baseTimestamp = 1_710_000_000_000;

    await saveAtTimestamp(store, baseTimestamp - 1000, 'openai', [{ id: 'gpt-4' }], { data: [] });
    await saveAtTimestamp(store, baseTimestamp, 'openai', [{ id: 'gpt-5' }], { data: [] });
    await saveAtTimestamp(store, baseTimestamp + 1000, 'openai', [{ id: 'gpt-5-mini' }], { data: [] });
    await saveAtTimestamp(store, baseTimestamp, 'anthropic', [{ id: 'claude-sonnet-4-5' }], { data: [] });

    const middleRange = await store.getByTimeRange('openai', baseTimestamp - 250, baseTimestamp + 250);
    const invalidRange = await store.getByTimeRange('openai', baseTimestamp + 5000, baseTimestamp - 5000);
    const missingProvider = await store.getByTimeRange('groq', baseTimestamp - 5000, baseTimestamp + 5000);

    expect(middleRange).toHaveLength(1);
    expect(middleRange[0].provider).toBe('openai');
    expect(middleRange[0].models[0].id).toBe('gpt-5');
    expect(invalidRange).toEqual([]);
    expect(missingProvider).toEqual([]);
  });

  test('isolates providers and persists latest snapshots across restart', async () => {
    const baseTimestamp = 1_720_000_000_000;

    await saveAtTimestamp(store, baseTimestamp, 'openai', [{ id: 'gpt-5' }], { data: [] });
    await saveAtTimestamp(store, baseTimestamp + 500, 'anthropic', [{ id: 'claude-opus-4-6' }], { data: [] });
    await saveAtTimestamp(store, baseTimestamp + 1000, 'openai', [{ id: 'gpt-5-mini' }], { data: [] });

    store = new SnapshotStore({
      storagePath: tempDir,
      retentionDays: 30
    });

    const latestOpenAI = await store.getLatest('openai');
    const latestAnthropic = await store.getLatest('anthropic');

    expect(latestOpenAI.provider).toBe('openai');
    expect(latestOpenAI.models[0].id).toBe('gpt-5-mini');
    expect(latestAnthropic.provider).toBe('anthropic');
    expect(latestAnthropic.models[0].id).toBe('claude-opus-4-6');
  });

  test('auto-cleans snapshots older than retention period during save', async () => {
    const staleTimestamp = Date.now() - (31 * DAY_MS);
    const snapshotFilePath = path.join(tempDir, 'snapshots.json');
    const staleSnapshot = {
      id: crypto.randomUUID(),
      timestamp: staleTimestamp,
      provider: 'openai',
      models: [{ id: 'legacy-model' }],
      rawPayloadHash: 'legacy-hash',
      metadata: {
        discoveryDuration: 50,
        modelCount: 1
      }
    };

    await fs.writeFile(snapshotFilePath, JSON.stringify({ snapshots: [staleSnapshot] }, null, 2), 'utf8');

    store = new SnapshotStore({
      storagePath: tempDir,
      retentionDays: 30
    });

    await store.save('openai', [{ id: 'current-model' }], { data: [] });

    const snapshots = await store.getByTimeRange(
      'openai',
      staleTimestamp - DAY_MS,
      Date.now() + DAY_MS
    );

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].models[0].id).toBe('current-model');
  });

  test('supports manual cleanup and reports removed snapshot count', async () => {
    store = new SnapshotStore({
      storagePath: tempDir,
      retentionDays: 365
    });

    const now = Date.now();
    await saveAtTimestamp(store, now - (45 * DAY_MS), 'openai', [{ id: 'old-model' }], { data: [] });
    await saveAtTimestamp(store, now - (5 * DAY_MS), 'openai', [{ id: 'new-model' }], { data: [] });

    const removed = await store.cleanup(30);
    const remaining = await store.getByTimeRange('openai', now - (60 * DAY_MS), now);

    expect(removed).toBe(1);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].models[0].id).toBe('new-model');
  });

  test('calculates storage size in bytes', async () => {
    const initialSize = await store.getStorageSize();
    expect(initialSize).toBe(0);

    await store.save('openai', [{ id: 'gpt-5' }], { data: ['sample'] });

    const reportedSize = await store.getStorageSize();
    const fileStats = await fs.stat(path.join(tempDir, 'snapshots.json'));

    expect(reportedSize).toBeGreaterThan(0);
    expect(reportedSize).toBe(fileStats.size);
  });
});
