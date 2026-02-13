/**
 * Stuck Bug Detector
 *
 * Detects when the agent is stuck on a bug or similar problem.
 * Monitors failure patterns using semantic similarity and time-based thresholds.
 */

class StuckBugDetector {
  #failureHistory = [];
  #lastFailureTimestamp = null;

  /**
   * Configuration thresholds
   */
  #THRESHOLDS = {
    /**
     * Time threshold for task timeout (5 minutes)
     */
    TIMEOUT_MS: 5 * 60 * 1000,

    /**
     * Minimum semantic similarity for considering failures as "same bug"
     */
    SEMANTIC_SIMILARITY_THRESHOLD: 0.90,

    /**
     * Number of failures before triggering stuck bug detection
     */
    FAILURE_THRESHOLD: 3,

    /**
     * Time window for counting failures (3 minutes)
     */
    FAILURE_WINDOW_MS: 3 * 60 * 1000
  };

  constructor(config = {}) {
    Object.assign(this.#THRESHOLDS, config);
  }

  /**
   * Record a failure
   *
   * @param {Object} failure - Failure information
   * @param {string} failure.error - Error message
   * @param {string} failure.code - Context where error occurred
   * @param {string} failure.stack_trace - Stack trace
   * @param {number} timestamp - Timestamp (default: Date.now())
   */
  recordFailure(failure, timestamp = Date.now()) {
    const failureEntry = {
      error: failure.error,
      code: failure.code,
      stack_trace: failure.stack_trace,
      timestamp,
      semantic_fingerprint: this.#computeSemanticFingerprint(failure)
    };

    this.#failureHistory.push(failureEntry);
    this.#lastFailureTimestamp = timestamp;

    // Trim history to last 50 failures
    if (this.#failureHistory.length > 50) {
      this.#failureHistory.shift();
    }

    console.log(`[StuckBugDetector] Failure recorded: ${failure.error.split('\n')[0].substring(0, 60)}...`);
  }

  /**
   * Check if stuck on a bug
   *
   * @returns {boolean} - Is the agent stuck?
   */
  isStuck() {
    const now = Date.now();

    // Check for timeout (e.g., no success in 5 minutes)
    if (this.#lastFailureTimestamp &&
        now - this.#lastFailureTimestamp > this.#THRESHOLDS.TIMEOUT_MS) {
      console.log('[StuckBugDetector] Stuck detected: timeout threshold exceeded');
      return true;
    }

    // Check for repeated failures
    const recentFailures = this.#getRecentFailures(now);
    if (recentFailures.length >= this.#THRESHOLDS.FAILURE_THRESHOLD) {
      const hasSimilarFailures = this.#hasSimilarFailures(recentFailures);

      if (hasSimilarFailures) {
        console.log('[StuckBugDetector] Stuck detected: repeated similar failures');
        return true;
      }
    }

    return false;
  }

  /**
   * Get stuck reason
   *
   * @returns {string|null} - Reason for being stuck
   */
  getStuckReason() {
    const now = Date.now();

    if (this.#lastFailureTimestamp &&
        now - this.#lastFailureTimestamp > this.#THRESHOLDS.TIMEOUT_MS) {
      return 'timeout';
    }

    const recentFailures = this.#getRecentFailures(now);
    if (recentFailures.length >= this.#THRESHOLDS.FAILURE_THRESHOLD &&
        this.#hasSimilarFailures(recentFailures)) {
      return 'repeated_failures';
    }

    return null;
  }

  /**
   * Get the most likely provider to switch to (most different from current)
   *
   * @param {string} currentProvider - Current provider
   * @returns {string} - Recommended provider
   */
  getAlternativeProvider(currentProvider) {
    // Provider diversity matrix
    const diversityMatrix = {
      anthropic: ['openai', 'antigravity', 'gemini'],  // Claude → Gemini, GPT, different training
      openai: ['anthropic', 'antigravity', 'cerebras'],
      gemini: ['anthropic', 'openai', 'nvidia'],
      antigravity: ['anthropic', 'openai', 'cerebras'],
      groq: ['cerebras', 'nvidia', 'openai'],
      cerebras: ['groq', 'nvidia', 'antigravity'],
      nvidia: ['groq', 'cerebras', 'openai']
    };

    const alternatives = diversityMatrix[currentProvider] || [];
    return alternatives[0] || 'anthropic';
  }

  /**
   * Get recent failures within the failure window
   *
   * @param {number} now - Current timestamp
   * @returns {Array} - Recent failures
   */
  #getRecentFailures(now) {
    const windowStart = now - this.#THRESHOLDS.FAILURE_WINDOW_MS;
    return this.#failureHistory.filter(f => f.timestamp > windowStart);
  }

  /**
   * Check if failures are similar (semantic similarity)
   *
   * @param {Array} failures - Failures to check
   * @returns {boolean} - Are there similar failures?
   */
  #hasSimilarFailures(failures) {
    const threshold = this.#THRESHOLDS.SEMANTIC_SIMILARITY_THRESHOLD;

    for (let i = 0; i < failures.length; i++) {
      for (let j = i + 1; j < failures.length; j++) {
        const similarity = this.#computeSemanticSimilarity(
          failures[i].semantic_fingerprint,
          failures[j].semantic_fingerprint
        );

        if (similarity >= threshold) {
          console.log(`[StuckBugDetector] Similar failures detected (similarity: ${similarity.toFixed(2)})`);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Compute semantic fingerprint of failure
   * (In production, this would use embeddings from a sentence transformer)
   *
   * @param {Object} failure - Failure info
   * @returns {string} - Semantic fingerprint
   */
  #computeSemanticFingerprint(failure) {
    // Simple heuristic fingerprint (prod would use embeddings)
    const code = failure.code || '';
    const error = failure.error || '';

    // Extract function names, error codes, etc.
    const codeTokens = code.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    const errorTokens = error.match(/[A-Z][A-Z0-9_]*/g) || [];

    // Combine and deduplicate
    const fingerprint = [...new Set([...codeTokens, ...errorTokens])].join(':');

    return fingerprint;
  }

  /**
   * Compute semantic similarity between two fingerprints
   * (In production, this would use cosine similarity of embeddings)
   *
   * @param {string} fp1 - First fingerprint
   * @param {string} fp2 - Second fingerprint
   * @returns {number} - Similarity score 0-1
   */
  #computeSemanticSimilarity(fp1, fp2) {
    // Simple Jaccard similarity (prod would use cosine similarity)
    const set1 = new Set(fp1.split(':'));
    const set2 = new Set(fp2.split(':'));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Clear failure history
   */
  clearHistory() {
    this.#failureHistory = [];
    this.#lastFailureTimestamp = null;
    console.log('[StuckBugDetector] History cleared');
  }

  /**
   * Get failure statistics
   *
   * @returns {Object} - Statistics
   */
  getStats() {
    const now = Date.now();
    const recentFailures = this.#getRecentFailures(now);

    return {
      total_failures: this.#failureHistory.length,
      recent_failures: recentFailures.length,
      last_failure: this.#lastFailureTimestamp,
      is_stuck: this.isStuck(),
      stuck_reason: this.getStuckReason()
    };
  }
}

module.exports = StuckBugDetector;
