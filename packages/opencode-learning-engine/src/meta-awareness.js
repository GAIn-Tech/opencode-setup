/**
 * MetaAwareness - Self-diagnostic and recommendation system for orchestration
 * 
 * Enables the system to:
 * - Self-diagnose issues (detect its own problems)
 * - Provide meta recommendations (recommend improvements to itself)
 * - Make informed orchestration decisions (use system state in routing)
 * 
 * This gives the system awareness of its own health, performance, and capabilities.
 */

class MetaAwareness {
  constructor(options = {}) {
    this.diagnosticHistory = [];
    this.recommendationHistory = [];
    this.maxHistory = options.maxHistory || 100;
    
    // Thresholds for self-diagnosis
    this.thresholds = {
      highErrorRate: 0.3,
      lowSuccessRate: 0.6,
      staleDataAge: 7 * 24 * 60 * 60 * 1000,
      highLatencyMs: 10000,
      lowConfidence: 0.5,
      patternDecayThreshold: 0.3,
    };
    
    // Performance baselines
    this.baselines = {
      avgResponseTime: 5000,
      targetSuccessRate: 0.85,
      maxRetries: 3,
      healthyPatternCount: 10,
    };
  }

  /**
   * Run self-diagnosis on the learning engine and orchestration system
   */
  diagnose(systemState = {}) {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      healthScore: 100,
      issues: [],
      warnings: [],
      info: [],
    };
    
    const { antiPatterns = {}, positivePatterns = {}, advisor = {}, recentOutcomes = [] } = systemState;
    
    // Pattern health checks
    const antiCount = antiPatterns.patterns?.length || 0;
    if (antiCount > 50) {
      diagnostics.issues.push({
        type: 'high_anti_pattern_count',
        message: `${antiCount} anti-patterns recorded - consider review`,
        severity: 'medium',
      });
      diagnostics.healthScore -= 10;
    }
    
    // Check pattern staleness
    const stalePatterns = this._findStalePatterns(antiPatterns.patterns || []);
    if (stalePatterns.length > 0) {
      diagnostics.warnings.push({
        type: 'stale_patterns',
        message: `${stalePatterns.length} patterns older than 30 days`,
        severity: 'low',
      });
      diagnostics.healthScore -= 5;
    }
    
    // Success rate analysis
    const successRate = this._calculateSuccessRate(recentOutcomes);
    if (recentOutcomes.length > 5) {
      if (successRate < this.thresholds.lowSuccessRate) {
        diagnostics.issues.push({
          type: 'low_success_rate',
          message: `Success rate ${(successRate * 100).toFixed(1)}% below threshold`,
          severity: 'high',
        });
        diagnostics.healthScore -= 20;
      }
    }
    
    // Error pattern analysis
    const errorPatterns = this._analyzeErrorPatterns(recentOutcomes);
    if (errorPatterns.length > 0) {
      diagnostics.warnings.push({
        type: 'recurring_errors',
        message: `Detected ${errorPatterns.length} recurring error patterns`,
        details: errorPatterns.slice(0, 3),
        severity: 'medium',
      });
      diagnostics.healthScore -= 15;
    }
    
    // Latency checks
    const avgLatency = this._calculateAvgLatency(recentOutcomes);
    if (avgLatency > this.thresholds.highLatencyMs) {
      diagnostics.warnings.push({
        type: 'high_latency',
        message: `Average latency ${avgLatency}ms exceeds threshold`,
        severity: 'medium',
      });
      diagnostics.healthScore -= 10;
    }
    
    // Learning gaps
    const gaps = this._detectLearningGaps(systemState);
    if (gaps.length > 0) {
      diagnostics.warnings.push({
        type: 'learning_gaps',
        message: `Detected ${gaps.length} areas lacking pattern coverage`,
        details: gaps,
        severity: 'low',
      });
      diagnostics.healthScore -= 5 * Math.min(gaps.length, 3);
    }
    
    diagnostics.healthScore = Math.max(0, Math.round(diagnostics.healthScore));
    this._addToHistory('diagnostic', diagnostics);
    
    return diagnostics;
  }

  /**
   * Generate meta recommendations based on system state
   */
  recommend(systemState = {}, diagnostics = {}) {
    const recommendations = {
      timestamp: new Date().toISOString(),
      priority: 'low',
      actions: [],
      insights: [],
    };
    
    // Priority based on health
    if (diagnostics.healthScore < 50) {
      recommendations.priority = 'critical';
    } else if (diagnostics.healthScore < 75) {
      recommendations.priority = 'high';
    }
    
    // Pattern hotspot recommendations
    const hotspot = this._findPatternHotspot(systemState.antiPatterns?.patterns || []);
    if (hotspot && hotspot.count > 5) {
      recommendations.actions.push({
        id: `address_${hotspot.type}`,
        title: `Address ${hotspot.type} Pattern`,
        description: `${hotspot.count} occurrences detected`,
        severity: 'high',
        steps: [
          `Investigate ${hotspot.type} root causes`,
          'Add targeted anti-pattern detection',
          'Consider adding skill or agent to handle this case',
        ],
      });
    }
    
    // Error pattern recommendations
    const recurringErrors = this._analyzeErrorPatterns(systemState.recentOutcomes || []);
    if (recurringErrors.length > 0) {
      recommendations.actions.push({
        id: 'handle_recurring_errors',
        title: 'Handle Recurring Error Patterns',
        description: `${recurringErrors.length} error patterns repeating`,
        severity: 'medium',
        steps: recurringErrors.slice(0, 3).map(err => `Add handler for: ${err.pattern}`),
      });
    }
    
    // Learning gaps
    const gaps = this._detectLearningGaps(systemState);
    if (gaps.length > 0) {
      recommendations.actions.push({
        id: 'fill_learning_gaps',
        title: 'Fill Learning Gaps',
        description: `${gaps.length} areas lack pattern coverage`,
        severity: 'low',
        steps: gaps.map(gap => `Add pattern coverage for: ${gap}`),
      });
    }
    
    this._addToHistory('recommendation', recommendations);
    
    return recommendations;
  }

  /**
   * Provide orchestration context for informed decision making
   */
  getOrchestrationGuidance(taskContext = {}, systemState = {}) {
    const guidance = {
      shouldAdjust: false,
      adjustments: [],
      confidence: 0.8,
      reasoning: [],
    };
    
    const diag = this.diagnose(systemState);
    
    // Health-based adjustments
    if (diag.healthScore < 50) {
      guidance.shouldAdjust = true;
      guidance.adjustments.push({
        type: 'conservative_routing',
        reason: 'System health below 50%',
        action: 'Prefer lower-risk agents and skills',
      });
      guidance.confidence *= 0.7;
    } else if (diag.healthScore < 75) {
      guidance.adjustments.push({
        type: 'enhanced_validation',
        reason: 'System health below 75%',
        action: 'Add extra validation steps',
      });
    }
    
    // Error pattern adjustments
    const errorPatterns = this._analyzeErrorPatterns(systemState.recentOutcomes || []);
    const taskErrorMatch = errorPatterns.find(e => 
      taskContext.task_type && e.pattern.includes(taskContext.task_type)
    );
    
    if (taskErrorMatch) {
      guidance.shouldAdjust = true;
      guidance.adjustments.push({
        type: 'error_aware_routing',
        reason: `Known failure pattern: ${taskErrorMatch.pattern}`,
        action: 'Route to more robust agent or add fallback',
      });
      guidance.confidence *= 0.8;
    }
    
    // Complexity-based adjustments
    if (taskContext.complexity === 'extreme' || taskContext.complexity === 'complex') {
      if (diag.healthScore < 85) {
        guidance.shouldAdjust = true;
        guidance.adjustments.push({
          type: 'complexity_caution',
          reason: 'High complexity task + suboptimal system health',
          action: 'Add more agents or skills for parallel processing',
        });
      }
    }
    
    return guidance;
  }

  /**
   * Get system self-awareness summary
   */
  getSummary() {
    return {
      lastDiagnostic: this.diagnosticHistory[this.diagnosticHistory.length - 1] || null,
      lastRecommendation: this.recommendationHistory[this.recommendationHistory.length - 1] || null,
      diagnosticCount: this.diagnosticHistory.length,
      recommendationCount: this.recommendationHistory.length,
      thresholds: this.thresholds,
      baselines: this.baselines,
    };
  }

  // Private helpers
  _findStalePatterns(patterns = []) {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return patterns.filter(p => new Date(p.timestamp || p.discovered_at).getTime() < cutoff);
  }

  _calculateSuccessRate(outcomes = []) {
    if (outcomes.length === 0) return 1;
    const successful = outcomes.filter(o => o.success === true || o.outcome?.success === true).length;
    return successful / outcomes.length;
  }

  _analyzeErrorPatterns(outcomes = []) {
    const errors = outcomes.filter(o => o.success === false || o.outcome?.success === false);
    const patternCounts = {};
    
    for (const error of errors) {
      const pattern = this._extractErrorPattern(error);
      if (pattern) {
        patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
      }
    }
    
    return Object.entries(patternCounts)
      .filter(([, count]) => count >= 2)
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count);
  }

  _extractErrorPattern(outcome) {
    const reason = outcome.failure_reason || outcome.description || outcome.error || '';
    if (reason.includes('timeout')) return 'timeout';
    if (reason.includes('rate_limit') || reason.includes('rate limit')) return 'rate_limit';
    if (reason.includes('quota')) return 'quota_exhaustion';
    if (reason.includes('auth') || reason.includes('unauthorized')) return 'auth_failure';
    if (reason.includes('not found') || reason.includes('404')) return 'not_found';
    if (reason.includes('network') || reason.includes('connection')) return 'network_error';
    return 'unknown_error';
  }

  _calculateAvgLatency(outcomes = []) {
    const withLatency = outcomes.filter(o => o.time_taken_ms || o.latency);
    if (withLatency.length === 0) return 0;
    const total = withLatency.reduce((sum, o) => sum + (o.time_taken_ms || o.latency || 0), 0);
    return Math.round(total / withLatency.length);
  }

  _detectLearningGaps(systemState) {
    const gaps = [];
    const taskTypes = ['debug', 'refactor', 'feature', 'fix', 'test', 'deploy', 'plan'];
    const coveredTypes = new Set(
      (systemState.positivePatterns?.patterns || [])
        .map(p => p.pattern_type)
        .filter(Boolean)
    );
    
    for (const type of taskTypes) {
      if (!coveredTypes.has(type)) {
        gaps.push(type);
      }
    }
    
    return gaps;
  }

  _findPatternHotspot(patterns = []) {
    if (patterns.length === 0) return null;
    const counts = {};
    for (const p of patterns) {
      const type = p.type || 'unknown';
      counts[type] = (counts[type] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return null;
    return { type: sorted[0][0], count: sorted[0][1] };
  }

  _addToHistory(type, data) {
    if (type === 'diagnostic') {
      this.diagnosticHistory.push(data);
      if (this.diagnosticHistory.length > this.maxHistory) {
        this.diagnosticHistory.shift();
      }
    } else if (type === 'recommendation') {
      this.recommendationHistory.push(data);
      if (this.recommendationHistory.length > this.maxHistory) {
        this.recommendationHistory.shift();
      }
    }
  }
}

module.exports = { MetaAwareness };
