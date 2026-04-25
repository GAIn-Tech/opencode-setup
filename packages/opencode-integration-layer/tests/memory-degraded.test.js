'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { DegradedModeHandler } = require('../src/memory-degraded.js');

describe('DegradedModeHandler', () => {
  let tempDir;
  let dbPath;
  let now;
  let handler;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-degraded-'));
    dbPath = path.join(tempDir, 'degraded-queue.db');
    now = Date.now();
    handler = null;
  });

  afterEach(() => {
    if (handler) {
      handler.close();
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes directly when Supermemory is available', async () => {
    const writes = [];
    handler = new DegradedModeHandler({
      localStoragePath: dbPath,
      supermemoryWhoAmI: async () => ({ id: 'user_1' }),
      supermemoryMemory: async (content, containerTag) => {
        writes.push({ content, containerTag });
        return { ok: true };
      },
    });

    const result = await handler.write({ id: 'rec_direct_1', value: 'direct' });

    expect(result.written).toBe(true);
    expect(result.queued).toBe(false);
    expect(writes.length).toBe(1);
    expect(writes[0].containerTag).toBe('sm_project_default');
    expect(handler.getStatus().queuedCount).toBe(0);
    expect(handler.disableConsolidation()).toBe(false);
  });

  it('queues writes locally when Supermemory is unavailable', async () => {
    handler = new DegradedModeHandler({
      localStoragePath: dbPath,
      supermemoryWhoAmI: async () => {
        throw new Error('supermemory unavailable');
      },
      supermemoryMemory: async () => ({ ok: true }),
    });

    const result = await handler.write({ id: 'rec_queue_1', value: 'queued' });
    const status = handler.getStatus();

    expect(result.written).toBe(false);
    expect(result.queued).toBe(true);
    expect(status.available).toBe(false);
    expect(status.queuedCount).toBe(1);
    expect(status.lastCheckTime).toBeTruthy();
    expect(handler.disableConsolidation()).toBe(true);
  });

  it('flushes queued writes when Supermemory recovers', async () => {
    handler = new DegradedModeHandler({
      localStoragePath: dbPath,
      supermemoryWhoAmI: async () => {
        throw new Error('down');
      },
      supermemoryMemory: async () => ({ ok: true }),
    });

    await handler.write({ id: 'rec_flush_1', value: 'first' });
    await handler.write({ id: 'rec_flush_2', value: 'second' });
    expect(handler.getStatus().queuedCount).toBe(2);

    const flushedPayloads = [];
    handler._supermemoryWhoAmI = async () => ({ id: 'user_recovered' });
    handler._supermemoryMemory = async (content, _containerTag) => {
      flushedPayloads.push(JSON.parse(content));
      return { ok: true };
    };

    const result = await handler.flush();

    expect(result).toEqual({ flushed: 2, failed: 0, remaining: 0 });
    expect(flushedPayloads.map((row) => row.id)).toEqual(['rec_flush_1', 'rec_flush_2']);
  });

  it('evicts oldest entries when queue exceeds maxQueueSize', async () => {
    const payloadIds = [];
    handler = new DegradedModeHandler({
      localStoragePath: dbPath,
      maxQueueSize: 2,
      supermemoryWhoAmI: async () => {
        throw new Error('down');
      },
      supermemoryMemory: async () => ({ ok: true }),
    });

    await handler.write({ id: 'oldest', value: 1 });
    await handler.write({ id: 'middle', value: 2 });
    await handler.write({ id: 'newest', value: 3 });
    expect(handler.getStatus().queuedCount).toBe(2);

    handler._supermemoryWhoAmI = async () => ({ id: 'user_ready' });
    handler._supermemoryMemory = async (content, _containerTag) => {
      payloadIds.push(JSON.parse(content).id);
      return { ok: true };
    };

    const result = await handler.flush();

    expect(result.flushed).toBe(2);
    expect(result.remaining).toBe(0);
    expect(payloadIds).toEqual(['middle', 'newest']);
  });

  it('uses exponential backoff on repeated flush failures', async () => {
    let writeAttempts = 0;
    handler = new DegradedModeHandler({
      localStoragePath: dbPath,
      retryIntervalMs: 60 * 1000,
      now: () => now,
      supermemoryWhoAmI: async () => ({ id: 'user_1' }),
      supermemoryMemory: async () => {
        writeAttempts += 1;
        throw new Error('write failed');
      },
    });

    await handler.write({ id: 'rec_retry_1', value: 'retry me' });
    expect(handler.getStatus().queuedCount).toBe(1);

    const first = await handler.flush();
    expect(first.failed).toBe(1);
    expect(first.remaining).toBe(1);
    expect(handler._nextFlushAllowedAt - now).toBe(60 * 1000);

    const attemptsAfterFirst = writeAttempts;
    const second = await handler.flush();
    expect(second).toEqual({ flushed: 0, failed: 0, remaining: 1 });
    expect(writeAttempts).toBe(attemptsAfterFirst);

    now += (60 * 1000) + 1;
    const third = await handler.flush();
    expect(third.failed).toBe(1);
    expect(handler._nextFlushAllowedAt - now).toBe(2 * 60 * 1000);
  });

  it('times out availability checks asynchronously', async () => {
    handler = new DegradedModeHandler({
      localStoragePath: dbPath,
      availabilityTimeoutMs: 20,
      supermemoryWhoAmI: () => new Promise(() => {}),
      supermemoryMemory: async () => ({ ok: true }),
    });

    const available = await handler.checkAvailability();
    expect(available).toBe(false);
    expect(handler.getStatus().lastCheckTime).toBeTruthy();
  });
});
