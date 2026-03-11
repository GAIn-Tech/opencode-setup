#!/usr/bin/env node
/**
 * runtime-tool-telemetry.mjs
 *
 * PostToolUse hook for oh-my-opencode. Receives tool invocation data on stdin
 * (JSON from the plugin's PostToolUse hook pipeline) and appends it to the
 * learning-engine's invocations.json file so the MCP → SkillRL affinity bridge
 * can observe real runtime tool usage.
 *
 * Installation:
 *   Add to ~/.claude/settings.json:
 *   {
 *     "hooks": {
 *       "PostToolUse": [{
 *         "matcher": "",
 *         "hooks": [{
 *           "type": "command",
 *           "command": "node /path/to/opencode-setup/scripts/runtime-tool-telemetry.mjs"
 *         }]
 *       }]
 *     }
 *   }
 *
 * stdin JSON shape (from oh-my-opencode executePostToolUseHooks):
 *   {
 *     "session_id": "ses_...",
 *     "tool_name": "Context7ResolveLibraryId",   // PascalCase
 *     "tool_input": { ... },
 *     "tool_response": { ... },
 *     "cwd": "/path/to/project",
 *     "hook_event_name": "PostToolUse",
 *     "hook_source": "opencode-plugin"
 *   }
 *
 * Output: silent on success (exit 0). Prints JSON decision on stdout only if needed.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

// ---- Configuration ----
const HOME = process.env.USERPROFILE || process.env.HOME || homedir();
const DATA_DIR = join(HOME, '.opencode', 'tool-usage');
const SESSIONS_DIR = join(DATA_DIR, 'sessions');
const INVOCATIONS_FILE = join(DATA_DIR, 'invocations.json');
const METRICS_HISTORY_FILE = join(HOME, '.opencode', 'metrics-history.db.events.json');
const MAX_INVOCATIONS = 1000;
const MAX_METRICS_EVENTS = 5000;
const DEFAULT_MODEL_LIMIT = 200000;

// ---- Tool catalog (mirrors AVAILABLE_TOOLS from tool-usage-tracker.js) ----
const AVAILABLE_TOOLS = {
  bash:       { category: 'execution', priority: 'critical' },
  read:       { category: 'file',      priority: 'critical' },
  write:      { category: 'file',      priority: 'critical' },
  edit:       { category: 'file',      priority: 'critical' },
  glob:       { category: 'search',    priority: 'high' },
  grep:       { category: 'search',    priority: 'high' },
  lsp_goto_definition:  { category: 'navigation', priority: 'high' },
  lsp_find_references:  { category: 'navigation', priority: 'high' },
  lsp_symbols:          { category: 'navigation', priority: 'high' },
  lsp_diagnostics:      { category: 'analysis',   priority: 'high' },
  lsp_prepare_rename:   { category: 'refactor',   priority: 'medium' },
  lsp_rename:           { category: 'refactor',   priority: 'medium' },
  ast_grep_search:      { category: 'search',     priority: 'high' },
  ast_grep_replace:     { category: 'refactor',   priority: 'high' },
  task:                 { category: 'delegation',  priority: 'critical' },
  background_output:    { category: 'delegation',  priority: 'high' },
  background_cancel:    { category: 'delegation',  priority: 'medium' },
  webfetch:              { category: 'web',     priority: 'medium' },
  websearch:             { category: 'web',     priority: 'medium' },
  codesearch:            { category: 'web',     priority: 'medium' },
  context7_resolve_library_id: { category: 'docs', priority: 'medium' },
  context7_query_docs:         { category: 'docs', priority: 'medium' },
  supermemory:           { category: 'memory',  priority: 'medium' },
  session_list:          { category: 'memory',  priority: 'low' },
  session_read:          { category: 'memory',  priority: 'low' },
  session_search:        { category: 'memory',  priority: 'low' },
  distill:               { category: 'context', priority: 'medium' },
  prune:                 { category: 'context', priority: 'medium' },
  skill:                 { category: 'skills',  priority: 'high' },
  slashcommand:          { category: 'skills',  priority: 'medium' },
  loaded_skills:         { category: 'skills',  priority: 'low' },
  look_at:               { category: 'analysis',  priority: 'medium' },
  pty_spawn:             { category: 'execution',  priority: 'medium' },
  pty_write:             { category: 'execution',  priority: 'medium' },
  pty_read:              { category: 'execution',  priority: 'medium' },
  pty_list:              { category: 'execution',  priority: 'low' },
  pty_kill:              { category: 'execution',  priority: 'low' },
  sequentialthinking_sequentialthinking: { category: 'reasoning', priority: 'medium' },
  interactive_bash:      { category: 'git',        priority: 'medium' },
  question:              { category: 'interaction', priority: 'low' },
  todowrite:             { category: 'planning',    priority: 'medium' },
  antigravity_quota:     { category: 'quota',       priority: 'medium' },
  // MCP grep-app tools
  grep_app_searchgithub: { category: 'web', priority: 'medium' },
  grep_grep_query:       { category: 'web', priority: 'medium' },
  playwright:            { category: 'web', priority: 'medium' },
  opencode_context_governor: { category: 'context', priority: 'medium' },
  // MCP websearch tools
  websearch_search:            { category: 'web', priority: 'medium' },
  websearch_crawl_and_extract: { category: 'web', priority: 'medium' },
  websearch_search_and_crawl:  { category: 'web', priority: 'medium' },
  websearch_capture_screenshot:{ category: 'web', priority: 'medium' },
  websearch_generate_pdf:      { category: 'web', priority: 'medium' },
  websearch_extract_structured:{ category: 'web', priority: 'medium' },
  websearch_execute_js:        { category: 'web', priority: 'medium' },
  websearch_extract_regex:     { category: 'web', priority: 'medium' },
  websearch_get_youtube_transcript: { category: 'web', priority: 'medium' },
  // Distill sub-tools
  distill_browse_tools:  { category: 'context', priority: 'low' },
  distill_run_tool:      { category: 'context', priority: 'medium' },
  // Agent tools
  call_omo_agent:        { category: 'delegation', priority: 'high' },
  // Supermemory sub-tools
  supermemory_memory:    { category: 'memory', priority: 'medium' },
  supermemory_recall:    { category: 'memory', priority: 'medium' },
  supermemory_add:       { category: 'memory', priority: 'medium' },
  supermemory_search:    { category: 'memory', priority: 'medium' },
  supermemory_list:      { category: 'memory', priority: 'low' },
  supermemory_profile:   { category: 'memory', priority: 'low' },
  supermemory_forget:    { category: 'memory', priority: 'low' },
  supermemory_listprojects: { category: 'memory', priority: 'low' },
  supermemory_whoami:    { category: 'memory', priority: 'low' },
  supermemory_memory_graph: { category: 'memory', priority: 'low' },
  supermemory_fetch_graph_data: { category: 'memory', priority: 'low' },
  // Session tools
  session_info:          { category: 'memory', priority: 'low' },
  // Google search
  google_search:         { category: 'web', priority: 'medium' },
};

// ---- PascalCase → snake_case reverse mapping ----

/**
 * Special reverse mappings that can't be derived mechanically.
 */
const REVERSE_SPECIAL = {
  'WebFetch':   'webfetch',
  'WebSearch':  'websearch',
  'TodoRead':   'todoread',
  'TodoWrite':  'todowrite',
  'CodeSearch': 'codesearch',
  'LookAt':     'look_at',
  'GrepAppSearchGitHub': 'grep_app_searchgithub',
};

const SUPERMEMORY_MODE_TO_TOOL = {
  add: 'supermemory_add',
  search: 'supermemory_search',
  list: 'supermemory_list',
  profile: 'supermemory_profile',
  forget: 'supermemory_forget',
};

/**
 * Convert PascalCase tool name (from oh-my-opencode transformToolName) back to
 * the snake_case key used by AVAILABLE_TOOLS.
 *
 * Examples:
 *   'Bash' → 'bash'
 *   'Read' → 'read'
 *   'Context7ResolveLibraryId' → 'context7_resolve_library_id'
 *   'AstGrepSearch' → 'ast_grep_search'
 *   'LspGotoDefinition' → 'lsp_goto_definition'
 *   'SequentialthinkingSequentialthinking' → 'sequentialthinking_sequentialthinking'
 *   'WebFetch' → 'webfetch' (special)
 */
function pascalToSnake(name) {
  if (!name || typeof name !== 'string') return name;

  // Check special reverse mappings first
  if (REVERSE_SPECIAL[name]) return REVERSE_SPECIAL[name];

  // General case: insert underscore before each uppercase letter that follows
  // a lowercase letter or digit, then lowercase everything
  const snake = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();

  // Check if the snake_case result exists in AVAILABLE_TOOLS
  if (AVAILABLE_TOOLS[snake]) return snake;

  // Try without the regex that splits consecutive caps (e.g., 'LSP' → 'l_s_p')
  // Instead, treat runs of caps as a single token
  const snake2 = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
  if (AVAILABLE_TOOLS[snake2]) return snake2;

  // Fallback: just lowercase the whole thing
  const lower = name.toLowerCase();
  if (AVAILABLE_TOOLS[lower]) return lower;

  return snake;
}

function normalizeRuntimeFragment(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  return trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function resolveWrappedMcpToolName(toolInput) {
  const provider = normalizeRuntimeFragment(toolInput?.mcp_name);
  if (!provider) return 'skill_mcp';

  if (provider === 'supermemory') {
    const mode = typeof toolInput?.arguments?.mode === 'string'
      ? toolInput.arguments.mode.trim().toLowerCase()
      : '';
    return SUPERMEMORY_MODE_TO_TOOL[mode] || provider;
  }

  const action = normalizeRuntimeFragment(
    toolInput?.tool_name || toolInput?.resource_name || toolInput?.prompt_name
  );
  const combined = action ? `${provider}_${action}` : provider;

  if (combined && AVAILABLE_TOOLS[combined]) return combined;
  if (AVAILABLE_TOOLS[provider]) return provider;
  return combined || provider;
}

function resolveRuntimeToolName(pascalName, toolInput) {
  const baseTool = pascalToSnake(pascalName);
  if (baseTool === 'skill_mcp') {
    return resolveWrappedMcpToolName(toolInput);
  }
  if (baseTool === 'supermemory') {
    const mode = typeof toolInput?.mode === 'string' ? toolInput.mode.trim().toLowerCase() : '';
    return SUPERMEMORY_MODE_TO_TOOL[mode] || baseTool;
  }
  return baseTool;
}

// ---- Read stdin ----

function readStdin() {
  try {
    return readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

// ---- Atomic JSON file update ----

function readJsonSync(filePath, defaultValue = {}) {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

function writeJsonAtomicSync(filePath, data) {
  const json = JSON.stringify(data, null, 2);
  const tmp = filePath + '.tmp';
  try {
    writeFileSync(tmp, json, 'utf8');
    try {
      renameSync(tmp, filePath);
    } catch {
      // Windows: rename over existing can EPERM; fall back to direct write
      writeFileSync(filePath, json, 'utf8');
      try { unlinkSync(tmp); } catch { /* best-effort */ }
    }
  } catch (err) {
    // Last resort: direct write
    writeFileSync(filePath, json, 'utf8');
  }
}

function stringifyLength(value) {
  try {
    return JSON.stringify(value === undefined ? {} : value).length;
  } catch {
    return String(value ?? '').length;
  }
}

function estimateTokens(toolInput, toolResponse) {
  const inputLength = stringifyLength(toolInput);
  const responseLength = stringifyLength(toolResponse);
  return Math.ceil((inputLength + responseLength) / 4);
}

function truncateOneLine(text, max = 120) {
  const singleLine = String(text ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (singleLine.length <= max) return singleLine;
  return singleLine.slice(0, max - 3) + '...';
}

function stringifyForSnippet(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value || {});
  } catch {
    return String(value ?? '');
  }
}

function formatTokenK(tokens) {
  return `${Math.round(tokens / 1000)}k`;
}

function getSessionBudgetFile(sessionId) {
  const safeSessionId = sessionId || `unknown-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return join(SESSIONS_DIR, `${safeSessionId}-budget.json`);
}

function getDefaultSessionBudget(sessionId) {
  return {
    session_id: sessionId || `unknown-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    cumulative_chars: 0,
    estimated_tokens: 0,
    model_limit: DEFAULT_MODEL_LIMIT,
    warnings_emitted: [],
    distill_events: [],
    last_updated: new Date().toISOString(),
  };
}

function loadSessionBudgetState(sessionId) {
  const stateFile = getSessionBudgetFile(sessionId);
  const defaults = getDefaultSessionBudget(sessionId);
  const state = readJsonSync(stateFile, defaults);

  state.session_id = state.session_id || defaults.session_id;
  state.cumulative_chars = Number(state.cumulative_chars) || 0;
  state.estimated_tokens = Number(state.estimated_tokens) || 0;
  state.model_limit = Number(state.model_limit) || DEFAULT_MODEL_LIMIT;
  state.warnings_emitted = Array.isArray(state.warnings_emitted) ? state.warnings_emitted : [];
  state.distill_events = Array.isArray(state.distill_events) ? state.distill_events : [];
  state.last_updated = state.last_updated || defaults.last_updated;

  return { state, stateFile };
}

function appendMetricsHistory(kind, event) {
  const dir = dirname(METRICS_HISTORY_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const data = readJsonSync(METRICS_HISTORY_FILE, []);
  const history = Array.isArray(data) ? data : [];
  history.push({ kind, event });

  if (history.length > MAX_METRICS_EVENTS) {
    history.splice(0, history.length - MAX_METRICS_EVENTS);
  }

  writeJsonAtomicSync(METRICS_HISTORY_FILE, history);
}

function emitBudgetWarnings(state) {
  const percent = Math.round((state.estimated_tokens / state.model_limit) * 100);
  const thresholds = [50, 65, 80];
  for (const threshold of thresholds) {
    const key = String(threshold);
    if (percent < threshold || state.warnings_emitted.includes(key)) continue;

    if (threshold === 50) {
      process.stderr.write(
        `[context] ~${percent}% budget used (~${formatTokenK(state.estimated_tokens)}/${formatTokenK(state.model_limit)} tokens)\n`
      );
    } else if (threshold === 65) {
      process.stderr.write(`[context] ~${percent}% budget used - compression recommended (run distill)\n`);
    } else {
      process.stderr.write(`[context] ~${percent}% budget used - CRITICAL: compress or wrap up\n`);
    }

    state.warnings_emitted.push(key);
  }
}

function findNumericMetric(value, keys) {
  const targetKeys = new Set(keys.map((key) => key.toLowerCase()));
  const queue = [value];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    for (const [rawKey, rawVal] of Object.entries(current)) {
      const key = rawKey.toLowerCase();
      if (targetKeys.has(key)) {
        const num = Number(rawVal);
        if (Number.isFinite(num)) return num;
      }
      if (rawVal && typeof rawVal === 'object') queue.push(rawVal);
    }
  }

  return null;
}

function findDistillPipelines(response) {
  const out = [];
  const seen = new Set();
  const queue = [response];

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    if (typeof current !== 'object') continue;

    if (typeof current.name === 'string') {
      const name = current.name.trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }

    if (typeof current.id === 'string') {
      const id = current.id.trim();
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === 'object') queue.push(value);
    }
  }

  return out;
}

function captureDistillMetrics(toolName, toolResponse, state) {
  if (toolName !== 'distill_run_tool' && toolName !== 'distill_browse_tools') {
    return;
  }

  let summary;

  if (toolName === 'distill_browse_tools') {
    const pipelines = findDistillPipelines(toolResponse).slice(0, 6);
    const list = pipelines.length ? pipelines.join(', ') : 'none reported';
    summary = `[distill] available pipelines: ${list}`;
  } else {
    const before = findNumericMetric(toolResponse, ['tokens_before', 'token_before', 'before_tokens']);
    const after = findNumericMetric(toolResponse, ['tokens_after', 'token_after', 'after_tokens']);
    let savings = findNumericMetric(toolResponse, ['savings', 'token_savings', 'savings_percent']);
    let ratio = findNumericMetric(toolResponse, ['ratio', 'compression_ratio']);

    if (savings === null && before !== null && after !== null && before > 0) {
      savings = ((before - after) / before) * 100;
    }
    if (ratio !== null && ratio > 0 && ratio <= 1) {
      ratio = ratio * 100;
    }

    if (before !== null && after !== null) {
      const percentSavings = savings !== null ? Math.round(savings) : (ratio !== null ? Math.round(100 - ratio) : null);
      const savingsText = percentSavings !== null ? `${percentSavings}% savings` : 'savings unknown';
      summary = `[distill] compressed: ${Math.round(before)} -> ${Math.round(after)} tokens (${savingsText})`;
    } else {
      summary = '[distill] compression complete';
    }
  }

  const line = truncateOneLine(summary, 120);
  process.stderr.write(`${line}\n`);

  state.distill_events.push({
    timestamp: new Date().toISOString(),
    tool: toolName,
    response_snippet: truncateOneLine(stringifyForSnippet(toolResponse), 120),
  });
}

function getArrayLength(value) {
  if (Array.isArray(value)) return value.length;
  return null;
}

function findFirstString(value, keys) {
  const targetKeys = new Set(keys.map((key) => key.toLowerCase()));
  const queue = [value];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    for (const [rawKey, rawVal] of Object.entries(current)) {
      const key = rawKey.toLowerCase();
      if (targetKeys.has(key) && typeof rawVal === 'string' && rawVal.trim()) {
        return rawVal.trim();
      }
      if (rawVal && typeof rawVal === 'object') queue.push(rawVal);
    }
  }

  return '';
}

function findSnippetCount(value) {
  const direct = findNumericMetric(value, ['snippet_count', 'snippetcount', 'snippets_count']);
  if (direct !== null) return direct;

  const queue = [value];
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    for (const [rawKey, rawVal] of Object.entries(current)) {
      const key = rawKey.toLowerCase();
      if ((key === 'snippets' || key === 'results' || key === 'examples') && Array.isArray(rawVal)) {
        return rawVal.length;
      }
      if (rawVal && typeof rawVal === 'object') queue.push(rawVal);
    }
  }

  return 0;
}

function hasFailureSignal(value) {
  const queue = [value];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    for (const [rawKey, rawVal] of Object.entries(current)) {
      const key = rawKey.toLowerCase();
      if ((key === 'error' || key === 'errors' || key === 'failed' || key === 'success' || key === 'resolved') && typeof rawVal !== 'object') {
        if (key === 'success' || key === 'resolved') {
          if (rawVal === false || rawVal === 'false') return true;
        } else if (key === 'failed') {
          if (rawVal === true || rawVal === 'true') return true;
        } else if (key === 'error' || key === 'errors') {
          if (typeof rawVal === 'string' && rawVal.trim()) return true;
          if (Array.isArray(rawVal) && rawVal.length > 0) return true;
        }
      }

      if (rawVal && typeof rawVal === 'object') queue.push(rawVal);
    }
  }

  return false;
}

function captureMonitoringMetrics(toolName, toolInput, toolResponse) {
  if (toolName === 'distill_run_tool') {
    const tokensBefore = findNumericMetric(toolResponse, ['tokens_before', 'token_before', 'before_tokens']);
    const tokensAfter = findNumericMetric(toolResponse, ['tokens_after', 'token_after', 'after_tokens']);
    if (tokensBefore !== null && tokensAfter !== null) {
      appendMetricsHistory('compression', {
        sessionId: findFirstString(toolInput, ['session_id']) || 'runtime-hook',
        tokensBefore: Math.round(tokensBefore),
        tokensAfter: Math.round(tokensAfter),
        tokensSaved: Math.max(0, Math.round(tokensBefore) - Math.round(tokensAfter)),
        ratio: tokensBefore > 0 ? Number((tokensAfter / tokensBefore).toFixed(4)) : 1,
        pipeline: findFirstString(toolInput, ['pipeline', 'tool', 'name']) || 'distill',
        durationMs: findNumericMetric(toolResponse, ['duration_ms', 'duration', 'elapsed_ms']) || 0,
        timestamp: Date.now(),
      });
    }
    return;
  }

  if (toolName === 'context7_query_docs' || toolName === 'context7_resolve_library_id') {
    const libraryName =
      findFirstString(toolInput, ['libraryid', 'libraryname']) ||
      findFirstString(toolResponse, ['libraryid', 'libraryname', 'id', 'name']);
    const snippetCount = findSnippetCount(toolResponse);
    const resolved = !hasFailureSignal(toolResponse);

    appendMetricsHistory('context7', {
      libraryName: libraryName || 'unknown',
      resolved,
      snippetCount,
      durationMs: findNumericMetric(toolResponse, ['duration_ms', 'duration', 'elapsed_ms']) || 0,
      timestamp: Date.now(),
    });
  }
}

// ---- Main ----

function main() {
  const raw = readStdin();
  if (!raw.trim()) {
    process.exit(0);
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    // Invalid JSON — nothing to do
    process.exit(0);
  }

  const rawSessionId = typeof input.session_id === 'string' ? input.session_id.trim() : '';
  const sessionId = rawSessionId || `unknown-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!rawSessionId) {
    process.stderr.write('warning: missing or invalid session_id; using isolated fallback session id\n');
  }
  const pascalToolName = input.tool_name;
  if (!pascalToolName) {
    process.exit(0);
  }

  // Reverse-map PascalCase → snake_case
  const toolName = resolveRuntimeToolName(pascalToolName, input.tool_input);
  const toolInfo = AVAILABLE_TOOLS[toolName] || { category: 'unknown', priority: 'unknown' };

  // Build invocation record (same shape as logInvocation in tool-usage-tracker.js)
  const invocation = {
    timestamp: new Date().toISOString(),
    tool: toolName,
    category: toolInfo.category,
    priority: toolInfo.priority,
    params: {},  // PostToolUse hook doesn't reliably pass full params
    success: true,  // If the hook fires, the tool succeeded
    context: {
      session: sessionId,
      task: null,
      messageCount: 0,
      source: 'runtime-hook',
    },
  };

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }

  // Read-modify-write invocations file
  const data = readJsonSync(INVOCATIONS_FILE, { invocations: [] });
  data.invocations.push(invocation);

  // Keep last N invocations
  if (data.invocations.length > MAX_INVOCATIONS) {
    data.invocations = data.invocations.slice(-MAX_INVOCATIONS);
  }

  writeJsonAtomicSync(INVOCATIONS_FILE, data);

  const { state, stateFile } = loadSessionBudgetState(sessionId);
  const callChars = stringifyLength(input.tool_input) + stringifyLength(input.tool_response);
  const callTokens = estimateTokens(input.tool_input, input.tool_response);

  state.cumulative_chars += callChars;
  state.estimated_tokens += callTokens;
  emitBudgetWarnings(state);
  captureDistillMetrics(toolName, input.tool_response, state);
  captureMonitoringMetrics(toolName, input.tool_input, input.tool_response);
  state.last_updated = new Date().toISOString();

  writeJsonAtomicSync(stateFile, state);

  // Exit cleanly — no stdout means "allow" decision
  process.exit(0);
}

main();
