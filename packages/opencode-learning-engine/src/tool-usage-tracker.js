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
const { safeJsonReadSync } = require('opencode-safe-io');
const { MetaAwarenessTracker } = require('./meta-awareness-tracker');

const metaAwarenessTracker = new MetaAwarenessTracker();

// Async write queue (serializes concurrent writes to prevent corruption)
let _writePromise = Promise.resolve();

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
 * Initialize the tracker (sync)
 * @deprecated Use initAsync() for non-blocking I/O
 */
function init() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  // Initialize files if they don't exist
  if (!fs.existsSync(INVOCATIONS_FILE)) {
    writeJsonSync(INVOCATIONS_FILE, { invocations: [] });
  }
  if (!fs.existsSync(METRICS_FILE)) {
    writeJsonSync(METRICS_FILE, { 
      totalSessions: 0,
      totalInvocations: 0,
      toolCounts: {},
      categoryCounts: {},
      breadthScore: 0,
      underUseEvents: 0,
      appropriatenessScore: 0
    });
  }
}

/**
 * Initialize the tracker (async, idempotent).
 * Uses _initPromise singleton to prevent concurrent init races.
 */
async function initAsync() {
  if (!_initPromise) {
    _initPromise = (async () => {
      await fsPromises.mkdir(DATA_DIR, { recursive: true });

      // Initialize invocations file if missing
      try {
        await fsPromises.access(INVOCATIONS_FILE);
      } catch {
        await writeJsonAsync(INVOCATIONS_FILE, { invocations: [] });
      }

      // Initialize metrics file if missing
      try {
        await fsPromises.access(METRICS_FILE);
      } catch {
        await writeJsonAsync(METRICS_FILE, {
          totalSessions: 0,
          totalInvocations: 0,
          toolCounts: {},
          categoryCounts: {},
          breadthScore: 0,
          underUseEvents: 0,
          appropriatenessScore: 0
        });
      }
    })();
  }
  return _initPromise;
}

/**
 * Write JSON atomically (sync)
 * @deprecated Use writeJsonAsync() for non-blocking I/O
 */
function writeJsonSync(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

/**
 * Read JSON safely (sync)
 * @deprecated Use readJsonAsync() for non-blocking I/O
 */
function readJsonSync(filePath, defaultValue = null) {
  return safeJsonReadSync(filePath, defaultValue, filePath);
}

/**
 * Read JSON safely (async - for runtime)
 */
async function readJsonAsync(filePath, defaultValue = null) {
  try {
    const content = await fsPromises.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return defaultValue;
  }
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
  
  const invocation = {
    timestamp: new Date().toISOString(),
    tool: toolName,
    category: AVAILABLE_TOOLS[toolName]?.category || 'unknown',
    priority: AVAILABLE_TOOLS[toolName]?.priority || 'unknown',
    params: sanitizeParams(params),
    success: result?.success !== false,
    context: {
      session: context.session || 'default',
      task: context.task || null,
      messageCount: context.messageCount || 0,
      ...context
    }
  };
  
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
    session_id: context.session || 'default',
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
 * Update metrics after an invocation
 */
async function updateMetrics(toolName, invocation) {
  // Queue full read-modify-write to prevent concurrent callers from
  // reading stale metrics and losing increments.
  const doTransaction = async () => {
    let metrics;
    try {
      metrics = await readJsonAsync(METRICS_FILE);
    } catch {
      metrics = {
        totalSessions: 0,
        totalInvocations: 0,
        toolCounts: {},
        categoryCounts: {},
        breadthScore: 0,
        underUseEvents: 0,
        appropriatenessScore: 0
      };
    }

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

module.exports = {
  init,
  logInvocation,
  detectUnderUse,
  getUsageReport,
  startSession,
  endSession,
  AVAILABLE_TOOLS,
  TOOL_APPROPRIATENESS_RULES
};
