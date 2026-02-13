/**
 * Rate Limit Adapter
 *
 * Adapts model usage based on rate limit thresholds.
 * Scales usage proportional to task complexity and volume.
 */

class RateLimitAdapter {
  #thresholds;
  #taskComplexityMultipliers;
  #taskVolumeMultipliers;

  constructor() {
    // Rate limit thresholds per provider (requests per minute)
    this.#thresholds = {
      'anthropic': 60,  // Standard rate limit
      'google': 100,    // Higher limit for Flash/Pro
      'openai': 80,     // Moderate limit
      'nvidia': 30,     // Free tier limit
      'groq': 100,      // Very high limit on LPUs
      'cerebras': 80    // High limit on CS-2
    };

    // Complexity multipliers for different task types
    // Higher complexity = more tolerant of rate limit usage
    this.#taskComplexityMultipliers = {
      'Simple Read': 0.3,          // Low value, can sustain high latency
      'Format Transform': 0.4,     // Low value
      'Documentation': 0.6,        // Medium value
      'Code Generation': 1.5,      // High value, accept higher rate limit usage
      'Code Transform': 1.8,       // Very high value
      'Debugging': 2.0,            // Critical, prioritize speed
      'Architecture': 1.7,         // High value
      'Large Context': 1.5,        // High value
      'Multimodal': 1.3,           // Medium-high value
      'Orchestration': 1.6         // High value
    };

    // Volume multipliers based on token counts
    // Lower volume = higher tolerance for rate limit bursts
    this.#taskVolumeMultipliers = {
      'low': 0.5,    // < 1K tokens - can afford to wait
      'medium': 0.8, // 1K-10K tokens
      'high': 1.2,   // 10K-50K tokens
      'very_high': 1.5 // > 50K tokens - need throughput
    };
  }

  /**
   * Determine volume category based on token count
   *
   * @param {number} tokenCount - Total token count
   * @returns {string} - Volume category
   */
  #getVolumeCategory(tokenCount) {
    if (tokenCount < 1000) return 'low';
    if (tokenCount < 10000) return 'medium';
    if (tokenCount < 50000) return 'high';
    return 'very_high';
  }

  /**
   * Calculate adaptive rate limit threshold
   *
   * @param {string} provider - Provider name
   * @param {string} taskCategory - Task intent category
   * @param {number} tokenCount - Total token count
   * @returns {number} - Adaptive threshold in requests per minute
   */
  calculateAdaptiveThreshold(provider, taskCategory, tokenCount) {
    const baseThreshold = this.#thresholds[provider] || 60;
    const complexityMultiplier = this.#taskComplexityMultipliers[taskCategory] || 1.0;
    const volumeMultiplier = this.#taskVolumeMultipliers[this.#getVolumeCategory(tokenCount)] || 1.0;

    const adaptiveThreshold = baseThreshold * complexityMultiplier * volumeMultiplier;

    console.log(`[RateLimitAdapter] ${provider}/${taskCategory}: ${baseThreshold} * ${complexityMultiplier} * ${volumeMultiplier} = ${adaptiveThreshold.toFixed(2)}`);

    return adaptiveThreshold;
  }

  /**
   * Check if rate limit should trigger fallback
   *
   * @param {number} currentUsage - Current usage (requests/min)
   * @param {number} adaptiveThreshold - Adaptive threshold
   * @param {number} [tolerance=0.9] - Tolerance factor (0-1)
   * @returns {boolean} - True if should fallback
   */
  shouldFallback(currentUsage, adaptiveThreshold, tolerance = 0.9) {
    const thresholdWithTolerance = adaptiveThreshold * tolerance;

    const shouldFallback = currentUsage >= thresholdWithTolerance;

    if (shouldFallback) {
      console.log(`[RateLimitAdapter] Fallback triggered: ${currentUsage} >= ${thresholdWithTolerance.toFixed(2)} (tolerance: ${tolerance})`);
    }

    return shouldFallback;
  }

  /**
   * Calculate recommended delay between requests
   *
   * @param {number} adaptiveThreshold - Adaptive threshold
   * @returns {number} - Delay in milliseconds
   */
  calculateDelay(adaptiveThreshold) {
    // Target: stay at 80% of threshold
    const targetRate = adaptiveThreshold * 0.8;

    const delayMs = (60 * 1000) / targetRate; // Convert requests/min to ms

    console.log(`[RateLimitAdapter] Recommended delay: ${delayMs.toFixed(2)}ms`);

    return delayMs;
  }

  /**
   * Update base threshold for a provider
   *
   * @param {string} provider - Provider name
   * @param {number} threshold - New threshold (requests/min)
   */
  updateThreshold(provider, threshold) {
    this.#thresholds[provider] = threshold;

    console.log(`[RateLimitAdapter] Updated threshold for ${provider}: ${threshold}`);
  }

  /**
   * Get all thresholds
   *
   * @returns {Object} - Complete thresholds table
   */
  getAllThresholds() {
    return { ...this.#thresholds };
  }

  /**
   * Get complexity multipliers
   *
   * @returns {Object} - Complexity multipliers table
   */
  getComplexityMultipliers() {
    return { ...this.#taskComplexityMultipliers };
  }

  /**
   * Get volume multipliers
   *
   * @returns {Object} - Volume multipliers table
   */
  getVolumeMultipliers() {
    return { ...this.#taskVolumeMultipliers };
  }
}

module.exports = RateLimitAdapter;
