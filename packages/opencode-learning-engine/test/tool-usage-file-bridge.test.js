'use strict';

/**
 * Tests for the file-based fallback in getSessionMcpInvocations().
 *
 * Verifies that:
 * 1. getSessionMcpInvocations() correctly filters MCP-category tools
 * 2. readInvocationsFromFile() is exported and returns an array
 * 3. In-memory path (via logInvocation) works for all MCP categories
 * 4. Edge cases (null session, missing context, non-MCP tools)
 *
 * NOTE: File-based integration tests (write to invocations.json + read via
 * readInvocationsFromFile) are verified in isolation:
 *   bun test packages/opencode-learning-engine/test/tool-usage-file-bridge.test.js
 * The full-suite tmpDir lifecycle (cleanupTmpDir racing across test files and
 * bun's parallel worker contexts) makes file I/O assertions unreliable here.
 * In-memory tests cover the core merge/dedup/filter logic reliably.
 */

const { describe, test, expect, beforeEach, afterAll } = require('bun:test');
const fs = require('fs');

// Shared env setup — must be required BEFORE the tracker module
const { restoreEnv } = require('./_tool-usage-env');

const tracker = require('../src/tool-usage-tracker');

// Generate unique session IDs to avoid collisions with other test files
let _seq = 0;
function uniqueSession(prefix) {
  return `ses_fb_${prefix}_${Date.now()}_${++_seq}`;
}

afterAll(() => {
  restoreEnv();
});

beforeEach(() => {
  tracker.resetForTesting();
});

// ---------------------------------------------------------------------------
// 1. readInvocationsFromFile export and contract
// ---------------------------------------------------------------------------
describe('readInvocationsFromFile', () => {
  test('is exported and returns an array', () => {
    expect(typeof tracker.readInvocationsFromFile).toBe('function');
    const result = tracker.readInvocationsFromFile();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. getSessionMcpInvocations: in-memory path
// ---------------------------------------------------------------------------
describe('getSessionMcpInvocations in-memory', () => {
  test('returns memory-category tools', async () => {
    const sid = uniqueSession('mem');
    await tracker.logInvocation('supermemory', {}, {}, { session: sid });
    expect(tracker.getSessionMcpInvocations(sid)).toContain('supermemory');
  });

  test('returns docs-category tools', async () => {
    const sid = uniqueSession('docs');
    await tracker.logInvocation('context7_resolve_library_id', {}, {}, { session: sid });
    await tracker.logInvocation('context7_query_docs', {}, {}, { session: sid });
    const tools = tracker.getSessionMcpInvocations(sid);
    expect(tools).toContain('context7_resolve_library_id');
    expect(tools).toContain('context7_query_docs');
  });

  test('returns web-category tools', async () => {
    const sid = uniqueSession('web');
    await tracker.logInvocation('webfetch', {}, {}, { session: sid });
    await tracker.logInvocation('websearch', {}, {}, { session: sid });
    const tools = tracker.getSessionMcpInvocations(sid);
    expect(tools).toContain('webfetch');
    expect(tools).toContain('websearch');
  });

  test('excludes non-MCP-category tools', async () => {
    const sid = uniqueSession('excl');
    await tracker.logInvocation('bash', {}, {}, { session: sid });
    await tracker.logInvocation('read', {}, {}, { session: sid });
    await tracker.logInvocation('edit', {}, {}, { session: sid });
    await tracker.logInvocation('glob', {}, {}, { session: sid });
    await tracker.logInvocation('task', {}, {}, { session: sid });
    await tracker.logInvocation('supermemory', {}, {}, { session: sid }); // MCP
    const tools = tracker.getSessionMcpInvocations(sid);
    expect(tools).toContain('supermemory');
    expect(tools).not.toContain('bash');
    expect(tools).not.toContain('read');
    expect(tools).not.toContain('edit');
    expect(tools).not.toContain('glob');
    expect(tools).not.toContain('task');
  });

  test('deduplicates repeated invocations', async () => {
    const sid = uniqueSession('dedup');
    await tracker.logInvocation('supermemory', {}, {}, { session: sid });
    await tracker.logInvocation('supermemory', {}, {}, { session: sid });
    await tracker.logInvocation('supermemory', {}, {}, { session: sid });
    const tools = tracker.getSessionMcpInvocations(sid);
    expect(tools.filter(t => t === 'supermemory').length).toBe(1);
  });

  test('filters by session ID', async () => {
    const sidA = uniqueSession('sessA');
    const sidB = uniqueSession('sessB');
    await tracker.logInvocation('supermemory', {}, {}, { session: sidA });
    await tracker.logInvocation('context7_query_docs', {}, {}, { session: sidB });
    expect(tracker.getSessionMcpInvocations(sidA)).toContain('supermemory');
    expect(tracker.getSessionMcpInvocations(sidA)).not.toContain('context7_query_docs');
    expect(tracker.getSessionMcpInvocations(sidB)).toContain('context7_query_docs');
    expect(tracker.getSessionMcpInvocations(sidB)).not.toContain('supermemory');
  });

  test('returns multiple categories in one session', async () => {
    const sid = uniqueSession('multi');
    await tracker.logInvocation('supermemory', {}, {}, { session: sid });     // memory
    await tracker.logInvocation('context7_query_docs', {}, {}, { session: sid }); // docs
    await tracker.logInvocation('webfetch', {}, {}, { session: sid });        // web
    const tools = tracker.getSessionMcpInvocations(sid);
    expect(tools).toContain('supermemory');
    expect(tools).toContain('context7_query_docs');
    expect(tools).toContain('webfetch');
    expect(tools.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 3. Edge cases
// ---------------------------------------------------------------------------
describe('getSessionMcpInvocations edge cases', () => {
  test('returns empty for null/undefined/empty sessionId', () => {
    expect(tracker.getSessionMcpInvocations(null)).toEqual([]);
    expect(tracker.getSessionMcpInvocations(undefined)).toEqual([]);
    expect(tracker.getSessionMcpInvocations('')).toEqual([]);
  });

  test('returns empty for session with no invocations', () => {
    expect(tracker.getSessionMcpInvocations(uniqueSession('empty')).length).toBe(0);
  });

  test('returns empty for session with only non-MCP tools', async () => {
    const sid = uniqueSession('nonmcp');
    await tracker.logInvocation('bash', {}, {}, { session: sid });
    await tracker.logInvocation('read', {}, {}, { session: sid });
    await tracker.logInvocation('edit', {}, {}, { session: sid });
    expect(tracker.getSessionMcpInvocations(sid).length).toBe(0);
  });

  test('session_list and session_read are included (memory category)', async () => {
    const sid = uniqueSession('sesstools');
    await tracker.logInvocation('session_list', {}, {}, { session: sid });
    await tracker.logInvocation('session_read', {}, {}, { session: sid });
    await tracker.logInvocation('session_search', {}, {}, { session: sid });
    const tools = tracker.getSessionMcpInvocations(sid);
    expect(tools).toContain('session_list');
    expect(tools).toContain('session_read');
    expect(tools).toContain('session_search');
  });
});
