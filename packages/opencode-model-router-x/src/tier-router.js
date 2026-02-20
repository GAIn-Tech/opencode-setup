/**
 * VISION Tier Routing System
 * Based on JARVIS/VISION integration patterns
 * Provides complexity-based model selection and automatic fallback
 * Includes anti-pattern detection and memory-aware routing
 */

// VISION-style anti-pattern detection
const ANTI_PATTERNS = [
  { pattern: /override|veto|bypass/i, risk: 0.7, name: 'attempt_override' },
  { pattern: /ignore.*error|skip.*validation|disable.*check/i, risk: 0.5, name: 'policy_bypass' },
  { pattern: /timeout|timeout.*error|deadlock/i, risk: 0.4, name: 'execution_timeout' },
  { pattern: /rate.*limit|quota|exhausted/i, risk: 0.3, name: 'rate_limit' },
  { pattern: /circuit.*break|too.*many.*request/i, risk: 0.3, name: 'circuit_open' },
  { pattern: /auth.*fail|unauthorized|forbidden/i, risk: 0.5, name: 'auth_failure' },
  { pattern: /parse.*error|invalid.*json|malformed/i, risk: 0.4, name: 'parse_error' },
  { pattern: /memory.*error|heap.*out|oom/i, risk: 0.6, name: 'memory_error' },
];

// Memory thresholds for model selection (from VISION context_governor)
const MEMORY_THRESHOLDS = {
  LOW: 256 * 1024 * 1024,    // 256MB - use cheaper models
  MEDIUM: 768 * 1024 * 1024, // 768MB - use standard models
  HIGH: 1024 * 1024 * 1024,  // 1GB - use faster models
};

const COMPLEXITY_KEYWORDS = [
  'architecture', 'design', 'refactor', 'implement',
  'create', 'build', 'system', 'framework', 'integrate',
  'complex', 'advanced', 'critical', 'security', 'performance',
  'optimize', 'scale', 'distributed', 'microservice', 'database',
  'api', 'authentication', 'authorization', 'infrastructure'
];

const TIER_CONFIG = {
  critical: {
    model: 'opus-thinking',
    maxComplexity: 1.0,
    minComplexity: 0.8,
    cost: 2.0,
    parallel: false,
    batchSize: 1,
  },
  architectural: {
    model: 'opus',
    maxComplexity: 0.8,
    minComplexity: 0.5,
    cost: 1.0,
    parallel: false,
    batchSize: 1,
  },
  advanced: {
    model: 'sonnet',
    maxComplexity: 0.5,
    minComplexity: 0.3,
    cost: 0.5,
    parallel: true,
    batchSize: 2,
  },
  routine: {
    model: 'haiku',
    maxComplexity: 0.3,
    minComplexity: 0.1,
    cost: 0.05,
    parallel: true,
    batchSize: 5,
  },
  mechanical: {
    model: 'haiku',
    maxComplexity: 0.1,
    minComplexity: 0.0,
    cost: 0.01,
    parallel: true,
    batchSize: 10,
  }
};

const FALLBACK_TIER_MAP = {
  critical: 'architectural',
  architectural: 'advanced',
  advanced: 'routine',
  routine: 'mechanical',
  mechanical: null
};

class TierRouter {
  constructor(options = {}) {
    this.dailyBudget = options.dailyBudget || 10.0;
    this.dailySpent = 0.0;
    this.lastReset = new Date().toDateString();
    this.taskHistory = [];
    this.tierStats = {
      mechanical: { calls: 0, success: 0, cost: 0 },
      routine: { calls: 0, success: 0, cost: 0 },
      advanced: { calls: 0, success: 0, cost: 0 },
      architectural: { calls: 0, success: 0, cost: 0 },
      critical: { calls: 0, success: 0, cost: 0 }
    };
    this.learningObservations = [];
    
    // Context budget tracking (VISION pattern)
    this.contextBudget = options.contextBudget || 100000; // default 100k tokens
    this.contextUsed = 0;
    this.contextWarnings = [];
  }

  /**
   * Analyze prompt complexity (0-1 scale)
   */
  analyzeComplexity(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      return 0.0;
    }

    let score = 0.0;
    const promptLower = prompt.toLowerCase();

    // Length factor
    if (prompt.length > 500) {
      score += 0.2;
    }
    if (prompt.length > 1000) {
      score += 0.1;
    }
    if (prompt.length > 2000) {
      score += 0.1;
    }

    // Complexity keywords
    for (const keyword of COMPLEXITY_KEYWORDS) {
      if (promptLower.includes(keyword)) {
        score += 0.05;
      }
    }

    // Code block indicators
    if (prompt.includes('```')) {
      score += 0.15;
    }

    // Multiple file indicators
    const fileIndicators = prompt.match(/\/\w+\/\w+/g);
    if (fileIndicators && fileIndicators.length > 3) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Determine best tier based on complexity
   */
  determineTier(prompt) {
    const complexity = this.analyzeComplexity(prompt);

    if (complexity >= 0.8) {
      return { tier: 'critical', complexity, strategy: TIER_CONFIG.critical };
    } else if (complexity >= 0.5) {
      return { tier: 'architectural', complexity, strategy: TIER_CONFIG.architectural };
    } else if (complexity >= 0.3) {
      return { tier: 'advanced', complexity, strategy: TIER_CONFIG.advanced };
    } else if (complexity >= 0.1) {
      return { tier: 'routine', complexity, strategy: TIER_CONFIG.routine };
    } else {
      return { tier: 'mechanical', complexity, strategy: TIER_CONFIG.mechanical };
    }
  }

  /**
   * Detect anti-patterns in error messages (VISION pattern)
   * Returns highest risk score found
   */
  detectAntiPattern(errorMessage) {
    if (!errorMessage || typeof errorMessage !== 'string') {
      return { risk: 0, patterns: [] };
    }

    let highestRisk = 0;
    const matchedPatterns = [];

    for (const anti of ANTI_PATTERNS) {
      if (anti.pattern.test(errorMessage)) {
        matchedPatterns.push(anti.name);
        highestRisk = Math.max(highestRisk, anti.risk);
      }
    }

    return { risk: highestRisk, patterns: matchedPatterns };
  }

  /**
   * Determine routing based on risk score (VISION pattern)
   * >= 0.6: requires review
   * >= 0.3: retry with fallback
   * < 0.3: normal execution
   */
  getRiskBasedRouting(riskScore, tier) {
    if (riskScore >= 0.6) {
      return { action: 'REVIEW', reason: 'High risk detected', fallbackTier: this.getFallbackTier(tier) };
    } else if (riskScore >= 0.3) {
      return { action: 'RETRY', reason: 'Medium risk - retry with fallback', fallbackTier: this.getFallbackTier(tier) };
    } else {
      return { action: 'PROCEED', reason: 'Low risk - proceed normally', fallbackTier: null };
    }
  }

  /**
   * Memory-aware model selection (VISION context_governor pattern)
   * Adjusts tier based on available memory
   */
  getMemoryAwareTier(baseTier, availableMemory = null) {
    // If no memory info, return base tier
    if (!availableMemory) {
      return baseTier;
    }

    // Get memory in bytes
    const memoryMB = availableMemory;
    
    // Downgrade tier if low memory
    if (memoryMB < MEMORY_THRESHOLDS.LOW / (1024 * 1024)) {
      // Force to cheaper model for low memory
      return this.getFallbackTier(baseTier) || 'mechanical';
    } else if (memoryMB < MEMORY_THRESHOLDS.MEDIUM / (1024 * 1024)) {
      // Keep current tier but prefer faster models
      return baseTier;
    } else {
      // Full memory - can use any tier
      return baseTier;
    }
  }

  /**
   * Get fallback tier
   */
  getFallbackTier(currentTier) {
    return FALLBACK_TIER_MAP[currentTier] || null;
  }

  /**
   * Check if under budget
   */
  isUnderBudget(tier) {
    this._checkDailyReset();
    const tierCost = TIER_CONFIG[tier]?.cost || 0.2;
    return (this.dailySpent + tierCost) <= this.dailyBudget;
  }

  /**
   * Context budget tracking (VISION pattern)
   * Returns degradation strategy based on context usage
   */
  getContextStrategy(tokensUsed) {
    this.contextUsed = tokensUsed || 0;
    const usagePercent = (this.contextUsed / this.contextBudget) * 100;

    if (usagePercent > 90) {
      return { 
        strategy: 'fallback_to_summary_context', 
        percent: usagePercent,
        action: 'Compact context to summary'
      };
    } else if (usagePercent > 70) {
      return { 
        strategy: 'open_new_window_with_compaction', 
        percent: usagePercent,
        action: 'Start new window with compaction'
      };
    } else if (usagePercent > 50) {
      return { 
        strategy: 'semantic_fold_and_continue', 
        percent: usagePercent,
        action: 'Fold semantic sections'
      };
    } else {
      return { 
        strategy: 'normal', 
        percent: usagePercent,
        action: 'Continue normally'
      };
    }
  }

  /**
   * Record task execution
   */
  recordTask(prompt, tier, success, cost, tokens) {
    this._checkDailyReset();

    const record = {
      id: `task-${Date.now()}`,
      prompt: prompt.substring(0, 100),
      tier,
      complexity: this.analyzeComplexity(prompt),
      success,
      cost,
      tokens: tokens || 0,
      timestamp: new Date().toISOString()
    };

    this.taskHistory.push(record);
    this.dailySpent += cost;

    // Update tier stats
    if (this.tierStats[tier]) {
      this.tierStats[tier].calls++;
      if (success) {
        this.tierStats[tier].success++;
      }
      this.tierStats[tier].cost += cost;
    }

    // Keep only last 1000 tasks
    if (this.taskHistory.length > 1000) {
      this.taskHistory = this.taskHistory.slice(-1000);
    }

    return record;
  }

  /**
   * Record learning observation
   */
  recordLearningObservation(taskId, prompt, result) {
    const observation = {
      taskId,
      promptHash: this._hashPrompt(prompt),
      complexity: this.analyzeComplexity(prompt),
      success: result?.success !== false,
      cost: result?.cost || 0,
      tokens: result?.tokens || 0,
      tier: result?.tier,
      timestamp: new Date().toISOString()
    };

    this.learningObservations.push(observation);

    // Keep only last 500 observations
    if (this.learningObservations.length > 500) {
      this.learningObservations = this.learningObservations.slice(-500);
    }

    return observation;
  }

  /**
   * Get statistics
   */
  getStats() {
    this._checkDailyReset();

    const totalTasks = this.taskHistory.length;
    const completed = this.taskHistory.filter(t => t.success).length;
    const failed = totalTasks - completed;

    // Calculate success rates by tier
    const tierSuccessRates = {};
    for (const [tier, stats] of Object.entries(this.tierStats)) {
      tierSuccessRates[tier] = {
        successRate: stats.calls > 0 ? (stats.success / stats.calls) * 100 : 0,
        calls: stats.calls,
        avgCost: stats.calls > 0 ? stats.cost / stats.calls : 0
      };
    }

    // Calculate tier accuracy (how often selected tier matched actual complexity)
    let correctTierSelections = 0;
    for (const obs of this.learningObservations) {
      const determined = this.determineTier(obs.promptHash);
      if (determined.tier === obs.tier) {
        correctTierSelections++;
      }
    }
    const tierAccuracy = this.learningObservations.length > 0
      ? (correctTierSelections / this.learningObservations.length) * 100
      : 0;

    return {
      totalTasks,
      completed,
      failed,
      successRate: totalTasks > 0 ? (completed / totalTasks) * 100 : 0,
      totalCost: this.dailySpent,
      dailyBudget: this.dailyBudget,
      budgetRemaining: this.dailyBudget - this.dailySpent,
      budgetUsedPercent: (this.dailySpent / this.dailyBudget) * 100,
      tierStats: tierSuccessRates,
      learningOptimizations: {
        tierAccuracy: Math.round(tierAccuracy),
        observationsRecorded: this.learningObservations.length,
        costSaved: this._estimateCostSavings(),
        fallbackRate: this._calculateFallbackRate()
      }
    };
  }

  /**
   * Attempt fallback execution
   */
  async attemptFallback(prompt, currentTier, executeFn) {
    const fallbackTier = this.getFallbackTier(currentTier);

    if (!fallbackTier) {
      return null;
    }

    try {
      const result = await executeFn(fallbackTier);
      return {
        success: true,
        tier: fallbackTier,
        originalTier: currentTier,
        cost: result.cost * 0.5, // Discount for fallback
        result: result.output
      };
    } catch (error) {
      // Try another fallback
      return this.attemptFallback(prompt, fallbackTier, executeFn);
    }
  }

  /**
   * Reset daily budget if new day
   */
  _checkDailyReset() {
    const today = new Date().toDateString();
    if (today !== this.lastReset) {
      this.dailySpent = 0.0;
      this.lastReset = today;
    }
  }

  /**
   * Hash prompt for observation storage
   */
  _hashPrompt(prompt) {
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
      const char = prompt.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Estimate cost savings from tier optimization
   */
  _estimateCostSavings() {
    // Compare actual cost vs using highest tier always
    const highestTierCost = this.taskHistory.length * TIER_CONFIG.critical.cost;
    const actualCost = this.dailySpent;
    return Math.round((highestTierCost - actualCost) * 100) / 100;
  }

  /**
   * Calculate fallback rate
   */
  _calculateFallbackRate() {
    const fallbacks = this.learningObservations.filter(
      obs => obs.tier !== this.determineTier(obs.promptHash).tier
    ).length;
    return this.learningObservations.length > 0
      ? Math.round((fallbacks / this.learningObservations.length) * 100)
      : 0;
  }
}

module.exports = {
  TierRouter,
  TIER_CONFIG,
  COMPLEXITY_KEYWORDS
};
