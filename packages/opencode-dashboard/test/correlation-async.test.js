import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { collectCorrelationData } from '../src/app/api/orchestration/lib/correlation.js';

describe('collectCorrelationData async conversion', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `correlation-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  test('returns valid data structure with async I/O', async () => {
    const messagesPath = path.join(tempDir, 'messages');
    const customEventsPath = path.join(tempDir, 'events.json');
    const cutoffMs = 0;

    await fs.mkdir(messagesPath, { recursive: true });
    await fs.writeFile(customEventsPath, JSON.stringify({ events: [] }), 'utf-8');

    const result = await collectCorrelationData({ messagesPath, customEventsPath, cutoffMs });

    expect(result).toBeDefined();
    expect(result.sessions).toBeInstanceOf(Set);
    expect(result.model).toBeInstanceOf(Map);
    expect(result.skill).toBeInstanceOf(Map);
    expect(result.tool).toBeInstanceOf(Map);
    expect(result.agent).toBeInstanceOf(Map);
    expect(result.termination).toBeInstanceOf(Map);
    expect(result.modelTokens).toBeInstanceOf(Map);
    expect(result.skillTokens).toBeInstanceOf(Map);
    expect(result.toolTokens).toBeInstanceOf(Map);
    expect(result.loopsBySession).toBeInstanceOf(Map);
    expect(Array.isArray(result.perMessageTokens)).toBe(true);
    expect(typeof result.totalMessages).toBe('number');
    expect(typeof result.delegatedMessages).toBe('number');
    expect(typeof result.traces).toBe('number');
    expect(typeof result.parentSpans).toBe('number');
    expect(typeof result.errorMentions).toBe('number');
    expect(typeof result.signedCustomEvents).toBe('number');
    expect(typeof result.validSignedCustomEvents).toBe('number');
    expect(typeof result.withTokens).toBe('number');
    expect(typeof result.inTok).toBe('number');
    expect(typeof result.outTok).toBe('number');
    expect(typeof result.totalTok).toBe('number');
    expect(Array.isArray(result.customEvents)).toBe(true);
  });

  test('handles missing messagesPath gracefully', async () => {
    const messagesPath = path.join(tempDir, 'nonexistent');
    const customEventsPath = path.join(tempDir, 'events.json');
    const cutoffMs = 0;

    await fs.writeFile(customEventsPath, JSON.stringify({ events: [] }), 'utf-8');

    const result = await collectCorrelationData({ messagesPath, customEventsPath, cutoffMs });

    expect(result.sessions.size).toBe(0);
    expect(result.totalMessages).toBe(0);
  });

  test('handles malformed JSON files (skips without crash)', async () => {
    const messagesPath = path.join(tempDir, 'messages');
    const sessionDir = path.join(messagesPath, 'session-1');
    const customEventsPath = path.join(tempDir, 'events.json');
    const cutoffMs = 0;

    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(path.join(sessionDir, 'valid.json'), JSON.stringify({ model: 'test-model' }), 'utf-8');
    await fs.writeFile(path.join(sessionDir, 'broken.json'), '{invalid json', 'utf-8');
    await fs.writeFile(customEventsPath, JSON.stringify({ events: [] }), 'utf-8');

    const result = await collectCorrelationData({ messagesPath, customEventsPath, cutoffMs });

    expect(result.sessions.size).toBe(1);
    expect(result.totalMessages).toBe(1); // only valid.json counted
    expect(result.model.get('test-model')).toBe(1);
  });

  test('returns empty data for empty directory', async () => {
    const messagesPath = path.join(tempDir, 'messages');
    const customEventsPath = path.join(tempDir, 'events.json');
    const cutoffMs = 0;

    await fs.mkdir(messagesPath, { recursive: true });
    await fs.writeFile(customEventsPath, JSON.stringify({ events: [] }), 'utf-8');

    const result = await collectCorrelationData({ messagesPath, customEventsPath, cutoffMs });

    expect(result.sessions.size).toBe(0);
    expect(result.model.size).toBe(0);
    expect(result.skill.size).toBe(0);
    expect(result.tool.size).toBe(0);
    expect(result.totalMessages).toBe(0);
  });
});
