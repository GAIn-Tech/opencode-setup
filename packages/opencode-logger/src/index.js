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

// Create default logger instance
const logger = new Logger();

// Export as ES modules
export { Logger, RequestTracer, logger, LOG_LEVELS };
export default logger;
