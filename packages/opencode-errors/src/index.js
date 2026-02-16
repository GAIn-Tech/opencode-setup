/**
 * Standardized OpenCode Error Types
 * Provides consistent error handling across all packages
 */

// Error Categories
export const ErrorCategory = {
  AUTH: 'AUTH',           // Authentication/authorization errors
  PROVIDER: 'PROVIDER',   // LLM provider errors (rate limits, API errors)
  NETWORK: 'NETWORK',     // Network connectivity errors
  CONFIG: 'CONFIG',       // Configuration errors
  STATE: 'STATE',         // State management errors
  VALIDATION: 'VALIDATION', // Input validation errors
  TIMEOUT: 'TIMEOUT',     // Operation timeouts
  RATE_LIMIT: 'RATE_LIMIT', // Rate limiting errors
  INTERNAL: 'INTERNAL',   // Internal system errors
  UNKNOWN: 'UNKNOWN'     // Unknown errors
};

// Error Codes - specific error identifiers
export const ErrorCode = {
  // Auth errors (AUTH)
  INVALID_API_KEY: 'INVALID_API_KEY',
  EXPIRED_API_KEY: 'EXPIRED_API_KEY',
  MISSING_API_KEY: 'MISSING_API_KEY',
  
  // Provider errors (PROVIDER)
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  MODEL_UNSUPPORTED: 'MODEL_UNSUPPORTED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  CONTENT_POLICY: 'CONTENT_POLICY',
  
  // Network errors (NETWORK)
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  DNS_ERROR: 'DNS_ERROR',
  SSL_ERROR: 'SSL_ERROR',
  RESET_CONNECTION: 'RESET_CONNECTION',
  
  // Config errors (CONFIG)
  CONFIG_MISSING: 'CONFIG_MISSING',
  CONFIG_INVALID: 'CONFIG_INVALID',
  CONFIG_CORRUPTED: 'CONFIG_CORRUPTED',
  SCHEMA_VALIDATION_FAILED: 'SCHEMA_VALIDATION_FAILED',
  
  // State errors (STATE)
  STATE_CORRUPTED: 'STATE_CORRUPTED',
  STATE_NOT_FOUND: 'STATE_NOT_FOUND',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  PERSISTENCE_FAILED: 'PERSISTENCE_FAILED',
  
  // Validation errors (VALIDATION)
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',
  
  // Timeout errors (TIMEOUT)
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  OPERATION_TIMEOUT: 'OPERATION_TIMEOUT',
  
  // Rate limit errors (RATE_LIMIT)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXHAUSTED: 'QUOTA_EXHAUSTED',
  TPM_LIMIT: 'TPM_LIMIT',
  RPM_LIMIT: 'RPM_LIMIT',
  
  // Internal errors (INTERNAL)
  UNEXPECTED_ERROR: 'UNEXPECTED_ERROR',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  CIRCULAR_REFERENCE: 'CIRCULAR_REFERENCE',
  MEMORY_ERROR: 'MEMORY_ERROR'
};

/**
 * Base OpenCode Error class
 */
export class OpenCodeError extends Error {
  constructor(message, category, code, details = {}) {
    super(message);
    this.name = 'OpenCodeError';
    this.category = category;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.recoverable = isRecoverable(code);
    
    // Capture stack trace properly in V8 engines (Node/Bun)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      recoverable: this.recoverable,
      stack: this.stack
    };
  }
}

/**
 * Check if error is recoverable (can retry)
 */
function isRecoverable(code) {
  const recoverableCodes = [
    ErrorCode.PROVIDER_UNAVAILABLE,
    ErrorCode.CONNECTION_FAILED,
    ErrorCode.RESET_CONNECTION,
    ErrorCode.REQUEST_TIMEOUT,
    ErrorCode.OPERATION_TIMEOUT,
    ErrorCode.RATE_LIMIT_EXCEEDED,
    ErrorCode.TIMEOUT,
    ErrorCode.PROVIDER
  ];
  return recoverableCodes.includes(code);
}

/**
 * Create error from unknown error (catch-all wrapper)
 */
export function fromUnknown(error, defaultMessage = 'An unknown error occurred') {
  if (error instanceof OpenCodeError) {
    return error;
  }
  
  const message = error?.message || defaultMessage;
  const category = categorizeError(error);
  const code = mapToErrorCode(error, category);
  
  return new OpenCodeError(
    message,
    category,
    code,
    { originalError: error?.name, stack: error?.stack }
  );
}

/**
 * Categorize error by examining the error object
 */
function categorizeError(error) {
  if (!error) return ErrorCategory.UNKNOWN;
  
  const message = (error.message || '').toLowerCase();
  const name = (error.name || '').toLowerCase();
  
  if (message.includes('rate limit') || message.includes('429')) {
    return ErrorCategory.RATE_LIMIT;
  }
  if (message.includes('timeout') || message.includes('etimedout')) {
    return ErrorCategory.TIMEOUT;
  }
  if (message.includes('auth') || message.includes('api key') || message.includes('unauthorized')) {
    return ErrorCategory.AUTH;
  }
  if (message.includes('network') || message.includes('fetch') || message.includes('connect')) {
    return ErrorCategory.NETWORK;
  }
  if (message.includes('config') || message.includes('invalid')) {
    return ErrorCategory.CONFIG;
  }
  if (message.includes('validation') || message.includes('invalid input')) {
    return ErrorCategory.VALIDATION;
  }
  if (message.includes('provider') || message.includes('api')) {
    return ErrorCategory.PROVIDER;
  }
  if (message.includes('memory') || message.includes('heap')) {
    return ErrorCategory.INTERNAL;
  }
  
  return ErrorCategory.UNKNOWN;
}

/**
 * Map error to specific error code
 */
function mapToErrorCode(error, category) {
  const message = (error?.message || '').toLowerCase();
  
  if (category === ErrorCategory.RATE_LIMIT) {
    if (message.includes('quota')) return ErrorCode.QUOTA_EXHAUSTED;
    if (message.includes('tpm')) return ErrorCode.TPM_LIMIT;
    if (message.includes('rpm')) return ErrorCode.RPM_LIMIT;
    return ErrorCode.RATE_LIMIT_EXCEEDED;
  }
  
  if (category === ErrorCategory.TIMEOUT) {
    if (message.includes('request')) return ErrorCode.REQUEST_TIMEOUT;
    return ErrorCode.OPERATION_TIMEOUT;
  }
  
  if (category === ErrorCategory.AUTH) {
    if (message.includes('invalid')) return ErrorCode.INVALID_API_KEY;
    if (message.includes('expired')) return ErrorCode.EXPIRED_API_KEY;
    return ErrorCode.MISSING_API_KEY;
  }
  
  if (category === ErrorCategory.NETWORK) {
    if (message.includes('dns')) return ErrorCode.DNS_ERROR;
    if (message.includes('ssl') || message.includes('certificate')) return ErrorCode.SSL_ERROR;
    if (message.includes('reset')) return ErrorCode.RESET_CONNECTION;
    return ErrorCode.CONNECTION_FAILED;
  }
  
  if (category === ErrorCategory.CONFIG) {
    if (message.includes('schema')) return ErrorCode.SCHEMA_VALIDATION_FAILED;
    if (message.includes('corrupt')) return ErrorCode.CONFIG_CORRUPTED;
    if (message.includes('missing')) return ErrorCode.CONFIG_MISSING;
    return ErrorCode.CONFIG_INVALID;
  }
  
  if (category === ErrorCategory.PROVIDER) {
    if (message.includes('not found') || message.includes('unknown model')) {
      return ErrorCode.MODEL_NOT_FOUND;
    }
    if (message.includes('unsupported')) return ErrorCode.MODEL_UNSUPPORTED;
    if (message.includes('content')) return ErrorCode.CONTENT_POLICY;
    return ErrorCode.PROVIDER_ERROR;
  }
  
  if (category === ErrorCategory.INTERNAL) {
    if (message.includes('circular')) return ErrorCode.CIRCULAR_REFERENCE;
    if (message.includes('memory') || message.includes('heap')) return ErrorCode.MEMORY_ERROR;
    return ErrorCode.UNEXPECTED_ERROR;
  }
  
  return ErrorCode.UNKNOWN;
}

/**
 * Check if error allows retry
 */
export function isRetryable(error) {
  if (error instanceof OpenCodeError) {
    return error.recoverable;
  }
  // Also handle regular errors
  const category = categorizeError(error);
  return [
    ErrorCategory.NETWORK,
    ErrorCategory.TIMEOUT,
    ErrorCategory.RATE_LIMIT,
    ErrorCategory.PROVIDER
  ].includes(category);
}

/**
 * Get user-friendly message for error
 */
export function getUserMessage(error) {
  if (!(error instanceof OpenCodeError)) {
    error = fromUnknown(error);
  }
  
  const messages = {
    [ErrorCode.INVALID_API_KEY]: 'Your API key is invalid. Please check your configuration.',
    [ErrorCode.EXPIRED_API_KEY]: 'Your API key has expired. Please update your configuration.',
    [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded. Please wait a moment and try again.',
    [ErrorCode.QUOTA_EXHAUSTED]: 'API quota exhausted. Please check your provider dashboard.',
    [ErrorCode.PROVIDER_UNAVAILABLE]: 'The AI provider is currently unavailable. Trying fallback...',
    [ErrorCode.CONNECTION_FAILED]: 'Network connection failed. Please check your internet.',
    [ErrorCode.REQUEST_TIMEOUT]: 'Request timed out. Please try again.',
    [ErrorCode.CONFIG_INVALID]: 'Configuration is invalid. Please check your settings.',
    [ErrorCode.SCHEMA_VALIDATION_FAILED]: 'Configuration validation failed. Please check your config file.'
  };
  
  return messages[error.code] || error.message;
}

export default {
  ErrorCategory,
  ErrorCode,
  OpenCodeError,
  fromUnknown,
  isRetryable,
  getUserMessage
};
