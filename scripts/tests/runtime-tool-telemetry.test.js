import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const SCRIPT = join(import.meta.dir, '..', 'runtime-tool-telemetry.mjs');
let tempHome;
let invocationsFile;

beforeAll(() => {
  // Create isolated temp directory to avoid polluting real ~/.opencode
  tempHome = mkdtempSync(join(tmpdir(), 'telemetry-test-'));
  const dataDir = join(tempHome, '.opencode', 'tool-usage');
  mkdirSync(dataDir, { recursive: true });
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
});
