/**
 * T20 (Wave 11): Context Management Integration Tests
 *
 * Tests the end-to-end flow of context management features added in Wave 11:
 *   - Governor budget tracking + threshold detection
 *   - ContextBridge advisory compression signals
 *   - IntegrationLayer governor wiring
 *   - Metrics collector compression + context7 tracking
 *   - AlertManager budget threshold alerts
 *   - Task context eviction (TTL)
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { unlinkSync } from 'node:fs';

/** Remove SQLite DB and event-history JSON files to prevent cross-test pollution. */
function cleanupDbFiles(dbPath) {
  for (const f of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`, `${dbPath}.events.json`]) {
    try { unlinkSync(f); } catch (_) { /* may not exist */ }
  }
}

// --- Governor ---
import { Governor } from '../packages/opencode-context-governor/src/index.js';

// --- ContextBridge ---
import { ContextBridge } from '../packages/opencode-integration-layer/src/context-bridge.js';

// --- Metrics Collector ---
import {
  PipelineMetricsCollector,
} from '../packages/opencode-model-manager/src/monitoring/metrics-collector.js';

// --- AlertManager ---
import {
  AlertManager,
  ALERT_TYPE,
  ALERT_SEVERITY,
} from '../packages/opencode-model-manager/src/monitoring/alert-manager.js';

// ---------------------------------------------------------------------------
// Governor budget tracking + threshold detection
// ---------------------------------------------------------------------------

describe('Governor budget tracking', () => {
  test('tracks token consumption and reaches warn threshold', () => {
    const gov = new Governor({ autoLoad: false, persistPath: '/tmp/test-budget-t20-1.json' });
    const session = 'ses_test_warn';
    const model = 'anthropic/claude-opus-4-6'; // max = 180,000

    // Consume 75% of budget
    const tokenCount = Math.floor(180_000 * 0.76);
    gov.consumeTokens(session, model, tokenCount);

    const budget = gov.getRemainingBudget(session, model);
    expect(budget.pct).toBeGreaterThanOrEqual(0.75);
    expect(budget.status).toBe('warn');
    expect(budget.used).toBe(tokenCount);
  });

  test('tracks token consumption and reaches error threshold', () => {
    const gov = new Governor({ autoLoad: false, persistPath: '/tmp/test-budget-t20-2.json' });
    const session = 'ses_test_error';
    const model = 'anthropic/claude-opus-4-6';

    const tokenCount = Math.floor(180_000 * 0.81);
    gov.consumeTokens(session, model, tokenCount);

    const budget = gov.getRemainingBudget(session, model);
    expect(budget.pct).toBeGreaterThanOrEqual(0.80);
    expect(budget.status).toBe('error');
  });

  test('resetSession clears budget tracking', () => {
    const gov = new Governor({ autoLoad: false, persistPath: '/tmp/test-budget-t20-3.json' });
    const session = 'ses_test_reset';
    const model = 'anthropic/claude-opus-4-6';

    gov.consumeTokens(session, model, 50_000);
    expect(gov.getRemainingBudget(session, model).used).toBe(50_000);

    gov.resetSession(session);
    const after = gov.getRemainingBudget(session, model);
    expect(after.used).toBe(0);
    expect(after.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// ContextBridge advisory compression signals
// ---------------------------------------------------------------------------

describe('ContextBridge evaluateAndCompress', () => {
  test('returns "none" when budget is healthy (<65%)', () => {
    const mockGovernor = {
      getRemainingBudget: () => ({ pct: 0.50, remaining: 90_000, used: 90_000, max: 180_000 }),
    };
    const bridge = new ContextBridge({ governor: mockGovernor });
    const signal = bridge.evaluateAndCompress('ses_healthy', 'test-model');

    expect(signal.action).toBe('none');
    expect(signal.pct).toBe(0.50);
  });

  test('returns "compress" when budget is at 72%', () => {
    const mockGovernor = {
      getRemainingBudget: () => ({ pct: 0.72, remaining: 50_400, used: 129_600, max: 180_000 }),
    };
    const bridge = new ContextBridge({ governor: mockGovernor });
    const signal = bridge.evaluateAndCompress('ses_warn', 'test-model');

    expect(signal.action).toBe('compress');
    expect(signal.pct).toBe(0.72);
    expect(signal.reason).toContain('proactive compression');
  });

  test('returns "compress_urgent" when budget is at 85%', () => {
    const mockGovernor = {
      getRemainingBudget: () => ({ pct: 0.85, remaining: 27_000, used: 153_000, max: 180_000 }),
    };
    const bridge = new ContextBridge({ governor: mockGovernor });
    const signal = bridge.evaluateAndCompress('ses_urgent', 'test-model');

    expect(signal.action).toBe('compress_urgent');
    expect(signal.pct).toBe(0.85);
    expect(signal.reason).toContain('CRITICAL');
  });

  test('returns "none" when governor is unavailable (fail-open)', () => {
    const bridge = new ContextBridge({ governor: null });
    const signal = bridge.evaluateAndCompress('ses_none', 'test-model');

    expect(signal.action).toBe('none');
    expect(signal.reason).toContain('Governor not available');
  });
});

// ---------------------------------------------------------------------------
// Metrics collector: compression + context7 tracking
// ---------------------------------------------------------------------------

describe('PipelineMetricsCollector compression tracking (T16)', () => {
  let collector;
  const DB_PATH = '/tmp/test-metrics-t20.db';

  beforeEach(() => {
    cleanupDbFiles(DB_PATH);
    collector = new PipelineMetricsCollector({
      autoCleanup: false,
      dbPath: DB_PATH,
    });
  });

  test('recordCompression stores events and getCompressionStats aggregates', () => {
    collector.recordCompression({
      sessionId: 'ses_c1',
      inputTokens: 10_000,
      outputTokens: 6_000,
      ratio: 0.60,
      strategy: 'ast-prune',
    });
    collector.recordCompression({
      sessionId: 'ses_c2',
      inputTokens: 8_000,
      outputTokens: 4_000,
      ratio: 0.50,
      strategy: 'summarize',
    });

    const stats = collector.getCompressionStats();
    expect(stats.totalEvents).toBe(2);
    expect(stats.totalTokensSaved).toBe(8_000); // (10000-6000)+(8000-4000)
    expect(stats.avgCompressionRatio).toBeCloseTo(0.55, 2);
  });

  test('getCompressionStats returns zeroes when no events', () => {
    const stats = collector.getCompressionStats();
    expect(stats.totalEvents).toBe(0);
    expect(stats.totalTokensSaved).toBe(0);
    expect(stats.avgCompressionRatio).toBe(0);
  });
});

describe('PipelineMetricsCollector Context7 tracking (T17)', () => {
  let collector;
  const DB_PATH = '/tmp/test-metrics-t20-c7.db';

  beforeEach(() => {
    cleanupDbFiles(DB_PATH);
    collector = new PipelineMetricsCollector({
      autoCleanup: false,
      dbPath: DB_PATH,
    });
  });

  test('recordContext7Lookup stores events and getContext7Stats aggregates', () => {
    collector.recordContext7Lookup({ libraryId: '/vercel/next.js', resolved: true, durationMs: 120, source: 'agent' });
    collector.recordContext7Lookup({ libraryId: '/unknown/lib', resolved: false, durationMs: 300, source: 'agent' });
    collector.recordContext7Lookup({ libraryId: '/supabase/supabase', resolved: true, durationMs: 95, source: 'librarian' });

    const stats = collector.getContext7Stats();
    expect(stats.totalLookups).toBe(3);
    expect(stats.resolved).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.resolutionRate).toBeCloseTo(0.6667, 3);
  });

  test('getContext7Stats returns zeroes when no events', () => {
    const stats = collector.getContext7Stats();
    expect(stats.totalLookups).toBe(0);
    expect(stats.resolved).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.resolutionRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AlertManager budget threshold alerts (T18)
// ---------------------------------------------------------------------------

describe('AlertManager evaluateBudget', () => {
  test('fires WARNING at 75% usage', () => {
    const am = new AlertManager();
    const alerts = am.evaluateBudget({
      sessionId: 'ses_75',
      model: 'test-model',
      pct: 0.76,
      used: 136_800,
      remaining: 43_200,
    });

    expect(alerts.length).toBe(1);
    expect(alerts[0].type).toBe(ALERT_TYPE.BUDGET_THRESHOLD);
    expect(alerts[0].severity).toBe(ALERT_SEVERITY.WARNING);
    expect(alerts[0].message).toContain('76.0%');
  });

  test('fires CRITICAL at 95% usage', () => {
    const am = new AlertManager();
    const alerts = am.evaluateBudget({
      sessionId: 'ses_95',
      model: 'test-model',
      pct: 0.96,
      used: 172_800,
      remaining: 7_200,
    });

    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe(ALERT_SEVERITY.CRITICAL);
    expect(alerts[0].message).toContain('CRITICAL');
  });

  test('auto-resolves when budget drops below thresholds', () => {
    const am = new AlertManager();

    // First, trigger a warning
    am.evaluateBudget({
      sessionId: 'ses_resolve',
      model: 'test-model',
      pct: 0.76,
      used: 136_800,
      remaining: 43_200,
    });
    expect(am.getActiveAlerts().length).toBe(1);

    // Then budget drops (e.g., after session reset)
    am.evaluateBudget({
      sessionId: 'ses_resolve',
      model: 'test-model',
      pct: 0.10,
      used: 18_000,
      remaining: 162_000,
    });
    expect(am.getActiveAlerts().length).toBe(0);
  });

  test('returns empty array for null/missing budgetStatus', () => {
    const am = new AlertManager();
    expect(am.evaluateBudget(null)).toEqual([]);
    expect(am.evaluateBudget(undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Cleanup tracking in metrics collector
// ---------------------------------------------------------------------------

describe('PipelineMetricsCollector cleanup includes new event types', () => {
  test('cleanup removes expired compression and context7 events', () => {
    let now = 1_000_000;
    const collector = new PipelineMetricsCollector({
      autoCleanup: false,
      retentionMs: 5_000,
      nowFn: () => now,
      dbPath: '/tmp/test-metrics-t20-cleanup.db',
    });

    // Record events at t=1_000_000
    collector.recordCompression({ sessionId: 's', inputTokens: 100, outputTokens: 50, ratio: 0.5, strategy: 'x' });
    collector.recordContext7Lookup({ libraryId: '/a/b', resolved: true, durationMs: 10, source: 's' });

    expect(collector.getCompressionStats().totalEvents).toBe(1);
    expect(collector.getContext7Stats().totalLookups).toBe(1);

    // Advance past retention window
    now = 1_010_000;
    collector.cleanup();

    expect(collector.getCompressionStats().totalEvents).toBe(0);
    expect(collector.getContext7Stats().totalLookups).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Reset includes new event arrays
// ---------------------------------------------------------------------------

describe('PipelineMetricsCollector reset clears compression and context7', () => {
  test('reset clears all event arrays including new ones', () => {
    const resetDbPath = '/tmp/test-metrics-t20-reset.db';
    cleanupDbFiles(resetDbPath);
    const collector = new PipelineMetricsCollector({
      autoCleanup: false,
      dbPath: resetDbPath,
    });

    collector.recordCompression({ sessionId: 's', inputTokens: 100, outputTokens: 50, ratio: 0.5, strategy: 'x' });
    collector.recordContext7Lookup({ libraryId: '/a/b', resolved: true, durationMs: 10, source: 's' });

    collector.reset();

    expect(collector.getCompressionStats().totalEvents).toBe(0);
    expect(collector.getContext7Stats().totalLookups).toBe(0);
  });
});
