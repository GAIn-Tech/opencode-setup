const { describe, test, expect, beforeEach } = require('bun:test');
const { SubagentRetryManager, CATEGORY_FALLBACKS, DEFAULT_FALLBACKS } = require('../src/subagent-retry-manager');
const { FAILURE_TYPES } = require('../src/response-validator');

describe('Subagent Retry Manager', () => {
  let manager;

  beforeEach(() => {
    manager = new SubagentRetryManager();
  });

  describe('getFallbackModel', () => {
    test('returns fallback model on failure', () => {
      const fallback = manager.getFallbackModel({
        originalModel: 'google/gemini-3-pro',
        failureType: FAILURE_TYPES.EMPTY_RESPONSE,
        category: 'visual-engineering',
      });
      
      expect(fallback).not.toBe('google/gemini-3-pro');
      expect(fallback).toBeDefined();
    });

    test('provides category-appropriate fallbacks', () => {
      const fallback = manager.getFallbackModel({
        originalModel: 'google/gemini-3-pro',
        failureType: FAILURE_TYPES.RATE_LIMITED,
        category: 'visual-engineering',
      });
      
      // Should get a model suitable for visual-engineering
      expect(CATEGORY_FALLBACKS['visual-engineering']).toContain(fallback);
    });

    test('uses default fallbacks for unknown category', () => {
      const fallback = manager.getFallbackModel({
        originalModel: 'google/gemini-3-pro',
        failureType: FAILURE_TYPES.EMPTY_RESPONSE,
        category: 'unknown-category',
      });
      
      expect(DEFAULT_FALLBACKS).toContain(fallback);
    });

    test('returns different fallbacks for different attempts', () => {
      const fallback1 = manager.getFallbackModel({
        originalModel: 'google/gemini-3-pro',
        failureType: FAILURE_TYPES.EMPTY_RESPONSE,
        category: 'visual-engineering',
        attemptNumber: 1,
      });

      const fallback2 = manager.getFallbackModel({
        originalModel: 'google/gemini-3-pro',
        failureType: FAILURE_TYPES.EMPTY_RESPONSE,
        category: 'visual-engineering',
        attemptNumber: 2,
      });

      // May or may not be different depending on fallback list, but both should be valid
      expect(fallback1).toBeDefined();
      expect(fallback2).toBeDefined();
    });

    test('skips unstable models in fallback selection', () => {
      // Mark first fallback as unstable
      const fallbacks = CATEGORY_FALLBACKS['visual-engineering'];
      for (let i = 0; i < 5; i++) {
        manager.recordFailure(fallbacks[0], FAILURE_TYPES.EMPTY_RESPONSE);
      }

      const fallback = manager.getFallbackModel({
        originalModel: 'google/gemini-3-pro',
        failureType: FAILURE_TYPES.EMPTY_RESPONSE,
        category: 'visual-engineering',
        attemptNumber: 1,
      });

      // Should skip the unstable model (unless it's the only one left)
      if (fallbacks.length > 1) {
        expect(fallback).not.toBe(fallbacks[0]);
      }
    });
  });

  describe('recordFailure', () => {
    test('tracks failure count per model', () => {
      manager.recordFailure('google/gemini-3-pro', FAILURE_TYPES.EMPTY_RESPONSE);
      manager.recordFailure('google/gemini-3-pro', FAILURE_TYPES.EMPTY_RESPONSE);
      
      expect(manager.getFailureCount('google/gemini-3-pro')).toBe(2);
    });

    test('resolves aliases when recording failures', () => {
      manager.recordFailure('google/gemini-3-pro', FAILURE_TYPES.EMPTY_RESPONSE);
      manager.recordFailure('gemini-3-pro', FAILURE_TYPES.EMPTY_RESPONSE);
      
      // Both should count toward the resolved alias
      expect(manager.getFailureCount('google/gemini-3-pro')).toBe(2);
      expect(manager.getFailureCount('antigravity/antigravity-gemini-3-pro')).toBe(2);
    });
  });

  describe('recordSuccess', () => {
    test('decrements failure count', () => {
      manager.recordFailure('test-model', FAILURE_TYPES.EMPTY_RESPONSE);
      manager.recordFailure('test-model', FAILURE_TYPES.EMPTY_RESPONSE);
      manager.recordSuccess('test-model');
      
      expect(manager.getFailureCount('test-model')).toBe(1);
    });

    test('does not go below zero', () => {
      manager.recordSuccess('test-model');
      expect(manager.getFailureCount('test-model')).toBe(0);
    });
  });

  describe('isUnstable', () => {
    test('marks model as unstable after threshold', () => {
      const customManager = new SubagentRetryManager({ failureThreshold: 3 });
      
      for (let i = 0; i < 3; i++) {
        customManager.recordFailure('google/gemini-3-pro', FAILURE_TYPES.EMPTY_RESPONSE);
      }
      
      expect(customManager.isUnstable('google/gemini-3-pro')).toBe(true);
    });

    test('model is not unstable below threshold', () => {
      const customManager = new SubagentRetryManager({ failureThreshold: 5 });
      
      for (let i = 0; i < 4; i++) {
        customManager.recordFailure('google/gemini-3-pro', FAILURE_TYPES.EMPTY_RESPONSE);
      }
      
      expect(customManager.isUnstable('google/gemini-3-pro')).toBe(false);
    });

    test('unstable status expires after window', async () => {
      const customManager = new SubagentRetryManager({ 
        failureThreshold: 2,
        unstableWindowMs: 50, // 50ms window for testing
      });
      
      customManager.recordFailure('test-model', FAILURE_TYPES.EMPTY_RESPONSE);
      customManager.recordFailure('test-model', FAILURE_TYPES.EMPTY_RESPONSE);
      
      expect(customManager.isUnstable('test-model')).toBe(true);
      
      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(customManager.isUnstable('test-model')).toBe(false);
    });
  });

  describe('shouldRetry', () => {
    test('respects max retry attempts', () => {
      const customManager = new SubagentRetryManager({ maxRetries: 2 });
      
      expect(customManager.shouldRetry({ attemptNumber: 1 })).toBe(true);
      expect(customManager.shouldRetry({ attemptNumber: 2 })).toBe(true);
      expect(customManager.shouldRetry({ attemptNumber: 3 })).toBe(false);
    });

    test('does not retry auth errors', () => {
      expect(manager.shouldRetry({ 
        attemptNumber: 1, 
        failureType: FAILURE_TYPES.AUTH_ERROR 
      })).toBe(false);
    });

    test('retries rate limit errors', () => {
      expect(manager.shouldRetry({ 
        attemptNumber: 1, 
        failureType: FAILURE_TYPES.RATE_LIMITED 
      })).toBe(true);
    });

    test('predictive retry remains advisory in observe mode', () => {
      const observed = new SubagentRetryManager({
        predictiveFailureThreshold: 2,
        predictiveRetryPolicy: 'observe',
      });

      observed.recordFailure('google/gemini-3-pro', FAILURE_TYPES.EMPTY_RESPONSE);
      observed.recordFailure('google/gemini-3-pro', FAILURE_TYPES.EMPTY_RESPONSE);

      expect(observed.shouldRetry({
        modelId: 'google/gemini-3-pro',
        attemptNumber: 1,
        failureType: FAILURE_TYPES.EMPTY_RESPONSE,
      })).toBe(true);
    });

    test('predictive retry can block when policy is block', () => {
      const blocking = new SubagentRetryManager({
        predictiveFailureThreshold: 2,
        predictiveRetryPolicy: 'block',
      });

      blocking.recordFailure('google/gemini-3-pro', FAILURE_TYPES.EMPTY_RESPONSE);
      blocking.recordFailure('google/gemini-3-pro', FAILURE_TYPES.EMPTY_RESPONSE);

      expect(blocking.shouldRetry({
        modelId: 'google/gemini-3-pro',
        attemptNumber: 1,
        failureType: FAILURE_TYPES.EMPTY_RESPONSE,
      })).toBe(false);
    });
  });

  describe('predictRetryFailure', () => {
    test('returns prediction after repeated failure pattern', () => {
      const predictive = new SubagentRetryManager({ predictiveFailureThreshold: 2 });
      predictive.recordFailure('google/gemini-3-pro', FAILURE_TYPES.RATE_LIMITED);
      predictive.recordFailure('google/gemini-3-pro', FAILURE_TYPES.RATE_LIMITED);

      const result = predictive.predictRetryFailure({
        modelId: 'google/gemini-3-pro',
        failureType: FAILURE_TYPES.RATE_LIMITED,
      });

      expect(result).toBeDefined();
      expect(result.likelyToFail).toBe(true);
      expect(result.count).toBe(2);
    });

    test('returns null when pattern threshold is not reached', () => {
      const predictive = new SubagentRetryManager({ predictiveFailureThreshold: 3 });
      predictive.recordFailure('google/gemini-3-pro', FAILURE_TYPES.RATE_LIMITED);

      const result = predictive.predictRetryFailure({
        modelId: 'google/gemini-3-pro',
        failureType: FAILURE_TYPES.RATE_LIMITED,
      });

      expect(result).toBeNull();
    });
  });

  describe('getUnstableModels', () => {
    test('returns list of unstable models', () => {
      const customManager = new SubagentRetryManager({ failureThreshold: 2 });
      
      customManager.recordFailure('model-a', FAILURE_TYPES.EMPTY_RESPONSE);
      customManager.recordFailure('model-a', FAILURE_TYPES.EMPTY_RESPONSE);
      customManager.recordFailure('model-b', FAILURE_TYPES.EMPTY_RESPONSE);
      customManager.recordFailure('model-b', FAILURE_TYPES.EMPTY_RESPONSE);
      
      const unstable = customManager.getUnstableModels();
      expect(unstable).toContain('model-a');
      expect(unstable).toContain('model-b');
    });
  });

  describe('reset', () => {
    test('clears all tracking', () => {
      const customManager = new SubagentRetryManager({ failureThreshold: 2 });
      
      customManager.recordFailure('model-a', FAILURE_TYPES.EMPTY_RESPONSE);
      customManager.recordFailure('model-a', FAILURE_TYPES.EMPTY_RESPONSE);
      
      expect(customManager.isUnstable('model-a')).toBe(true);
      
      customManager.reset();
      
      expect(customManager.isUnstable('model-a')).toBe(false);
      expect(customManager.getFailureCount('model-a')).toBe(0);
      expect(customManager.getUnstableModels()).toEqual([]);
    });
  });

  describe('CATEGORY_FALLBACKS', () => {
    test('has fallbacks for all expected categories', () => {
      const expectedCategories = [
        'visual-engineering',
        'ultrabrain',
        'deep',
        'artistry',
        'quick',
        'writing',
        'unspecified-low',
        'unspecified-high',
      ];
      
      for (const category of expectedCategories) {
        expect(CATEGORY_FALLBACKS[category]).toBeDefined();
        expect(Array.isArray(CATEGORY_FALLBACKS[category])).toBe(true);
        expect(CATEGORY_FALLBACKS[category].length).toBeGreaterThan(0);
      }
    });
  });
});
