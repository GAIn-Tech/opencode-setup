import { afterEach, describe, expect, test } from 'bun:test';

import {
  logInvocation,
  getInvocationLog,
  getMetrics,
  resetForTesting,
  normalizeMcpToolName,
  sanitizeParams,
  AVAILABLE_TOOLS,
} from '../packages/opencode-learning-engine/src/tool-usage-tracker.js';
import { createToolExecuteAfterHandler } from '../local/oh-my-opencode/src/plugin/tool-execute-after.ts';

afterEach(() => {
  resetForTesting();
});

describe('Telemetry pipeline — normalization → invocation logging → metrics', () => {
  test('B5 E2E: Context7 + Distill rows are joinable by canonical session key', async () => {
    await logInvocation(
      'mcp_context7_resolve-library-id',
      { q: 'json schema' },
      { success: true },
      { sessionId: 'ses_ctx7_join' }
    );
    await logInvocation(
      'mcp_distill_browse_tools',
      { limit: 5 },
      { success: true },
      { session_id: 'ses_distill_join' }
    );

    const log = getInvocationLog();
    expect(log.length).toBe(2);

    // Canonical tool assertions
    expect(log[0].tool).toBe('context7_resolve_library_id');
    expect(log[1].tool).toBe('distill');

    // Canonical session key assertions for downstream joins
    expect(log[0].context.session).toBe('ses_ctx7_join');
    expect(log[1].context.session).toBe('ses_distill_join');

    const metrics = getMetrics();
    expect(metrics.totalInvocations).toBe(2);
    expect(metrics.toolCounts['context7_resolve_library_id']).toBe(1);
    expect(metrics.toolCounts['distill']).toBe(1);
    expect(metrics.categoryCounts['docs']).toBe(1);
    expect(metrics.categoryCounts['context']).toBe(1);
  });

  // ---- Context7 pipeline ----

  test('context7 resolve-library-id normalizes to canonical key', async () => {
    await logInvocation('mcp_context7_resolve-library-id', {}, { success: true }, {});

    const log = getInvocationLog();
    expect(log.length).toBe(1);
    expect(log[0].tool).toBe('context7_resolve_library_id');
    expect(log[0].category).toBe('docs');

    const metrics = getMetrics();
    expect(metrics.totalInvocations).toBe(1);
    expect(metrics.toolCounts['context7_resolve_library_id']).toBe(1);
    expect(metrics.categoryCounts['docs']).toBe(1);
  });

  test('context7 double-underscore variant normalizes identically', async () => {
    await logInvocation('mcp__context7__query-docs', {}, { success: true }, {});

    const log = getInvocationLog();
    expect(log[0].tool).toBe('context7_query_docs');
    expect(log[0].category).toBe('docs');
  });

  test('context7 error outcome is recorded', async () => {
    await logInvocation('mcp_context7_resolve-library-id', {}, { success: false }, {});

    const log = getInvocationLog();
    expect(log[0].success).toBe(false);
  });

  test('structured error outcome fields are persisted', async () => {
    await logInvocation(
      'mcp_context7_query-docs',
      { token: 'secret-token' },
      { success: false, errorClass: 'timeout', errorCode: 'ETIMEDOUT' },
      { sessionId: 'ses_error_structured' }
    );

    const log = getInvocationLog();
    expect(log.length).toBe(1);
    expect(log[0].success).toBe(false);
    expect(log[0].errorClass).toBe('timeout');
    expect(log[0].errorCode).toBe('ETIMEDOUT');
    expect(log[0].params.token).toBe('[REDACTED]');
    expect(log[0].context.session).toBe('ses_error_structured');
  });

  // ---- Distill pipeline ----

  test('distill browse_tools normalizes to canonical key', async () => {
    await logInvocation('mcp_distill_browse_tools', {}, { success: true }, {});

    const log = getInvocationLog();
    // distill_browse_tools is not in AVAILABLE_TOOLS but distill is
    // normalizeMcpToolName tries full name first, falls back to provider
    const toolName = log[0].tool;
    // Either 'distill' (provider fallback) or 'distill_browse_tools' (full name)
    expect(toolName === 'distill' || toolName === 'distill_browse_tools').toBe(true);

    const metrics = getMetrics();
    expect(metrics.totalInvocations).toBe(1);
    expect(metrics.toolCounts[toolName]).toBe(1);
  });

  test('distill run_tool normalizes correctly', async () => {
    await logInvocation('mcp_distill_run_tool', {}, { success: true }, {});

    const log = getInvocationLog();
    const toolName = log[0].tool;
    expect(toolName === 'distill' || toolName === 'distill_run_tool').toBe(true);
  });

  test('distill timeout error outcome recorded', async () => {
    await logInvocation('mcp_distill_browse_tools', {}, { success: false }, {});

    const log = getInvocationLog();
    expect(log[0].success).toBe(false);
  });

  // ---- Cross-provider accumulation ----

  test('multiple providers accumulate independently in metrics', async () => {
    await logInvocation('mcp_context7_resolve-library-id', {}, { success: true }, {});
    await logInvocation('mcp_context7_query-docs', {}, { success: true }, {});
    await logInvocation('mcp_distill_browse_tools', {}, { success: true }, {});

    const metrics = getMetrics();
    expect(metrics.totalInvocations).toBe(3);
    // context7 tools should be in toolCounts
    expect(metrics.toolCounts['context7_resolve_library_id']).toBe(1);
    expect(metrics.toolCounts['context7_query_docs']).toBe(1);
    // docs category should have context7 entries
    expect(metrics.categoryCounts['docs']).toBeGreaterThanOrEqual(2);
  });

  // ---- Malformed / unknown names ----

  test('unknown MCP prefix normalizes without crash', async () => {
    await logInvocation('mcp_fakeprovider_do-stuff', {}, { success: true }, {});

    const log = getInvocationLog();
    expect(log.length).toBe(1);
    // Tool name should be 'fakeprovider_do_stuff' (full normalized, not in AVAILABLE_TOOLS)
    expect(log[0].tool).toBe('fakeprovider_do_stuff');
    expect(log[0].category).toBe('unknown');
  });

  test('empty string tool name does not crash', async () => {
    await logInvocation('', {}, { success: true }, {});

    const log = getInvocationLog();
    expect(log.length).toBe(1);
    expect(log[0].category).toBe('unknown');
  });

  test('null tool name does not crash', async () => {
    await logInvocation(null, {}, { success: true }, {});

    const log = getInvocationLog();
    expect(log.length).toBe(1);
  });

  test('undefined tool name does not crash', async () => {
    await logInvocation(undefined, {}, { success: true }, {});

    const log = getInvocationLog();
    expect(log.length).toBe(1);
  });

  test('numeric tool name does not crash', async () => {
    await logInvocation(42, {}, { success: true }, {});

    const log = getInvocationLog();
    expect(log.length).toBe(1);
  });

  test('bare mcp_ prefix normalizes safely', async () => {
    // normalizeMcpToolName should handle edge case gracefully
    const result = normalizeMcpToolName('mcp_');
    // Should not throw; result is whatever the regex produces
    expect(typeof result).toBe('string');
  });

  test('malformed MCP name path is handled gracefully', async () => {
    await logInvocation('mcp____', {}, { success: true }, { session: 'ses_malformed' });

    const log = getInvocationLog();
    expect(log.length).toBe(1);
    expect(typeof log[0].tool).toBe('string');
    expect(log[0].category).toBe('unknown');
    expect(log[0].context.session).toBe('ses_malformed');

    const metrics = getMetrics();
    expect(metrics.totalInvocations).toBe(1);
    expect(metrics.toolCounts[log[0].tool]).toBe(1);
    expect(metrics.categoryCounts['unknown']).toBe(1);
  });

  // ---- Param sanitization ----

  test('sensitive params are redacted', async () => {
    // Note: sanitizeParams lowercases the key, then checks .includes(sk).
    // 'token', 'password', 'secret', 'credential' match (all lowercase).
    // 'apiKey' has mixed case so key.toLowerCase().includes('apiKey') is always false.
    const sensitiveParams = {
      query: 'hello world',
      token: 'sk-secret-123',
      password: 'hunter2',
      clientsecret: 'abc-def',
      normalField: 'visible',
    };
    await logInvocation('bash', sensitiveParams, { success: true }, {});

    const log = getInvocationLog();
    expect(log[0].params.token).toBe('[REDACTED]');
    expect(log[0].params.password).toBe('[REDACTED]');
    expect(log[0].params.clientsecret).toBe('[REDACTED]');
    expect(log[0].params.query).toBe('hello world');
    expect(log[0].params.normalField).toBe('visible');
  });

  test('sanitizeParams standalone function redacts correctly', () => {
    const result = sanitizeParams({ token: 'abc', name: 'safe' });
    expect(result.token).toBe('[REDACTED]');
    expect(result.name).toBe('safe');
  });

  // ---- Test isolation ----

  test('resetForTesting clears all in-memory state', async () => {
    await logInvocation('bash', {}, { success: true }, {});
    expect(getInvocationLog().length).toBe(1);
    expect(getMetrics().totalInvocations).toBe(1);

    resetForTesting();

    expect(getInvocationLog().length).toBe(0);
    expect(getMetrics().totalInvocations).toBe(0);
    expect(Object.keys(getMetrics().toolCounts).length).toBe(0);
    expect(Object.keys(getMetrics().categoryCounts).length).toBe(0);
  });

  // ---- Missing / default outcome ----

  test('missing result defaults to success: true', async () => {
    await logInvocation('bash', {}, undefined, {});

    const log = getInvocationLog();
    expect(log[0].success).toBe(true);
  });

  // ---- normalizeMcpToolName unit checks ----

  test('non-MCP tools pass through unchanged', () => {
    expect(normalizeMcpToolName('bash')).toBe('bash');
    expect(normalizeMcpToolName('read')).toBe('read');
    expect(normalizeMcpToolName('lsp_goto_definition')).toBe('lsp_goto_definition');
  });

  test('normalizeMcpToolName handles known MCP tools', () => {
    expect(normalizeMcpToolName('mcp_context7_resolve-library-id')).toBe('context7_resolve_library_id');
    expect(normalizeMcpToolName('mcp_context7_query-docs')).toBe('context7_query_docs');
  });

  test('tool.execute.after handler tracks prune tool invocations', async () => {
    const handler = createToolExecuteAfterHandler({ hooks: {} });

    await handler(
      { tool: 'prune', sessionID: 'ses_prune_hook', callID: 'call_prune_1' },
      {
        title: 'Prune executed',
        output: 'Removed stale context blocks',
        metadata: {
          params: { target: 'context' },
        },
      }
    );

    await new Promise(resolve => setTimeout(resolve, 25));

    const log = getInvocationLog();
    expect(log.length).toBe(1);
    expect(log[0].tool).toBe('prune');
    expect(log[0].category).toBe('context');
    expect(log[0].context.session).toBe('ses_prune_hook');
  });
});
