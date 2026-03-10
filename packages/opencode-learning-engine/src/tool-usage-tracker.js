/**
 * Tool Usage Tracker
 * 
 * Tracks tool invocations, breadth metrics, and quality scoring
 * for the opencode learning engine.
 * 
 * Key metrics:
 * - Tool breadth: % of available tools actually used
 * - Tool under-use: Missed opportunities where a tool should have been used
 * - Appropriateness score: Quality of tool selection for the task
 */

const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { MetaAwarenessTracker } = require('./meta-awareness-tracker');

const metaAwarenessTracker = new MetaAwarenessTracker();

// Async write queue (serializes concurrent writes to prevent corruption)
let _writePromise = Promise.resolve();

// ---- In-memory test state (synchronous mirror for unit/integration tests) ----
const _testLog = [];
let _testMetrics = { toolCounts: {}, categoryCounts: {}, totalInvocations: 0 };

// Init singleton (prevents concurrent init races)
let _initPromise = null;

// Paths
const HOME = process.env.USERPROFILE || process.env.HOME;
const DATA_DIR = path.join(HOME, '.opencode', 'tool-usage');
const INVOCATIONS_FILE = path.join(DATA_DIR, 'invocations.json');
const METRICS_FILE = path.join(DATA_DIR, 'metrics.json');
const SESSION_FILE = path.join(DATA_DIR, 'current-session.json');

// Available tools in the system (can be extended)
const AVAILABLE_TOOLS = {
  // Core tools
  bash: { category: 'execution', priority: 'critical', description: 'Execute shell commands' },
  read: { category: 'file', priority: 'critical', description: 'Read file contents' },
  write: { category: 'file', priority: 'critical', description: 'Write file contents' },
  edit: { category: 'file', priority: 'critical', description: 'Edit file contents' },
  glob: { category: 'search', priority: 'high', description: 'Find files by pattern' },
  grep: { category: 'search', priority: 'high', description: 'Search file contents' },
  
  // LSP tools
  lsp_goto_definition: { category: 'navigation', priority: 'high', description: 'Jump to symbol definition' },
  lsp_find_references: { category: 'navigation', priority: 'high', description: 'Find all usages' },
  lsp_symbols: { category: 'navigation', priority: 'high', description: 'Get file/workspace symbols' },
  lsp_diagnostics: { category: 'analysis', priority: 'high', description: 'Get errors/warnings' },
  lsp_prepare_rename: { category: 'refactor', priority: 'medium', description: 'Check if rename valid' },
  lsp_rename: { category: 'refactor', priority: 'medium', description: 'Rename symbol' },
  
  // AST tools
  ast_grep_search: { category: 'search', priority: 'high', description: 'AST-aware code search' },
  ast_grep_replace: { category: 'refactor', priority: 'high', description: 'AST-aware code replacement' },
  
  // Agent tools
  task: { category: 'delegation', priority: 'critical', description: 'Spawn agent task' },
  background_output: { category: 'delegation', priority: 'high', description: 'Get background task output' },
  background_cancel: { category: 'delegation', priority: 'medium', description: 'Cancel background task' },
  
  // Web tools
  webfetch: { category: 'web', priority: 'medium', description: 'Fetch URL content' },
  websearch: { category: 'web', priority: 'medium', description: 'Search the web' },
  codesearch: { category: 'web', priority: 'medium', description: 'Search code examples' },
  context7_resolve_library_id: { category: 'docs', priority: 'medium', description: 'Resolve library ID' },
  context7_query_docs: { category: 'docs', priority: 'medium', description: 'Query library docs' },
  
  // Memory tools
  supermemory: { category: 'memory', priority: 'medium', description: 'Persistent memory system' },
  session_list: { category: 'memory', priority: 'low', description: 'List sessions' },
  session_read: { category: 'memory', priority: 'low', description: 'Read session history' },
  session_search: { category: 'memory', priority: 'low', description: 'Search sessions' },
  
  // Context management
  distill: { category: 'context', priority: 'medium', description: 'Distill tool outputs' },
  prune: { category: 'context', priority: 'medium', description: 'Remove tool outputs' },
  
  // Skills
  skill: { category: 'skills', priority: 'high', description: 'Load skill instructions' },
  slashcommand: { category: 'skills', priority: 'medium', description: 'Execute slash command' },
  loaded_skills: { category: 'skills', priority: 'low', description: 'List loaded skills' },
  
  // Analysis
  look_at: { category: 'analysis', priority: 'medium', description: 'Analyze media files' },
  
  // PTY
  pty_spawn: { category: 'execution', priority: 'medium', description: 'Spawn PTY session' },
  pty_write: { category: 'execution', priority: 'medium', description: 'Write to PTY' },
  pty_read: { category: 'execution', priority: 'medium', description: 'Read from PTY' },
  pty_list: { category: 'execution', priority: 'low', description: 'List PTY sessions' },
  pty_kill: { category: 'execution', priority: 'low', description: 'Kill PTY session' },
  
  // Thinking
  sequentialthinking_sequentialthinking: { category: 'reasoning', priority: 'medium', description: 'Sequential thinking' },
  
  // Git
  interactive_bash: { category: 'git', priority: 'medium', description: 'Interactive tmux commands' },
  
  // Other
  question: { category: 'interaction', priority: 'low', description: 'Ask user question' },
  todowrite: { category: 'planning', priority: 'medium', description: 'Manage todo list' },
  antigravity_quota: { category: 'quota', priority: 'medium', description: 'Check antigravity quota' },
};

// Tool appropriateness rules (when a tool should have been used)
const TOOL_APPROPRIATENESS_RULES = [
  {
    name: 'use_lsp_for_navigation',
    trigger: { toolsUsed: ['grep', 'read'], count: 3, pattern: 'sequential' },
    shouldUse: ['lsp_goto_definition', 'lsp_find_references', 'lsp_symbols'],
    reason: 'LSP tools are more efficient for code navigation than grep+read cycles'
  },
  {
    name: 'use_ast_for_structural_changes',
    trigger: { contextKeywords: ['refactor', 'rename', 'replace all'] },
    shouldUse: ['ast_grep_search', 'ast_grep_replace', 'lsp_rename'],
    reason: 'AST tools are safer for structural code changes'
  },
  {
    name: 'use_parallel_agents_for_independent_tasks',
    trigger: { contextKeywords: ['also', 'and', 'simultaneously'], taskCount: 2 },
    shouldUse: ['task'],
    reason: 'Parallel agents for independent tasks improve efficiency'
  },
  {
    name: 'use_skill_before_implementation',
    trigger: { contextKeywords: ['implement', 'create', 'build'], firstToolUsed: 'edit' },
    shouldUse: ['skill', 'slashcommand'],
    reason: 'Skills provide guidance before implementation'
  },
  {
    name: 'use_context_management',
    trigger: { tokenEstimate: 80000 },
    shouldUse: ['distill', 'prune'],
    reason: 'Context management prevents context rot'
  }
];

/**
 * Read JSON file asynchronously, returning defaultValue if file missing or parse fails.
 */
async function readJsonAsync(filePath, defaultValue = {}) {
  try {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    const raw = await fsPromises.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (_) {
    return defaultValue;
  }
}

/**
 * Ensure DATA_DIR exists (singleton via _initPromise to avoid race conditions).
 */
async function initAsync() {
  if (!_initPromise) {
    _initPromise = fsPromises.mkdir(DATA_DIR, { recursive: true });
  }
  return _initPromise;
}

/**
 * Write JSON atomically (async) with serialized write queue.
 * Uses tmp+rename for atomic swap, chained via _writePromise to prevent
 * concurrent write corruption. Falls back to direct write on Windows EPERM.
 */
async function writeJsonAsync(filePath, data) {
  const doWrite = async () => {
    const json = JSON.stringify(data, null, 2);
    const tmp = filePath + '.tmp';
    try {
      await fsPromises.writeFile(tmp, json, 'utf8');
      await fsPromises.rename(tmp, filePath);
    } catch (err) {
      // Windows: rename over existing file can EPERM; fall back to direct write
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        await fsPromises.writeFile(filePath, json, 'utf8');
        try { await fsPromises.unlink(tmp); } catch { /* best-effort cleanup */ }
      } else {
        throw err;
      }
    }
  };
  _writePromise = _writePromise.catch(() => {}).then(doWrite);
  return _writePromise;
}

/**
 * Log a tool invocation
 */
async function logInvocation(toolName, params, result, context = {}) {
  await initAsync();
  toolName = normalizeMcpToolName(toolName);
  const canonicalSession = resolveSessionKey(context) || 'default';
    
  const invocation = {
    timestamp: new Date().toISOString(),
    tool: toolName,
    category: AVAILABLE_TOOLS[toolName]?.category || 'unknown',
    priority: AVAILABLE_TOOLS[toolName]?.priority || 'unknown',
    params: sanitizeParams(params),
    success: result?.success !== false,
    errorClass: typeof result?.errorClass === 'string' ? result.errorClass : undefined,
    errorCode: typeof result?.errorCode === 'string' ? result.errorCode : undefined,
    context: {
      session: canonicalSession,
      task: context.task || null,
      messageCount: context.messageCount || 0,
      ...context
    }
  };
  
  // ---- Synchronous in-memory mirror (before async file write) ----
  _testLog.push(invocation);
  _testMetrics.totalInvocations++;
  _testMetrics.toolCounts[toolName] = (_testMetrics.toolCounts[toolName] || 0) + 1;
  const cat = invocation.category;
  _testMetrics.categoryCounts[cat] = (_testMetrics.categoryCounts[cat] || 0) + 1;

  // Queue the ENTIRE read-modify-write as one transaction to prevent
  // concurrent callers from reading the same stale snapshot and losing
  // each other's entries (last-write-wins race).
  const doTransaction = async () => {
    let data;
    try {
      data = await readJsonAsync(INVOCATIONS_FILE, { invocations: [] });
    } catch {
      data = { invocations: [] };
    }
    data.invocations.push(invocation);

    // Keep last 1000 invocations
    if (data.invocations.length > 1000) {
      data.invocations = data.invocations.slice(-1000);
    }

    // Atomic write inlined (avoid double-queuing through writeJsonAsync)
    const json = JSON.stringify(data, null, 2);
    const tmp = INVOCATIONS_FILE + '.tmp';
    try {
      await fsPromises.writeFile(tmp, json, 'utf8');
      await fsPromises.rename(tmp, INVOCATIONS_FILE);
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        await fsPromises.writeFile(INVOCATIONS_FILE, json, 'utf8');
        try { await fsPromises.unlink(tmp); } catch { /* best-effort */ }
      } else {
        throw err;
      }
    }
  };
  _writePromise = _writePromise.catch(() => {}).then(doTransaction);
  await _writePromise;

  // Update metrics (also serialized inside its own transaction)
  await updateMetrics(toolName, invocation);

  // Emit orchestration intelligence event (fire-and-forget)
  metaAwarenessTracker.trackEvent({
    event_type: 'orchestration.tool_invoked',
    session_id: canonicalSession,
    task_id: context.taskId || null,
    task_type: context.taskType || 'general',
    complexity: context.complexity || 'moderate',
    outcome: invocation.success ? 'success' : 'failure',
    metadata: {
      tool: toolName,
      suggested_tools: context.suggestedTools || [],
      tool_antipattern: context.toolAntipattern === true,
      params_size: params ? Object.keys(params).length : 0,
    },
  }).catch(() => {});
  
  return invocation;
}

/**
 * Sanitize params to remove sensitive data
 */
function sanitizeParams(params) {
  const sanitized = { ...params };
  const sensitiveKeys = ['apiKey', 'token', 'password', 'secret', 'credential'];
  
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

/**
 * Normalize MCP tool names to canonical keys
 * 
 * Converts runtime MCP names (with prefixes and hyphens) to canonical names
 * that match AVAILABLE_TOOLS keys. Examples:
 * - mcp_context7_resolve-library-id → context7_resolve_library_id
 * - mcp_distill_browse_tools → distill (provider fallback)
 * - mcp__context7__query-docs → context7_query_docs
 * 
 * Non-MCP tools pass through unchanged.
 */
function normalizeMcpToolName(toolName) {
  if (!toolName || typeof toolName !== 'string') {
    return toolName;
  }
  
  // MCP prefix pattern: mcp_<provider>_ or mcp__<provider>__
  // Extract provider name from the prefix
  const mcpMatch = toolName.match(/^mcp_+(\w+?)_+(.*)$/);
  if (!mcpMatch) {
    // Not an MCP tool, return as-is
    return toolName;
  }
  
  const provider = mcpMatch[1];
  const methodPart = mcpMatch[2];
  
  // Convert hyphens to underscores in the method part
  const normalized = methodPart.replace(/-/g, '_');
  
  // Try full name first: provider_method
  const fullName = `${provider}_${normalized}`;
  if (AVAILABLE_TOOLS[fullName]) {
    return fullName;
  }
  
  // Try just the provider name
  if (AVAILABLE_TOOLS[provider]) {
    return provider;
  }
  
  // Return full name even if not in AVAILABLE_TOOLS (will be marked as 'unknown')
  return fullName;
}

/**
 * Update metrics after an invocation
 */
async function updateMetrics(toolName, invocation) {
  // Queue full read-modify-write to prevent concurrent callers from
  // reading stale metrics and losing increments.
  const doTransaction = async () => {
    let metrics = await readJsonAsync(METRICS_FILE, {
      totalSessions: 0,
      totalInvocations: 0,
      toolCounts: {},
      categoryCounts: {},
      breadthScore: 0,
      underUseEvents: 0,
      appropriatenessScore: 0
    });

    metrics.totalInvocations++;
    metrics.toolCounts[toolName] = (metrics.toolCounts[toolName] || 0) + 1;
    metrics.categoryCounts[invocation.category] = (metrics.categoryCounts[invocation.category] || 0) + 1;

    // Calculate breadth score
    const usedTools = Object.keys(metrics.toolCounts);
    metrics.breadthScore = Math.round((usedTools.length / Object.keys(AVAILABLE_TOOLS).length) * 100);

    // Calculate appropriateness score
    metrics.appropriatenessScore = await calculateAppropriatenessScore(metrics);

    // Atomic write inlined (avoid double-queuing through writeJsonAsync)
    const json = JSON.stringify(metrics, null, 2);
    const tmp = METRICS_FILE + '.tmp';
    try {
      await fsPromises.writeFile(tmp, json, 'utf8');
      await fsPromises.rename(tmp, METRICS_FILE);
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        await fsPromises.writeFile(METRICS_FILE, json, 'utf8');
        try { await fsPromises.unlink(tmp); } catch { /* best-effort */ }
      } else {
        throw err;
      }
    }
  };
  _writePromise = _writePromise.catch(() => {}).then(doTransaction);
  return _writePromise;
}

/**
 * Calculate appropriateness score based on tool usage patterns
 */
async function calculateAppropriatenessScore(metrics) {
  const invocations = (await readJsonAsync(INVOCATIONS_FILE, { invocations: [] })).invocations;
  
  let score = 100;
  const recentInvocations = invocations.slice(-50);
  
  // Check for anti-patterns
  const toolSequence = recentInvocations.map(i => i.tool);
  
  // Penalize grep+read cycles (should use LSP)
  let grepReadCycles = 0;
  for (let i = 0; i < toolSequence.length - 1; i++) {
    if (toolSequence[i] === 'grep' && toolSequence[i + 1] === 'read') {
      grepReadCycles++;
    }
  }
  score -= Math.min(grepReadCycles * 5, 30);
  
  // Reward diverse tool usage
  const uniqueTools = new Set(toolSequence).size;
  score += Math.min(uniqueTools, 10);
  
  // Reward use of advanced tools
  const advancedTools = ['ast_grep_search', 'ast_grep_replace', 'lsp_rename', 'task'];
  const advancedUsage = recentInvocations.filter(i => advancedTools.includes(i.tool)).length;
  score += Math.min(advancedUsage * 2, 20);
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Check for under-use events (tools that should have been used)
 */
async function detectUnderUse(context) {
  const invocations = (await readJsonAsync(INVOCATIONS_FILE, { invocations: [] })).invocations;
  const recentInvocations = invocations.slice(-20);
  const toolsUsed = recentInvocations.map(i => i.tool);
  
  const underUseEvents = [];
  
  for (const rule of TOOL_APPROPRIATENESS_RULES) {
    const triggered = checkRuleTrigger(rule, toolsUsed, context);
    
    if (triggered) {
      const missingTools = rule.shouldUse.filter(t => !toolsUsed.includes(t));
      if (missingTools.length > 0) {
        underUseEvents.push({
          rule: rule.name,
          reason: rule.reason,
          missingTools,
          severity: getRuleSeverity(rule, toolsUsed)
        });

        // Fire-and-forget
        metaAwarenessTracker.trackEvent({
          event_type: 'orchestration.context_gap_detected',
          session_id: context.session || 'default',
          task_id: context.taskId || null,
          task_type: context.taskType || 'general',
          complexity: context.complexity || 'moderate',
          outcome: 'warning',
          metadata: {
            gap_type: rule.name,
            missing_tools: missingTools,
            resolved: false,
          },
        }).catch(() => {});
      }
    }
  }
  
  // Update metrics if under-use detected
  if (underUseEvents.length > 0) {
    const metrics = await readJsonAsync(METRICS_FILE);
    metrics.underUseEvents += underUseEvents.length;
    await writeJsonAsync(METRICS_FILE, metrics);
  }
  
  return underUseEvents;
}

/**
 * Check if a rule is triggered
 */
function checkRuleTrigger(rule, toolsUsed, context) {
  const trigger = rule.trigger;
  
  // Check tool count trigger
  if (trigger.toolsUsed && trigger.count) {
    const matchingTools = toolsUsed.filter(t => trigger.toolsUsed.includes(t));
    if (matchingTools.length >= trigger.count) {
      // Check for sequential pattern
      if (trigger.pattern === 'sequential') {
        let sequenceCount = 0;
        for (let i = 0; i < toolsUsed.length - 1; i++) {
          if (trigger.toolsUsed.includes(toolsUsed[i]) && 
              trigger.toolsUsed.includes(toolsUsed[i + 1])) {
            sequenceCount++;
          }
        }
        if (sequenceCount >= trigger.count) return true;
      } else {
        return true;
      }
    }
  }
  
  // Check context keywords
  if (trigger.contextKeywords && context.task) {
    const taskLower = context.task.toLowerCase();
    if (trigger.contextKeywords.some(kw => taskLower.includes(kw))) {
      return true;
    }
  }
  
  // Check first tool used
  if (trigger.firstToolUsed && toolsUsed[0] === trigger.firstToolUsed) {
    return true;
  }
  
  // Check token estimate
  if (trigger.tokenEstimate && context.tokenCount > trigger.tokenEstimate) {
    return true;
  }
  
  // Check task count
  if (trigger.taskCount && context.taskCount >= trigger.taskCount) {
    return true;
  }
  
  return false;
}

/**
 * Get severity for a rule violation
 */
function getRuleSeverity(rule, toolsUsed) {
  // Higher severity if the pattern is more pronounced
  const trigger = rule.trigger;
  
  if (trigger.count && trigger.toolsUsed) {
    const matchingTools = toolsUsed.filter(t => trigger.toolsUsed.includes(t));
    if (matchingTools.length >= trigger.count * 2) return 'high';
    if (matchingTools.length >= trigger.count) return 'medium';
  }
  
  return 'low';
}

/**
 * Get current usage report
 */
async function getUsageReport() {
  await initAsync();
  
  const metrics = await readJsonAsync(METRICS_FILE);
  const invocations = (await readJsonAsync(INVOCATIONS_FILE, { invocations: [] })).invocations;
  
  const usedTools = Object.keys(metrics.toolCounts);
  const unusedTools = Object.keys(AVAILABLE_TOOLS).filter(t => !usedTools.includes(t));
  
  const categoryBreakdown = {};
  for (const [tool, count] of Object.entries(metrics.toolCounts)) {
    const cat = AVAILABLE_TOOLS[tool]?.category || 'unknown';
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + count;
  }
  
  return {
    summary: {
      totalInvocations: metrics.totalInvocations,
      uniqueToolsUsed: usedTools.length,
      totalToolsAvailable: Object.keys(AVAILABLE_TOOLS).length,
      breadthScore: metrics.breadthScore,
      appropriatenessScore: metrics.appropriatenessScore,
      underUseEvents: metrics.underUseEvents
    },
    toolUsage: metrics.toolCounts,
    categoryBreakdown,
    unusedTools: unusedTools.map(t => ({
      tool: t,
      ...AVAILABLE_TOOLS[t]
    })),
    recentUnderUse: await detectUnderUse({}),
    recommendations: generateRecommendations(metrics, unusedTools)
  };
}

/**
 * Generate recommendations based on usage patterns
 */
function generateRecommendations(metrics, unusedTools) {
  const recommendations = [];
  
  // Recommend high-priority unused tools
  const highPriorityUnused = unusedTools.filter(t => AVAILABLE_TOOLS[t]?.priority === 'high');
  if (highPriorityUnused.length > 0) {
    recommendations.push({
      type: 'try_tools',
      message: `Consider using these high-priority tools: ${highPriorityUnused.slice(0, 3).join(', ')}`,
      tools: highPriorityUnused
    });
  }
  
  // Check for low breadth score
  if (metrics.breadthScore < 30) {
    recommendations.push({
      type: 'breadth',
      message: `Tool breadth is low (${metrics.breadthScore}%). Explore more available tools.`
    });
  }
  
  // Check for low appropriateness score
  if (metrics.appropriatenessScore < 70) {
    recommendations.push({
      type: 'appropriateness',
      message: `Tool appropriateness score is low (${metrics.appropriatenessScore}). Consider using more advanced tools.`
    });
  }
  
  return recommendations;
}

/**
 * Start a new session
 */
async function startSession(sessionId, context = {}) {
  await initAsync();
  
  const session = {
    id: sessionId,
    startTime: new Date().toISOString(),
    context,
    toolsUsed: [],
    underUseEvents: []
  };
  
  await writeJsonAsync(SESSION_FILE, session);

  // Fire-and-forget
  metaAwarenessTracker.trackEvent({
    event_type: 'orchestration.phase_entered',
    session_id: sessionId,
    task_id: context.taskId || null,
    task_type: context.taskType || 'session',
    complexity: context.complexity || 'moderate',
    metadata: {
      phase: 'intent_gate',
      phase_violation: false,
    },
  }).catch(() => {});
  
  // Update session count
  const metrics = await readJsonAsync(METRICS_FILE);
  metrics.totalSessions++;
  await writeJsonAsync(METRICS_FILE, metrics);
  
  return session;
}

/**
 * End current session
 */
async function endSession() {
  const session = await readJsonAsync(SESSION_FILE);
  if (session) {
    session.endTime = new Date().toISOString();
    session.duration = new Date(session.endTime) - new Date(session.startTime);
    
    // Calculate session metrics
    const invocations = (await readJsonAsync(INVOCATIONS_FILE, { invocations: [] })).invocations;
    session.toolsUsed = invocations
      .filter(i => i.context.session === session.id)
      .map(i => i.tool);
    
    session.finalMetrics = {
      uniqueToolsUsed: new Set(session.toolsUsed).size,
      totalInvocations: session.toolsUsed.length
    };
    
    // Save session history
    const historyPath = path.join(DATA_DIR, 'sessions');
    await fsPromises.mkdir(historyPath, { recursive: true });
    await writeJsonAsync(path.join(historyPath, `${session.id}.json`), session);

    // Fire-and-forget
    metaAwarenessTracker.trackEvent({
      event_type: 'orchestration.completion_claimed',
      session_id: session.id,
      task_type: session.context?.taskType || 'session',
      complexity: session.context?.complexity || 'moderate',
      outcome: 'completed',
      metadata: {
        without_verification: session.context?.verified !== true,
        duration_ms: session.duration,
      },
    }).catch(() => {});
  }
  
  return session;
}

// ---- Test helpers (in-memory mirror for unit/integration tests) ----

/**
 * Return a shallow copy of the in-memory invocation log.
 */
function getInvocationLog() { return [..._testLog]; }

/**
 * Return a deep copy of the in-memory metrics snapshot.
 */
function getMetrics() { return JSON.parse(JSON.stringify(_testMetrics)); }

/**
 * Reset all in-memory test state. Call in beforeEach/afterEach.
 */
function resetForTesting() {
  _testLog.length = 0;
  _testMetrics = { toolCounts: {}, categoryCounts: {}, totalInvocations: 0 };
}

/**
 * Resolve the canonical session key from a context object.
 * Supports fallback aliases: session → sessionId → session_id.
 * Returns null when no session key is found.
 */
function resolveSessionKey(context) {
  if (!context || typeof context !== 'object') return null;
  return context.session || context.sessionId || context.session_id || null;
}

/**
 * Migrate legacy invocation entries to include a canonical `session` field.
 * Useful for backfilling old rows that used sessionId or session_id.
 */
function migrateSessionKeys(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(e => {
    if (e.session !== undefined) return e;
    return { ...e, session: resolveSessionKey(e.context) };
  });
}

/**
 * Read invocations from the on-disk invocations.json file (synchronous).
 * Returns an array of invocation records, or [] on any error.
 * Used as a fallback when _testLog has no entries for a session (runtime hook
 * writes directly to the file without populating _testLog).
 */
function readInvocationsFromFile() {
  try {
    const raw = fs.readFileSync(INVOCATIONS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data.invocations) ? data.invocations : [];
  } catch {
    return [];
  }
}

/**
 * Get MCP-category tool names invoked in a specific session.
 * Returns a deduplicated list of canonical tool names whose category is docs, context,
 * memory, or web. Used by the SkillRL bridge to record tool affinities.
 *
 * Sources (merged, deduplicated):
 *   1. In-memory _testLog — populated by logInvocation() during in-process calls
 *   2. On-disk invocations.json — populated by the runtime PostToolUse hook
 *      (scripts/runtime-tool-telemetry.mjs) which runs out-of-process
 *
 * The file fallback ensures that runtime MCP tool usage is visible to the SkillRL
 * bridge even when the learning engine was not loaded in the same process.
 *
 * @param {string} sessionId
 * @returns {string[]}
 */
function getSessionMcpInvocations(sessionId) {
  if (!sessionId) return [];
  const sessionKey = String(sessionId);
  const MCP_CATEGORIES = new Set(['docs', 'context', 'memory', 'web']);

  // Helper: extract MCP tool names from a list of invocation entries.
  // Checks both AVAILABLE_TOOLS catalog and the entry's own category field
  // (runtime hook entries carry their category inline).
  const extractMcpTools = (entries) =>
    entries
      .filter(entry => {
        const entrySession = resolveSessionKey(entry.context);
        const category = AVAILABLE_TOOLS[entry.tool]?.category || entry.category;
        return entrySession === sessionKey && MCP_CATEGORIES.has(category);
      })
      .map(entry => entry.tool);

  // 1. In-memory entries (fast path)
  const inMemoryTools = extractMcpTools(_testLog);

  // 2. File-based entries (fallback — catches runtime hook data)
  const fileEntries = readInvocationsFromFile();
  const fileTools = extractMcpTools(fileEntries);

  // Merge and deduplicate
  return [...new Set([...inMemoryTools, ...fileTools])];
}

module.exports = {
  detectUnderUse,
  getUsageReport,
  startSession,
  endSession,
  logInvocation,
  AVAILABLE_TOOLS,
  TOOL_APPROPRIATENESS_RULES,
  // Test helpers
  getInvocationLog,
  getMetrics,
  resetForTesting,
  // Session key utilities
  resolveSessionKey,
  migrateSessionKeys,
  // Normalization (already used internally, now exported)
  normalizeMcpToolName,
  sanitizeParams,
  // MCP → SkillRL affinity bridge
  getSessionMcpInvocations,
  // File-based invocation reader (for testing / external consumers)
  readInvocationsFromFile,
};
