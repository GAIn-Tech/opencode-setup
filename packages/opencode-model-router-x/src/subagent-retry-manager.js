'use strict';

const { FAILURE_TYPES } = require('./response-validator');
const { resolveModelAlias } = require('./model-alias-resolver');

/**
 * Subagent Retry Manager
 * 
 * Manages retry logic and fallback model selection for subagent tasks.
 * Tracks model stability and provides intelligent fallback selection.
 */

// Category → Fallback models (in priority order)
const CATEGORY_FALLBACKS = {
  'visual-engineering': [
    'antigravity/antigravity-gemini-3-pro',
    'anthropic/claude-sonnet-4-5',
    'openai/gpt-5.2',
  ],
  'ultrabrain': [
    'anthropic/claude-opus-4-6',
    'openai/gpt-5.3-codex',
    'antigravity/antigravity-claude-opus-4-6-thinking',
  ],
  'deep': [
    'anthropic/claude-opus-4-6',
    'openai/gpt-5.3-codex',
    'antigravity/antigravity-claude-sonnet-4-5-thinking',
  ],
  'artistry': [
    'antigravity/antigravity-gemini-3-pro',
    'anthropic/claude-sonnet-4-5',
    'openai/gpt-5.2',
  ],
  'quick': [
    'anthropic/claude-haiku-4-5',
    'antigravity/antigravity-gemini-3-flash',
    'openai/gpt-5',
  ],
  'writing': [
    'antigravity/antigravity-gemini-3-flash',
    'anthropic/claude-sonnet-4-5',
    'openai/gpt-5.2',
  ],
  'unspecified-low': [
    'anthropic/claude-sonnet-4-5',
    'antigravity/antigravity-claude-sonnet-4-5',
    'openai/gpt-5.2',
  ],
  'unspecified-high': [
    'anthropic/claude-opus-4-6',
    'openai/gpt-5.3-codex',
    'antigravity/antigravity-claude-opus-4-6-thinking',
  ],
};

// Default fallback chain for unknown categories
const DEFAULT_FALLBACKS = [
  'anthropic/claude-sonnet-4-5',
  'openai/gpt-5.2',
  'antigravity/antigravity-gemini-3-pro',
];

class SubagentRetryManager {
  #failureCounts = new Map();
  #unstableModels = new Set();
  #options;

  constructor(options = {}) {
    this.#options = {
      maxRetries: options.maxRetries || 3,
      failureThreshold: options.failureThreshold || 5,
      unstableWindowMs: options.unstableWindowMs || 5 * 60 * 1000, // 5 minutes
      ...options,
    };
  }

  /**
   * Record a model failure
   */
  recordFailure(modelId, failureType) {
    const resolved = resolveModelAlias(modelId);
    const key = resolved;
    
    const current = this.#failureCounts.get(key) || { count: 0, lastFailure: 0 };
    current.count++;
    current.lastFailure = Date.now();
    current.lastFailureType = failureType;
    this.#failureCounts.set(key, current);

    // Mark as unstable if threshold exceeded
    if (current.count >= this.#options.failureThreshold) {
      this.#unstableModels.add(key);
      console.warn(`[SubagentRetryManager] Model ${resolved} marked unstable after ${current.count} failures`);
    }
  }

  /**
   * Record a model success (reduces failure count)
   */
  recordSuccess(modelId) {
    const resolved = resolveModelAlias(modelId);
    const current = this.#failureCounts.get(resolved);
    
    if (current) {
      current.count = Math.max(0, current.count - 1);
      if (current.count < this.#options.failureThreshold) {
        this.#unstableModels.delete(resolved);
      }
    }
  }

  /**
   * Get failure count for a model
   */
  getFailureCount(modelId) {
    const resolved = resolveModelAlias(modelId);
    return this.#failureCounts.get(resolved)?.count || 0;
  }

  /**
   * Check if model is currently unstable
   */
  isUnstable(modelId) {
    const resolved = resolveModelAlias(modelId);
    
    // Check if unstable status has expired
    const stats = this.#failureCounts.get(resolved);
    if (stats && this.#unstableModels.has(resolved)) {
      if (Date.now() - stats.lastFailure > this.#options.unstableWindowMs) {
        this.#unstableModels.delete(resolved);
        return false;
      }
    }
    
    return this.#unstableModels.has(resolved);
  }

  /**
   * Determine if we should retry
   */
  shouldRetry({ attemptNumber, failureType }) {
    if (attemptNumber > this.#options.maxRetries) {
      return false;
    }

    // Don't retry auth errors - they won't magically fix themselves
    if (failureType === FAILURE_TYPES.AUTH_ERROR) {
      return false;
    }

    return true;
  }

  /**
   * Get fallback model for a failed request
   */
  getFallbackModel({ originalModel, failureType, category, attemptNumber = 1 }) {
    const resolved = resolveModelAlias(originalModel);
    const fallbacks = CATEGORY_FALLBACKS[category] || DEFAULT_FALLBACKS;
    
    // Filter out unstable models and the original model
    const available = fallbacks.filter(m => {
      const resolvedFallback = resolveModelAlias(m);
      return resolvedFallback !== resolved && !this.isUnstable(resolvedFallback);
    });

    if (available.length === 0) {
      // All fallbacks are unstable or same as original - return first fallback anyway
      console.warn(`[SubagentRetryManager] All fallbacks exhausted for ${category}, using first available`);
      return fallbacks.find(m => resolveModelAlias(m) !== resolved) || fallbacks[0];
    }

    // Return fallback based on attempt number
    const index = Math.min(attemptNumber - 1, available.length - 1);
    return available[index];
  }

  /**
   * Get all unstable models
   */
  getUnstableModels() {
    return Array.from(this.#unstableModels);
  }

  /**
   * Reset all tracking
   */
  reset() {
    this.#failureCounts.clear();
    this.#unstableModels.clear();
  }
}

module.exports = {
  SubagentRetryManager,
  CATEGORY_FALLBACKS,
  DEFAULT_FALLBACKS,
};
