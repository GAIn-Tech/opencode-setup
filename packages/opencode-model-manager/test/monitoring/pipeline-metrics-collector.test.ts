// @ts-nocheck
const { afterEach, beforeEach, describe, expect, test } = require('bun:test');
const os = require('os');
const path = require('path');

const { PipelineMetricsCollector, PROVIDERS } = require('../../src/monitoring/metrics-collector');

describe('PipelineMetricsCollector', () => {
  let collector;
  let now;

beforeEach(() => {
    now = 1000000;
    collector = new PipelineMetricsCollector({
      autoCleanup: false,
      nowFn: () => now,
      enableDb: false
    });
  });

  afterEach(() => {
    if (collector) {
      collector.close();
      collector = null;
    }
  });

  // ─── Construction ──────────────────────────────────────────

  describe('constructor', () => {
test('initializes with default retention (24h)', () => {
      const c = new PipelineMetricsCollector({ autoCleanup: false, enableDb: false });
      expect(c.retentionMs).toBe(24 * 60 * 60 * 1000);
      c.close();
    });

    test('accepts custom retention', () => {
      const c = new PipelineMetricsCollector({ retentionMs: 60000, autoCleanup: false, enableDb: false });
      expect(c.retentionMs).toBe(60000);
      c.close();
    });

    test('accepts custom nowFn', () => {
      const c = new PipelineMetricsCollector({ nowFn: () => 42, autoCleanup: false, enableDb: false });
      expect(c.nowFn()).toBe(42);
      c.close();
    });
  });

  // ─── Discovery Metrics ────────────────────────────────────

  describe('discovery metrics', () => {
    test('records successful discovery', () => {
      const event = collector.recordDiscovery('openai', true, { modelCount: 10, durationMs: 500 });
      expect(event.provider).toBe('openai');
      expect(event.success).toBe(true);
      expect(event.modelCount).toBe(10);
      expect(event.durationMs).toBe(500);
      expect(event.error).toBeNull();
    });

    test('records failed discovery', () => {
      const event = collector.recordDiscovery('anthropic', false, { error: 'rate limited' });
      expect(event.success).toBe(false);
      expect(event.error).toBe('rate limited');
    });

    test('normalizes provider name to lowercase', () => {
      const event = collector.recordDiscovery('OpenAI', true);
      expect(event.provider).toBe('openai');
    });

    test('getDiscoveryRates returns rates for all providers', () => {
      collector.recordDiscovery('openai', true);
      collector.recordDiscovery('openai', true);
      collector.recordDiscovery('openai', false);

      const rates = collector.getDiscoveryRates();
      expect(rates.openai.total).toBe(3);
      expect(rates.openai.successes).toBe(2);
      expect(rates.openai.failures).toBe(1);
      expect(rates.openai.rate).toBeCloseTo(0.6667, 3);
    });

    test('getDiscoveryRates tracks consecutive failures', () => {
      collector.recordDiscovery('google', true);
      collector.recordDiscovery('google', false);
      collector.recordDiscovery('google', false);
      collector.recordDiscovery('google', false);

      const rates = collector.getDiscoveryRates();
      expect(rates.google.consecutiveFailures).toBe(3);
    });

    test('consecutive failures reset on success', () => {
      collector.recordDiscovery('groq', false);
      collector.recordDiscovery('groq', false);
      collector.recordDiscovery('groq', true);

      const rates = collector.getDiscoveryRates();
      expect(rates.groq.consecutiveFailures).toBe(0);
    });

    test('returns zero rates for providers with no events', () => {
      const rates = collector.getDiscoveryRates();
      expect(rates.nvidia.total).toBe(0);
      expect(rates.nvidia.rate).toBe(0);
      expect(rates.nvidia.consecutiveFailures).toBe(0);
    });

    test('respects time window', () => {
      collector.recordDiscovery('openai', true);
      now += 10000;
      collector.recordDiscovery('openai', false);

      // Window of 5000ms should only include the second event
      const rates = collector.getDiscoveryRates(5000);
      expect(rates.openai.total).toBe(1);
      expect(rates.openai.failures).toBe(1);
    });

    test('all 6 providers present in rates', () => {
      const rates = collector.getDiscoveryRates();
      const expectedProviders = ['openai', 'anthropic', 'google', 'groq', 'cerebras', 'nvidia'];
      for (const p of expectedProviders) {
        expect(rates[p]).toBeDefined();
      }
    });
  });

  // ─── Cache Metrics ────────────────────────────────────────

  describe('cache metrics', () => {
    test('records L1 cache hit', () => {
      const event = collector.recordCacheAccess('l1', 'hit', 'openai:models');
      expect(event.tier).toBe('l1');
      expect(event.hit).toBe(true);
      expect(event.key).toBe('openai:models');
    });

    test('records L2 cache miss', () => {
      const event = collector.recordCacheAccess('l2', 'miss');
      expect(event.tier).toBe('l2');
      expect(event.hit).toBe(false);
    });

    test('defaults to L1 for invalid tier', () => {
      const event = collector.recordCacheAccess('l3', 'hit');
      expect(event.tier).toBe('l1');
    });

    test('getCacheRates returns per-tier stats', () => {
      collector.recordCacheAccess('l1', 'hit');
      collector.recordCacheAccess('l1', 'hit');
      collector.recordCacheAccess('l1', 'miss');
      collector.recordCacheAccess('l2', 'hit');
      collector.recordCacheAccess('l2', 'miss');
      collector.recordCacheAccess('l2', 'miss');

      const rates = collector.getCacheRates();
      expect(rates.l1.hits).toBe(2);
      expect(rates.l1.misses).toBe(1);
      expect(rates.l1.total).toBe(3);
      expect(rates.l1.hitRate).toBeCloseTo(0.6667, 3);

      expect(rates.l2.hits).toBe(1);
      expect(rates.l2.misses).toBe(2);
      expect(rates.l2.total).toBe(3);
      expect(rates.l2.hitRate).toBeCloseTo(0.3333, 3);
    });

    test('returns zero when no events', () => {
      const rates = collector.getCacheRates();
      expect(rates.l1.hitRate).toBe(0);
      expect(rates.l2.hitRate).toBe(0);
    });
  });

  // ─── State Transition Metrics ─────────────────────────────

  describe('transition metrics', () => {
    test('records state transition', () => {
      const event = collector.recordTransition('gpt-5', 'detected', 'assessed');
      expect(event.modelId).toBe('gpt-5');
      expect(event.fromState).toBe('detected');
      expect(event.toState).toBe('assessed');
      expect(event.timestamp).toBe(now);
    });

    test('getTransitionCounts aggregates by transition type', () => {
      collector.recordTransition('m1', 'detected', 'assessed');
      collector.recordTransition('m2', 'detected', 'assessed');
      collector.recordTransition('m1', 'assessed', 'approved');
      collector.recordTransition('m3', 'detected', 'assessed');

      const counts = collector.getTransitionCounts();
      expect(counts['detected->assessed']).toBe(3);
      expect(counts['assessed->approved']).toBe(1);
    });

    test('respects time window for transitions', () => {
      collector.recordTransition('m1', 'detected', 'assessed');
      now += 20000;
      collector.recordTransition('m2', 'detected', 'assessed');

      const counts = collector.getTransitionCounts(10000);
      expect(counts['detected->assessed']).toBe(1);
    });
  });

  // ─── PR Metrics ───────────────────────────────────────────

  describe('PR metrics', () => {
    test('records successful PR creation', () => {
      const event = collector.recordPRCreation(true, { prNumber: 42, branch: 'auto/update-1' });
      expect(event.success).toBe(true);
      expect(event.prNumber).toBe(42);
      expect(event.branch).toBe('auto/update-1');
      expect(event.error).toBeNull();
    });

    test('records failed PR creation', () => {
      const event = collector.recordPRCreation(false, { error: 'branch conflict' });
      expect(event.success).toBe(false);
      expect(event.error).toBe('branch conflict');
    });

    test('getPRRates aggregates correctly', () => {
      collector.recordPRCreation(true);
      collector.recordPRCreation(true);
      collector.recordPRCreation(false, { error: 'fail' });

      const rates = collector.getPRRates();
      expect(rates.total).toBe(3);
      expect(rates.successes).toBe(2);
      expect(rates.failures).toBe(1);
      expect(rates.rate).toBeCloseTo(0.6667, 3);
      expect(rates.recentFailures).toBe(1);
    });
  });

  // ─── Time to Approval ────────────────────────────────────

  describe('time to approval', () => {
    test('tracks time from detected to selectable', () => {
      collector.recordTransition('m1', '', 'detected');
      now += 5000;
      collector.recordTransition('m1', 'detected', 'assessed');
      now += 3000;
      collector.recordTransition('m1', 'assessed', 'approved');
      now += 2000;
      collector.recordTransition('m1', 'approved', 'selectable');

      const tta = collector.getTimeToApproval();
      expect(tta.count).toBe(1);
      expect(tta.avgMs).toBe(10000);
      expect(tta.minMs).toBe(10000);
      expect(tta.maxMs).toBe(10000);
    });

    test('handles multiple models', () => {
      collector.recordTransition('m1', '', 'detected');
      now += 5000;
      collector.recordTransition('m2', '', 'detected');
      now += 5000;
      collector.recordTransition('m1', 'approved', 'selectable');
      now += 5000;
      collector.recordTransition('m2', 'approved', 'selectable');

      const tta = collector.getTimeToApproval();
      expect(tta.count).toBe(2);
      // m1: 10000ms, m2: 10000ms
      expect(tta.avgMs).toBe(10000);
    });

    test('returns zeros when no models reached selectable', () => {
      collector.recordTransition('m1', '', 'detected');
      const tta = collector.getTimeToApproval();
      expect(tta.count).toBe(0);
      expect(tta.avgMs).toBe(0);
    });
  });

  // ─── Catalog Freshness ───────────────────────────────────

  describe('catalog freshness', () => {
    test('stale when never updated', () => {
      const freshness = collector.getCatalogFreshness();
      expect(freshness.lastUpdateTimestamp).toBeNull();
      expect(freshness.ageMs).toBe(-1);
      expect(freshness.stale).toBe(true);
    });

    test('fresh after successful discovery', () => {
      collector.recordDiscovery('openai', true);
      const freshness = collector.getCatalogFreshness();
      expect(freshness.lastUpdateTimestamp).toBe(now);
      expect(freshness.ageMs).toBe(0);
      expect(freshness.stale).toBe(false);
    });

    test('becomes stale after 24h', () => {
      collector.recordDiscovery('openai', true);
      now += 25 * 60 * 60 * 1000; // 25 hours
      const freshness = collector.getCatalogFreshness();
      expect(freshness.stale).toBe(true);
    });

    test('markCatalogUpdated sets timestamp', () => {
      collector.markCatalogUpdated(500000);
      const freshness = collector.getCatalogFreshness();
      expect(freshness.lastUpdateTimestamp).toBe(500000);
    });

    test('failed discovery does not update freshness', () => {
      collector.recordDiscovery('openai', false);
      const freshness = collector.getCatalogFreshness();
      expect(freshness.lastUpdateTimestamp).toBeNull();
    });
  });

  // ─── Snapshot & Prometheus ────────────────────────────────

  describe('getSnapshot', () => {
    test('returns all metrics sections', () => {
      collector.recordDiscovery('openai', true);
      collector.recordCacheAccess('l1', 'hit');
      collector.recordTransition('m1', 'detected', 'assessed');
      collector.recordPRCreation(true);

      const snapshot = collector.getSnapshot();
      expect(snapshot.timestamp).toBe(now);
      expect(snapshot.discovery).toBeDefined();
      expect(snapshot.cache).toBeDefined();
      expect(snapshot.transitions).toBeDefined();
      expect(snapshot.prCreation).toBeDefined();
      expect(snapshot.timeToApproval).toBeDefined();
      expect(snapshot.catalogFreshness).toBeDefined();
    });

    test('includes compression and Context7 sections', () => {
      collector.recordCompression({
        sessionId: 'ses_1',
        inputTokens: 1000,
        outputTokens: 400,
        ratio: 0.4,
        strategy: 'compress'
      });
      collector.recordContext7Lookup({
        libraryId: '/vercel/next.js',
        resolved: true,
        durationMs: 25,
        source: 'route'
      });

      const snapshot = collector.getSnapshot();
      expect(snapshot.compression).toBeDefined();
      expect(snapshot.compression.totalEvents).toBe(1);
      expect(snapshot.context7).toBeDefined();
      expect(snapshot.context7.totalLookups).toBe(1);
    });
  });

  describe('persisted compression/context7 stats', () => {
    test('reads compression stats from persisted history in a new collector instance', () => {
      const dbPath = path.join(os.tmpdir(), `test-metrics-persist-${Date.now()}-compression.db`);
      const writer = new PipelineMetricsCollector({ autoCleanup: false, dbPath });
      writer.recordCompression({
        sessionId: 'ses_persist',
        inputTokens: 2000,
        outputTokens: 500,
        ratio: 0.25,
        strategy: 'distill'
      });
      writer.close();

      const reader = new PipelineMetricsCollector({ autoCleanup: false, dbPath });
      const stats = reader.getCompressionStats();
      expect(stats.totalEvents).toBe(1);
      expect(stats.totalTokensSaved).toBe(1500);
      reader.close();
    });

    test('reads Context7 stats from persisted history in a new collector instance', () => {
      const dbPath = path.join(os.tmpdir(), `test-metrics-persist-${Date.now()}-context7.db`);
      const writer = new PipelineMetricsCollector({ autoCleanup: false, dbPath });
      writer.recordContext7Lookup({
        libraryId: '/supabase/supabase',
        resolved: true,
        durationMs: 42,
        source: 'context7'
      });
      writer.close();

      const reader = new PipelineMetricsCollector({ autoCleanup: false, dbPath });
      const stats = reader.getContext7Stats();
      expect(stats.totalLookups).toBe(1);
      expect(stats.resolved).toBe(1);
      reader.close();
    });
  });

  describe('toPrometheus', () => {
    test('returns valid Prometheus text format', () => {
      collector.recordDiscovery('openai', true, { modelCount: 5 });
      collector.recordDiscovery('openai', false, { error: 'timeout' });
      collector.recordCacheAccess('l1', 'hit');
      collector.recordTransition('m1', 'detected', 'assessed');
      collector.recordPRCreation(true);

      const text = collector.toPrometheus();
      expect(typeof text).toBe('string');
      expect(text).toContain('# HELP model_discovery_total');
      expect(text).toContain('# TYPE model_discovery_total counter');
      expect(text).toContain('model_discovery_total{provider="openai",result="success"} 1');
      expect(text).toContain('model_discovery_total{provider="openai",result="failure"} 1');
      expect(text).toContain('model_cache_total{tier="l1",result="hit"} 1');
      expect(text).toContain('model_transitions_total{from="detected",to="assessed"} 1');
      expect(text).toContain('model_pr_total{result="success"} 1');
      expect(text).toContain('model_pr_success_rate 1');
      expect(text).toContain('model_catalog_age_ms');
      expect(text.endsWith('\n')).toBe(true);
    });

    test('includes all providers even with no events', () => {
      const text = collector.toPrometheus();
      for (const provider of PROVIDERS) {
        expect(text).toContain(`provider="${provider}"`);
      }
    });
  });

  describe('orchestration policy telemetry', () => {
    test('records normalized decision event with stable shape', () => {
      const event = collector.recordPolicyDecision({
        contractVersion: '1.0',
        failOpen: true,
        inputs: {
          runtimeContext: {
            parallel: {
              forceSerial: false,
              disabled: false,
              requestedFanout: 4,
              requestedConcurrency: 3,
            }
          },
          budgetSignals: {
            contextPressure: 0.72,
            costPressure: 0.35,
          },
          taskClassification: {
            category: 'deep',
            complexity: 'high',
          },
        },
        outputs: {
          parallel: {
            maxFanout: 3,
            maxConcurrency: 2,
          },
          routing: {
            weightHints: {
              quality: 0.51,
              cost: 0.33,
              latency: 0.16,
            },
            fallback: {
              allowFailOpen: true,
              reason: 'policy-applied',
              metadata: {
                combinedBudgetBand: 'high',
                precedenceRule: 'budget.adaptiveScale',
              },
            },
          },
        },
        explain: {
          budget: {
            score: 0.61,
            band: 'high',
            contextPressure: 0.72,
            costPressure: 0.35,
            weights: {
              context: 0.7,
              cost: 0.3,
            },
            components: {
              context: 0.504,
              cost: 0.105,
            },
          },
          precedence: {
            appliedRule: 'budget.adaptiveScale',
          },
        },
      }, {
        sessionId: 'ses_policy',
        taskId: 'task_policy',
        taskType: 'deep',
      });

      expect(event.eventType).toBe('orchestration_policy_decision');
      expect(event.schemaVersion).toBe('1.0');
      expect(event.decisionVersion).toBe('1.0');
      expect(event.sessionId).toBe('ses_policy');
      expect(event.taskId).toBe('task_policy');
      expect(event.taskType).toBe('deep');
      expect(event.inputs.taskClassification).toEqual({ category: 'deep', complexity: 'high' });
      expect(event.score).toEqual({
        combinedBudgetScore: 0.61,
        band: 'high',
        contextPressure: 0.72,
        costPressure: 0.35,
        weights: {
          context: 0.7,
          cost: 0.3,
        },
        components: {
          context: 0.504,
          cost: 0.105,
        },
      });
      expect(event.outputs.parallel).toEqual({ maxFanout: 3, maxConcurrency: 2 });
      expect(event.outputs.fallbackReason).toBe('policy-applied');
      expect(event.outputs.precedenceRule).toBe('budget.adaptiveScale');
      expect(event.outputs.failOpen).toBe(true);
    });

    test('supports sampled low-overhead telemetry path', () => {
      const neverSample = new PipelineMetricsCollector({
        autoCleanup: false,
        nowFn: () => now,
        randomFn: () => 0.99,
      });

      const skipped = neverSample.recordPolicyDecision({
        explain: { budget: { score: 0.1, components: {} } },
        outputs: { routing: { fallback: { reason: 'policy-applied' } }, parallel: {} },
      }, {
        sampleRate: 0.2,
      });

      expect(skipped).toBeNull();
      expect(neverSample.getPolicyDecisionStats().totalEvents).toBe(0);

      neverSample.close();
    });
  });

  describe('parallel and package utilization telemetry', () => {
    test('records and summarizes parallel control utilization', () => {
      collector.recordParallelControls({
        sessionId: 'ses_parallel',
        taskId: 'task_parallel',
        taskType: 'deep',
        category: 'deep',
        budgetBand: 'high',
        fallbackReason: 'policy-applied',
        requestedFanout: 6,
        requestedConcurrency: 4,
        appliedFanout: 3,
        appliedConcurrency: 2,
      });

      const stats = collector.getParallelControlStats();
      expect(stats.totalEvents).toBe(1);
      expect(stats.avgFanoutReduction).toBe(3);
      expect(stats.avgConcurrencyReduction).toBe(2);
      expect(stats.byBudgetBand.high).toBe(1);
      expect(stats.byTaskType.deep).toBe(1);
      expect(stats.fallbackReasons['policy-applied']).toBe(1);
    });

    test('records and summarizes package execution utilization', () => {
      collector.recordPackageExecution({
        package: 'preloadSkills',
        method: 'selectTools',
        success: true,
        durationMs: 12,
        taskType: 'deep',
      });
      collector.recordPackageExecution({
        package: 'preloadSkills',
        method: 'selectTools',
        success: false,
        durationMs: 8,
        taskType: 'deep',
        error: 'timeout',
      });

      const stats = collector.getPackageExecutionStats();
      expect(stats.totalEvents).toBe(2);
      expect(stats.successRate).toBe(0.5);
      expect(stats.avgDurationMs).toBe(10);
      expect(stats.byPackage.preloadSkills.total).toBe(2);
      expect(stats.byPackage.preloadSkills.failures).toBe(1);
      expect(stats.byMethod['preloadSkills.selectTools']).toBe(2);
    });

    test('snapshot includes new utilization sections', () => {
      collector.recordParallelControls({
        taskType: 'deep',
        requestedFanout: 4,
        requestedConcurrency: 2,
        appliedFanout: 3,
        appliedConcurrency: 2,
      });
      collector.recordPackageExecution({
        package: 'modelRouter',
        method: 'route',
        success: true,
        durationMs: 5,
      });

      const snapshot = collector.getSnapshot();
      expect(snapshot.parallelControls).toBeDefined();
      expect(snapshot.parallelControls.totalEvents).toBe(1);
      expect(snapshot.packageExecution).toBeDefined();
      expect(snapshot.packageExecution.totalEvents).toBe(1);
    });
  });

  // ─── Cleanup & Reset ─────────────────────────────────────

  describe('cleanup', () => {
    test('removes events older than retention', () => {
      collector.recordDiscovery('openai', true);
      collector.recordCacheAccess('l1', 'hit');
      collector.recordTransition('m1', 'detected', 'assessed');
      collector.recordPRCreation(true);

      // Move time past retention
      now += collector.retentionMs + 1000;
      collector.cleanup();

      const snapshot = collector.getSnapshot();
      expect(snapshot.discovery.openai.total).toBe(0);
      expect(snapshot.cache.l1.total).toBe(0);
      expect(Object.keys(snapshot.transitions.counts)).toHaveLength(0);
      expect(snapshot.prCreation.total).toBe(0);
    });
  });

  describe('reset', () => {
    test('clears all metrics', () => {
      collector.recordDiscovery('openai', true);
      collector.recordCacheAccess('l1', 'hit');
      collector.recordTransition('m1', '', 'detected');
      collector.recordPRCreation(true);
      collector.markCatalogUpdated();

      collector.reset();

      const snapshot = collector.getSnapshot();
      expect(snapshot.discovery.openai.total).toBe(0);
      expect(snapshot.cache.l1.total).toBe(0);
      expect(snapshot.prCreation.total).toBe(0);
      expect(snapshot.catalogFreshness.lastUpdateTimestamp).toBeNull();
    });
  });

  // ─── Bounded Arrays (FIFO Eviction) ─────────────────────────

  describe('bounded arrays with FIFO eviction', () => {
    test('caps all 4 event arrays at maxEvents', () => {
      const cap = 100;
      const bounded = new PipelineMetricsCollector({
        autoCleanup: false,
        nowFn: () => now,
        maxEvents: cap
      });

      for (let i = 0; i < 150; i++) {
        bounded.recordDiscovery('openai', true, { modelCount: i });
        bounded.recordCacheAccess('l1', 'hit', `key-${i}`);
        bounded.recordTransition(`m${i}`, 'detected', 'assessed');
        bounded.recordPRCreation(true, { prNumber: i });
      }

      expect(bounded._discoveryEvents.length).toBeLessThanOrEqual(cap);
      expect(bounded._cacheEvents.length).toBeLessThanOrEqual(cap);
      expect(bounded._transitionEvents.length).toBeLessThanOrEqual(cap);
      expect(bounded._prEvents.length).toBeLessThanOrEqual(cap);

      bounded.close();
    });

    test('FIFO order: oldest events evicted first', () => {
      const bounded = new PipelineMetricsCollector({
        autoCleanup: false,
        nowFn: () => now,
        maxEvents: 5
      });

      // Record 6 discovery events with identifiable modelCounts
      for (let i = 1; i <= 6; i++) {
        bounded.recordDiscovery('openai', true, { modelCount: i });
      }

      // First event (modelCount=1) should be evicted; oldest remaining is modelCount=2
      expect(bounded._discoveryEvents.length).toBe(5);
      expect(bounded._discoveryEvents[0].modelCount).toBe(2);
      expect(bounded._discoveryEvents[4].modelCount).toBe(6);

      // Same for cache events with identifiable keys
      for (let i = 1; i <= 6; i++) {
        bounded.recordCacheAccess('l1', 'hit', `key-${i}`);
      }
      expect(bounded._cacheEvents.length).toBe(5);
      expect(bounded._cacheEvents[0].key).toBe('key-2');

      // Same for transition events
      for (let i = 1; i <= 6; i++) {
        bounded.recordTransition(`model-${i}`, 'detected', 'assessed');
      }
      expect(bounded._transitionEvents.length).toBe(5);
      expect(bounded._transitionEvents[0].modelId).toBe('model-2');

      // Same for PR events
      for (let i = 1; i <= 6; i++) {
        bounded.recordPRCreation(true, { prNumber: i });
      }
      expect(bounded._prEvents.length).toBe(5);
      expect(bounded._prEvents[0].prNumber).toBe(2);

      bounded.close();
    });

    test('default maxEvents does not break existing behavior', () => {
      const defaultCollector = new PipelineMetricsCollector({
        autoCleanup: false,
        nowFn: () => now
      });

      // Should accept many events without issue
      for (let i = 0; i < 200; i++) {
        defaultCollector.recordDiscovery('openai', true);
      }
      expect(defaultCollector._discoveryEvents.length).toBe(200);

      defaultCollector.close();
    });
  });
});
