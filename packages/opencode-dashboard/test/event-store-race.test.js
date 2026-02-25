import { test, expect, beforeEach, afterEach } from 'bun:test';
import { persistEvents } from '../src/app/api/orchestration/lib/event-store.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpDir;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `event-store-race-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

test('concurrent persists do not lose events', async () => {
  const filePath = path.join(tmpDir, 'events.json');

  // Simulate 5 concurrent persist calls, each adding 1 event.
  // All pass existingEvents: [] — simulating callers that all read the file
  // at the same instant (before any write completes).
  // With the bug: merge happens outside queue, last write wins → only 1 event.
  // With the fix: read-merge-write inside queue → all 5 events preserved.
  const promises = Array(5).fill().map((_, i) =>
    persistEvents({
      filePath,
      version: '1.0.0',
      existingEvents: [],
      replace: false,
      normalized: [{ id: i, timestamp: new Date().toISOString(), model: `event-${i}` }],
    })
  );

  await Promise.all(promises);

  // Verify all 5 events persisted
  const content = JSON.parse(await fs.readFile(filePath, 'utf8'));
  expect(content.events).toHaveLength(5);
});

test('concurrent persists preserve event order', async () => {
  const filePath = path.join(tmpDir, 'ordered-events.json');

  // Seed file with 2 initial events
  await persistEvents({
    filePath,
    version: '1.0.0',
    existingEvents: [],
    replace: false,
    normalized: [
      { id: 'seed-0', timestamp: '2026-01-01T00:00:00Z', model: 'seed-0' },
      { id: 'seed-1', timestamp: '2026-01-01T00:00:01Z', model: 'seed-1' },
    ],
  });

  // 3 concurrent appends, each passing stale existingEvents
  const promises = Array(3).fill().map((_, i) =>
    persistEvents({
      filePath,
      version: '1.0.0',
      existingEvents: [],  // stale snapshot
      replace: false,
      normalized: [{ id: `append-${i}`, timestamp: new Date().toISOString(), model: `append-${i}` }],
    })
  );

  await Promise.all(promises);

  const content = JSON.parse(await fs.readFile(filePath, 'utf8'));
  // Should have 2 seeds + 3 appends = 5 total
  expect(content.events).toHaveLength(5);
  // Seeds should still be present
  expect(content.events[0].model).toBe('seed-0');
  expect(content.events[1].model).toBe('seed-1');
});
