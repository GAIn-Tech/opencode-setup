'use strict';

const { describe, test, expect, beforeEach, afterAll } = require('bun:test');

// Must set env before requiring the tracker (paths are captured at require-time)
const { tmpDir, restoreEnv, cleanupTmpDir } = require('./_tool-usage-env');

const tracker = require('../src/tool-usage-tracker');

afterAll(() => {
  restoreEnv();
  cleanupTmpDir();
});

describe('getSessionMcpInvocations', () => {
  beforeEach(() => {
    tracker.resetForTesting();
  });

  test('returns empty array for null sessionId', () => {
    const result = tracker.getSessionMcpInvocations(null);
    expect(result).toEqual([]);
  });

  test('returns empty array for undefined sessionId', () => {
    const result = tracker.getSessionMcpInvocations(undefined);
    expect(result).toEqual([]);
  });

  test('returns empty array when no invocations for session', () => {
    const result = tracker.getSessionMcpInvocations('session-no-invocations');
    expect(result).toEqual([]);
  });

  test('returns only MCP-category tools for the given session', async () => {
    // Log a docs-category tool (context7_resolve_library_id) and a non-MCP tool (bash)
    await tracker.logInvocation('context7_resolve_library_id', {}, {}, { session: 'sess-abc' });
    await tracker.logInvocation('bash', {}, {}, { session: 'sess-abc' });

    const result = tracker.getSessionMcpInvocations('sess-abc');
    expect(result).toContain('context7_resolve_library_id');
    expect(result).not.toContain('bash');
  });

  test('deduplicates repeated MCP tool calls in same session', async () => {
    await tracker.logInvocation('context7_resolve_library_id', {}, {}, { session: 'sess-dedup' });
    await tracker.logInvocation('context7_resolve_library_id', {}, {}, { session: 'sess-dedup' });
    await tracker.logInvocation('context7_resolve_library_id', {}, {}, { session: 'sess-dedup' });

    const result = tracker.getSessionMcpInvocations('sess-dedup');
    const count = result.filter(t => t === 'context7_resolve_library_id').length;
    expect(count).toBe(1);
  });

  test('does not include tools from a different session', async () => {
    await tracker.logInvocation('context7_resolve_library_id', {}, {}, { session: 'sess-A' });
    await tracker.logInvocation('supermemory', {}, {}, { session: 'sess-B' });

    const resultA = tracker.getSessionMcpInvocations('sess-A');
    const resultB = tracker.getSessionMcpInvocations('sess-B');

    expect(resultA).not.toContain('supermemory');
    expect(resultB).not.toContain('context7_resolve_library_id');
  });

  test('supports sessionId alias in context', async () => {
    // logInvocation resolves sessionId via resolveSessionKey → stored as session
    await tracker.logInvocation('supermemory', {}, {}, { sessionId: 'sess-alias' });

    const result = tracker.getSessionMcpInvocations('sess-alias');
    expect(result).toContain('supermemory');
  });

  test('supports session_id alias in context', async () => {
    await tracker.logInvocation('supermemory', {}, {}, { session_id: 'sess-underscore' });

    const result = tracker.getSessionMcpInvocations('sess-underscore');
    expect(result).toContain('supermemory');
  });

  test('returns multiple distinct MCP tools from different categories', async () => {
    await tracker.logInvocation('context7_resolve_library_id', {}, {}, { session: 'sess-multi' }); // docs
    await tracker.logInvocation('supermemory', {}, {}, { session: 'sess-multi' });                  // memory
    await tracker.logInvocation('webfetch', {}, {}, { session: 'sess-multi' });                     // web
    await tracker.logInvocation('distill', {}, {}, { session: 'sess-multi' });                      // context

    const result = tracker.getSessionMcpInvocations('sess-multi');
    expect(result).toContain('context7_resolve_library_id');
    expect(result).toContain('supermemory');
    expect(result).toContain('webfetch');
    expect(result).toContain('distill');
    expect(result.length).toBe(4);
  });

  test('excludes non-MCP categories (execution, search, navigation, etc)', async () => {
    await tracker.logInvocation('bash', {}, {}, { session: 'sess-exclude' });            // execution
    await tracker.logInvocation('glob', {}, {}, { session: 'sess-exclude' });            // search
    await tracker.logInvocation('lsp_diagnostics', {}, {}, { session: 'sess-exclude' }); // analysis
    await tracker.logInvocation('task', {}, {}, { session: 'sess-exclude' });            // delegation
    await tracker.logInvocation('distill', {}, {}, { session: 'sess-exclude' });         // context (MCP)

    const result = tracker.getSessionMcpInvocations('sess-exclude');
    expect(result).toEqual(['distill']);
  });
});
