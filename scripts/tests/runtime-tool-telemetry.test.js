import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { PipelineMetricsCollector } from '../../packages/opencode-model-manager/src/monitoring/metrics-collector.js';

const SCRIPT = join(import.meta.dir, '..', 'runtime-tool-telemetry.mjs');
let tempHome;
let invocationsFile;

beforeAll(() => {
  // Create isolated temp directory to avoid polluting real ~/.opencode
  tempHome = mkdtempSync(join(tmpdir(), 'telemetry-test-'));
  const dataDir = join(tempHome, '.opencode', 'tool-usage');
  mkdirSync(dataDir, { recursive: true });
  const sessionsDir = join(dataDir, 'sessions');
  mkdirSync(sessionsDir, { recursive: true });
  invocationsFile = join(dataDir, 'invocations.json');
  // Seed with empty invocations
  writeFileSync(invocationsFile, JSON.stringify({ invocations: [] }, null, 2));
});

afterAll(() => {
  // Clean up
  try { rmSync(tempHome, { recursive: true, force: true }); } catch { /* best-effort */ }
});

function runHook(stdinData) {
  const result = spawnSync('node', [SCRIPT], {
    input: typeof stdinData === 'string' ? stdinData : JSON.stringify(stdinData),
    env: { ...process.env, USERPROFILE: tempHome, HOME: tempHome },
    timeout: 5000,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout?.toString() || '',
    stderr: result.stderr?.toString() || '',
  };
}

function readInvocations() {
  return JSON.parse(readFileSync(invocationsFile, 'utf8')).invocations;
}

function readSessionBudget(sessionId) {
  const dataDir = join(tempHome, '.opencode', 'tool-usage');
  const budgetFile = join(dataDir, 'sessions', `${sessionId}-budget.json`);
  if (!existsSync(budgetFile)) {
    return null;
  }
  return JSON.parse(readFileSync(budgetFile, 'utf8'));
}

function getMetricsDbPath() {
  return join(tempHome, '.opencode', 'metrics-history.db');
}

describe('runtime-tool-telemetry PostToolUse hook', () => {
  test('exits 0 on empty stdin', () => {
    const { exitCode } = runHook('');
    expect(exitCode).toBe(0);
  });

  test('exits 0 on invalid JSON', () => {
    const { exitCode } = runHook('not-json');
    expect(exitCode).toBe(0);
  });

  test('exits 0 on missing tool_name', () => {
    const { exitCode } = runHook({ session_id: 'ses_test' });
    expect(exitCode).toBe(0);
  });

  test('appends invocation for PascalCase tool name', () => {
    const before = readInvocations().length;
    const { exitCode } = runHook({
      session_id: 'ses_pascal_test',
      tool_name: 'Context7ResolveLibraryId',
    });
    expect(exitCode).toBe(0);
    const inv = readInvocations();
    expect(inv.length).toBe(before + 1);
    const last = inv[inv.length - 1];
    expect(last.tool).toBe('context7_resolve_library_id');
    expect(last.category).toBe('docs');
    expect(last.context.session).toBe('ses_pascal_test');
    expect(last.context.source).toBe('runtime-hook');
  });

  test('maps simple tool names correctly', () => {
    const before = readInvocations().length;
    runHook({ session_id: 'ses_simple', tool_name: 'Bash' });
    runHook({ session_id: 'ses_simple', tool_name: 'Read' });
    runHook({ session_id: 'ses_simple', tool_name: 'Write' });
    const inv = readInvocations();
    expect(inv.length).toBe(before + 3);
    expect(inv[inv.length - 3].tool).toBe('bash');
    expect(inv[inv.length - 3].category).toBe('execution');
    expect(inv[inv.length - 2].tool).toBe('read');
    expect(inv[inv.length - 2].category).toBe('file');
    expect(inv[inv.length - 1].tool).toBe('write');
    expect(inv[inv.length - 1].category).toBe('file');
  });

  test('maps special tool names correctly', () => {
    const before = readInvocations().length;
    runHook({ session_id: 'ses_special', tool_name: 'WebFetch' });
    runHook({ session_id: 'ses_special', tool_name: 'WebSearch' });
    runHook({ session_id: 'ses_special', tool_name: 'TodoWrite' });
    const inv = readInvocations();
    expect(inv.length).toBe(before + 3);
    expect(inv[inv.length - 3].tool).toBe('webfetch');
    expect(inv[inv.length - 3].category).toBe('web');
    expect(inv[inv.length - 2].tool).toBe('websearch');
    expect(inv[inv.length - 2].category).toBe('web');
    expect(inv[inv.length - 1].tool).toBe('todowrite');
    expect(inv[inv.length - 1].category).toBe('planning');
  });

  test('maps compound tool names correctly', () => {
    const before = readInvocations().length;
    runHook({ session_id: 'ses_compound', tool_name: 'AstGrepSearch' });
    runHook({ session_id: 'ses_compound', tool_name: 'LspGotoDefinition' });
    runHook({ session_id: 'ses_compound', tool_name: 'SequentialthinkingSequentialthinking' });
    const inv = readInvocations();
    expect(inv.length).toBe(before + 3);
    expect(inv[inv.length - 3].tool).toBe('ast_grep_search');
    expect(inv[inv.length - 3].category).toBe('search');
    expect(inv[inv.length - 2].tool).toBe('lsp_goto_definition');
    expect(inv[inv.length - 2].category).toBe('navigation');
    expect(inv[inv.length - 1].tool).toBe('sequentialthinking_sequentialthinking');
    expect(inv[inv.length - 1].category).toBe('reasoning');
  });

  test('maps MCP-category tools (docs, context, memory, web)', () => {
    const before = readInvocations().length;
    runHook({ session_id: 'ses_mcp', tool_name: 'Supermemory' });
    runHook({ session_id: 'ses_mcp', tool_name: 'Context7QueryDocs' });
    runHook({ session_id: 'ses_mcp', tool_name: 'Distill' });
    const inv = readInvocations();
    expect(inv.length).toBe(before + 3);
    expect(inv[inv.length - 3].tool).toBe('supermemory');
    expect(inv[inv.length - 3].category).toBe('memory');
    expect(inv[inv.length - 2].tool).toBe('context7_query_docs');
    expect(inv[inv.length - 2].category).toBe('docs');
    expect(inv[inv.length - 1].tool).toBe('distill');
    expect(inv[inv.length - 1].category).toBe('context');
  });

  test('produces silent stdout (no JSON response = allow decision)', () => {
    const { exitCode, stdout } = runHook({
      session_id: 'ses_silent',
      tool_name: 'Bash',
    });
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('');
  });

  test('records invocation shape matching logInvocation format', () => {
    const before = readInvocations().length;
    runHook({ session_id: 'ses_shape', tool_name: 'Glob' });
    const inv = readInvocations();
    const last = inv[inv.length - 1];
    // Verify all required fields from logInvocation shape
    expect(last).toHaveProperty('timestamp');
    expect(last).toHaveProperty('tool');
    expect(last).toHaveProperty('category');
    expect(last).toHaveProperty('priority');
    expect(last).toHaveProperty('params');
    expect(last).toHaveProperty('success');
    expect(last).toHaveProperty('context');
    expect(last.context).toHaveProperty('session');
    expect(last.context).toHaveProperty('task');
    expect(last.context).toHaveProperty('messageCount');
    expect(last.context).toHaveProperty('source');
    expect(typeof last.timestamp).toBe('string');
    expect(last.success).toBe(true);
  });

  test('creates session budget state file after tool call', () => {
    const sessionId = 'ses_budget_create';
    runHook({
      session_id: sessionId,
      tool_name: 'Bash',
      tool_input: { command: 'echo test' },
      tool_response: { stdout: 'test' },
    });
    const budget = readSessionBudget(sessionId);
    expect(budget).not.toBeNull();
    expect(budget.session_id).toBe(sessionId);
    expect(budget).toHaveProperty('cumulative_chars');
    expect(budget).toHaveProperty('estimated_tokens');
    expect(budget).toHaveProperty('model_limit');
    expect(budget).toHaveProperty('warnings_emitted');
    expect(budget).toHaveProperty('distill_events');
    expect(budget).toHaveProperty('last_updated');
    expect(budget.estimated_tokens).toBeGreaterThan(0);
  });

  test('accumulates token estimates across calls', () => {
    const sessionId = 'ses_budget_accumulate';
    const call1 = {
      session_id: sessionId,
      tool_name: 'Read',
      tool_input: { filePath: '/test/file.js' },
      tool_response: { content: 'x'.repeat(100) },
    };
    const call2 = {
      session_id: sessionId,
      tool_name: 'Read',
      tool_input: { filePath: '/test/file2.js' },
      tool_response: { content: 'y'.repeat(100) },
    };
    const call3 = {
      session_id: sessionId,
      tool_name: 'Read',
      tool_input: { filePath: '/test/file3.js' },
      tool_response: { content: 'z'.repeat(100) },
    };
    runHook(call1);
    const budget1 = readSessionBudget(sessionId);
    const tokens1 = budget1.estimated_tokens;
    runHook(call2);
    const budget2 = readSessionBudget(sessionId);
    const tokens2 = budget2.estimated_tokens;
    runHook(call3);
    const budget3 = readSessionBudget(sessionId);
    const tokens3 = budget3.estimated_tokens;
    expect(tokens2).toBeGreaterThan(tokens1);
    expect(tokens3).toBeGreaterThan(tokens2);
  });

  test('emits 50% budget warning to stderr', () => {
    const sessionId = 'ses_budget_50pct';
    const dataDir = join(tempHome, '.opencode', 'tool-usage');
    const sessionsDir = join(dataDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    const budgetFile = join(sessionsDir, `${sessionId}-budget.json`);
    const preseededBudget = {
      session_id: sessionId,
      cumulative_chars: 100000,
      estimated_tokens: 100000,
      model_limit: 200000,
      warnings_emitted: [],
      distill_events: [],
      last_updated: new Date().toISOString(),
    };
    writeFileSync(budgetFile, JSON.stringify(preseededBudget, null, 2));
    const { stderr } = runHook({
      session_id: sessionId,
      tool_name: 'Bash',
      tool_input: { command: 'test' },
      tool_response: { stdout: 'x'.repeat(100) },
    });
    expect(stderr).toContain('[context]');
    expect(stderr).toContain('budget used');
  });

  test('emits 65% compression recommended warning', () => {
    const sessionId = 'ses_budget_65pct';
    const dataDir = join(tempHome, '.opencode', 'tool-usage');
    const sessionsDir = join(dataDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    const budgetFile = join(sessionsDir, `${sessionId}-budget.json`);
    const preseededBudget = {
      session_id: sessionId,
      cumulative_chars: 130000,
      estimated_tokens: 130000,
      model_limit: 200000,
      warnings_emitted: ['50'],
      distill_events: [],
      last_updated: new Date().toISOString(),
    };
    writeFileSync(budgetFile, JSON.stringify(preseededBudget, null, 2));
    const { stderr } = runHook({
      session_id: sessionId,
      tool_name: 'Bash',
      tool_input: { command: 'test' },
      tool_response: { stdout: 'x'.repeat(100) },
    });
    expect(stderr).toContain('compression recommended');
  });

  test('emits 80% critical warning', () => {
    const sessionId = 'ses_budget_80pct';
    const dataDir = join(tempHome, '.opencode', 'tool-usage');
    const sessionsDir = join(dataDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    const budgetFile = join(sessionsDir, `${sessionId}-budget.json`);
    const preseededBudget = {
      session_id: sessionId,
      cumulative_chars: 160000,
      estimated_tokens: 160000,
      model_limit: 200000,
      warnings_emitted: ['50', '65'],
      distill_events: [],
      last_updated: new Date().toISOString(),
    };
    writeFileSync(budgetFile, JSON.stringify(preseededBudget, null, 2));
    const { stderr } = runHook({
      session_id: sessionId,
      tool_name: 'Bash',
      tool_input: { command: 'test' },
      tool_response: { stdout: 'x'.repeat(100) },
    });
    expect(stderr).toContain('CRITICAL');
  });

  test('does not emit warnings below 50%', () => {
    const sessionId = 'ses_budget_low';
    const { stderr } = runHook({
      session_id: sessionId,
      tool_name: 'Bash',
      tool_input: { command: 'test' },
      tool_response: { stdout: 'x'.repeat(10) },
    });
    expect(stderr).not.toContain('[context]');
    expect(stderr).not.toContain('budget used');
  });

  test('does not re-emit already emitted warnings', () => {
    const sessionId = 'ses_budget_no_reemit';
    const dataDir = join(tempHome, '.opencode', 'tool-usage');
    const sessionsDir = join(dataDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    const budgetFile = join(sessionsDir, `${sessionId}-budget.json`);
    const preseededBudget = {
      session_id: sessionId,
      cumulative_chars: 110000,
      estimated_tokens: 110000,
      model_limit: 200000,
      warnings_emitted: ['50'],
      distill_events: [],
      last_updated: new Date().toISOString(),
    };
    writeFileSync(budgetFile, JSON.stringify(preseededBudget, null, 2));
    const { stderr } = runHook({
      session_id: sessionId,
      tool_name: 'Bash',
      tool_input: { command: 'test' },
      tool_response: { stdout: 'x'.repeat(100) },
    });
    expect(stderr).not.toContain('[context]');
  });

  test('captures distill_run_tool compression metrics', () => {
    const sessionId = 'ses_distill_run';
    const { stderr } = runHook({
      session_id: sessionId,
      tool_name: 'DistillRunTool',
      tool_input: { pipeline: 'compress' },
      tool_response: {
        tokens_before: 5000,
        tokens_after: 2500,
        savings: 50,
      },
    });
    expect(stderr).toContain('[distill]');
    expect(stderr).toContain('compressed:');
  });

  test('captures distill_browse_tools pipeline list', () => {
    const sessionId = 'ses_distill_browse';
    const { stderr } = runHook({
      session_id: sessionId,
      tool_name: 'DistillBrowseTools',
      tool_input: {},
      tool_response: {
        pipelines: [
          { name: 'compress', description: 'Compress context' },
          { name: 'summarize', description: 'Summarize' },
        ],
      },
    });
    expect(stderr).toContain('[distill]');
    expect(stderr).toContain('available pipelines:');
  });

  test('appends distill events to budget state', () => {
    const sessionId = 'ses_distill_events';
    runHook({
      session_id: sessionId,
      tool_name: 'DistillRunTool',
      tool_input: { pipeline: 'compress' },
      tool_response: {
        tokens_before: 3000,
        tokens_after: 1500,
      },
    });
    const budget = readSessionBudget(sessionId);
    expect(budget.distill_events).not.toBeNull();
    expect(Array.isArray(budget.distill_events)).toBe(true);
    expect(budget.distill_events.length).toBeGreaterThan(0);
    const event = budget.distill_events[0];
    expect(event).toHaveProperty('timestamp');
    expect(event).toHaveProperty('tool');
    expect(event.tool).toBe('distill_run_tool');
    expect(event).toHaveProperty('response_snippet');
  });

  test('writes distill runtime events into shared monitoring history', () => {
    const sessionId = 'ses_distill_monitoring';
    runHook({
      session_id: sessionId,
      tool_name: 'DistillRunTool',
      tool_input: { pipeline: 'compress' },
      tool_response: {
        tokens_before: 2400,
        tokens_after: 600,
        duration_ms: 18,
      },
    });

    const collector = new PipelineMetricsCollector({
      autoCleanup: false,
      dbPath: getMetricsDbPath(),
    });
    const stats = collector.getCompressionStats();
    collector.close();

    expect(stats.totalEvents).toBeGreaterThan(0);
    expect(stats.totalTokensSaved).toBeGreaterThan(0);
  });

  test('writes Context7 runtime events into shared monitoring history', () => {
    const sessionId = 'ses_context7_monitoring';
    runHook({
      session_id: sessionId,
      tool_name: 'Context7QueryDocs',
      tool_input: {
        libraryId: '/vercel/next.js',
        query: 'app router route handlers'
      },
      tool_response: {
        snippets: [
          { code: 'export async function GET() {}' },
          { code: 'export async function POST() {}' }
        ]
      },
    });

    const collector = new PipelineMetricsCollector({
      autoCleanup: false,
      dbPath: getMetricsDbPath(),
    });
    const stats = collector.getContext7Stats();
    collector.close();

    expect(stats.totalLookups).toBeGreaterThan(0);
    expect(stats.resolved).toBeGreaterThan(0);
    expect(stats.librariesQueried).toContain('/vercel/next.js');
  });

  test('records failed Context7 lookups when docs query returns an error', () => {
    const sessionId = 'ses_context7_failed';
    const beforeCollector = new PipelineMetricsCollector({
      autoCleanup: false,
      dbPath: getMetricsDbPath(),
    });
    const beforeStats = beforeCollector.getContext7Stats();
    beforeCollector.close();

    runHook({
      session_id: sessionId,
      tool_name: 'Context7QueryDocs',
      tool_input: {
        libraryId: '/missing/library',
        query: 'unknown api',
      },
      tool_response: {
        error: 'Library not found',
      },
    });

    const collector = new PipelineMetricsCollector({
      autoCleanup: false,
      dbPath: getMetricsDbPath(),
    });
    const stats = collector.getContext7Stats();
    collector.close();

    expect(stats.failed).toBeGreaterThan(beforeStats.failed);
    expect(stats.resolved).toBe(beforeStats.resolved);
    expect(stats.librariesQueried).toContain('/missing/library');
  });
});
