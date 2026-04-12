'use strict';

const { EventEmitter } = require('events');

// Lazy require of central event bus — fail-open so AlertManager works without it
let _eventBus = null;
function _getEventBus() {
  if (_eventBus === null) {
    try { _eventBus = require('../../../opencode-event-bus/src/index.js'); } catch { _eventBus = undefined; }
  }
  return _eventBus || null;
}

const DEFAULT_THRESHOLDS = Object.freeze({
  providerConsecutiveFailures: 3,
  staleCatalogMs: 24 * 60 * 60 * 1000, // 24 hours
  failedPRsInWindow: 2,
  prFailureWindowMs: 24 * 60 * 60 * 1000 // 24 hours
});

const ALERT_SEVERITY = Object.freeze({
  WARNING: 'warning',
  CRITICAL: 'critical'
});

const ALERT_TYPE = Object.freeze({
  PROVIDER_FAILURE: 'provider_failure',
  PREDICTED_PROVIDER_FAILURE: 'predicted_provider_failure',
  STALE_CATALOG: 'stale_catalog',
  PR_FAILURES: 'pr_failures',
  BUDGET_THRESHOLD: 'budget_threshold'
});

/**
 * AlertManager evaluates pipeline metrics against configured thresholds
 * and fires alerts when violations are detected.
 *
 * Events:
 * - 'alert:fired'   { alert }
 * - 'alert:resolved' { alertId, type }
 *
 * Design: Stateless evaluation against PipelineMetricsCollector snapshots.
 * Alert state (active/resolved) is tracked internally to avoid duplicate firing.
 */
class AlertManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.thresholds = Object.freeze({
      ...DEFAULT_THRESHOLDS,
      ...(options.thresholds && typeof options.thresholds === 'object' ? options.thresholds : {})
    });
    this.nowFn = typeof options.nowFn === 'function' ? options.nowFn : () => Date.now();
    this.maxHistorySize = Math.max(1, Math.floor(Number(options.maxHistorySize) || 1000));

    // Active alerts keyed by alertId
    this._activeAlerts = new Map();

    // Alert history (bounded FIFO, capped at maxHistorySize)
    this._alertHistory = [];

    // Suppression set
    this._suppressedTypes = new Set();
  }

  /**
   * Evaluate metrics and fire/resolve alerts.
   * @param {object} metricsCollector - PipelineMetricsCollector instance
   * @returns {object[]} - Array of newly fired alerts
   */
  evaluate(metricsCollector) {
    if (!metricsCollector || typeof metricsCollector.getSnapshot !== 'function') {
      return [];
    }

    const snapshot = metricsCollector.getSnapshot();
    const newAlerts = [];

    // Check provider failures
    newAlerts.push(...this._checkProviderFailures(snapshot.discovery));

    // Check predictive provider-failure advisories (shadow-mode signal consumption)
    newAlerts.push(...this._checkPredictedProviderFailures(snapshot.predictions?.discoveryAlerts, snapshot.discovery));

    // Check stale catalog
    newAlerts.push(...this._checkStaleCatalog(snapshot.catalogFreshness));

    // Check PR failures
    newAlerts.push(...this._checkPRFailures(snapshot.prCreation));

    return newAlerts;
  }

  /**
   * Evaluate token budget status and fire budget threshold alerts.
   * Call this after each consumeTokens() with the budget result.
   * @param {{ sessionId: string, model: string, used: number, remaining: number, pct: number, status: string }} budgetStatus
   * @returns {object[]} Newly fired alerts
   */
  evaluateBudget(budgetStatus) {
    if (!budgetStatus || typeof budgetStatus !== 'object') return [];

    const newAlerts = [];
    const pct = budgetStatus.pct ?? 0;
    const sessionId = budgetStatus.sessionId || 'unknown';
    const model = budgetStatus.model || 'unknown';
    const alertId = `${ALERT_TYPE.BUDGET_THRESHOLD}:${sessionId}:${model}`;

    if (pct >= 0.95) {
      if (!this._activeAlerts.has(alertId) || this._activeAlerts.get(alertId).severity !== ALERT_SEVERITY.CRITICAL) {
        // Upgrade to CRITICAL
        if (this._activeAlerts.has(alertId)) this._activeAlerts.delete(alertId);
        const alert = this._fireAlert({
          id: alertId,
          type: ALERT_TYPE.BUDGET_THRESHOLD,
          severity: ALERT_SEVERITY.CRITICAL,
          message: `Token budget CRITICAL: ${(pct * 100).toFixed(1)}% used for session ${sessionId} on ${model}`,
          sessionId,
          model,
          pct,
          used: budgetStatus.used,
          remaining: budgetStatus.remaining,
        });
        if (alert) newAlerts.push(alert);
      }
    } else if (pct >= 0.80) {
      if (!this._activeAlerts.has(alertId) || this._activeAlerts.get(alertId).severity !== ALERT_SEVERITY.CRITICAL) {
        // Upgrade to CRITICAL — aligns with Governor COMPRESS_URGENT at 80%
        if (this._activeAlerts.has(alertId)) this._activeAlerts.delete(alertId);
        const alert = this._fireAlert({
          id: alertId,
          type: ALERT_TYPE.BUDGET_THRESHOLD,
          severity: ALERT_SEVERITY.CRITICAL,
          message: `Token budget CRITICAL: ${(pct * 100).toFixed(1)}% used — compression mandatory for session ${sessionId} on ${model}`,
          sessionId,
          model,
          pct,
          used: budgetStatus.used,
          remaining: budgetStatus.remaining,
        });
        if (alert) newAlerts.push(alert);
      }
    } else if (pct >= 0.75) {
      if (!this._activeAlerts.has(alertId)) {
        const alert = this._fireAlert({
          id: alertId,
          type: ALERT_TYPE.BUDGET_THRESHOLD,
          severity: ALERT_SEVERITY.WARNING,
          message: `Token budget WARN: ${(pct * 100).toFixed(1)}% used for session ${sessionId} on ${model}`,
          sessionId,
          model,
          pct,
          used: budgetStatus.used,
          remaining: budgetStatus.remaining,
        });
        if (alert) newAlerts.push(alert);
      }
    } else {
      // Below all thresholds — auto-resolve if active
      if (this._activeAlerts.has(alertId)) {
        this.resolveAlert(alertId);
      }
    }

    return newAlerts;
  }

  /**
   * Get all currently active alerts.
   * @returns {object[]}
   */
  getActiveAlerts() {
    return Array.from(this._activeAlerts.values());
  }

  /**
   * Get alert history.
   * @param {number} [limit=100]
   * @returns {object[]}
   */
  getAlertHistory(limit = 100) {
    const len = this._alertHistory.length;
    return this._alertHistory.slice(Math.max(0, len - limit));
  }

  /**
   * Manually resolve an alert.
   * @param {string} alertId
   * @returns {boolean}
   */
  resolveAlert(alertId) {
    const alert = this._activeAlerts.get(alertId);
    if (!alert) return false;

    this._activeAlerts.delete(alertId);
    const resolvedEvent = { alertId, type: alert.type, resolvedAt: this.nowFn() };
    this.emit('alert:resolved', resolvedEvent);
    try { _getEventBus()?.emit('alert:resolved', resolvedEvent); } catch { /* fail-open */ }
    return true;
  }

  /**
   * Suppress a specific alert type (stops new alerts from firing).
   * @param {string} alertType
   */
  suppress(alertType) {
    this._suppressedTypes.add(alertType);
  }

  /**
   * Unsuppress a specific alert type.
   * @param {string} alertType
   */
  unsuppress(alertType) {
    this._suppressedTypes.delete(alertType);
  }

  /**
   * Get summary of alert state.
   * @returns {{ active: number, history: number, suppressed: string[] }}
   */
  getSummary() {
    return {
      active: this._activeAlerts.size,
      history: this._alertHistory.length,
      suppressed: Array.from(this._suppressedTypes)
    };
  }

  /**
   * Reset all alerts and history.
   */
  reset() {
    this._activeAlerts.clear();
    this._alertHistory = [];
    this._suppressedTypes.clear();
  }

  // ─── Internal Checks ────────────────────────────────────────

  _checkProviderFailures(discoveryRates) {
    const newAlerts = [];
    if (!discoveryRates || typeof discoveryRates !== 'object') return newAlerts;

    for (const [provider, data] of Object.entries(discoveryRates)) {
      const alertId = `${ALERT_TYPE.PROVIDER_FAILURE}:${provider}`;

      if (data.consecutiveFailures >= this.thresholds.providerConsecutiveFailures) {
        if (!this._activeAlerts.has(alertId)) {
          const alert = this._fireAlert({
            id: alertId,
            type: ALERT_TYPE.PROVIDER_FAILURE,
            severity: data.consecutiveFailures >= this.thresholds.providerConsecutiveFailures * 2
              ? ALERT_SEVERITY.CRITICAL
              : ALERT_SEVERITY.WARNING,
            message: `Provider "${provider}" has ${data.consecutiveFailures} consecutive discovery failures`,
            provider,
            consecutiveFailures: data.consecutiveFailures,
            successRate: data.rate
          });
          if (alert) newAlerts.push(alert);
        }
      } else {
        // Auto-resolve when consecutive failures drop below threshold
        if (this._activeAlerts.has(alertId)) {
          this.resolveAlert(alertId);
        }
      }
    }

    return newAlerts;
  }

  _checkPredictedProviderFailures(predictionSummary, discoveryRates) {
    const newAlerts = [];
    const byProvider = predictionSummary && typeof predictionSummary === 'object'
      ? predictionSummary.byProvider
      : null;
    const providerPredictions = byProvider && typeof byProvider === 'object' ? byProvider : {};

    // Resolve predicted alerts when provider no longer has a prediction payload.
    const activePredictedAlerts = this.getActiveAlerts().filter((a) => a.type === ALERT_TYPE.PREDICTED_PROVIDER_FAILURE);
    for (const alert of activePredictedAlerts) {
      if (!providerPredictions[alert.provider]) {
        this.resolveAlert(alert.id);
      }
    }

    for (const [provider, prediction] of Object.entries(providerPredictions)) {
      const alertId = `${ALERT_TYPE.PREDICTED_PROVIDER_FAILURE}:${provider}`;
      const providerDiscovery = discoveryRates && typeof discoveryRates === 'object'
        ? discoveryRates[provider]
        : null;
      const reactiveThresholdHit = providerDiscovery
        && Number(providerDiscovery.consecutiveFailures) >= this.thresholds.providerConsecutiveFailures;

      const likely = Boolean(prediction)
        && Number(prediction.secondHalfFailureRate) >= Number(prediction.threshold?.failureRate)
        && !reactiveThresholdHit;

      if (likely) {
        if (!this._activeAlerts.has(alertId)) {
          const alert = this._fireAlert({
            id: alertId,
            type: ALERT_TYPE.PREDICTED_PROVIDER_FAILURE,
            severity: ALERT_SEVERITY.WARNING,
            message: `Provider "${provider}" predicted to hit provider-failure threshold soon (failureRate=${prediction.secondHalfFailureRate}, delta=${prediction.delta})`,
            provider,
            prediction
          });
          if (alert) newAlerts.push(alert);
        }
      } else if (this._activeAlerts.has(alertId)) {
        this.resolveAlert(alertId);
      }
    }

    return newAlerts;
  }

  _checkStaleCatalog(catalogFreshness) {
    const newAlerts = [];
    if (!catalogFreshness || typeof catalogFreshness !== 'object') return newAlerts;

    const alertId = ALERT_TYPE.STALE_CATALOG;
    const ageMs = catalogFreshness.ageMs;
    const isStale = ageMs === -1 || ageMs > this.thresholds.staleCatalogMs;

    if (isStale) {
      if (!this._activeAlerts.has(alertId)) {
        const alert = this._fireAlert({
          id: alertId,
          type: ALERT_TYPE.STALE_CATALOG,
          severity: ageMs === -1 || ageMs > this.thresholds.staleCatalogMs * 2
            ? ALERT_SEVERITY.CRITICAL
            : ALERT_SEVERITY.WARNING,
          message: ageMs === -1
            ? 'Catalog has never been updated'
            : `Catalog is stale (${Math.round(ageMs / 3600000)}h since last update, threshold: ${Math.round(this.thresholds.staleCatalogMs / 3600000)}h)`,
          catalogAgeMs: ageMs
        });
        if (alert) newAlerts.push(alert);
      }
    } else {
      if (this._activeAlerts.has(alertId)) {
        this.resolveAlert(alertId);
      }
    }

    return newAlerts;
  }

  _checkPRFailures(prRates) {
    const newAlerts = [];
    if (!prRates || typeof prRates !== 'object') return newAlerts;

    const alertId = ALERT_TYPE.PR_FAILURES;

    if (prRates.recentFailures >= this.thresholds.failedPRsInWindow) {
      if (!this._activeAlerts.has(alertId)) {
        const alert = this._fireAlert({
          id: alertId,
          type: ALERT_TYPE.PR_FAILURES,
          severity: prRates.recentFailures >= this.thresholds.failedPRsInWindow * 2
            ? ALERT_SEVERITY.CRITICAL
            : ALERT_SEVERITY.WARNING,
          message: `${prRates.recentFailures} PR failures in the last ${Math.round(this.thresholds.prFailureWindowMs / 3600000)}h (threshold: ${this.thresholds.failedPRsInWindow})`,
          recentFailures: prRates.recentFailures,
          successRate: prRates.rate
        });
        if (alert) newAlerts.push(alert);
      }
    } else {
      if (this._activeAlerts.has(alertId)) {
        this.resolveAlert(alertId);
      }
    }

    return newAlerts;
  }

  _fireAlert(alertData) {
    if (this._suppressedTypes.has(alertData.type)) {
      return null;
    }

    const alert = {
      ...alertData,
      firedAt: this.nowFn()
    };

    this._activeAlerts.set(alert.id, alert);
    this._alertHistory.push(alert);
    while (this._alertHistory.length > this.maxHistorySize) {
      this._alertHistory.shift();
    }
    this.emit('alert:fired', alert);
    try { _getEventBus()?.emit('alert:fired', alert); } catch { /* fail-open */ }

    return alert;
  }
}

module.exports = {
  AlertManager,
  ALERT_TYPE,
  ALERT_SEVERITY,
  DEFAULT_THRESHOLDS
};
