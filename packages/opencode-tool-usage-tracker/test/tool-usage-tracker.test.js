'use strict';

const { describe, test, expect, afterAll } = require('bun:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Test isolation: set HOME to a tmp dir BEFORE requiring the module.
// The tracker caches HOME-derived paths at require-time.
// ---------------------------------------------------------------------------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-usage-standalone-'));
const savedHome = process.env.HOME;
const savedUserProfile = process.env.USERPROFILE;
process.env.HOME = tmpDir;
process.env.USERPROFILE = tmpDir;

const tracker = require('../src/index');

afterAll(() => {
  process.env.HOME = savedHome;
  process.env.USERPROFILE = savedUserProfile;
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
});

// ---------------------------------------------------------------------------
// 1. logInvocation smoke test
// ---------------------------------------------------------------------------
describe('logInvocation', () => {
  test('returns invocation object with correct shape', async () => {
    const inv = await tracker.logInvocation('bash', { cmd: 'ls' }, { success: true }, { session: 'smoke-test' });
    expect(inv).toBeDefined();
    expect(inv.tool).toBe('bash');
    expect(inv.category).toBe('execution');
    expect(inv.success).toBe(true);
    expect(inv.timestamp).toBeDefined();
    expect(inv.context.session).toBe('smoke-test');
  });
});

// ---------------------------------------------------------------------------
// 2. detectUnderUse returns array
// ---------------------------------------------------------------------------
describe('detectUnderUse', () => {
  test('returns an array', async () => {
    const events = await tracker.detectUnderUse({});
    expect(Array.isArray(events)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. getUsageReport returns valid structure
// ---------------------------------------------------------------------------
describe('getUsageReport', () => {
  test('returns report with required keys', async () => {
    const report = await tracker.getUsageReport();
    expect(report).toBeDefined();
    expect(report.summary).toBeDefined();
    expect(typeof report.summary.totalInvocations).toBe('number');
    expect(typeof report.summary.breadthScore).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// 4. normalizeMcpToolName
// ---------------------------------------------------------------------------
describe('normalizeMcpToolName', () => {
  test('normalizes mcp_ prefixed names', () => {
    expect(tracker.normalizeMcpToolName('mcp_context7_resolve-library-id')).toBe('context7_resolve_library_id');
  });

  test('returns non-MCP names unchanged', () => {
    expect(tracker.normalizeMcpToolName('bash')).toBe('bash');
  });

  test('falls back to provider name when sub-tool not in catalog', () => {
    expect(tracker.normalizeMcpToolName('mcp_distill_browse_tools')).toBe('distill');
  });
});

// ---------------------------------------------------------------------------
// 5. getSessionMcpInvocations
// ---------------------------------------------------------------------------
describe('getSessionMcpInvocations', () => {
  test('returns empty array for unknown session', () => {
    const result = tracker.getSessionMcpInvocations('nonexistent-session-xyz');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  test('returns MCP-category tools for a session with invocations', async () => {
    await tracker.logInvocation('mcp_context7_query-docs', {}, {}, { session: 'mcp-test-session' });
    const result = tracker.getSessionMcpInvocations('mcp-test-session');
    expect(result).toContain('context7_query_docs');
  });
});

// ---------------------------------------------------------------------------
// 6. configure() accepts tracker injection (no-op default works)
// ---------------------------------------------------------------------------
describe('configure', () => {
  test('accepts a tracker object without error', () => {
    const events = [];
    tracker.configure({
      tracker: { trackEvent: (e) => { events.push(e); return Promise.resolve(); } }
    });
    // Reset to no-op after test
    tracker.configure({ tracker: { trackEvent: () => Promise.resolve() } });
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. Module exports completeness
// ---------------------------------------------------------------------------
describe('module exports', () => {
  test('exports all expected functions', () => {
    expect(typeof tracker.logInvocation).toBe('function');
    expect(typeof tracker.detectUnderUse).toBe('function');
    expect(typeof tracker.getUsageReport).toBe('function');
    expect(typeof tracker.normalizeMcpToolName).toBe('function');
    expect(typeof tracker.getSessionMcpInvocations).toBe('function');
    expect(typeof tracker.configure).toBe('function');
    expect(typeof tracker.sanitizeParams).toBe('function');
    expect(typeof tracker.resolveSessionKey).toBe('function');
    expect(typeof tracker.migrateSessionKeys).toBe('function');
    expect(typeof tracker.readInvocationsFromFile).toBe('function');
    expect(typeof tracker.startSession).toBe('function');
    expect(typeof tracker.endSession).toBe('function');
    expect(typeof tracker.getInvocationLog).toBe('function');
    expect(typeof tracker.getMetrics).toBe('function');
    expect(typeof tracker.resetForTesting).toBe('function');
    expect(tracker.AVAILABLE_TOOLS).toBeDefined();
    expect(tracker.TOOL_APPROPRIATENESS_RULES).toBeDefined();
  });
});
