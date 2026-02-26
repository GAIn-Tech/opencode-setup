const { describe, test, expect, beforeEach } = require('bun:test');
const { TierRouter, TIER_CONFIG, COMPLEXITY_KEYWORDS } = require('../src/tier-router');

describe('TierRouter - Tier Selection Logic', () => {
  let router;

  beforeEach(() => {
    router = new TierRouter({ dailyBudget: 10.0 });
  });

  describe('Complexity Analysis', () => {
    test('analyzes simple prompt as low complexity', () => {
      const complexity = router.analyzeComplexity('What is 2+2?');
      expect(complexity).toBeLessThan(0.2);
    });

    test('analyzes complex prompt with keywords as high complexity', () => {
      const complexity = router.analyzeComplexity(
        'Design a distributed microservice architecture for a high-performance database system'
      );
      expect(complexity).toBeGreaterThan(0.3);
    });

    test('analyzes prompt with code blocks as higher complexity', () => {
      const simple = router.analyzeComplexity('What is this code?');
      const withCode = router.analyzeComplexity('What is this code?\n```javascript\nconst x = 1;\n```');
      expect(withCode).toBeGreaterThan(simple);
    });

    test('analyzes long prompt as higher complexity', () => {
      const short = router.analyzeComplexity('Hello');
      const long = router.analyzeComplexity('a'.repeat(1000));
      expect(long).toBeGreaterThan(short);
    });

    test('handles null/undefined prompt gracefully', () => {
      expect(router.analyzeComplexity(null)).toBe(0.0);
      expect(router.analyzeComplexity(undefined)).toBe(0.0);
      expect(router.analyzeComplexity('')).toBe(0.0);
    });

    test('caps complexity at 1.0', () => {
      const veryComplex = router.analyzeComplexity(
        'a'.repeat(5000) + ' architecture design refactor implement create build system framework'
      );
      expect(veryComplex).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Tier Determination - Cost-Based Routing', () => {
    test('routes simple prompt to mechanical tier (cheapest)', () => {
      const result = router.determineTier('What is 2+2?');
      expect(result.tier).toBe('mechanical');
      expect(result.strategy.cost).toBe(TIER_CONFIG.mechanical.cost);
    });

    test('routes moderate prompt to routine, advanced, or mechanical tier', () => {
      const result = router.determineTier('Write a function to sort an array');
      expect(['routine', 'advanced', 'mechanical']).toContain(result.tier);
      expect(result.strategy.cost).toBeLessThanOrEqual(TIER_CONFIG.advanced.cost);
    });

    test('routes complex prompt to advanced tier', () => {
      const result = router.determineTier(
        'Design a caching strategy for a distributed system'
      );
      expect(result.tier).toBe('advanced');
      expect(result.strategy.cost).toBeGreaterThan(TIER_CONFIG.routine.cost);
    });

    test('routes architectural prompt to architectural or critical tier', () => {
      const result = router.determineTier(
        'Design a microservice architecture for a high-performance system with distributed database'
      );
      expect(['architectural', 'critical']).toContain(result.tier);
      expect(result.strategy.cost).toBeGreaterThan(TIER_CONFIG.advanced.cost);
    });

    test('routes critical prompt to critical tier (most expensive)', () => {
      const result = router.determineTier(
        'Design a critical security infrastructure with distributed authentication, authorization, and performance optimization across multiple microservices'
      );
      expect(result.tier).toBe('critical');
      expect(result.strategy.cost).toBe(TIER_CONFIG.critical.cost);
    });

    test('cheaper tier has lower cost than expensive tier', () => {
      const cheap = TIER_CONFIG.mechanical.cost;
      const expensive = TIER_CONFIG.critical.cost;
      expect(cheap).toBeLessThan(expensive);
    });
  });

  describe('Tier Determination - Performance-Based Routing', () => {
    test('critical tier disables parallelization', () => {
      const result = router.determineTier(
        'Critical security architecture design with distributed authentication'
      );
      expect(result.strategy.parallel).toBe(false);
      expect(result.strategy.batchSize).toBe(1);
    });

    test('mechanical tier enables parallelization for speed', () => {
      const result = router.determineTier('Simple task');
      expect(result.strategy.parallel).toBe(true);
      expect(result.strategy.batchSize).toBeGreaterThan(1);
    });

    test('faster tier has larger batch size', () => {
      const mechanical = TIER_CONFIG.mechanical.batchSize;
      const critical = TIER_CONFIG.critical.batchSize;
      expect(mechanical).toBeGreaterThan(critical);
    });

    test('architectural tier uses appropriate model for latency', () => {
      const result = router.determineTier(
        'Design a system architecture with performance optimization'
      );
      expect(['opus', 'sonnet']).toContain(result.strategy.model);
    });
  });

  describe('Tier Fallback Behavior', () => {
    test('returns fallback tier when current tier unavailable', () => {
      const fallback = router.getFallbackTier('critical');
      expect(fallback).toBe('architectural');
    });

    test('fallback chain works correctly', () => {
      expect(router.getFallbackTier('critical')).toBe('architectural');
      expect(router.getFallbackTier('architectural')).toBe('advanced');
      expect(router.getFallbackTier('advanced')).toBe('routine');
      expect(router.getFallbackTier('routine')).toBe('mechanical');
      expect(router.getFallbackTier('mechanical')).toBeNull();
    });

    test('mechanical tier has no fallback', () => {
      const fallback = router.getFallbackTier('mechanical');
      expect(fallback).toBeNull();
    });

    test('attemptFallback returns null when no fallback available', async () => {
      const result = await router.attemptFallback(
        'test',
        'mechanical',
        async () => ({ cost: 0.1, output: 'result' })
      );
      expect(result).toBeNull();
    });

    test('attemptFallback executes with fallback tier', async () => {
      let executedTier = null;
      const result = await router.attemptFallback(
        'test',
        'critical',
        async (tier) => {
          executedTier = tier;
          return { cost: 0.5, output: 'fallback result' };
        }
      );
      expect(result.success).toBe(true);
      expect(result.tier).toBe('architectural');
      expect(executedTier).toBe('architectural');
    });

    test('attemptFallback applies cost discount for fallback', async () => {
      const result = await router.attemptFallback(
        'test',
        'critical',
        async () => ({ cost: 1.0, output: 'result' })
      );
      expect(result.cost).toBe(0.5); // 50% discount
    });

    test('attemptFallback chains fallbacks on error', async () => {
      let attempts = 0;
      const result = await router.attemptFallback(
        'test',
        'critical',
        async (tier) => {
          attempts++;
          if (tier === 'architectural') {
            throw new Error('Failed');
          }
          return { cost: 0.3, output: 'success' };
        }
      );
      expect(attempts).toBeGreaterThan(1);
      expect(result.success).toBe(true);
    });
  });

  describe('Tier Boundary Conditions', () => {
    test('complexity exactly at tier boundary routes correctly', () => {
      // Mock analyzeComplexity to return exact boundary
      const originalAnalyze = router.analyzeComplexity;
      router.analyzeComplexity = () => 0.8;
      const result = router.determineTier('test');
      expect(result.tier).toBe('critical');
      router.analyzeComplexity = originalAnalyze;
    });

    test('complexity just below tier boundary routes to lower tier', () => {
      const originalAnalyze = router.analyzeComplexity;
      router.analyzeComplexity = () => 0.79;
      const result = router.determineTier('test');
      expect(result.tier).toBe('architectural');
      router.analyzeComplexity = originalAnalyze;
    });

    test('complexity at 0.0 routes to mechanical', () => {
      const originalAnalyze = router.analyzeComplexity;
      router.analyzeComplexity = () => 0.0;
      const result = router.determineTier('test');
      expect(result.tier).toBe('mechanical');
      router.analyzeComplexity = originalAnalyze;
    });

    test('complexity at 1.0 routes to critical', () => {
      const originalAnalyze = router.analyzeComplexity;
      router.analyzeComplexity = () => 1.0;
      const result = router.determineTier('test');
      expect(result.tier).toBe('critical');
      router.analyzeComplexity = originalAnalyze;
    });
  });

  describe('Budget Tracking', () => {
    test('isUnderBudget returns true when under daily budget', () => {
      router.dailySpent = 2.0;
      router.dailyBudget = 10.0;
      expect(router.isUnderBudget('mechanical')).toBe(true);
    });

    test('isUnderBudget returns false when over daily budget', () => {
      router.dailySpent = 9.5;
      router.dailyBudget = 10.0;
      expect(router.isUnderBudget('critical')).toBe(false);
    });

    test('isUnderBudget accounts for tier cost', () => {
      router.dailySpent = 9.0;
      router.dailyBudget = 10.0;
      expect(router.isUnderBudget('mechanical')).toBe(true);
      expect(router.isUnderBudget('critical')).toBe(false);
    });

    test('daily budget resets on new day', () => {
      router.dailySpent = 5.0;
      router.lastReset = new Date(Date.now() - 86400000).toDateString(); // Yesterday
      router._checkDailyReset();
      expect(router.dailySpent).toBe(0.0);
    });
  });

  describe('Anti-Pattern Detection', () => {
    test('detects override anti-pattern', () => {
      const result = router.detectAntiPattern('Attempting to override validation');
      expect(result.risk).toBeGreaterThan(0);
      expect(result.patterns).toContain('attempt_override');
    });

    test('detects policy bypass anti-pattern', () => {
      const result = router.detectAntiPattern('Ignore error and skip validation');
      expect(result.risk).toBeGreaterThan(0);
      expect(result.patterns).toContain('policy_bypass');
    });

    test('detects timeout anti-pattern', () => {
      const result = router.detectAntiPattern('Operation timeout error');
      expect(result.risk).toBeGreaterThan(0);
      expect(result.patterns).toContain('execution_timeout');
    });

    test('detects rate limit anti-pattern', () => {
      const result = router.detectAntiPattern('Rate limit exceeded');
      expect(result.risk).toBeGreaterThan(0);
      expect(result.patterns).toContain('rate_limit');
    });

    test('detects auth failure anti-pattern', () => {
      const result = router.detectAntiPattern('Authentication failed');
      expect(result.risk).toBeGreaterThan(0);
      expect(result.patterns).toContain('auth_failure');
    });

    test('returns zero risk for clean error message', () => {
      const result = router.detectAntiPattern('Operation completed successfully');
      expect(result.risk).toBe(0);
      expect(result.patterns.length).toBe(0);
    });

    test('handles null/undefined error message', () => {
      expect(router.detectAntiPattern(null)).toEqual({ risk: 0, patterns: [] });
      expect(router.detectAntiPattern(undefined)).toEqual({ risk: 0, patterns: [] });
    });

    test('returns highest risk when multiple patterns detected', () => {
      const result = router.detectAntiPattern('Override validation and timeout error');
      expect(result.risk).toBe(0.7); // override has highest risk
    });
  });

  describe('Risk-Based Routing', () => {
    test('high risk (>= 0.6) requires review', () => {
      const routing = router.getRiskBasedRouting(0.7, 'critical');
      expect(routing.action).toBe('REVIEW');
      expect(routing.fallbackTier).toBe('architectural');
    });

    test('medium risk (0.3-0.6) triggers retry with fallback', () => {
      const routing = router.getRiskBasedRouting(0.5, 'advanced');
      expect(routing.action).toBe('RETRY');
      expect(routing.fallbackTier).toBe('routine');
    });

    test('low risk (< 0.3) proceeds normally', () => {
      const routing = router.getRiskBasedRouting(0.2, 'routine');
      expect(routing.action).toBe('PROCEED');
      expect(routing.fallbackTier).toBeNull();
    });

    test('boundary risk at 0.6 requires review', () => {
      const routing = router.getRiskBasedRouting(0.6, 'critical');
      expect(routing.action).toBe('REVIEW');
    });

    test('boundary risk at 0.3 triggers retry', () => {
      const routing = router.getRiskBasedRouting(0.3, 'advanced');
      expect(routing.action).toBe('RETRY');
    });
  });

  describe('Memory-Aware Tier Selection', () => {
    test('returns base tier when no memory info provided', () => {
      const tier = router.getMemoryAwareTier('critical', null);
      expect(tier).toBe('critical');
    });

    test('downgrades tier on low memory', () => {
      const tier = router.getMemoryAwareTier('critical', 100); // 100MB
      expect(tier).not.toBe('critical');
      expect(tier).toBe('mechanical');
    });

    test('keeps tier on medium memory', () => {
      const tier = router.getMemoryAwareTier('advanced', 500); // 500MB
      expect(tier).toBe('advanced');
    });

    test('keeps tier on high memory', () => {
      const tier = router.getMemoryAwareTier('critical', 2000); // 2GB
      expect(tier).toBe('critical');
    });

    test('mechanical tier stays mechanical on low memory', () => {
      const tier = router.getMemoryAwareTier('mechanical', 50);
      expect(tier).toBe('mechanical');
    });
  });

  describe('Context Budget Tracking', () => {
    test('returns normal strategy when under 50% context usage', () => {
      const strategy = router.getContextStrategy(25000); // 25% of 100k
      expect(strategy.strategy).toBe('normal');
      expect(strategy.percent).toBe(25);
    });

    test('returns semantic fold strategy at 50-70% usage', () => {
      const strategy = router.getContextStrategy(60000); // 60% of 100k
      expect(strategy.strategy).toBe('semantic_fold_and_continue');
      expect(strategy.percent).toBe(60);
    });

    test('returns compaction strategy at 70-90% usage', () => {
      const strategy = router.getContextStrategy(80000); // 80% of 100k
      expect(strategy.strategy).toBe('open_new_window_with_compaction');
      expect(strategy.percent).toBe(80);
    });

    test('returns fallback strategy at 90%+ usage', () => {
      const strategy = router.getContextStrategy(95000); // 95% of 100k
      expect(strategy.strategy).toBe('fallback_to_summary_context');
      expect(strategy.percent).toBe(95);
    });

    test('boundary at 50% returns semantic fold', () => {
      const strategy = router.getContextStrategy(50000);
      expect(strategy.strategy).toBe('semantic_fold_and_continue');
    });

    test('boundary at 70% returns compaction', () => {
      const strategy = router.getContextStrategy(70000);
      expect(strategy.strategy).toBe('open_new_window_with_compaction');
    });

    test('boundary at 90% returns fallback', () => {
      const strategy = router.getContextStrategy(90000);
      expect(strategy.strategy).toBe('fallback_to_summary_context');
    });
  });

  describe('Task Recording and Statistics', () => {
    test('records task execution', () => {
      const record = router.recordTask('test prompt', 'advanced', true, 0.5, 1000);
      expect(record.tier).toBe('advanced');
      expect(record.success).toBe(true);
      expect(record.cost).toBe(0.5);
      expect(record.tokens).toBe(1000);
    });

    test('updates daily spent on task record', () => {
      const initialSpent = router.dailySpent;
      router.recordTask('test', 'mechanical', true, 0.1, 100);
      expect(router.dailySpent).toBe(initialSpent + 0.1);
    });

    test('updates tier statistics on task record', () => {
      router.recordTask('test', 'advanced', true, 0.5, 1000);
      expect(router.tierStats.advanced.calls).toBe(1);
      expect(router.tierStats.advanced.success).toBe(1);
      expect(router.tierStats.advanced.cost).toBe(0.5);
    });

    test('tracks failed tasks in statistics', () => {
      router.recordTask('test', 'advanced', false, 0.5, 1000);
      expect(router.tierStats.advanced.calls).toBe(1);
      expect(router.tierStats.advanced.success).toBe(0);
    });

    test('getStats returns correct success rate', () => {
      router.recordTask('test1', 'advanced', true, 0.5, 1000);
      router.recordTask('test2', 'advanced', true, 0.5, 1000);
      router.recordTask('test3', 'advanced', false, 0.5, 1000);
      const stats = router.getStats();
      expect(stats.successRate).toBe(66.66666666666666); // 2/3
    });

    test('getStats returns budget information', () => {
      router.recordTask('test', 'advanced', true, 2.5, 1000);
      const stats = router.getStats();
      expect(stats.totalCost).toBe(2.5);
      expect(stats.budgetRemaining).toBe(7.5);
      expect(stats.budgetUsedPercent).toBe(25);
    });

    test('getStats includes tier-specific success rates', () => {
      router.recordTask('test1', 'mechanical', true, 0.01, 100);
      router.recordTask('test2', 'mechanical', false, 0.01, 100);
      const stats = router.getStats();
      expect(stats.tierStats.mechanical.successRate).toBe(50);
      expect(stats.tierStats.mechanical.calls).toBe(2);
    });
  });

  describe('Learning Observations', () => {
    test('records learning observation', () => {
      const obs = router.recordLearningObservation('task-1', 'test prompt', {
        success: true,
        cost: 0.5,
        tokens: 1000,
        tier: 'advanced'
      });
      expect(obs.taskId).toBe('task-1');
      expect(obs.success).toBe(true);
      expect(obs.tier).toBe('advanced');
    });

    test('learning observation includes complexity', () => {
      const obs = router.recordLearningObservation('task-1', 'complex architecture design', {
        success: true,
        cost: 0.5,
        tokens: 1000,
        tier: 'advanced'
      });
      expect(obs.complexity).toBeGreaterThan(0);
    });

    test('keeps only last 500 observations', () => {
      for (let i = 0; i < 600; i++) {
        router.recordLearningObservation(`task-${i}`, 'test', { success: true });
      }
      expect(router.learningObservations.length).toBe(500);
    });
  });

  describe('Integration - Full Routing Flow', () => {
    test('routes simple task to cheap tier and stays under budget', () => {
      const result = router.determineTier('What is 2+2?');
      expect(result.tier).toBe('mechanical');
      expect(router.isUnderBudget(result.tier)).toBe(true);
    });

    test('routes complex task and records execution', () => {
      const result = router.determineTier(
        'Design a distributed microservice architecture'
      );
      expect(result.tier).toBe('advanced');
      
      const record = router.recordTask(
        'Design a distributed microservice architecture',
        result.tier,
        true,
        result.strategy.cost,
        2000
      );
      
      expect(record.tier).toBe(result.tier);
      expect(router.dailySpent).toBe(result.strategy.cost);
    });

    test('handles error detection and risk-based routing', () => {
      const errorMsg = 'Rate limit exceeded on API call';
      const antiPattern = router.detectAntiPattern(errorMsg);
      const routing = router.getRiskBasedRouting(antiPattern.risk, 'critical');
      
      expect(antiPattern.risk).toBeGreaterThan(0);
      expect(routing.action).toBe('RETRY');
      expect(routing.fallbackTier).toBe('architectural');
    });

    test('complete workflow: analyze -> route -> record -> stats', () => {
      const prompt = 'Implement a complex authentication system';
      const tierResult = router.determineTier(prompt);
      
      expect(router.isUnderBudget(tierResult.tier)).toBe(true);
      
      const record = router.recordTask(
        prompt,
        tierResult.tier,
        true,
        tierResult.strategy.cost,
        1500
      );
      
      router.recordLearningObservation(record.id, prompt, {
        success: true,
        cost: tierResult.strategy.cost,
        tokens: 1500,
        tier: tierResult.tier
      });
      
      const stats = router.getStats();
      expect(stats.totalTasks).toBe(1);
      expect(stats.successRate).toBe(100);
      expect(stats.totalCost).toBe(tierResult.strategy.cost);
    });
  });
});
