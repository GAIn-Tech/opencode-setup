'use strict';

/**
 * Response Validator
 * 
 * Validates LLM responses for early failure detection.
 * Catches empty responses, rate limits, model unavailability, etc.
 */

const FAILURE_TYPES = {
  NULL_RESPONSE: 'null_response',
  EMPTY_RESPONSE: 'empty_response',
  RATE_LIMITED: 'rate_limited',
  MODEL_UNAVAILABLE: 'model_unavailable',
  TRUNCATED: 'truncated',
  MALFORMED: 'malformed',
  TIMEOUT: 'timeout',
  AUTH_ERROR: 'auth_error',
};

// Patterns that indicate failure (case-insensitive)
const FAILURE_PATTERNS = {
  [FAILURE_TYPES.RATE_LIMITED]: [
    /rate.?limit/i,
    /too.?many.?requests/i,
    /quota.*exceeded/i,
    /please.?try.?again.?later/i,
    /429/,
    /Request rate increased too quickly/i,
    /adjust your client logic/i,
  ],
  [FAILURE_TYPES.MODEL_UNAVAILABLE]: [
    /model.*(unavailable|not.?found|deprecated)/i,
    /service.*(unavailable|temporarily)/i,
    /503/,
    /502/,
  ],
  [FAILURE_TYPES.AUTH_ERROR]: [
    /unauthorized/i,
    /invalid.?api.?key/i,
    /authentication.?failed/i,
    /401/,
    /403/,
  ],
};

class ResponseValidationError extends Error {
  constructor(message, failureType, details = {}) {
    super(message);
    this.name = 'ResponseValidationError';
    this.failureType = failureType;
    this.details = details;
    this.retriable = this.#isRetriable(failureType);
  }

  #isRetriable(failureType) {
    // These failures might succeed with a different model
    return [
      FAILURE_TYPES.RATE_LIMITED,
      FAILURE_TYPES.MODEL_UNAVAILABLE,
      FAILURE_TYPES.TIMEOUT,
    ].includes(failureType);
  }
}

/**
 * Validate an LLM response
 * 
 * @param {object} response - Response object with content, stop_reason, etc.
 * @param {object} options - Validation options
 * @returns {object} - { valid: boolean, failureType: string|null, message: string }
 */
function validateResponse(response, options = {}) {
  const {
    minContentLength = 10,
    allowTruncated = false,
  } = options;

  // Null/undefined response
  if (response === null || response === undefined) {
    return {
      valid: false,
      failureType: FAILURE_TYPES.NULL_RESPONSE,
      message: 'Response is null or undefined',
    };
  }

  // Extract content
  const content = typeof response === 'string' 
    ? response 
    : (response.content || response.text || response.message || '');

  // Empty response
  if (!content || content.trim().length === 0) {
    return {
      valid: false,
      failureType: FAILURE_TYPES.EMPTY_RESPONSE,
      message: 'Response content is empty',
    };
  }

  // Check for failure patterns in content
  for (const [failureType, patterns] of Object.entries(FAILURE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        return {
          valid: false,
          failureType,
          message: `Response contains ${failureType} indicator`,
        };
      }
    }
  }

  // Check for truncation
  if (!allowTruncated && response.stop_reason === 'max_tokens') {
    return {
      valid: false,
      failureType: FAILURE_TYPES.TRUNCATED,
      message: 'Response was truncated due to max_tokens',
    };
  }

  // Content too short (might indicate partial failure)
  if (content.trim().length < minContentLength) {
    return {
      valid: false,
      failureType: FAILURE_TYPES.EMPTY_RESPONSE,
      message: `Response too short (${content.trim().length} < ${minContentLength} chars)`,
    };
  }

  return {
    valid: true,
    failureType: null,
    message: 'Response is valid',
  };
}

/**
 * Quick check if response indicates a retriable failure
 * 
 * @param {object} response - Response to check
 * @returns {boolean} - True if failure is retriable with different model
 */
function isRetriableFailure(response) {
  const result = validateResponse(response);
  if (result.valid) return false;
  
  return [
    FAILURE_TYPES.RATE_LIMITED,
    FAILURE_TYPES.MODEL_UNAVAILABLE,
    FAILURE_TYPES.TIMEOUT,
    FAILURE_TYPES.EMPTY_RESPONSE,
  ].includes(result.failureType);
}

module.exports = {
  FAILURE_TYPES,
  ResponseValidationError,
  validateResponse,
  isRetriableFailure,
};
