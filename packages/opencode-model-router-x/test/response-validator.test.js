const { describe, test, expect } = require('bun:test');
const { 
  validateResponse, 
  isRetriableFailure, 
  ResponseValidationError, 
  FAILURE_TYPES 
} = require('../src/response-validator');

describe('Response Validator', () => {
  describe('validateResponse', () => {
    describe('null/undefined detection', () => {
      test('detects null response', () => {
        const result = validateResponse(null);
        expect(result.valid).toBe(false);
        expect(result.failureType).toBe(FAILURE_TYPES.NULL_RESPONSE);
      });

      test('detects undefined response', () => {
        const result = validateResponse(undefined);
        expect(result.valid).toBe(false);
        expect(result.failureType).toBe(FAILURE_TYPES.NULL_RESPONSE);
      });
    });

    describe('empty response detection', () => {
      test('detects empty string content', () => {
        const result = validateResponse({ content: '' });
        expect(result.valid).toBe(false);
        expect(result.failureType).toBe(FAILURE_TYPES.EMPTY_RESPONSE);
      });

      test('detects whitespace-only content', () => {
        const result = validateResponse({ content: '   \n\t  ' });
        expect(result.valid).toBe(false);
        expect(result.failureType).toBe(FAILURE_TYPES.EMPTY_RESPONSE);
      });

      test('detects too-short content', () => {
        const result = validateResponse({ content: 'OK' });
        expect(result.valid).toBe(false);
        expect(result.failureType).toBe(FAILURE_TYPES.EMPTY_RESPONSE);
      });

      test('respects minContentLength option', () => {
        const result = validateResponse({ content: 'OK' }, { minContentLength: 2 });
        expect(result.valid).toBe(true);
      });
    });

    describe('rate limit detection', () => {
      test('detects rate limit error in content', () => {
        const result = validateResponse({ 
          content: 'Error: Rate limit exceeded. Please try again later.' 
        });
        expect(result.valid).toBe(false);
        expect(result.failureType).toBe(FAILURE_TYPES.RATE_LIMITED);
      });

      test('detects quota exceeded', () => {
        const result = validateResponse({ 
          content: 'Your quota has been exceeded for this period.' 
        });
        expect(result.valid).toBe(false);
        expect(result.failureType).toBe(FAILURE_TYPES.RATE_LIMITED);
      });

      test('detects 429 error', () => {
        const result = validateResponse({ content: 'HTTP 429: Too Many Requests' });
        expect(result.valid).toBe(false);
        expect(result.failureType).toBe(FAILURE_TYPES.RATE_LIMITED);
      });
    });

    describe('model unavailable detection', () => {
      test('detects model unavailable', () => {
        const result = validateResponse({ 
          content: 'The model is currently unavailable.' 
        });
        expect(result.valid).toBe(false);
        expect(result.failureType).toBe(FAILURE_TYPES.MODEL_UNAVAILABLE);
      });

      test('detects service unavailable', () => {
        const result = validateResponse({ 
          content: 'Service temporarily unavailable. Please retry.' 
        });
        expect(result.valid).toBe(false);
        expect(result.failureType).toBe(FAILURE_TYPES.MODEL_UNAVAILABLE);
      });

      test('detects 503 error', () => {
        const result = validateResponse({ content: 'Error 503: Service Unavailable' });
        expect(result.valid).toBe(false);
        expect(result.failureType).toBe(FAILURE_TYPES.MODEL_UNAVAILABLE);
      });
    });

    describe('auth error detection', () => {
      test('detects unauthorized', () => {
        const result = validateResponse({ content: 'Unauthorized: Invalid credentials' });
        expect(result.valid).toBe(false);
        expect(result.failureType).toBe(FAILURE_TYPES.AUTH_ERROR);
      });

      test('detects invalid API key', () => {
        const result = validateResponse({ 
          content: 'Invalid API key provided. Check your credentials.' 
        });
        expect(result.valid).toBe(false);
        expect(result.failureType).toBe(FAILURE_TYPES.AUTH_ERROR);
      });
    });

    describe('truncation detection', () => {
      test('detects truncated response', () => {
        const result = validateResponse({ 
          content: 'Let me explain: First, you need to set up the configuration by',
          stop_reason: 'max_tokens'
        });
        expect(result.valid).toBe(false);
        expect(result.failureType).toBe(FAILURE_TYPES.TRUNCATED);
      });

      test('allows truncated when option enabled', () => {
        const result = validateResponse({ 
          content: 'Partial response that got cut off because of token limit',
          stop_reason: 'max_tokens'
        }, { allowTruncated: true });
        expect(result.valid).toBe(true);
      });
    });

    describe('valid response acceptance', () => {
      test('accepts valid response object', () => {
        const result = validateResponse({ 
          content: 'Here is your answer: The code looks correct and follows best practices.' 
        });
        expect(result.valid).toBe(true);
        expect(result.failureType).toBe(null);
      });

      test('accepts string response', () => {
        const result = validateResponse('This is a valid response with sufficient length.');
        expect(result.valid).toBe(true);
      });

      test('handles text field instead of content', () => {
        const result = validateResponse({ 
          text: 'Response with text field instead of content field.' 
        });
        expect(result.valid).toBe(true);
      });

      test('handles message field', () => {
        const result = validateResponse({ 
          message: 'Response with message field for compatibility.' 
        });
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('isRetriableFailure', () => {
    test('returns true for rate limited', () => {
      expect(isRetriableFailure({ content: 'Rate limit exceeded' })).toBe(true);
    });

    test('returns true for model unavailable', () => {
      expect(isRetriableFailure({ content: 'Model unavailable' })).toBe(true);
    });

    test('returns true for empty response', () => {
      expect(isRetriableFailure({ content: '' })).toBe(true);
    });

    test('returns false for auth error', () => {
      expect(isRetriableFailure({ content: 'Unauthorized access' })).toBe(false);
    });

    test('returns false for valid response', () => {
      expect(isRetriableFailure({ content: 'This is a valid response.' })).toBe(false);
    });
  });

  describe('ResponseValidationError', () => {
    test('creates error with correct properties', () => {
      const error = new ResponseValidationError(
        'Test error',
        FAILURE_TYPES.RATE_LIMITED,
        { modelId: 'test-model' }
      );

      expect(error.message).toBe('Test error');
      expect(error.name).toBe('ResponseValidationError');
      expect(error.failureType).toBe(FAILURE_TYPES.RATE_LIMITED);
      expect(error.details.modelId).toBe('test-model');
      expect(error.retriable).toBe(true);
    });

    test('marks auth errors as non-retriable', () => {
      const error = new ResponseValidationError(
        'Auth failed',
        FAILURE_TYPES.AUTH_ERROR
      );
      expect(error.retriable).toBe(false);
    });
  });

  describe('FAILURE_TYPES', () => {
    test('exports all expected failure types', () => {
      expect(FAILURE_TYPES.NULL_RESPONSE).toBeDefined();
      expect(FAILURE_TYPES.EMPTY_RESPONSE).toBeDefined();
      expect(FAILURE_TYPES.RATE_LIMITED).toBeDefined();
      expect(FAILURE_TYPES.MODEL_UNAVAILABLE).toBeDefined();
      expect(FAILURE_TYPES.TRUNCATED).toBeDefined();
      expect(FAILURE_TYPES.AUTH_ERROR).toBeDefined();
      expect(FAILURE_TYPES.TIMEOUT).toBeDefined();
    });
  });
});
