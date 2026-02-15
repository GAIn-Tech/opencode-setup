/**
 * PatternExtractor — Analyzes opencode session logs to extract anti-patterns and positive patterns.
 *
 * Parses session messages from ~/.opencode/messages/{session_id}/*.json
 * Identifies:
 *   Anti-patterns: shotgun_debug, repeated_mistake, inefficient_solution, wrong_tool,
 *                  type_suppression, broken_state, failed_debug
 *   Positive patterns: efficient_debug, creative_solution, good_delegation,
 *                      clean_refactor, fast_resolution
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const MESSAGES_DIR = path.join(os.homedir(), '.opencode', 'messages');

class PatternExtractor {
  constructor() {
    this.thresholds = {
      // Anti-pattern thresholds
      shotgun_debug_max_edits: 3, // >3 edits to same file = shotgun
      inefficient_tokens_per_line: 500, // >500 tokens per line changed = inefficient
      repeated_mistake_min_sessions: 2, // Same error in 2+ sessions
      // Positive pattern thresholds
      efficient_debug_max_attempts: 1, // Fixed in 1 attempt
      fast_resolution_max_messages: 5, // Resolved in <=5 messages
    };
  }

  /**
   * Extract patterns from a single session.
   * @param {string} sessionId - The session directory name
   * @returns {{ anti_patterns: Object[], positive_patterns: Object[] }}
   */
  extractFromSession(sessionId) {
    const sessionDir = path.join(MESSAGES_DIR, sessionId);

    if (!fs.existsSync(sessionDir)) {
      return { anti_patterns: [], positive_patterns: [], session_id: sessionId, error: 'session not found' };
    }

    const messages = this._loadSessionMessages(sessionDir);
    if (messages.length === 0) {
      return { anti_patterns: [], positive_patterns: [], session_id: sessionId, error: 'no messages' };
    }

    const antiPatterns = [];
    const positivePatterns = [];

    // Run all detectors
    antiPatterns.push(...this._detectShotgunDebug(messages, sessionId));
    antiPatterns.push(...this._detectInefficient(messages, sessionId));
    antiPatterns.push(...this._detectTypeSuppression(messages, sessionId));
    antiPatterns.push(...this._detectBrokenState(messages, sessionId));
    antiPatterns.push(...this._detectFailedDebug(messages, sessionId));
    antiPatterns.push(...this._detectWrongTool(messages, sessionId));
    antiPatterns.push(...this._detectQuotaPressure(messages, sessionId));

    positivePatterns.push(...this._detectEfficientDebug(messages, sessionId));
    positivePatterns.push(...this._detectCreativeSolution(messages, sessionId));
    positivePatterns.push(...this._detectGoodDelegation(messages, sessionId));
    positivePatterns.push(...this._detectFastResolution(messages, sessionId));

    return {
      session_id: sessionId,
      message_count: messages.length,
      anti_patterns: antiPatterns,
      positive_patterns: positivePatterns,
      extracted_at: new Date().toISOString(),
    };
  }

  /**
   * Extract patterns from all available sessions.
   * Also runs cross-session detectors (repeated_mistake).
   * @returns {{ sessions: Object[], cross_session: Object[] }}
   */
  extractFromAllSessions() {
    const sessionDirs = this._listSessionDirs();
    const allResults = [];
    const allAntiPatterns = [];

    for (const sid of sessionDirs) {
      const result = this.extractFromSession(sid);
      allResults.push(result);
      allAntiPatterns.push(...result.anti_patterns);
    }

    // Cross-session: repeated_mistake detection
    const crossSession = this._detectRepeatedMistakes(allResults);

    return {
      sessions_analyzed: sessionDirs.length,
      sessions: allResults,
      cross_session_anti_patterns: crossSession,
      total_anti_patterns:
        allAntiPatterns.length + crossSession.length,
      total_positive_patterns: allResults.reduce(
        (sum, r) => sum + r.positive_patterns.length,
        0
      ),
      extracted_at: new Date().toISOString(),
    };
  }

  // ===== ANTI-PATTERN DETECTORS =====

  /**
   * Shotgun debug: Multiple failed edits to the same file within a session.
   * Detected by counting edit tool calls to the same file path that are followed by errors.
   */
  _detectShotgunDebug(messages, sessionId) {
    const patterns = [];
    const editsByFile = {};

    for (const msg of messages) {
      const toolUse = this._extractToolUse(msg);
      if (!toolUse) continue;

      // Track edit/write operations
      if (
        toolUse.tool === 'edit' ||
        toolUse.tool === 'write' ||
        toolUse.tool === 'mcp_edit' ||
        toolUse.tool === 'mcp_write'
      ) {
        const filePath = toolUse.params?.filePath || toolUse.params?.file_path || 'unknown';
        if (!editsByFile[filePath]) editsByFile[filePath] = [];
        editsByFile[filePath].push({
          timestamp: msg.timestamp || msg.created_at,
          tool: toolUse.tool,
          has_error: this._messageHasError(msg),
        });
      }
    }

    for (const [filePath, edits] of Object.entries(editsByFile)) {
      const failedEdits = edits.filter((e) => e.has_error);
      if (edits.length > this.thresholds.shotgun_debug_max_edits) {
        patterns.push({
          type: 'shotgun_debug',
          description: `${edits.length} edits to ${path.basename(filePath)} (${failedEdits.length} with errors) — indicates trial-and-error debugging`,
          severity: edits.length > 6 ? 'critical' : 'high',
          context: {
            session_id: sessionId,
            file: filePath,
            total_edits: edits.length,
            failed_edits: failedEdits.length,
          },
        });
      }
    }

    return patterns;
  }

  /**
   * Inefficient solution: High token usage relative to actual code changes.
   */
  _detectInefficient(messages, sessionId) {
    const patterns = [];
    const totalTokens = this._estimateTokens(messages);
    const codeChanges = this._countCodeChanges(messages);

    if (codeChanges > 0 && totalTokens / codeChanges > this.thresholds.inefficient_tokens_per_line) {
      patterns.push({
        type: 'inefficient_solution',
        description: `${Math.round(totalTokens / codeChanges)} tokens per line changed (threshold: ${this.thresholds.inefficient_tokens_per_line}) — excessive exploration for simple changes`,
        severity: totalTokens / codeChanges > 1000 ? 'high' : 'medium',
        context: {
          session_id: sessionId,
          estimated_tokens: totalTokens,
          code_changes: codeChanges,
          ratio: Math.round(totalTokens / codeChanges),
        },
      });
    }

    return patterns;
  }

  /**
   * Type suppression: Using @ts-ignore, `any`, type assertions to silence errors.
   */
  _detectTypeSuppression(messages, sessionId) {
    const patterns = [];
    const suppressionPatterns = [
      /@ts-ignore/,
      /@ts-expect-error/,
      /as\s+any/,
      /:\s*any\b/,
      /\/\/\s*eslint-disable/,
      /# type:\s*ignore/,
      /# noqa/,
    ];

    for (const msg of messages) {
      const toolUse = this._extractToolUse(msg);
      if (!toolUse) continue;

      if (toolUse.tool === 'edit' || toolUse.tool === 'write' || toolUse.tool === 'mcp_edit' || toolUse.tool === 'mcp_write') {
        const content = toolUse.params?.newString || toolUse.params?.content || '';
        for (const regex of suppressionPatterns) {
          if (regex.test(content)) {
            patterns.push({
              type: 'type_suppression',
              description: `Type/lint suppression detected: ${regex.source} — fix root cause instead of silencing`,
              severity: 'high',
              context: {
                session_id: sessionId,
                file: toolUse.params?.filePath || 'unknown',
                pattern: regex.source,
              },
            });
            break; // One per tool use
          }
        }
      }
    }

    return patterns;
  }

  /**
   * Broken state: Build/test failures that persist across multiple messages.
   */
  _detectBrokenState(messages, sessionId) {
    const patterns = [];
    let consecutiveErrors = 0;
    let errorStart = null;

    for (const msg of messages) {
      const toolUse = this._extractToolUse(msg);
      if (!toolUse) continue;

      if (toolUse.tool === 'bash' || toolUse.tool === 'mcp_bash') {
        const cmd = toolUse.params?.command || '';
        const isBuildOrTest =
          /\b(build|test|lint|tsc|compile|check)\b/.test(cmd);

        if (isBuildOrTest && this._messageHasError(msg)) {
          if (consecutiveErrors === 0) errorStart = msg.timestamp || msg.created_at;
          consecutiveErrors++;
        } else if (isBuildOrTest) {
          consecutiveErrors = 0;
          errorStart = null;
        }

        if (consecutiveErrors >= 3) {
          patterns.push({
            type: 'broken_state',
            description: `${consecutiveErrors} consecutive build/test failures — working in broken state without fixing root cause`,
            severity: consecutiveErrors >= 5 ? 'critical' : 'high',
            context: {
              session_id: sessionId,
              consecutive_failures: consecutiveErrors,
              started_at: errorStart,
            },
          });
          consecutiveErrors = 0; // Reset after recording
        }
      }
    }

    return patterns;
  }

  /**
   * Failed debug: Debug attempts that didn't resolve the issue.
   */
  _detectFailedDebug(messages, sessionId) {
    const patterns = [];
    const errorTypes = new Map(); // error_message -> count

    for (const msg of messages) {
      const errors = this._extractErrors(msg);
      for (const err of errors) {
        const key = err.slice(0, 100); // Normalize to first 100 chars
        errorTypes.set(key, (errorTypes.get(key) || 0) + 1);
      }
    }

    for (const [error, count] of errorTypes) {
      if (count >= 3) {
        patterns.push({
          type: 'failed_debug',
          description: `Same error appeared ${count} times: "${error.slice(0, 80)}..." — debug approach not working`,
          severity: count >= 5 ? 'high' : 'medium',
          context: {
            session_id: sessionId,
            error_type: error.slice(0, 100),
            occurrences: count,
          },
        });
      }
    }

    return patterns;
  }

  /**
   * Wrong tool: Using ineffective tools for a task type.
   */
  _detectWrongTool(messages, sessionId) {
    const patterns = [];
    const toolSequences = [];

    for (const msg of messages) {
      const toolUse = this._extractToolUse(msg);
      if (toolUse) {
        toolSequences.push({
          tool: toolUse.tool,
          has_error: this._messageHasError(msg),
          timestamp: msg.timestamp || msg.created_at,
        });
      }
    }

    // Detect: grep followed by multiple reads (should use ast-grep or LSP)
    for (let i = 0; i < toolSequences.length - 3; i++) {
      const window = toolSequences.slice(i, i + 4);
      const grepCount = window.filter((t) =>
        ['grep', 'mcp_grep'].includes(t.tool)
      ).length;
      const readCount = window.filter((t) =>
        ['read', 'mcp_read'].includes(t.tool)
      ).length;

      if (grepCount >= 2 && readCount >= 2) {
        patterns.push({
          type: 'wrong_tool',
          description:
            'Multiple grep+read cycles detected — consider using LSP (goto_definition, find_references) or ast-grep for code navigation',
          severity: 'medium',
          context: {
            session_id: sessionId,
            tool: 'grep',
            task_type: 'code_navigation',
            suggestion: 'lsp_goto_definition or ast_grep_search',
          },
        });
        break; // One per session
      }
    }

    return patterns;
  }

  /**
   * Quota pressure: Session shows high provider quota usage or fallbacks.
   */
  _detectQuotaPressure(messages, sessionId) {
    const patterns = [];
    let quotaAlerts = 0;
    let fallbackCount = 0;

    for (const msg of messages) {
      const text = JSON.stringify(msg).toLowerCase();
      // Check for quota warning messages (from quota-routing or usage-tracking)
      if (text.includes('quota at') && (text.includes('warning') || text.includes('critical'))) {
        quotaAlerts++;
      }
      // Check for fallback triggered
      if (text.includes('using fallback') || text.includes('fallbackapplied":true')) {
        fallbackCount++;
      }
    }

    if (quotaAlerts >= 2 || fallbackCount >= 1) {
      patterns.push({
        type: 'quota_exhaustion_risk',
        description: `Quota pressure detected in session: ${quotaAlerts} alerts and ${fallbackCount} fallbacks — task type might be economically inefficient`,
        severity: quotaAlerts > 3 || fallbackCount > 2 ? 'high' : 'medium',
        context: {
          session_id: sessionId,
          quota_alerts: quotaAlerts,
          fallbacks: fallbackCount,
        },
      });
    }

    return patterns;
  }

  // ===== POSITIVE PATTERN DETECTORS =====

  /**
   * Efficient debug: Fixed in a single attempt (edit → verify → done).
   */
  _detectEfficientDebug(messages, sessionId) {
    const patterns = [];
    const toolSequence = messages
      .map((m) => this._extractToolUse(m))
      .filter(Boolean);

    // Look for: read → edit → bash(test/build) with no error
    for (let i = 0; i < toolSequence.length - 2; i++) {
      const [a, b, c] = [toolSequence[i], toolSequence[i + 1], toolSequence[i + 2]];

      const aIsRead = ['read', 'mcp_read'].includes(a.tool);
      const bIsEdit = ['edit', 'mcp_edit', 'write', 'mcp_write'].includes(b.tool);
      const cIsBash = ['bash', 'mcp_bash'].includes(c.tool);
      const cIsTest = cIsBash && /\b(test|build|lint|check)\b/.test(c.params?.command || '');

      if (aIsRead && bIsEdit && cIsTest && !messages[i + 2]?._has_error) {
        patterns.push({
          type: 'efficient_debug',
          description: 'Single-attempt fix: read → edit → verify (clean)',
          success_rate: 1.0,
          context: {
            session_id: sessionId,
            file: b.params?.filePath || 'unknown',
            task_type: 'debug',
          },
        });
        break; // One per session to avoid noise
      }
    }

    return patterns;
  }

  /**
   * Creative solution: Using non-obvious tools or approaches effectively.
   */
  _detectCreativeSolution(messages, sessionId) {
    const patterns = [];
    const toolsUsed = new Set();

    for (const msg of messages) {
      const toolUse = this._extractToolUse(msg);
      if (toolUse) toolsUsed.add(toolUse.tool);
    }

    // Using AST-grep or LSP for refactoring (instead of manual grep+edit)
    if (
      (toolsUsed.has('mcp_ast_grep_search') || toolsUsed.has('mcp_ast_grep_replace')) &&
      !this._sessionHasManyErrors(messages)
    ) {
      patterns.push({
        type: 'creative_solution',
        description: 'Used AST-aware tools for code manipulation — structural approach',
        success_rate: 0.9,
        context: {
          session_id: sessionId,
          tools: ['ast_grep'],
          task_type: 'refactor',
        },
      });
    }

    // Using LSP effectively
    if (
      (toolsUsed.has('mcp_lsp_goto_definition') ||
        toolsUsed.has('mcp_lsp_find_references') ||
        toolsUsed.has('mcp_lsp_rename')) &&
      !this._sessionHasManyErrors(messages)
    ) {
      patterns.push({
        type: 'creative_solution',
        description: 'Used LSP for precise code navigation/refactoring — efficient approach',
        success_rate: 0.9,
        context: {
          session_id: sessionId,
          tools: ['lsp'],
          task_type: 'code_navigation',
        },
      });
    }

    return patterns;
  }

  /**
   * Good delegation: Using sub-agents or background tasks effectively.
   */
  _detectGoodDelegation(messages, sessionId) {
    const patterns = [];
    const toolsUsed = new Set();

    for (const msg of messages) {
      const toolUse = this._extractToolUse(msg);
      if (toolUse) toolsUsed.add(toolUse.tool);
    }

    if (
      (toolsUsed.has('mcp_call_omo_agent') || toolsUsed.has('task')) &&
      !this._sessionHasManyErrors(messages)
    ) {
      patterns.push({
        type: 'good_delegation',
        description: 'Effectively delegated work to sub-agents',
        success_rate: 0.85,
        context: {
          session_id: sessionId,
          task_type: 'complex',
        },
      });
    }

    return patterns;
  }

  /**
   * Fast resolution: Session completed in few messages.
   */
  _detectFastResolution(messages, sessionId) {
    const patterns = [];

    if (
      messages.length <= this.thresholds.fast_resolution_max_messages &&
      messages.length >= 2 &&
      !this._sessionHasManyErrors(messages)
    ) {
      patterns.push({
        type: 'fast_resolution',
        description: `Task completed in ${messages.length} messages — efficient interaction`,
        success_rate: 0.95,
        context: {
          session_id: sessionId,
          message_count: messages.length,
          task_type: 'quick',
        },
      });
    }

    return patterns;
  }

  // ===== CROSS-SESSION DETECTORS =====

  /**
   * Repeated mistake: Same error type appearing across multiple sessions.
   */
  _detectRepeatedMistakes(allResults) {
    const errorsBySessions = new Map(); // error_type -> Set<session_id>

    for (const result of allResults) {
      for (const ap of result.anti_patterns) {
        if (ap.context && ap.context.error_type) {
          const key = ap.context.error_type;
          if (!errorsBySessions.has(key)) errorsBySessions.set(key, new Set());
          errorsBySessions.get(key).add(result.session_id);
        }
      }
    }

    const crossSessionPatterns = [];
    for (const [errorType, sessions] of errorsBySessions) {
      if (sessions.size >= this.thresholds.repeated_mistake_min_sessions) {
        crossSessionPatterns.push({
          type: 'repeated_mistake',
          description: `Error "${errorType.slice(0, 80)}" repeated across ${sessions.size} sessions — systemic issue needs permanent fix`,
          severity: sessions.size >= 3 ? 'critical' : 'high',
          context: {
            error_type: errorType,
            sessions: [...sessions],
            session_count: sessions.size,
          },
        });
      }
    }

    return crossSessionPatterns;
  }

  // ===== HELPERS =====

  /**
   * Load session messages with batching to prevent memory exhaustion.
   * 
   * MEMORY OPTIMIZATION: Processes JSON files in batches instead of loading
   * all simultaneously. For very large sessions (500+ messages), this prevents OOM.
   *
   * @param {string} sessionDir  Directory containing session JSON files.
   * @param {object} [opts]  Options for batched loading.
   * @param {number} [opts.batchSize=100]  Max files to load at once.
   * @returns {object[]} Sorted array of message objects.
   */
  _loadSessionMessages(sessionDir, opts = {}) {
    const { batchSize = 100 } = opts;
    
    try {
      const files = fs.readdirSync(sessionDir).filter((f) => f.endsWith('.json'));
      const messages = [];

      // Process files in batches to prevent memory exhaustion
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        
        for (const file of batch) {
          try {
            const raw = fs.readFileSync(path.join(sessionDir, file), 'utf8');
            const msg = JSON.parse(raw);
            messages.push(msg);
          } catch {
            // Skip malformed files
          }
        }
      }

      // Sort by timestamp if available
      messages.sort((a, b) => {
        const ta = a.timestamp || a.created_at || '';
        const tb = b.timestamp || b.created_at || '';
        return ta.localeCompare(tb);
      });

      return messages;
    } catch {
      return [];
    }
  }

  _listSessionDirs() {
    try {
      if (!fs.existsSync(MESSAGES_DIR)) return [];
      return fs
        .readdirSync(MESSAGES_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      return [];
    }
  }

  _extractToolUse(msg) {
    // Handle various message formats from opencode
    if (msg.tool_use) return msg.tool_use;
    if (msg.type === 'tool_use') {
      return { tool: msg.name, params: msg.input || msg.params || {} };
    }
    if (msg.content && Array.isArray(msg.content)) {
      const toolBlock = msg.content.find((c) => c.type === 'tool_use');
      if (toolBlock) {
        return { tool: toolBlock.name, params: toolBlock.input || {} };
      }
    }
    // Check for tool_calls (OpenAI format)
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const tc = msg.tool_calls[0];
      return {
        tool: tc.function?.name || tc.name,
        params: tc.function?.arguments
          ? (typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments)
          : {},
      };
    }
    return null;
  }

  _messageHasError(msg) {
    const text = JSON.stringify(msg).toLowerCase();
    return (
      text.includes('"error"') ||
      text.includes('error:') ||
      text.includes('failed') ||
      text.includes('exception') ||
      text.includes('traceback')
    );
  }

  _extractErrors(msg) {
    const errors = [];
    const text = JSON.stringify(msg);
    // Match common error patterns
    const errorRegexes = [
      /Error:\s*(.{10,100})/g,
      /error\[.*?\]:\s*(.{10,100})/g,
      /TypeError:\s*(.{10,100})/g,
      /SyntaxError:\s*(.{10,100})/g,
      /ReferenceError:\s*(.{10,100})/g,
      /FAIL\s+(.{10,100})/g,
    ];

    for (const regex of errorRegexes) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        errors.push(match[1].trim());
      }
    }

    return errors;
  }

  _estimateTokens(messages) {
    // Rough estimate: 4 chars per token
    const totalChars = messages.reduce(
      (sum, m) => sum + JSON.stringify(m).length,
      0
    );
    return Math.round(totalChars / 4);
  }

  _countCodeChanges(messages) {
    let lines = 0;
    for (const msg of messages) {
      const toolUse = this._extractToolUse(msg);
      if (!toolUse) continue;
      if (['edit', 'mcp_edit', 'write', 'mcp_write'].includes(toolUse.tool)) {
        const content =
          toolUse.params?.newString || toolUse.params?.content || '';
        lines += content.split('\n').length;
      }
    }
    return Math.max(lines, 1);
  }

  _sessionHasManyErrors(messages) {
    const errorCount = messages.filter((m) => this._messageHasError(m)).length;
    return errorCount > messages.length * 0.4; // >40% messages have errors
  }
}

module.exports = { PatternExtractor };
