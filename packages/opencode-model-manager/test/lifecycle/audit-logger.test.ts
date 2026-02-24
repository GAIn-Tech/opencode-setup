// @ts-nocheck
const { afterEach, beforeEach, describe, expect, test } = require('bun:test');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { AuditLogger } = require('../../src/lifecycle/audit-logger');

const DAY_MS = 24 * 60 * 60 * 1000;

function createDiffHash(seed) {
  return crypto.createHash('sha256').update(String(seed)).digest('hex');
}

function createEntry(overrides = {}) {
  return {
    modelId: 'model-a',
    fromState: 'detected',
    toState: 'assessed',
    actor: 'system:auto-assessment',
    reason: 'Assessment benchmark completed',
    diffHash: createDiffHash('default-diff'),
    metadata: {
      source: 'state-machine',
      score: 0.84
    },
    ...overrides
  };
}

function hashAuditEntry(entry) {
  const serialized = JSON.stringify(normalizeForHash({
    id: entry.id,
    timestamp: entry.timestamp,
    modelId: entry.modelId,
    fromState: entry.fromState,
    toState: entry.toState,
    actor: entry.actor,
    reason: entry.reason,
    diffHash: entry.diffHash,
    metadata: entry.metadata,
    previousHash: entry.previousHash
  }));

  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function normalizeForHash(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForHash(entry));
  }

  if (value && typeof value === 'object') {
    const sorted = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      sorted[key] = normalizeForHash(value[key]);
    }
    return sorted;
  }

  if (value === undefined) {
    return '__undefined__';
  }

  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }

  return value;
}

describe('AuditLogger', () => {
  let tempDir;
  let dbPath;
  let logger;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'model-audit-log-'));
    dbPath = path.join(tempDir, 'audit.db');
    logger = new AuditLogger({ dbPath, retentionDays: 365 });
  });

  afterEach(async () => {
    if (logger) {
      logger.close();
      logger = null;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('logs transition entries with required schema', async () => {
    const timestamp = 1_730_000_000_000;
    const loggedEntry = await logger.log(createEntry({
      timestamp,
      metadata: {
        source: 'state-machine',
        transitionId: 'transition-1'
      }
    }));

    const entries = await logger.getByModel('model-a');

    expect(loggedEntry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(loggedEntry.timestamp).toBe(timestamp);
    expect(loggedEntry.modelId).toBe('model-a');
    expect(loggedEntry.fromState).toBe('detected');
    expect(loggedEntry.toState).toBe('assessed');
    expect(loggedEntry.actor).toBe('system:auto-assessment');
    expect(loggedEntry.reason).toBe('Assessment benchmark completed');
    expect(loggedEntry.diffHash).toMatch(/^[a-f0-9]{64}$/);
    expect(loggedEntry.metadata).toEqual({
      source: 'state-machine',
      transitionId: 'transition-1'
    });
    expect(loggedEntry.previousHash).toBe('0');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(loggedEntry);
  });

  test('queries audit history by model id', async () => {
    await logger.log(createEntry({
      modelId: 'model-a',
      fromState: 'detected',
      toState: 'assessed',
      timestamp: 1_730_000_001_000,
      diffHash: createDiffHash('model-a-1')
    }));

    await logger.log(createEntry({
      modelId: 'model-b',
      fromState: 'detected',
      toState: 'assessed',
      timestamp: 1_730_000_002_000,
      diffHash: createDiffHash('model-b-1')
    }));

    await logger.log(createEntry({
      modelId: 'model-a',
      fromState: 'assessed',
      toState: 'approved',
      actor: 'user:reviewer@example.com',
      reason: 'Manual review approved',
      timestamp: 1_730_000_003_000,
      diffHash: createDiffHash('model-a-2')
    }));

    const modelAHistory = await logger.getByModel('model-a');
    const modelBHistory = await logger.getByModel('model-b');

    expect(modelAHistory).toHaveLength(2);
    expect(modelAHistory.map((entry) => entry.toState)).toEqual(['assessed', 'approved']);
    expect(modelBHistory).toHaveLength(1);
    expect(modelBHistory[0].modelId).toBe('model-b');
  });

  test('queries audit history by time range', async () => {
    await logger.log(createEntry({
      timestamp: 1_730_100_000_000,
      diffHash: createDiffHash('range-1')
    }));
    await logger.log(createEntry({
      timestamp: 1_730_200_000_000,
      diffHash: createDiffHash('range-2'),
      toState: 'approved'
    }));
    await logger.log(createEntry({
      timestamp: 1_730_300_000_000,
      diffHash: createDiffHash('range-3'),
      toState: 'selectable'
    }));

    const middleWindow = await logger.getByTimeRange(1_730_150_000_000, 1_730_250_000_000);
    const invalidWindow = await logger.getByTimeRange(1_730_400_000_000, 1_730_100_000_000);

    expect(middleWindow).toHaveLength(1);
    expect(middleWindow[0].toState).toBe('approved');
    expect(invalidWindow).toEqual([]);
  });

  test('builds and verifies hash chain integrity', async () => {
    const first = await logger.log(createEntry({
      timestamp: 1_730_000_000_100,
      diffHash: createDiffHash('chain-first')
    }));

    const second = await logger.log(createEntry({
      timestamp: 1_730_000_000_200,
      fromState: 'assessed',
      toState: 'approved',
      actor: 'user:reviewer@example.com',
      reason: 'Approved after manual review',
      diffHash: createDiffHash('chain-second')
    }));

    const expectedPreviousHash = hashAuditEntry(first);

    expect(second.previousHash).toBe(expectedPreviousHash);
    await expect(logger.verify()).resolves.toBe(true);
  });

  test('detects tampering when an entry is modified', async () => {
    const first = await logger.log(createEntry({
      timestamp: 1_730_000_100_000,
      diffHash: createDiffHash('tamper-first')
    }));

    await logger.log(createEntry({
      timestamp: 1_730_000_200_000,
      fromState: 'assessed',
      toState: 'approved',
      actor: 'user:reviewer@example.com',
      reason: 'Approved by human reviewer',
      diffHash: createDiffHash('tamper-second')
    }));

    logger.db.run(
      `
      UPDATE model_lifecycle_audit_log
      SET reason = ?
      WHERE id = ?
      `,
      ['tampered reason', first.id]
    );

    await expect(logger.verify()).resolves.toBe(false);
  });

  test('cleans up entries older than one-year retention and keeps chain valid', async () => {
    const now = Date.now();

    await logger.log(createEntry({
      modelId: 'cleanup-model',
      timestamp: now - (400 * DAY_MS),
      diffHash: createDiffHash('cleanup-old')
    }));

    await logger.log(createEntry({
      modelId: 'cleanup-model',
      timestamp: now - (15 * DAY_MS),
      fromState: 'assessed',
      toState: 'approved',
      actor: 'user:reviewer@example.com',
      reason: 'Recent transition kept',
      diffHash: createDiffHash('cleanup-new')
    }));

    const removed = await logger.cleanup();
    const remaining = await logger.getByModel('cleanup-model');

    expect(removed).toBe(1);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].reason).toBe('Recent transition kept');
    await expect(logger.verify()).resolves.toBe(true);
  });
});
