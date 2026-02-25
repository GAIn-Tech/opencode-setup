// @ts-nocheck
const { afterEach, beforeEach, describe, expect, mock, test } = require('bun:test');

const { AlertManager, ALERT_TYPE, ALERT_SEVERITY, DEFAULT_THRESHOLDS } = require('../../src/monitoring/alert-manager');
const { PipelineMetricsCollector } = require('../../src/monitoring/metrics-collector');

describe('AlertManager', () => {
  let alertManager;
  let metricsCollector;
  let now;

  beforeEach(() => {
    now = 1000000;
    metricsCollector = new PipelineMetricsCollector({
      autoCleanup: false,
      nowFn: () => now
    });
    alertManager = new AlertManager({
      nowFn: () => now
    });
  });

  afterEach(() => {
    if (metricsCollector) {
      metricsCollector.close();
      metricsCollector = null;
    }
    alertManager = null;
  });

  // ─── Construction ──────────────────────────────────────────

  describe('constructor', () => {
    test('uses default thresholds', () => {
      expect(alertManager.thresholds.providerConsecutiveFailures).toBe(3);
      expect(alertManager.thresholds.staleCatalogMs).toBe(24 * 60 * 60 * 1000);
      expect(alertManager.thresholds.failedPRsInWindow).toBe(2);
    });

    test('accepts custom thresholds', () => {
      const am = new AlertManager({
        thresholds: { providerConsecutiveFailures: 5 }
      });
      expect(am.thresholds.providerConsecutiveFailures).toBe(5);
      // Other thresholds keep defaults
      expect(am.thresholds.staleCatalogMs).toBe(DEFAULT_THRESHOLDS.staleCatalogMs);
    });
  });

  // ─── Provider Failure Alerts ──────────────────────────────

  describe('provider failure alerts', () => {
    // Seed fresh catalog to avoid stale_catalog alerts polluting provider failure tests
    beforeEach(() => {
      metricsCollector.markCatalogUpdated(now);
    });

    test('fires alert after 3 consecutive failures', () => {
      metricsCollector.recordDiscovery('openai', false, { error: 'timeout' });
      metricsCollector.recordDiscovery('openai', false, { error: 'timeout' });
      metricsCollector.recordDiscovery('openai', false, { error: 'timeout' });

      const newAlerts = alertManager.evaluate(metricsCollector);
      const providerAlerts = newAlerts.filter(a => a.type === ALERT_TYPE.PROVIDER_FAILURE);
      expect(providerAlerts).toHaveLength(1);
      expect(providerAlerts[0].provider).toBe('openai');
      expect(providerAlerts[0].consecutiveFailures).toBe(3);
      expect(providerAlerts[0].severity).toBe(ALERT_SEVERITY.WARNING);
    });

    test('does not fire below threshold', () => {
      metricsCollector.recordDiscovery('openai', false);
      metricsCollector.recordDiscovery('openai', false);

      const newAlerts = alertManager.evaluate(metricsCollector);
      const providerAlerts = newAlerts.filter(a => a.type === ALERT_TYPE.PROVIDER_FAILURE);
      expect(providerAlerts).toHaveLength(0);
    });

    test('fires critical for double threshold', () => {
      for (let i = 0; i < 6; i++) {
        metricsCollector.recordDiscovery('anthropic', false);
      }

      const newAlerts = alertManager.evaluate(metricsCollector);
      const providerAlerts = newAlerts.filter(a => a.type === ALERT_TYPE.PROVIDER_FAILURE);
      expect(providerAlerts).toHaveLength(1);
      expect(providerAlerts[0].severity).toBe(ALERT_SEVERITY.CRITICAL);
    });

    test('does not duplicate alerts for same provider', () => {
      for (let i = 0; i < 5; i++) {
        metricsCollector.recordDiscovery('google', false);
      }

      alertManager.evaluate(metricsCollector);
      const secondEval = alertManager.evaluate(metricsCollector);
      expect(secondEval).toHaveLength(0);
    });

    test('auto-resolves when failures stop', () => {
      for (let i = 0; i < 3; i++) {
        metricsCollector.recordDiscovery('groq', false);
      }

      alertManager.evaluate(metricsCollector);
      const providerActive = alertManager.getActiveAlerts().filter(a => a.type === ALERT_TYPE.PROVIDER_FAILURE);
      expect(providerActive).toHaveLength(1);

      // Success resets consecutive failures
      metricsCollector.recordDiscovery('groq', true);
      alertManager.evaluate(metricsCollector);

      const providerActiveAfter = alertManager.getActiveAlerts().filter(a => a.type === ALERT_TYPE.PROVIDER_FAILURE);
      expect(providerActiveAfter).toHaveLength(0);
    });

    test('fires separate alerts for different providers', () => {
      for (let i = 0; i < 3; i++) {
        metricsCollector.recordDiscovery('openai', false);
        metricsCollector.recordDiscovery('cerebras', false);
      }

      const newAlerts = alertManager.evaluate(metricsCollector);
      const providerAlerts = newAlerts.filter(a => a.type === ALERT_TYPE.PROVIDER_FAILURE);
      expect(providerAlerts).toHaveLength(2);

      const providers = providerAlerts.map(a => a.provider).sort();
      expect(providers).toEqual(['cerebras', 'openai']);
    });
  });

  // ─── Stale Catalog Alerts ────────────────────────────────

  describe('stale catalog alerts', () => {
    test('fires alert when catalog never updated', () => {
      const newAlerts = alertManager.evaluate(metricsCollector);

      const staleCatalogAlerts = newAlerts.filter(a => a.type === ALERT_TYPE.STALE_CATALOG);
      expect(staleCatalogAlerts).toHaveLength(1);
      expect(staleCatalogAlerts[0].severity).toBe(ALERT_SEVERITY.CRITICAL);
    });

    test('fires alert when catalog older than 24h', () => {
      metricsCollector.recordDiscovery('openai', true);
      now += 25 * 60 * 60 * 1000; // 25h

      const newAlerts = alertManager.evaluate(metricsCollector);
      const staleCatalogAlerts = newAlerts.filter(a => a.type === ALERT_TYPE.STALE_CATALOG);
      expect(staleCatalogAlerts).toHaveLength(1);
    });

    test('no alert when catalog is fresh', () => {
      metricsCollector.recordDiscovery('openai', true);
      now += 1000; // 1 second

      const newAlerts = alertManager.evaluate(metricsCollector);
      const staleCatalogAlerts = newAlerts.filter(a => a.type === ALERT_TYPE.STALE_CATALOG);
      expect(staleCatalogAlerts).toHaveLength(0);
    });

    test('auto-resolves when catalog refreshed', () => {
      // Trigger stale alert
      alertManager.evaluate(metricsCollector);
      expect(alertManager.getActiveAlerts().length).toBeGreaterThan(0);

      // Refresh catalog
      metricsCollector.recordDiscovery('openai', true);
      now += 1000;
      alertManager.evaluate(metricsCollector);

      const staleAlerts = alertManager.getActiveAlerts().filter(
        a => a.type === ALERT_TYPE.STALE_CATALOG
      );
      expect(staleAlerts).toHaveLength(0);
    });
  });

  // ─── PR Failure Alerts ───────────────────────────────────

  describe('PR failure alerts', () => {
    // Seed fresh catalog to isolate PR alert tests
    beforeEach(() => {
      metricsCollector.markCatalogUpdated(now);
    });

    test('fires alert after 2 failed PRs', () => {
      metricsCollector.recordPRCreation(false, { error: 'conflict' });
      metricsCollector.recordPRCreation(false, { error: 'conflict' });

      const newAlerts = alertManager.evaluate(metricsCollector);
      const prAlerts = newAlerts.filter(a => a.type === ALERT_TYPE.PR_FAILURES);
      expect(prAlerts).toHaveLength(1);
      expect(prAlerts[0].severity).toBe(ALERT_SEVERITY.WARNING);
      expect(prAlerts[0].recentFailures).toBe(2);
    });

    test('does not fire with fewer than threshold failures', () => {
      metricsCollector.recordPRCreation(false, { error: 'conflict' });
      metricsCollector.recordPRCreation(true);

      const newAlerts = alertManager.evaluate(metricsCollector);
      const prAlerts = newAlerts.filter(a => a.type === ALERT_TYPE.PR_FAILURES);
      expect(prAlerts).toHaveLength(0);
    });

    test('fires critical for double threshold', () => {
      for (let i = 0; i < 4; i++) {
        metricsCollector.recordPRCreation(false, { error: 'fail' });
      }

      const newAlerts = alertManager.evaluate(metricsCollector);
      const prAlerts = newAlerts.filter(a => a.type === ALERT_TYPE.PR_FAILURES);
      expect(prAlerts).toHaveLength(1);
      expect(prAlerts[0].severity).toBe(ALERT_SEVERITY.CRITICAL);
    });
  });

  // ─── Alert Lifecycle ─────────────────────────────────────

  describe('alert lifecycle', () => {
    test('getActiveAlerts returns all active', () => {
      // No catalog update -> stale_catalog alert
      // 3 failures -> provider_failure:openai alert
      // 2 PR failures -> pr_failures alert
      for (let i = 0; i < 3; i++) {
        metricsCollector.recordDiscovery('openai', false);
      }
      metricsCollector.recordPRCreation(false);
      metricsCollector.recordPRCreation(false);

      alertManager.evaluate(metricsCollector);

      // Should have: provider_failure:openai, stale_catalog, pr_failures
      const active = alertManager.getActiveAlerts();
      expect(active.length).toBe(3);
      const types = active.map(a => a.type).sort();
      expect(types).toEqual([ALERT_TYPE.PR_FAILURES, ALERT_TYPE.PROVIDER_FAILURE, ALERT_TYPE.STALE_CATALOG]);
    });

    test('resolveAlert removes from active', () => {
      metricsCollector.markCatalogUpdated(now);
      for (let i = 0; i < 3; i++) {
        metricsCollector.recordDiscovery('openai', false);
      }

      alertManager.evaluate(metricsCollector);
      const alertId = `${ALERT_TYPE.PROVIDER_FAILURE}:openai`;

      expect(alertManager.resolveAlert(alertId)).toBe(true);
      const active = alertManager.getActiveAlerts();
      expect(active.find(a => a.id === alertId)).toBeUndefined();
    });

    test('resolveAlert returns false for unknown id', () => {
      expect(alertManager.resolveAlert('nonexistent')).toBe(false);
    });

    test('alert history is preserved', () => {
      for (let i = 0; i < 3; i++) {
        metricsCollector.recordDiscovery('openai', false);
      }

      alertManager.evaluate(metricsCollector);
      const history = alertManager.getAlertHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].firedAt).toBe(now);
    });

    test('emits alert:fired event', () => {
      metricsCollector.markCatalogUpdated(now);
      const firedAlerts = [];
      alertManager.on('alert:fired', (alert) => firedAlerts.push(alert));

      for (let i = 0; i < 3; i++) {
        metricsCollector.recordDiscovery('nvidia', false);
      }

      alertManager.evaluate(metricsCollector);
      const providerAlerts = firedAlerts.filter(a => a.type === ALERT_TYPE.PROVIDER_FAILURE);
      expect(providerAlerts).toHaveLength(1);
      expect(providerAlerts[0].provider).toBe('nvidia');
    });

    test('emits alert:resolved event', () => {
      metricsCollector.markCatalogUpdated(now);
      const resolved = [];
      alertManager.on('alert:resolved', (event) => resolved.push(event));

      for (let i = 0; i < 3; i++) {
        metricsCollector.recordDiscovery('openai', false);
      }
      alertManager.evaluate(metricsCollector);

      metricsCollector.recordDiscovery('openai', true);
      alertManager.evaluate(metricsCollector);

      const providerResolved = resolved.filter(r => r.type === ALERT_TYPE.PROVIDER_FAILURE);
      expect(providerResolved).toHaveLength(1);
    });
  });

  // ─── Suppression ─────────────────────────────────────────

  describe('suppression', () => {
    test('suppressed alert type is not fired', () => {
      alertManager.suppress(ALERT_TYPE.STALE_CATALOG);

      const newAlerts = alertManager.evaluate(metricsCollector);
      const staleAlerts = newAlerts.filter(a => a.type === ALERT_TYPE.STALE_CATALOG);
      expect(staleAlerts).toHaveLength(0);
    });

    test('unsuppress re-enables alert type', () => {
      alertManager.suppress(ALERT_TYPE.STALE_CATALOG);
      alertManager.evaluate(metricsCollector);
      expect(alertManager.getActiveAlerts().filter(a => a.type === ALERT_TYPE.STALE_CATALOG)).toHaveLength(0);

      alertManager.unsuppress(ALERT_TYPE.STALE_CATALOG);
      const newAlerts = alertManager.evaluate(metricsCollector);
      const staleAlerts = newAlerts.filter(a => a.type === ALERT_TYPE.STALE_CATALOG);
      expect(staleAlerts).toHaveLength(1);
    });

    test('getSummary includes suppressed types', () => {
      alertManager.suppress(ALERT_TYPE.PR_FAILURES);
      const summary = alertManager.getSummary();
      expect(summary.suppressed).toContain(ALERT_TYPE.PR_FAILURES);
    });
  });

  // ─── Reset ───────────────────────────────────────────────

  describe('reset', () => {
    test('clears all alerts and history', () => {
      metricsCollector.markCatalogUpdated(now);
      for (let i = 0; i < 3; i++) {
        metricsCollector.recordDiscovery('openai', false);
      }
      alertManager.evaluate(metricsCollector);
      alertManager.suppress(ALERT_TYPE.PR_FAILURES);

      alertManager.reset();

      expect(alertManager.getActiveAlerts()).toHaveLength(0);
      expect(alertManager.getAlertHistory()).toHaveLength(0);
      expect(alertManager.getSummary().suppressed).toHaveLength(0);
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────

  describe('edge cases', () => {
    test('evaluate with null returns empty array', () => {
      expect(alertManager.evaluate(null)).toEqual([]);
    });

    test('evaluate with invalid object returns empty array', () => {
      expect(alertManager.evaluate({})).toEqual([]);
    });

    test('custom threshold for provider failures', () => {
      metricsCollector.markCatalogUpdated(now);
      const am = new AlertManager({
        thresholds: { providerConsecutiveFailures: 5 },
        nowFn: () => now
      });

      // 3 failures - should not fire with threshold of 5
      for (let i = 0; i < 3; i++) {
        metricsCollector.recordDiscovery('openai', false);
      }
      let alerts = am.evaluate(metricsCollector);
      const providerAlerts = alerts.filter(a => a.type === ALERT_TYPE.PROVIDER_FAILURE);
      expect(providerAlerts).toHaveLength(0);

      // 2 more = 5 total
      metricsCollector.recordDiscovery('openai', false);
      metricsCollector.recordDiscovery('openai', false);
      alerts = am.evaluate(metricsCollector);
      const providerAlerts2 = alerts.filter(a => a.type === ALERT_TYPE.PROVIDER_FAILURE);
      expect(providerAlerts2).toHaveLength(1);
    });
  });

  // ─── History Bounds ───────────────────────────────────────

  describe('history bounds', () => {
    test('caps history at maxHistorySize', () => {
      const am = new AlertManager({
        maxHistorySize: 10,
        nowFn: () => now
      });
      const mc = new PipelineMetricsCollector({
        autoCleanup: false,
        nowFn: () => now
      });
      mc.markCatalogUpdated(now);

      // Fire 20 unique alerts by using different providers with enough failures
      for (let i = 0; i < 20; i++) {
        const provider = `provider-${i}`;
        // Manually fire alerts via evaluate by creating unique provider failures
        // Instead, use _fireAlert indirectly by crafting unique alert IDs
        am._fireAlert({
          id: `test-alert-${i}`,
          type: ALERT_TYPE.PROVIDER_FAILURE,
          severity: ALERT_SEVERITY.WARNING,
          message: `Alert ${i}`,
          provider: `p${i}`
        });
      }

      expect(am._alertHistory.length).toBeLessThanOrEqual(10);
      expect(am._alertHistory.length).toBe(10);
    });

    test('evicts oldest alerts first (FIFO)', () => {
      const am = new AlertManager({
        maxHistorySize: 5,
        nowFn: () => now
      });

      for (let i = 0; i < 8; i++) {
        now += 1;
        am._fireAlert({
          id: `alert-${i}`,
          type: ALERT_TYPE.PROVIDER_FAILURE,
          severity: ALERT_SEVERITY.WARNING,
          message: `Alert ${i}`,
          provider: `p${i}`
        });
      }

      // Should have alerts 3-7 (oldest 0-2 evicted)
      expect(am._alertHistory.length).toBe(5);
      expect(am._alertHistory[0].id).toBe('alert-3');
      expect(am._alertHistory[4].id).toBe('alert-7');
    });

    test('defaults to 1000 maxHistorySize', () => {
      const am = new AlertManager();
      expect(am.maxHistorySize).toBe(1000);
    });

    test('backward compatible - existing tests work without maxHistorySize', () => {
      // Default AlertManager should work exactly as before
      const am = new AlertManager({ nowFn: () => now });
      for (let i = 0; i < 5; i++) {
        am._fireAlert({
          id: `compat-${i}`,
          type: ALERT_TYPE.PROVIDER_FAILURE,
          severity: ALERT_SEVERITY.WARNING,
          message: `Alert ${i}`
        });
      }
      expect(am._alertHistory.length).toBe(5);
    });
  });

  // ─── Constants Export ────────────────────────────────────

  describe('constants', () => {
    test('ALERT_TYPE has expected values', () => {
      expect(ALERT_TYPE.PROVIDER_FAILURE).toBe('provider_failure');
      expect(ALERT_TYPE.STALE_CATALOG).toBe('stale_catalog');
      expect(ALERT_TYPE.PR_FAILURES).toBe('pr_failures');
    });

    test('ALERT_SEVERITY has expected values', () => {
      expect(ALERT_SEVERITY.WARNING).toBe('warning');
      expect(ALERT_SEVERITY.CRITICAL).toBe('critical');
    });

    test('DEFAULT_THRESHOLDS has expected values', () => {
      expect(DEFAULT_THRESHOLDS.providerConsecutiveFailures).toBe(3);
      expect(DEFAULT_THRESHOLDS.staleCatalogMs).toBe(86400000);
      expect(DEFAULT_THRESHOLDS.failedPRsInWindow).toBe(2);
    });
  });
});
