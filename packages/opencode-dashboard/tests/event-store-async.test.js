import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { normalizeEvents, persistEvents, summarizeEventProvenance } from '../src/app/api/orchestration/lib/event-store.js';

describe('event-store async conversion', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `event-store-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  test('persistEvents writes file atomically via async I/O', async () => {
    const filePath = path.join(tempDir, 'events.json');
    const normalized = [
      { timestamp: '2026-01-01T00:00:00Z', model: 'test', input_tokens: 10, output_tokens: 5, total_tokens: 15, iteration_index: 0 },
    ];

    const events = await persistEvents({
      filePath,
      version: '1.0.0',
      existingEvents: [],
      replace: false,
      normalized,
    });

    expect(events).toHaveLength(1);
    expect(events[0].model).toBe('test');

    // Verify file was written
    const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(content.version).toBe('1.0.0');
    expect(content.events).toHaveLength(1);
    expect(content.updated_at).toBeDefined();
  });

  test('persistEvents appends events without replace', async () => {
    const filePath = path.join(tempDir, 'events.json');
    const existing = [{ timestamp: '2026-01-01T00:00:00Z', model: 'old' }];
    const normalized = [{ timestamp: '2026-01-02T00:00:00Z', model: 'new' }];

    const events = await persistEvents({
      filePath,
      version: '1.0.0',
      existingEvents: existing,
      replace: false,
      normalized,
    });

    expect(events).toHaveLength(2);
    expect(events[0].model).toBe('old');
    expect(events[1].model).toBe('new');
  });

  test('persistEvents replaces events with replace=true', async () => {
    const filePath = path.join(tempDir, 'events.json');
    const existing = [{ model: 'old' }];
    const normalized = [{ model: 'new' }];

    const events = await persistEvents({
      filePath,
      version: '1.0.0',
      existingEvents: existing,
      replace: true,
      normalized,
    });

    expect(events).toHaveLength(1);
    expect(events[0].model).toBe('new');
  });

  test('concurrent persistEvents writes serialize via write queue', async () => {
    const filePath = path.join(tempDir, 'concurrent-events.json');

    // Fire multiple writes concurrently
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        persistEvents({
          filePath,
          version: '1.0.0',
          existingEvents: [],
          replace: true,
          normalized: [{ model: `write-${i}`, timestamp: new Date().toISOString() }],
        })
      );
    }

    await Promise.all(promises);

    // File should be valid JSON (not corrupted)
    const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(content.version).toBe('1.0.0');
    expect(content.events).toHaveLength(1);
    // Last write wins due to replace=true and serial queue
    expect(content.events[0].model).toMatch(/^write-\d$/);
  });

  test('normalizeEvents is synchronous and unchanged', () => {
    const result = normalizeEvents({
      incoming: [{ model: 'test', input_tokens: 10, output_tokens: 5 }],
      signingKey: '',
      signingMode: 'off',
      defaultSource: 'test',
    });

    expect(result.normalized).toHaveLength(1);
    expect(result.normalized[0].model).toBe('test');
    expect(result.normalized[0].total_tokens).toBe(15);
    expect(result.normalizationDiagnostics).toBeDefined();
  });

  test('summarizeEventProvenance is synchronous and unchanged', () => {
    const normalized = [
      { provenance: { signature: 'abc', signature_valid: true } },
      { provenance: { signature: '', signature_valid: false } },
    ];

    const result = summarizeEventProvenance({
      normalized,
      signingKey: 'key',
      diagnostics: { unsigned: 1, invalid_signature: 0, accepted_signed: 1, accepted_unsigned: 0 },
    });

    expect(result.signing_enabled).toBe(true);
    expect(result.signed_events).toBe(1);
    expect(result.valid_signed_events).toBe(1);
  });

  test('persistEvents no tmp files left after success', async () => {
    const filePath = path.join(tempDir, 'clean-events.json');

    await persistEvents({
      filePath,
      version: '1.0.0',
      existingEvents: [],
      replace: false,
      normalized: [{ model: 'test' }],
    });

    const files = await fs.readdir(tempDir);
    const tmpFiles = files.filter(f => f.includes('.tmp.'));
    expect(tmpFiles).toHaveLength(0);
  });
});
