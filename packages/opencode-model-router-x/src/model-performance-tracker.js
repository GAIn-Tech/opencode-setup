/**
 * Model Performance Tracker
 * 
 * Tracks and aggregates performance metrics for each model-task category pair.
 * Maintains running statistics including success rate, accuracy, latency percentiles,
 * cost per success, and token usage.
 * 
 * Part of: dynamic-exploration-mode.md
 */

class ModelPerformanceTracker {
  constructor() {
    // Map of "intentCategory:modelId" -> AggregatedMetrics
    this.aggregates = new Map();
  }

  /**
   * Track a single performance observation
   * @param {Object} metrics - Performance metrics from a single task
   */
  async track(metrics) {
    const key = this._getKey(metrics.intentCategory, metrics.modelId);

    if (!this.aggregates.has(key)) {
      this.aggregates.set(key, this._initializeAggregate());
    }

    const agg = this.aggregates.get(key);

    // Update aggregate metrics
    agg.totalAttempts++;
    agg.successfulAttempts += metrics.success ? 1 : 0;
    agg.totalAccuracy += metrics.accuracy;
    agg.totalLatency += metrics.latency;
    agg.totalCost += metrics.cost;
    agg.totalTokens += metrics.tokensUsed || 0;

    // Latency tracking (percentiles)
    agg.latencyHistory.push(metrics.latency);
    agg.latencyHistory.sort((a, b) => a - b);
    if (agg.latencyHistory.length > 100) {
      agg.latencyHistory.shift();
    }

    // Calculate derived metrics
    agg.successRate = agg.successfulAttempts / agg.totalAttempts;
    agg.averageAccuracy = agg.totalAccuracy / agg.totalAttempts;
    agg.averageLatency = agg.totalLatency / agg.totalAttempts;
    agg.averageCost = agg.totalCost / agg.totalAttempts;
    agg.costPerSuccess = agg.successfulAttempts > 0 
      ? agg.totalCost / agg.successfulAttempts 
      : 0;
    agg.averageTokens = agg.totalTokens / agg.totalAttempts;

    // Percentiles
    if (agg.latencyHistory.length > 0) {
      agg.medianLatency = agg.latencyHistory[Math.floor(agg.latencyHistory.length / 2)];
      agg.p95Latency = agg.latencyHistory[Math.floor(agg.latencyHistory.length * 0.95)] || agg.medianLatency;
      agg.p99Latency = agg.latencyHistory[Math.floor(agg.latencyHistory.length * 0.99)] || agg.medianLatency;
    }

    // Accuracy history for consistency tracking
    agg.accuracyHistory.push(metrics.accuracy);
    if (agg.accuracyHistory.length > 50) {
      agg.accuracyHistory.shift();
    }

    return agg;
  }

  /**
   * Get the best model for a given task category
   * @param {string} intentCategory - Task category
   * @returns {string|null} Best model ID or null if no data
   */
  getBestModel(intentCategory) {
    const categoryMetrics = this._getMetricsForCategory(intentCategory);

    if (categoryMetrics.size === 0) {
      return null; // No data yet, use fallback
    }

    // Find best model by weighted score
    let bestModel = null;
    let bestScore = -Infinity;

    for (const [modelId, agg] of categoryMetrics) {
      // Require minimum sample size for reliable assessment
      if (agg.totalAttempts < 3) continue;
      
      const score = this._calculateScore(agg);
      if (score > bestScore) {
        bestScore = score;
        bestModel = modelId;
      }
    }

    return bestModel;
  }

  /**
   * Get all models ranked for a category
   * @param {string} intentCategory - Task category
   * @returns {Array} Array of { modelId, score, metrics }
   */
  getRankedModels(intentCategory) {
    const categoryMetrics = this._getMetricsForCategory(intentCategory);
    const rankings = [];

    for (const [modelId, agg] of categoryMetrics) {
      rankings.push({
        modelId,
        score: this._calculateScore(agg),
        attempts: agg.totalAttempts,
        successRate: agg.successRate,
        averageAccuracy: agg.averageAccuracy,
        medianLatency: agg.medianLatency,
        costPerSuccess: agg.costPerSuccess
      });
    }

    return rankings.sort((a, b) => b.score - a.score);
  }

  /**
   * Get performance summary for a model across all categories
   * @param {string} modelId - Model identifier
   * @returns {Object} Summary metrics
   */
  getModelSummary(modelId) {
    const summary = {
      totalAttempts: 0,
      totalSuccesses: 0,
      categories: [],
      overallSuccessRate: 0,
      overallAccuracy: 0,
      overallLatency: 0,
      overallCost: 0
    };

    for (const [key, agg] of this.aggregates) {
      const [, model] = key.split(':');
      if (model === modelId) {
        summary.totalAttempts += agg.totalAttempts;
        summary.totalSuccesses += agg.successfulAttempts;
        summary.categories.push({
          category: key.split(':')[0],
          attempts: agg.totalAttempts,
          successRate: agg.successRate,
          averageAccuracy: agg.averageAccuracy,
          medianLatency: agg.medianLatency
        });
      }
    }

    if (summary.totalAttempts > 0) {
      summary.overallSuccessRate = summary.totalSuccesses / summary.totalAttempts;
    }

    return summary;
  }

  /**
   * Get all aggregated metrics
   * @returns {Map} All aggregates
   */
  getAllMetrics() {
    return this.aggregates;
  }

  /**
   * Weighted performance score (higher is better)
   * Uses configurable weights for the 4 pillars
   * @param {Object} agg - Aggregated metrics
   * @returns {number} Weighted score
   */
  _calculateScore(agg) {
    const CONFIG = {
      ACCURACY_WEIGHT: 0.4,
      LATENCY_WEIGHT: -0.3,    // Lower latency is better (negative weight)
      COST_WEIGHT: -0.2,       // Lower cost is better (negative weight)
      SUCCESS_WEIGHT: 0.1
    };

    // Normalize latency to 0-1 scale (assuming max 60s = 1.0)
    const normalizedLatency = Math.min(agg.medianLatency / 60000, 1.0);
    
    // Normalize cost to 0-1 scale (assuming max $1 = 1.0)
    const normalizedCost = Math.min(agg.costPerSuccess || 0, 1.0);

    return (
      agg.averageAccuracy * CONFIG.ACCURACY_WEIGHT +
      normalizedLatency * CONFIG.LATENCY_WEIGHT +
      normalizedCost * CONFIG.COST_WEIGHT +
      agg.successRate * CONFIG.SUCCESS_WEIGHT
    );
  }

  /**
   * Get metrics for a specific category
   * @param {string} intentCategory - Task category
   * @returns {Map} Map of modelId -> aggregated metrics
   */
  _getMetricsForCategory(intentCategory) {
    const categoryMetrics = new Map();
    
    for (const [key, agg] of this.aggregates) {
      const [category, modelId] = key.split(':');
      if (category === intentCategory) {
        categoryMetrics.set(modelId, agg);
      }
    }

    return categoryMetrics;
  }

  /**
   * Generate storage key
   * @param {string} intentCategory - Task category
   * @param {string} modelId - Model identifier
   * @returns {string} Storage key
   */
  _getKey(intentCategory, modelId) {
    return `${intentCategory}:${modelId}`;
  }

  /**
   * Initialize a new aggregate record
   * @returns {Object} Empty aggregate
   */
  _initializeAggregate() {
    return {
      totalAttempts: 0,
      successfulAttempts: 0,
      successRate: 0,
      totalAccuracy: 0,
      averageAccuracy: 0,
      accuracyHistory: [],
      totalLatency: 0,
      averageLatency: 0,
      latencyHistory: [],
      medianLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      totalCost: 0,
      averageCost: 0,
      costPerSuccess: 0,
      totalTokens: 0,
      averageTokens: 0
    };
  }
}

module.exports = ModelPerformanceTracker;
