/**
 * Orchestrate Skill → Memory Graph Bridge
 * 
 * This module connects the orchestrate skill's session decisions
c * to the memory-graph package for persistence and analysis.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_DIR = path.join(os.homedir(), '.omc', 'logs');
const SESSION_LOG = path.join(LOG_DIR, 'orchestrate-sessions.jsonl');

/**
 * Ensure log directory exists
 */
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Log a session event to the JSONL file
 * @param {Object} event - The event to log
 */
function logEvent(event) {
  ensureLogDir();
  
  const entry = {
    timestamp: new Date().toISOString(),
    session_id: process.env.OMC_SESSION_ID || 'unknown',
    ...event
  };
  
  fs.appendFileSync(SESSION_LOG, JSON.stringify(entry) + '\n');
}

/**
 * Log when a task starts being processed
 * @param {string} agent - The agent handling the task
 * @param {string} model - The model being used
 * @param {string} taskPrompt - The task description
 * @param {string} complexity - Complexity assessment
 */
function logTaskStart(agent, model, taskPrompt, complexity) {
  logEvent({
    type: 'task_start',
    agent,
    model,
    task_hash: hashString(taskPrompt),
    complexity,
    prompt_preview: taskPreview(taskPrompt)
  });
}

/**
 * Log task completion
 * @param {string} agent - The agent that handled the task
 * @param {boolean} success - Whether the task succeeded
 * @param {number} durationMs - Task duration in milliseconds
 * @param {Object} metadata - Additional metadata
 */
function logTaskComplete(agent, success, durationMs, metadata = {}) {
  logEvent({
    type: 'task_complete',
    agent,
    success,
    duration_ms: durationMs,
    ...metadata
  });
}

/**
 * Log an error that occurred
 * @param {string} agent - The agent running when error occurred
 * @param {Error} error - The error object
 * @param {string} context - Additional context
 */
function logError(agent, error, context = '') {
  logEvent({
    type: 'error',
    agent,
    error_type: error.name,
    error_message: error.message,
    stack_preview: error.stack?.split('\n').slice(0, 3).join('\n'),
    context
  });
}

/**
 * Log a tool invocation with context and result
 * @param {string} toolName - Name of the tool (e.g., 'read', 'grep', 'bash')
 * @param {object} params - Tool parameters (sanitized - no secrets)
 * @param {object} result - Tool result summary
 * @param {object} context - Session/task context
 */
function logToolInvocation(toolName, params = {}, result = {}, context = {}) {
  const sanitizedParams = { ...params };
  // Strip sensitive data
  delete sanitizedParams.apiKey;
  delete sanitizedParams.token;
  delete sanitizedParams.secret;
  // Truncate large values
  for (const [k, v] of Object.entries(sanitizedParams)) {
    if (typeof v === 'string' && v.length > 200) {
      sanitizedParams[k] = v.substring(0, 200) + '...';
    }
  }

  logEvent({
    type: 'tool_invocation',
    tool: toolName,
    params_summary: sanitizedParams,
    success: result.success !== false,
    duration_ms: result.durationMs || null,
    error: result.error || null,
    session_id: context.sessionId || null,
    task_id: context.taskId || null,
    agent: context.agent || null
  });
}

/**
 * Log model routing decision
 * @param {string} fromModel - Original model
 * @param {string} toModel - Target model after routing
 * @param {string} reason - Why routing occurred
 */
function logModelRouting(fromModel, toModel, reason) {
  logEvent({
    type: 'model_routing',
    from_model: fromModel,
    to_model: toModel,
    reason
  });
}

/**
 * Create a hash of a string for identification without storing full content
 * @param {string} str - String to hash
 * @returns {string} - Hashed value
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

/**
 * Create a preview of the task prompt (first 100 chars)
 * @param {string} prompt - Full prompt
 * @returns {string} - Truncated preview
 */
function taskPreview(prompt) {
  const preview = prompt.substring(0, 100).replace(/\s+/g, ' ').trim();
  return preview.length < prompt.length ? preview + '...' : preview;
}

module.exports = {
  logTaskStart,
  logTaskComplete,
  logError,
  logToolInvocation,
  logModelRouting,
  SESSION_LOG
};
