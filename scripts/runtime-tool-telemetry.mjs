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
const DELEGATION_LOG_FILE = join(HOME, '.opencode', 'delegation-log.json');
const PKG_EVENTS_FILE = join(HOME, '.opencode', 'package-execution', 'events.json');
const MODEL_SELECTION_FILE = join(DATA_DIR, 'sessions', '~-model-selection.json');
const MODEL_ROUTER_OUTCOMES_FILE = join(HOME, '.opencode', 'model-router-runtime-outcomes.json');
const MAX_INVOCATIONS = 5000;
const MAX_METRICS_EVENTS = 5000;
const MAX_DELEGATION_EVENTS = 2000;
const MAX_PKG_EVENTS = 5000;
const MAX_MODEL_SELECTION_EVENTS = 5000;
const MAX_MODEL_ROUTER_OUTCOMES = 5000;
const DEFAULT_MODEL_LIMIT = 200000;
const LOCK_MAX_RETRIES = 10;
const LOCK_RETRY_DELAY_MS = 5;
const WINDOWS_RENAME_RETRIES = 3;
const WINDOWS_RENAME_RETRY_DELAY_MS = 10;

// ---- Category/Agent → Model lookup (mirrors opencode-config/oh-my-opencode.json) ----
// Updated from opencode-config/oh-my-opencode.json categories and agents sections.
// These are the actual models assigned by oh-my-opencode for each category/agent.
const CATEGORY_TO_MODEL = {
  'visual-engineering':  { modelId: 'antigravity-gemini-3-pro',   provider: 'google' },
  'ultrabrain':          { modelId: 'gpt-5.3-codex',              provider: 'openai' },
  'deep':                { modelId: 'gpt-5.3-codex',              provider: 'openai' },
  'artistry':            { modelId: 'antigravity-gemini-3-pro',   provider: 'google' },
  'quick':               { modelId: 'claude-haiku-4-5',           provider: 'anthropic' },
  'unspecified-low':     { modelId: 'claude-sonnet-4-5',          provider: 'anthropic' },
  'unspecified-high':    { modelId: 'claude-opus-4-6',            provider: 'anthropic' },
  'writing':             { modelId: 'antigravity-gemini-3-flash', provider: 'google' },
};

const AGENT_TO_MODEL = {
  'atlas':               { modelId: 'claude-sonnet-4-5',          provider: 'anthropic' },
  'hephaestus':          { modelId: 'gpt-5.3-codex',              provider: 'openai' },
  'librarian':           { modelId: 'claude-sonnet-4-5',          provider: 'anthropic' },
  'metis':               { modelId: 'claude-opus-4-6',            provider: 'anthropic' },
  'momus':               { modelId: 'gpt-5.2',                    provider: 'openai' },
  'oracle':              { modelId: 'gpt-5.2',                    provider: 'openai' },
  'prometheus':          { modelId: 'claude-opus-4-6',            provider: 'anthropic' },
  'sisyphus':            { modelId: 'claude-opus-4-6',            provider: 'anthropic' },
  'explore':             { modelId: 'claude-haiku-4-5',           provider: 'anthropic' },
  'multimodal-looker':   { modelId: 'antigravity-gemini-3-flash', provider: 'google' },
};

// ---- Per-Model Pricing (avg of input+output cost per 1K tokens) ----
// Source: packages/opencode-model-router-x/src/strategies/token-cost-calculator.js
const MODEL_PRICING = {
  'claude-opus-4-6':     15.0,    // ($5 in + $25 out) / 2
  'claude-sonnet-4-5':    9.0,    // ($3 in + $15 out) / 2
  'claude-haiku-4-5':     3.0,    // ($1 in + $5 out) / 2
  'gemini-3-pro':         6.0,    // ($2 in + $10 out) / 2
  'gemini-3-flash':       1.75,   // ($0.50 in + $3 out) / 2
  'gpt-5':                6.25,   // ($2.50 in + $10 out) / 2
  'gpt-5.2':              0.375,  // ($0.15 in + $0.60 out) / 2
  'gpt-5.3-codex':        6.25,   // ~gpt-5 tier estimate
  'o1':                  37.5,    // ($15 in + $60 out) / 2
  'o1-mini':              7.5,    // ($3 in + $12 out) / 2
  'llama-4-maverick':     0.40,   // ($0.20 in + $0.60 out) / 2
  'llama-4-scout':        0.30,   // ($0.15 in + $0.45 out) / 2
};
const DEFAULT_COST_PER_1K = 3.0; // conservative fallback (haiku-tier)

function getModelCostPerToken(modelId) {
  if (!modelId || modelId === 'unknown') return DEFAULT_COST_PER_1K / 1000;
  const baseModel = modelId.replace(/^antigravity-/, '');
  return (MODEL_PRICING[baseModel] ?? DEFAULT_COST_PER_1K) / 1000;
}

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
  // Compress tool (context management)
  compress:              { category: 'context', priority: 'high' },
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

// ---- Tool → Package/Method mapping for package-level execution tracking ----
// Maps tool names to IntegrationLayer package.method pairs.
// All tools are tracked, not just delegated ones, since every tool call passes
// through this PostToolUse hook. "no-op" means the tool is a terminal operation
// (no IntegrationLayer delegation path).
const TOOL_TO_PACKAGE_METHOD = {
  // opencode-runbooks
  opencode_runbooks_matchrunbookerror:     { package: 'runbooks',           method: 'matchRunbookError' },
  opencode_runbooks_matchallrunbookerrors: { package: 'runbooks',           method: 'matchAllRunbookErrors' },
  opencode_runbooks_getrunbookremedy:     { package: 'runbooks',           method: 'getRunbookRemedy' },
  opencode_runbooks_diagnoserunbookerror:  { package: 'runbooks',           method: 'diagnoseRunbookError' },
  opencode_runbooks_executerunbookremedy: { package: 'runbooks',           method: 'executeRunbookRemedy' },
  opencode_runbooks_listrunbookpatterns:   { package: 'runbooks',           method: 'listRunbookPatterns' },

  // opencode-context-governor (MCP)
  opencode_context_governor_checkcontextbudget:     { package: 'contextGovernor', method: 'checkBudget' },
  opencode_context_governor_recordtokenusage:       { package: 'contextGovernor', method: 'consumeTokens' },
  opencode_context_governor_getcontextbudgetstatus:  { package: 'contextGovernor', method: 'getRemainingBudget' },
  opencode_context_governor_listbudgetsessions:      { package: 'contextGovernor', method: 'listBudgetSessions' },
  opencode_context_governor_resetbudgetsession:      { package: 'contextGovernor', method: 'resetBudgetSession' },
  opencode_context_governor_getmodelbudgets:          { package: 'contextGovernor', method: 'getModelBudgets' },

  // opencode-skill-orchestrator (preloadSkills)
  skill_mcp:                    { package: 'preloadSkills', method: 'loadOnDemand' },
  skill:                        { package: 'preloadSkills', method: 'loadOnDemand' },
  slashcommand:                 { package: 'preloadSkills', method: 'loadOnDemand' },
  loaded_skills:               { package: 'preloadSkills', method: 'selectTools' },
  opencode_skill_orchestrator_runtime: { package: 'skillOrchestrator', method: 'orchestrate' },

  // opencode-model-manager (delegation events are captured from call_omo_agent/task)
  call_omo_agent:               { package: 'modelManager', method: 'delegate' },
  task:                         { package: 'modelManager', method: 'delegate' },
  background_output:            { package: 'modelManager', method: 'getBackgroundOutput' },
  background_cancel:             { package: 'modelManager', method: 'cancelBackground' },

  // opencode-integration-layer (remaining methods)
  opencode_runbooks_executerunbookremedy: { package: 'runbooks', method: 'executeRemedy' },

  // Tool categories with no IntegrationLayer mapping (terminal operations)
  // bash, read, write, edit, glob, grep, webfetch, websearch, codesearch,
  // context7_resolve_library_id, context7_query_docs, supermemory_*,
  // session_list, session_read, session_search, session_info,
  // lsp_*, ast_grep_*, pty_*, distill_*, compress, prune,
  // todowrite, question, antigravity_quota, google_search, playwright_*,
  // websearch_*, grep_app_*, sequentialthinking_*, interactive_bash,
  // look_at, opencode_memory_graph_*, distill_browse_tools
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

function sleepSync(delayMs) {
  if (!Number.isFinite(delayMs) || delayMs <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.floor(delayMs));
}

function withFileLockSync(filePath, operation) {
  const lockFile = `${filePath}.lock`;
  let locked = false;

  for (let attempt = 0; attempt < LOCK_MAX_RETRIES; attempt++) {
    try {
      writeFileSync(lockFile, String(process.pid), { encoding: 'utf8', flag: 'wx' });
      locked = true;
      break;
    } catch (err) {
      if (err?.code !== 'EEXIST') break;
      if (attempt < LOCK_MAX_RETRIES - 1) {
        sleepSync(LOCK_RETRY_DELAY_MS);
      }
    }
  }

  if (!locked) {
    process.stderr.write(`[runtime-telemetry] warning: lock acquisition failed for ${filePath}; proceeding without lock\n`);
  }

  try {
    return operation();
  } finally {
    if (!locked) return;
    try {
      unlinkSync(lockFile);
    } catch {
      // best-effort
    }
  }
}

function renameWithWindowsRetrySync(tmpPath, filePath) {
  for (let attempt = 0; attempt < WINDOWS_RENAME_RETRIES; attempt++) {
    try {
      renameSync(tmpPath, filePath);
      return;
    } catch (err) {
      const isLastAttempt = attempt === WINDOWS_RENAME_RETRIES - 1;
      if (err?.code === 'EPERM' && !isLastAttempt) {
        sleepSync(WINDOWS_RENAME_RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
}

function writeJsonAtomicSync(filePath, data) {
  const json = JSON.stringify(data, null, 2);
  const tmp = filePath + '.tmp';
  let tempWritten = false;

  try {
    writeFileSync(tmp, json, 'utf8');
    tempWritten = true;

    try {
      renameWithWindowsRetrySync(tmp, filePath);
    } catch (err) {
      if (err?.code === 'EPERM') {
        // Last resort only after a successful temp write
        writeFileSync(filePath, json, 'utf8');
      } else {
        throw err;
      }
    }
  } catch {
    if (tempWritten) {
      // Last resort only after temp write succeeded
      writeFileSync(filePath, json, 'utf8');
    }
  } finally {
    try { unlinkSync(tmp); } catch { /* best-effort */ }
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
    actual_tokens: 0,
    model_id: 'unknown',
    provider: 'unknown',
    cumulative_cost: 0,
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
  state.actual_tokens = Number(state.actual_tokens) || 0;
  state.model_id = typeof state.model_id === 'string' ? state.model_id : defaults.model_id;
  state.provider = typeof state.provider === 'string' ? state.provider : defaults.provider;
  state.cumulative_cost = Number(state.cumulative_cost) || 0;
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

  withFileLockSync(METRICS_HISTORY_FILE, () => {
    const data = readJsonSync(METRICS_HISTORY_FILE, []);
    const history = Array.isArray(data) ? data : [];
    history.push({ kind, event });

    if (history.length > MAX_METRICS_EVENTS) {
      history.splice(0, history.length - MAX_METRICS_EVENTS);
    }

    writeJsonAtomicSync(METRICS_HISTORY_FILE, history);
  });
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

      // Check errors/error as array BEFORE the typeof !== 'object' guard
      // (arrays ARE objects, so Array.isArray inside the guard below is always dead)
      if ((key === 'error' || key === 'errors') && Array.isArray(rawVal) && rawVal.length > 0) {
        return true;
      }

      if ((key === 'error' || key === 'errors' || key === 'failed' || key === 'success' || key === 'resolved') && typeof rawVal !== 'object') {
        if (key === 'success' || key === 'resolved') {
          if (rawVal === false || rawVal === 'false') return true;
        } else if (key === 'failed') {
          if (rawVal === true || rawVal === 'true') return true;
        } else if (key === 'error' || key === 'errors') {
          if (typeof rawVal === 'string' && rawVal.trim()) return true;
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

// ---- Tool Call Batching Suggestion (Item 8) ----
// Track recent tool invocations per session. When 3+ consecutive calls are
// of the same category, suggest batching via stderr.
const RECENT_CALLS_FILE = join(HOME, '.opencode', 'tool-usage', 'recent-calls.json');
const MAX_RECENT = 20;
const BATCH_THRESHOLD = 3;

function getRecentCalls(sessionId) {
  try {
    const data = readJsonSync(RECENT_CALLS_FILE, {});
    const session = data[sessionId] || [];
    return Array.isArray(session) ? session : [];
  } catch { return []; }
}

function appendRecentCall(sessionId, toolName, toolInfo) {
  try {
    withFileLockSync(RECENT_CALLS_FILE, () => {
      const data = readJsonSync(RECENT_CALLS_FILE, {});
      if (!data[sessionId]) data[sessionId] = [];
      data[sessionId].push({ tool: toolName, category: toolInfo.category, ts: Date.now() });
      if (data[sessionId].length > MAX_RECENT) data[sessionId] = data[sessionId].slice(-MAX_RECENT);
      writeJsonAtomicSync(RECENT_CALLS_FILE, data);
    });
  } catch (_) { /* never crash */ }
}

function suggestBatchingIfNeeded(sessionId, toolName, toolInfo) {
  try {
    const recent = getRecentCalls(sessionId);
    if (recent.length < BATCH_THRESHOLD) return;
    // Count consecutive same-category runs
    const runs = [];
    let currentRun = { category: recent[0].category, count: 1 };
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].category === currentRun.category) {
        currentRun.count++;
      } else {
        runs.push(currentRun);
        currentRun = { category: recent[i].category, count: 1 };
      }
    }
    runs.push(currentRun);
    const lastRun = runs[runs.length - 1];
    if (lastRun.count >= BATCH_THRESHOLD) {
      const cat = lastRun.category;
      if (cat === 'search') {
        process.stderr.write('[hint] 3+ sequential searches — combine into one grep/glob or use codesearch for external examples\n');
      } else if (cat === 'file') {
        process.stderr.write('[hint] 3+ sequential file reads — use glob first to find all targets, then batch reads\n');
      } else if (cat === 'execution') {
        process.stderr.write('[hint] 3+ sequential bash calls — combine with && or write a compound script\n');
      }
    }
  } catch (_) { /* never crash */ }
}

// ---- LSP Tool Guidance (Item 7) ----
// Suggest LSP tools when agent uses bash/read/grep for navigation instead.
const LSP_HINTS = [
  { patterns: [/\bfind.*function\b/i, /\bfind.*definition\b/i, /\bnavigate.*to\b/i, /\bwhere.*is\b/i, /\blocate.*function\b/i],
    hint: '[lsp-hint] For code navigation, use lsp_goto_definition — instant, no shell overhead' },
  { patterns: [/\bfind.*usages\b/i, /\bfind.*references\b/i, /\bwho.*calls\b/i, /\bwhere.*used\b/i],
    hint: '[lsp-hint] For finding usages, use lsp_find_references — covers all projects atomically' },
  { patterns: [/\bfind.*symbol\b/i, /\blist.*functions\b/i, /\bfile.*outline\b/i],
    hint: '[lsp-hint] For file outlines, use lsp_symbols — shows all classes/functions/variables at once' },
  { patterns: [/\brename.*variable\b/i, /\brename.*function\b/i, /\brefactor.*name\b/i],
    hint: '[lsp-hint] For safe renames, use lsp_prepare_rename + lsp_rename — renames across all files atomically' },
  { patterns: [/\bfind.*type\s/i, /\bfind.*error.*pattern\b/i, /\bast.*grep\b/i],
    hint: '[lsp-hint] For AST-aware pattern matching, use ast_grep_search — more precise than regex grep' },
];

function suggestLspIfNeeded(toolName, toolInput) {
  try {
    if (toolName.startsWith('lsp_') || toolName.startsWith('ast_grep_')) return;
    const inputStr = stringifyForSnippet(toolInput).toLowerCase();
    for (const h of LSP_HINTS) {
      if (h.patterns.some(p => p.test(inputStr))) {
        process.stderr.write(`${h.hint}\n`);
        break;
      }
    }
  } catch (_) { /* never crash */ }
}

// ---- Profile + Research Tool Promotion (Items 9, 10, 11) ----
// Surface skill profile hints and promote codesearch/context7 from registry.json triggers.
const PROFILE_HINTS = [
  { patterns: [/\brefactor\b/i, /\bclean up\b/i, /\bimprove architecture\b/i, /\brename\b/i],
    hint: '[profile] deep-refactoring: load skill(systematic-debugging) + skill(test-driven-development) + skill(verification)' },
  { patterns: [/\bplan\b/i, /\bdesign\b/i, /\barchitect\b/i, /\broadmap\b/i],
    hint: '[profile] planning-cycle: load skill(brainstorming) + skill(writing-plans) + skill(executing-plans)' },
  { patterns: [/\bbrowser\b/i, /\bui test\b/i, /\bvisual\b/i, /\be2e\b/i],
    hint: '[profile] browser-testing: load skill(dev-browser) + skill(playwright) + skill(verification)' },
  { patterns: [/\bbug\b/i, /\bdiagnose\b/i, /\berror\b/i, /\bfailing\b/i, /\bcrash\b/i],
    hint: '[profile] diagnostic-healing: load skill(systematic-debugging) + skill(code-doctor) + skill(incident-commander)' },
  { patterns: [/\bcode review\b/i, /\bpr review\b/i, /\blgtm\b/i, /\bfeedback\b/i],
    hint: '[profile] review-cycle: load skill(requesting-code-review) + skill(receiving-code-review)' },
  { patterns: [/\bparallel\b/i, /\bdivide and conquer\b/i, /\bsubagent\b/i],
    hint: '[profile] parallel-implementation: load skill(dispatching-parallel-agents) + skill(subagent-driven-development)' },
  { patterns: [/\bresearch\b/i, /\binvestigate\b/i, /\bhow.?to\b/i, /\blibrary\b/i, /\bapi\b/i],
    hint: '[profile] research-to-code: load skill(context7) + skill(codesearch) + skill(writing-plans)' },
];

const RESEARCH_TOOL_HINTS = [
  { patterns: [/search.*github/i, /find.*example/i, /real.?world.*code/i, /public.*repo/i, /grep.*github/i],
    hint: '[hint] For GitHub code search, use codesearch — live examples from 1M+ repos, better than grep' },
  { patterns: [/library.*docs/i, /framework.*doc/i, /api.*reference/i, /correct syntax/i, /npm.*package/i, /how to use/i],
    hint: '[hint] For library/framework docs, use context7_resolve_library_id + context7_query_docs — up-to-date instead of training data' },
];

function suggestContextTools(toolName, toolInput) {
  try {
    const promoted = ['codesearch', 'context7', 'context7_resolve', 'context7_query'];
    if (promoted.some(t => toolName.includes(t))) return;
    const inputStr = stringifyForSnippet(toolInput).toLowerCase();
    for (const h of RESEARCH_TOOL_HINTS) {
      if (h.patterns.some(p => p.test(inputStr))) {
        process.stderr.write(`${h.hint}\n`);
        break;
      }
    }
    for (const p of PROFILE_HINTS) {
      if (p.patterns.some(p2 => p2.test(inputStr))) {
        process.stderr.write(`${p.hint}\n`);
        break;
      }
    }
    // Workflow executor trigger (item 9)
    if (/workflow|pipeline|orchestrate|multi.?step.*plan/i.test(inputStr)) {
      process.stderr.write('[hint] For complex workflows, consider: skill(task-orchestrator) or skill(executing-plans)\n');
    }
  } catch (_) { /* never crash */ }
}

// ---- Delegation Event Capture ----
// Written to ~/.opencode/delegation-log.json for post-processing by ingest-sessions.mjs.
// Captures task tool invocations so OrchestrationAdvisor and SkillRL can learn from
// real delegation patterns without paying the cost of loading CJS modules on every hook call.

function captureDelegationEvent(sessionId, toolInput, toolResponse) {
  try {
    const category = typeof toolInput?.category === 'string' ? toolInput.category.trim() : '';
    const subagentType = typeof toolInput?.subagent_type === 'string' ? toolInput.subagent_type.trim() : '';
    const description = typeof toolInput?.description === 'string' ? toolInput.description.trim().slice(0, 200) : '';
    const loadSkills = Array.isArray(toolInput?.load_skills) ? toolInput.load_skills.filter(s => typeof s === 'string') : [];
    const background = !!toolInput?.run_in_background;
    const continuedSession = typeof toolInput?.session_id === 'string' ? toolInput.session_id : null;
    // Background tasks return {task_id, status:"running"} — outcome is unknown at fire time.
    // Use null to signal "pending outcome" so ingest-sessions skips RL until a real result arrives.
    const success = background ? null : !hasFailureSignal(toolResponse);
    // Derive a task_type hint from description keywords for OrchestrationAdvisor routing
    const descLower = description.toLowerCase();
    let taskType = category || subagentType || 'general';
    if (descLower.includes('debug') || descLower.includes('fix') || descLower.includes('error')) taskType = 'debug';
    else if (descLower.includes('refactor') || descLower.includes('rename') || descLower.includes('restructure')) taskType = 'refactor';
    else if (descLower.includes('feature') || descLower.includes('implement') || descLower.includes('add')) taskType = 'feature';
    else if (descLower.includes('test') || descLower.includes('spec')) taskType = 'test';
    else if (descLower.includes('git') || descLower.includes('commit') || descLower.includes('branch')) taskType = 'git';
    else if (descLower.includes('ui') || descLower.includes('frontend') || descLower.includes('style')) taskType = 'ui';
    else if (descLower.includes('research') || descLower.includes('find') || descLower.includes('explore')) taskType = 'research';

    const event = {
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      category: category || subagentType || 'unspecified',
      task_type: taskType,
      description,
      load_skills: loadSkills,
      background,
      continued_session: continuedSession,
      success,
      processed: false,
    };

    withFileLockSync(DELEGATION_LOG_FILE, () => {
      const data = readJsonSync(DELEGATION_LOG_FILE, { events: [] });
      const events = Array.isArray(data.events) ? data.events : [];
      events.push(event);
      if (events.length > MAX_DELEGATION_EVENTS) events.splice(0, events.length - MAX_DELEGATION_EVENTS);
      writeJsonAtomicSync(DELEGATION_LOG_FILE, { events });
    });
  } catch (_) {
    // Never crash the hook for delegation logging
  }
}

// ---- Skill Suggestion on Failure/Test Patterns ----
// When error/failure signals or test keywords appear in a tool response,
// suggest loading high-value skills proactively via stderr.
// This fires after every tool call so the operator can observe the signal.

const FAILURE_PATTERNS = [
  /error/i, /fail/i, /exception/i, /crash/i, /bug/i,
  /undefined is not/i, /cannot read/i, /is not a function/i,
  /typeerror/i, /referenceerror/i, /syntaxerror/i,
  /segfault/i, /panic/i, /wrong/i, /incorrect/i,
  /unexpected/i, /refused/i, /denied/i, /not found/i,
  /enoent/i, /eperm/i, /enoexec/i,
];

const TEST_PATTERNS = [
  /\btest\b/i, /\bspec\b/i, /\btdd\b/i, /\bjest\b/i,
  /\bvitest\b/i, /\bpytest\b/i, /\bmocha\b/i,
  /\bfail(ed|ing)?\b/i, /assertion/i, /expect\(/i,
  /coverage/i, /unit.?test/i, /integration.?test/i,
];

function suggestSkillOnSignal(toolName, toolInput, toolResponse) {
  try {
    const responseStr = stringifyForSnippet(toolResponse).toLowerCase();
    const inputStr = stringifyForSnippet(toolInput).toLowerCase();
    const combined = responseStr + ' ' + inputStr;

    // Check for failure signals — suggest systematic-debugging
    const hasFailure = FAILURE_PATTERNS.some(p => p.test(responseStr));
    // Check for test-related work — suggest TDD skill
    const hasTestSignal = TEST_PATTERNS.some(p => p.test(combined));

    if (hasFailure) {
      process.stderr.write(
        `[skill-hint] Failure signal detected — consider: /systematic-debugging\n` +
        `[skill-hint] Load: skill(name="systematic-debugging") or slash /systematic-debugging\n`
      );
    }

    if (hasTestSignal && !hasFailure) {
      process.stderr.write(
        `[skill-hint] Test signal detected — consider: /test-driven-development\n` +
        `[skill-hint] Load: skill(name="test-driven-development") or slash /TDD\n`
      );
    }
  } catch (_) {
    // Never crash the hook for skill hints
  }
}// Writes to ~/.opencode/package-execution/events.json so the dashboard's
// T21 panel shows real data. Tracks ALL tool calls (not just delegate() calls)
// since this hook fires on every tool invocation.
function capturePackageExecution(sessionId, toolName, toolInput, toolResponse, durationMs) {
  try {
    const mapping = TOOL_TO_PACKAGE_METHOD[toolName] || null;
    const packageName = mapping?.package || 'opencode-core';
    const method = mapping?.method || 'direct';
    const success = !hasFailureSignal(toolResponse);
    const taskType = deriveTaskType(toolInput);

    const event = {
      package: packageName,
      method,
      success,
      durationMs: durationMs || 0,
      timestamp: Date.now(),
      sessionId,
      taskType,
      error: success ? null : extractErrorMessage(toolResponse),
      tool: toolName, // raw tool for diagnostics
    };

    const dir = dirname(PKG_EVENTS_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    withFileLockSync(PKG_EVENTS_FILE, () => {
      const data = readJsonSync(PKG_EVENTS_FILE, []);
      const events = Array.isArray(data) ? data : [];
      events.push(event);
      if (events.length > MAX_PKG_EVENTS) events.splice(0, events.length - MAX_PKG_EVENTS);
      writeJsonAtomicSync(PKG_EVENTS_FILE, events);
    });
  } catch (_) {
    // Never crash the hook for package tracking
  }
}

// ---- Model Selection Tracking ----
// Writes to sessions/~-model-selection.json so the dashboard's T20 panel
// shows which models are being selected and why.
function captureModelSelection(sessionId, toolName, toolInput, toolResponse) {
  // Only track delegation tools (these carry model selection decisions)
  if (toolName !== 'call_omo_agent' && toolName !== 'task') return;

  try {
    const category = typeof toolInput?.category === 'string' ? toolInput.category.trim() : '';
    const subagentType = typeof toolInput?.subagent_type === 'string' ? toolInput.subagent_type.trim() : '';
    const success = !hasFailureSignal(toolResponse);
    const cost = findNumericMetric(toolInput, ['max_tokens', 'token_limit']) || 0;

    // Derive model from the static lookup tables (oh-my-opencode.json categories/agents).
    // The task tool input never contains a model field — the actual model is selected by
    // oh-my-opencode based on category/subagent_type. Use our mirrored mapping instead.
    let resolved = null;
    if (category && CATEGORY_TO_MODEL[category]) {
      resolved = CATEGORY_TO_MODEL[category];
    } else if (subagentType && AGENT_TO_MODEL[subagentType]) {
      resolved = AGENT_TO_MODEL[subagentType];
    }

    const taskType = category || subagentType || 'general';
    const modelId = resolved?.modelId || 'unknown';
    const provider = resolved?.provider || 'unknown';

    const event = {
      timestamp: Date.now(),
      sessionId,
      modelId,
      provider,
      taskType,
      category: category || null,
      agentType: subagentType || null,
      success,
      estimatedCost: cost,
    };

    const dir = dirname(MODEL_SELECTION_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    withFileLockSync(MODEL_SELECTION_FILE, () => {
      const data = readJsonSync(MODEL_SELECTION_FILE, []);
      const events = Array.isArray(data) ? data : [];
      events.push(event);
      if (events.length > MAX_MODEL_SELECTION_EVENTS) events.splice(0, events.length - MAX_MODEL_SELECTION_EVENTS);
      writeJsonAtomicSync(MODEL_SELECTION_FILE, events);
    });
  } catch (_) {
    // Never crash the hook for model tracking
  }
}

// ---- Model Router Outcome Capture ----
// Writes {modelId, success, latencyMs, timestamp, sessionId} to
// ~/.opencode/model-router-runtime-outcomes.json for each task/call_omo_agent
// tool call. bootstrap.js reads this file and passes it as runtimeOutcomes[]
// to ModelRouter.loadStatsFromDisk() so Thompson Sampling has real training data.
function captureModelOutcome(sessionId, toolName, toolInput, toolResponse, durationMs) {
  if (toolName !== 'task' && toolName !== 'call_omo_agent') return;
  try {
    const category = typeof toolInput?.category === 'string' ? toolInput.category.trim() : '';
    const subagentType = typeof toolInput?.subagent_type === 'string' ? toolInput.subagent_type.trim() : '';

    let resolved = null;
    if (category && CATEGORY_TO_MODEL[category]) {
      resolved = CATEGORY_TO_MODEL[category];
    } else if (subagentType && AGENT_TO_MODEL[subagentType]) {
      resolved = AGENT_TO_MODEL[subagentType];
    }

    const modelId = resolved?.modelId || 'unknown';
    const success = !hasFailureSignal(toolResponse);
    const latencyMs = typeof durationMs === 'number' && durationMs > 0 ? durationMs : 0;

    const outcome = {
      modelId,
      success,
      latencyMs,
      timestamp: Date.now(),
      sessionId,
      category: category || null,
      agentType: subagentType || null,
    };

    const dir = dirname(MODEL_ROUTER_OUTCOMES_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    withFileLockSync(MODEL_ROUTER_OUTCOMES_FILE, () => {
      const data = readJsonSync(MODEL_ROUTER_OUTCOMES_FILE, []);
      const outcomes = Array.isArray(data) ? data : [];
      outcomes.push(outcome);
      if (outcomes.length > MAX_MODEL_ROUTER_OUTCOMES) outcomes.splice(0, outcomes.length - MAX_MODEL_ROUTER_OUTCOMES);
      writeJsonAtomicSync(MODEL_ROUTER_OUTCOMES_FILE, outcomes);
    });
  } catch (_) {
    // Never crash the hook for outcome tracking
  }
}

// ---- Improved Budget Tracking ----
// Budget files now store: actual_tokens (estimated), model_id, provider,
// cumulative_cost (estimated), and percentage-based warnings (e.g. "75%")
// instead of raw threshold values ("75").
function updateSessionBudget(state, sessionId, toolInput, toolResponse, callTokens, callChars) {
  // Extract model info from tool input (for delegation tools)
  const modelId = findFirstString(toolInput, ['model', 'model_id']) || state.model_id || 'unknown';
  const provider = findFirstString(toolInput, ['provider']) || state.provider || 'unknown';
  const costPerToken = getModelCostPerToken(modelId);
  const estimatedCost = (callTokens * costPerToken) + (state.cumulative_cost || 0);

  state.cumulative_chars = (state.cumulative_chars || 0) + callChars;
  state.estimated_tokens = (state.estimated_tokens || 0) + callTokens;
  state.actual_tokens = (state.actual_tokens || 0) + callTokens; // mirrors estimated for now
  state.model_id = modelId;
  state.provider = provider;
  state.cumulative_cost = estimatedCost;
  state.last_updated = new Date().toISOString();

  // Emit percentage-based warnings (e.g. "75%" not "75")
  const percent = Math.round((state.estimated_tokens / state.model_limit) * 100);
  const thresholds = [50, 65, 80, 95];
  for (const threshold of thresholds) {
    const key = String(threshold);
    if (percent < threshold || state.warnings_emitted.includes(key)) continue;

    let message = '';
    if (threshold === 50) {
      message = `[context] ~${percent}% budget used (~${formatTokenK(state.estimated_tokens)}/${formatTokenK(state.model_limit)} tokens)`;
    } else if (threshold === 65) {
      message = `[context] ~${percent}% budget used - compression recommended (run distill)`;
    } else if (threshold === 80) {
      message = `[context] ~${percent}% budget used - CRITICAL: compress or wrap up`;
    } else {
      message = `[context] ~${percent}% budget used - EMERGENCY: context nearly exhausted`;
    }

    process.stderr.write(`${message}\n`);
    state.warnings_emitted.push(key);
  }

  return state;
}

// ---- Distill Event Capture from compress tool ----
// The compress tool is used as a manual distill trigger — capture it here
// so distill_events in budget files actually populate.
function captureCompressAsDistillEvent(sessionId, toolName, toolInput, toolResponse, state) {
  if (toolName !== 'compress') return;

  try {
    const tokensBefore = findNumericMetric(toolInput, ['tokens', 'input_tokens', 'before']);
    const tokensAfter = findNumericMetric(toolResponse, ['tokens_after', 'after_tokens', 'tokens_after']);
    const ratio = findNumericMetric(toolResponse, ['ratio', 'compression_ratio', 'savings_ratio']);
    const pipeline = findFirstString(toolInput, ['pipeline']) || 'compress-manual';

    let savings = null;
    if (tokensBefore !== null && tokensAfter !== null && tokensBefore > 0) {
      savings = Math.round(((tokensBefore - tokensAfter) / tokensBefore) * 100);
    } else if (ratio !== null && ratio > 0 && ratio <= 1) {
      savings = Math.round((1 - ratio) * 100);
    }

    const summary = savings !== null
      ? `[distill] compress: ~${savings}% savings (${pipeline})`
      : '[distill] compress triggered';

    process.stderr.write(`${summary}\n`);

    state.distill_events = state.distill_events || [];
    state.distill_events.push({
      timestamp: new Date().toISOString(),
      tool: toolName,
      pipeline,
      savings_percent: savings,
      tokens_before: tokensBefore,
      tokens_after: tokensAfter,
      ratio,
    });

    // Also append to metrics history
    if (tokensBefore !== null && tokensAfter !== null) {
      appendMetricsHistory('compression', {
        sessionId,
        tokensBefore: Math.round(tokensBefore),
        tokensAfter: Math.round(tokensAfter),
        tokensSaved: Math.max(0, Math.round(tokensBefore) - Math.round(tokensAfter)),
        ratio: tokensBefore > 0 ? Number((tokensAfter / tokensBefore).toFixed(4)) : 1,
        pipeline,
        durationMs: findNumericMetric(toolResponse, ['duration_ms']) || 0,
        timestamp: Date.now(),
      });
    }
  } catch (_) {
    // Never crash the hook
  }
}

// ---- Helpers ----

function deriveTaskType(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const desc = (toolInput.description || '').toLowerCase();
  const cat = (toolInput.category || '').toLowerCase();
  const combined = desc + ' ' + cat;
  if (combined.includes('debug') || combined.includes('fix')) return 'debug';
  if (combined.includes('refactor') || combined.includes('rename')) return 'refactor';
  if (combined.includes('feature') || combined.includes('implement')) return 'feature';
  if (combined.includes('test') || combined.includes('spec')) return 'test';
  if (combined.includes('git') || combined.includes('commit')) return 'git';
  if (combined.includes('ui') || combined.includes('frontend')) return 'ui';
  if (combined.includes('research') || combined.includes('explore')) return 'research';
  if (combined.includes('deep')) return 'deep';
  if (combined.includes('quick')) return 'quick';
  return null;
}

function extractErrorMessage(response) {
  if (!response || typeof response !== 'object') return null;
  const queue = [response];
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) { current.forEach(item => queue.push(item)); continue; }
    for (const [key, val] of Object.entries(current)) {
      if ((key === 'error' || key === 'errorMessage' || key === 'message') && typeof val === 'string' && val.trim()) {
        return val.trim().slice(0, 200);
      }
      if (val && typeof val === 'object') queue.push(val);
    }
  }
  return null;
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
    params: input.tool_input || {},
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
  withFileLockSync(INVOCATIONS_FILE, () => {
    const data = readJsonSync(INVOCATIONS_FILE, { invocations: [] });
    data.invocations.push(invocation);

    // Keep last N invocations
    if (data.invocations.length > MAX_INVOCATIONS) {
      data.invocations = data.invocations.slice(-MAX_INVOCATIONS);
    }

    writeJsonAtomicSync(INVOCATIONS_FILE, data);
  });

  const { stateFile } = loadSessionBudgetState(sessionId);
  const callChars = stringifyLength(input.tool_input) + stringifyLength(input.tool_response);
  const callTokens = estimateTokens(input.tool_input, input.tool_response);
  const durationMs = findNumericMetric(input.tool_response, ['duration_ms', 'elapsed_ms', 'execution_time']) || 0;

  withFileLockSync(stateFile, () => {
    const { state } = loadSessionBudgetState(sessionId);

    // Improved budget tracking with model/cost info and percentage warnings
    updateSessionBudget(state, sessionId, input.tool_input, input.tool_response, callTokens, callChars);

    // Capture compress tool as a distill event (was missing — distill_events was always empty)
    captureCompressAsDistillEvent(sessionId, toolName, input.tool_input, input.tool_response, state);

    state.last_updated = new Date().toISOString();
    writeJsonAtomicSync(stateFile, state);
  });

  // Standard distill + context7 monitoring
  captureMonitoringMetrics(toolName, input.tool_input, input.tool_response);

  // Suggest skills on failure/test patterns (item 6)
  suggestSkillOnSignal(toolName, input.tool_input, input.tool_response);

  // Track for batching suggestion (item 8)
  appendRecentCall(sessionId, toolName, toolInfo);
  suggestBatchingIfNeeded(sessionId, toolName, toolInfo);

  // LSP tool guidance (item 7)
  suggestLspIfNeeded(toolName, input.tool_input);

  // Context-aware skill/profile/codesearch suggestions (items 9, 10, 11)
  suggestContextTools(toolName, input.tool_input);

  // Capture package-level execution for ALL tool calls (T21 — was only in IntegrationLayer.delegate())
  capturePackageExecution(sessionId, toolName, input.tool_input, input.tool_response, durationMs);

  // Track model selection from delegation tool calls (T20)
  captureModelSelection(sessionId, toolName, input.tool_input, input.tool_response);

  // Record model outcome for Thompson Sampling RL training signal (Wave 1A)
  captureModelOutcome(sessionId, toolName, input.tool_input, input.tool_response, durationMs);

  // Capture delegation events for OrchestrationAdvisor + SkillRL post-processing
  // Note: call_omo_agent is the MCP tool name for agent spawning; task normalization
  // is handled by resolveRuntimeToolName but the MCP name is preserved for delegation detection
  if (toolName === 'task' || toolName === 'call_omo_agent') {
    captureDelegationEvent(sessionId, input.tool_input, input.tool_response);
  }

  // Exit cleanly — no stdout means "allow" decision
  process.exit(0);
}

main();
