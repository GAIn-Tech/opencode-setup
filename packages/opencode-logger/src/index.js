// Structured logging for OpenCode with correlation IDs
// Replaces scattered console.log/error/warn with structured logging

const LOG_LEVELS = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5
};

// ─── Langfuse Integration (opt-in) ───────────────────────────────────────────
// When LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY env vars are set, the logger
// will create Langfuse traces and spans for WARN+ level log entries. This enables
// observability and tracing without changing any existing log output or behavior.
//
// Requirements:
//   - Set LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY environment variables
//   - Install 'langfuse' or 'langfuse-node' npm package (NOT a required dependency)
//   - Optionally set LANGFUSE_BASE_URL for self-hosted instances
//
// When env vars are unset or the package is not installed, the logger behaves
// exactly as before — zero overhead, zero side effects.
// ─────────────────────────────────────────────────────────────────────────────

let _langfuseClient = null;
let _langfuseInitAttempted = false;

function getLangfuse() {
  if (!_langfuseClient && !_langfuseInitAttempted) {
    _langfuseInitAttempted = true;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    if (secretKey && publicKey) {
      try {
        // Try 'langfuse' first (standard package), then 'langfuse-node' (alt name)
        let LangfuseConstructor;
        try {
          const mod = require('langfuse');
          LangfuseConstructor = mod.Langfuse || mod.default || mod;
        } catch (_e1) {
          try {
            const mod = require('langfuse-node');
            LangfuseConstructor = mod.Langfuse || mod.default || mod;
          } catch (_e2) {
            // Neither package available — Langfuse integration disabled
            return null;
          }
        }
        _langfuseClient = new LangfuseConstructor({
          secretKey,
          publicKey,
          ...(process.env.LANGFUSE_BASE_URL && { baseUrl: process.env.LANGFUSE_BASE_URL })
        });
      } catch (_err) {
        // Langfuse init failed — silently disable, never break logging
        _langfuseClient = null;
      }
    }
  }
  return _langfuseClient;
}

const LANGFUSE_LEVELS = new Set(['warn', 'error', 'fatal']);

class Logger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.service = options.service || 'opencode';
    this.enableConsole = options.enableConsole !== false;
    
    // Correlation ID for request tracing
    this.correlationId = null;
  }
  
  setCorrelationId(id) {
    this.correlationId = id;
  }
  
  clearCorrelationId() {
    this.correlationId = null;
  }
  
  _log(level, message, meta = {}) {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.level]) {
      return;
    }
    
    const entry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      service: this.service,
      message,
      ...meta,
      ...(this.correlationId && { correlationId: this.correlationId })
    };
    
    if (this.enableConsole) {
      const color = this._getColor(level);
      const timestamp = entry.timestamp;
      console.log(
        `${color}[${timestamp}] ${level.toUpperCase()}${this._reset()}: ${message}`,
        Object.keys(meta).length ? meta : ''
      );
    }
    
    // Langfuse trace/span for WARN+ levels (opt-in, never fails logging)
    if (LANGFUSE_LEVELS.has(level)) {
      try {
        const lf = getLangfuse();
        if (lf) {
          const trace = lf.trace({
            name: `log:${level}`,
            metadata: {
              service: this.service,
              message,
              ...(this.correlationId && { correlationId: this.correlationId })
            }
          });
          trace.span({
            name: `${level}:${message.slice(0, 80)}`,
            input: meta,
            output: entry
          });
        }
      } catch (_lfErr) {
        // Langfuse must never interfere with logging
      }
    }
    
    return entry;
  }
  
  _getColor(level) {
    const colors = {
      trace: '\x1b[90m',
      debug: '\x1b[36m',
      info: '\x1b[32m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
      fatal: '\x1b[35m'
    };
    return colors[level] || '';
  }
  
  _reset() {
    return '\x1b[0m';
  }
  
  trace(message, meta) { return this._log('trace', message, meta); }
  debug(message, meta) { return this._log('debug', message, meta); }
  info(message, meta) { return this._log('info', message, meta); }
  warn(message, meta) { return this._log('warn', message, meta); }
  error(message, meta) { return this._log('error', message, meta); }
  fatal(message, meta) { return this._log('fatal', message, meta); }
  
  // Flush pending Langfuse events (no-op if Langfuse not configured)
  flush() {
    try {
      return getLangfuse()?.flush();
    } catch (_err) {
      // Never throw from flush
    }
  }
  
  // Child logger with additional context
  child(additionalContext) {
    const child = new Logger({
      level: this.level,
      service: this.service,
      enableConsole: this.enableConsole
    });
    child.correlationId = this.correlationId;
    return {
      ...child,
      _log: (level, message, meta) => {
        return child._log(level, message, { ...additionalContext, ...meta });
      }
    };
  }
}

// Request tracer for correlation IDs
class RequestTracer {
  constructor(logger) {
    this.logger = logger;
    this.requests = new Map();
  }
  
  startRequest(requestId = crypto.randomUUID()) {
    this.logger.setCorrelationId(requestId);
    this.requests.set(requestId, { startTime: Date.now() });
    return requestId;
  }
  
  endRequest(requestId) {
    const request = this.requests.get(requestId);
    if (request) {
      const duration = Date.now() - request.startTime;
      this.logger.info('Request completed', { requestId, duration });
      this.requests.delete(requestId);
    }
    this.logger.clearCorrelationId();
  }
  
  withCorrelation(requestId, fn) {
    const prevId = this.logger.correlationId;
    this.logger.setCorrelationId(requestId);
    try {
      return fn();
    } finally {
      this.logger.setCorrelationId(prevId);
    }
  }
}

// ─── Agent Execution Tracer ──────────────────────────────────────────────────
// High-level trace spans for agent boundaries: task dispatch, model selection,
// skill loading, tool invocations. Emits to Langfuse when configured, otherwise
// to structured logs. Each span records input/output and duration.
// ─────────────────────────────────────────────────────────────────────────────

class AgentTracer {
  constructor(loggerInstance) {
    this._logger = loggerInstance || new Logger({ service: 'agent-tracer' });
  }

  /**
   * Create and execute a traced span.
   * @param {string} spanName - e.g. 'task:dispatch', 'model:select', 'skill:load'
   * @param {object} input - Span input data
   * @param {Function} fn - Async or sync function to execute within the span
   * @returns {Promise<*>} - Result of fn()
   */
  async span(spanName, input, fn) {
    const startMs = Date.now();
    let output = null;
    let error = null;

    try {
      output = await fn();
      return output;
    } catch (err) {
      error = err;
      throw err;
    } finally {
      const durationMs = Date.now() - startMs;
      const meta = {
        span: spanName,
        durationMs,
        ...(input && { input: typeof input === 'object' ? JSON.stringify(input).slice(0, 500) : String(input) }),
        ...(error && { error: error.message || String(error) }),
      };

      // Log at info level (always)
      this._logger.info(`[trace] ${spanName} (${durationMs}ms)${error ? ' FAILED' : ''}`, meta);

      // Emit to Langfuse if available
      try {
        const lf = getLangfuse();
        if (lf) {
          const trace = lf.trace({
            name: `agent:${spanName}`,
            metadata: { service: this._logger.service, durationMs },
          });
          trace.span({
            name: spanName,
            input: input || {},
            output: error ? { error: error.message } : (output || {}),
            startTime: new Date(startMs),
            endTime: new Date(startMs + durationMs),
          });
        }
      } catch (_lfErr) {
        // Never let tracing break execution
      }
    }
  }
}

// Create default logger instance
const logger = new Logger();

// Create default agent tracer
const agentTracer = new AgentTracer(logger);

// Convenience: flush pending Langfuse events via the default logger
function flush() {
  return logger.flush();
}

// Export as ES modules
export { Logger, logger, flush, AgentTracer, agentTracer, RequestTracer };
export default logger;
