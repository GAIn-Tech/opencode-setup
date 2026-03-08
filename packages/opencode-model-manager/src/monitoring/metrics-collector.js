'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_EVENTS = 10000;
const PROVIDERS = Object.freeze([
  'openai', 'anthropic', 'google', 'groq', 'cerebras', 'nvidia'
]);
const DEFAULT_HISTORY_RETENTION_DAYS = 90;

/**
 * PipelineMetricsCollector tracks operational health of the model management pipeline.
 *
 * Distinct from src/metrics/metrics-collector.js which tracks 4-pillar model quality
 * (accuracy, latency, cost, robustness). This collector focuses on pipeline operations:
 * discovery success/failure rates, cache performance, state transitions, and PR activity.
 *
 * Uses in-memory storage for low overhead. Operational metrics are ephemeral -
 * they don't need SQLite persistence like model quality metrics do.
 */
class PipelineMetricsCollector {
  constructor(options = {}) {
    this.retentionMs = Math.max(0, Number(options.retentionMs) || DEFAULT_RETENTION_MS);
    this.nowFn = typeof options.nowFn === 'function' ? options.nowFn : () => Date.now();
    this._cleanupIntervalMs = Math.max(1000, Number(options.cleanupIntervalMs) || DEFAULT_CLEANUP_INTERVAL_MS);
    this._maxEvents = Math.max(1, Math.floor(Number(options.maxEvents) || DEFAULT_MAX_EVENTS));

    // Discovery metrics per provider
    this._discoveryEvents = [];

    // Cache metrics
    this._cacheEvents = [];

    // State transition metrics
    this._transitionEvents = [];

    // PR metrics
    this._prEvents = [];

    // Time-to-approval tracking (modelId -> detectedAt)
    this._detectedTimestamps = new Map();

    // Catalog freshness
    this._lastCatalogUpdate = null;

    // Cleanup timer
    this._cleanupTimer = null;
    if (typeof options.autoCleanup === 'undefined' || options.autoCleanup) {
      this._startCleanup();
    }

    // SQLite persistence for daily metric summaries
    this._db = null;
    this._dbPath = options.dbPath || path.join(os.homedir(), '.opencode', 'metrics-history.db');
    this._historyRetentionDays = DEFAULT_HISTORY_RETENTION_DAYS;
    this._initDb();
  }

  // ─── Discovery Metrics ───────────────────────────────────────

  /**
   * Record a discovery attempt for a provider.
   * @param {string} provider
   * @param {boolean} success
   * @param {object} [details] - Optional: { modelCount, durationMs, error }
   */
  recordDiscovery(provider, success, details = {}) {
    const event = {
      provider: normalizeProvider(provider),
      success: Boolean(success),
      timestamp: this.nowFn(),
      modelCount: toNonNegativeInt(details.modelCount, 0),
      durationMs: toNonNegativeNumber(details.durationMs, 0),
      error: success ? null : String(details.error || 'unknown')
    };
    this._discoveryEvents.push(event);
    this._enforceLimit(this._discoveryEvents);
    if (success) {
      this._lastCatalogUpdate = event.timestamp;
    }
    return event;
  }

  /**
   * Get discovery success rate per provider.
   * @param {number} [windowMs] - Time window (default: retention)
   * @returns {Object<string, { total: number, successes: number, failures: number, rate: number, consecutiveFailures: number }>}
   */
  getDiscoveryRates(windowMs) {
    const cutoff = this.nowFn() - (windowMs || this.retentionMs);
    const rates = {};

    for (const provider of PROVIDERS) {
      rates[provider] = { total: 0, successes: 0, failures: 0, rate: 0, consecutiveFailures: 0 };
    }

    const relevant = this._discoveryEvents.filter(e => e.timestamp >= cutoff);

    for (const event of relevant) {
      const p = event.provider;
      if (!rates[p]) {
        rates[p] = { total: 0, successes: 0, failures: 0, rate: 0, consecutiveFailures: 0 };
      }
      rates[p].total += 1;
      if (event.success) {
        rates[p].successes += 1;
      } else {
        rates[p].failures += 1;
      }
    }

    // Calculate rates and consecutive failures
    for (const provider of Object.keys(rates)) {
      const info = rates[provider];
      info.rate = info.total > 0 ? round(info.successes / info.total, 4) : 0;
      info.consecutiveFailures = this._getConsecutiveFailures(provider);
    }

    return rates;
  }

  // ─── Cache Metrics ───────────────────────────────────────────

  /**
   * Record a cache access event.
   * @param {'l1'|'l2'} tier
   * @param {'hit'|'miss'} result
   * @param {string} [key]
   */
  recordCacheAccess(tier, result, key) {
    const event = {
      tier: tier === 'l2' ? 'l2' : 'l1',
      hit: result === 'hit',
      timestamp: this.nowFn(),
      key: String(key || '')
    };
    this._cacheEvents.push(event);
    this._enforceLimit(this._cacheEvents);
    return event;
  }

  /**
   * Get cache hit/miss rates.
   * @param {number} [windowMs]
   * @returns {{ l1: { hits: number, misses: number, total: number, hitRate: number }, l2: { hits: number, misses: number, total: number, hitRate: number } }}
   */
  getCacheRates(windowMs) {
    const cutoff = this.nowFn() - (windowMs || this.retentionMs);
    const relevant = this._cacheEvents.filter(e => e.timestamp >= cutoff);

    const result = {
      l1: { hits: 0, misses: 0, total: 0, hitRate: 0 },
      l2: { hits: 0, misses: 0, total: 0, hitRate: 0 }
    };

    for (const event of relevant) {
      const tier = result[event.tier];
      tier.total += 1;
      if (event.hit) {
        tier.hits += 1;
      } else {
        tier.misses += 1;
      }
    }

    result.l1.hitRate = result.l1.total > 0 ? round(result.l1.hits / result.l1.total, 4) : 0;
    result.l2.hitRate = result.l2.total > 0 ? round(result.l2.hits / result.l2.total, 4) : 0;

    return result;
  }

  // ─── State Transition Metrics ────────────────────────────────

  /**
   * Record a lifecycle state transition.
   * @param {string} modelId
   * @param {string} fromState
   * @param {string} toState
   */
  recordTransition(modelId, fromState, toState) {
    const now = this.nowFn();
    const event = {
      modelId: String(modelId || ''),
      fromState: String(fromState || ''),
      toState: String(toState || ''),
      timestamp: now
    };
    this._transitionEvents.push(event);
    this._enforceLimit(this._transitionEvents);

    // Track time-to-approval
    if (toState === 'detected') {
      this._detectedTimestamps.set(event.modelId, now);
    }

    return event;
  }

  /**
   * Get state transition counts.
   * @param {number} [windowMs]
   * @returns {Object<string, number>} - e.g. { 'detected->assessed': 5, ... }
   */
  getTransitionCounts(windowMs) {
    const cutoff = this.nowFn() - (windowMs || this.retentionMs);
    const relevant = this._transitionEvents.filter(e => e.timestamp >= cutoff);

    const counts = {};
    for (const event of relevant) {
      const key = `${event.fromState}->${event.toState}`;
      counts[key] = (counts[key] || 0) + 1;
    }

    return counts;
  }

  // ─── PR Metrics ──────────────────────────────────────────────

  /**
   * Record a PR creation attempt.
   * @param {boolean} success
   * @param {object} [details] - { prNumber, branch, error }
   */
  recordPRCreation(success, details = {}) {
    const event = {
      success: Boolean(success),
      timestamp: this.nowFn(),
      prNumber: details.prNumber || null,
      branch: String(details.branch || ''),
      error: success ? null : String(details.error || 'unknown')
    };
    this._prEvents.push(event);
    this._enforceLimit(this._prEvents);
    return event;
  }

  /**
   * Get PR creation rates.
   * @param {number} [windowMs]
   * @returns {{ total: number, successes: number, failures: number, rate: number, recentFailures: number }}
   */
  getPRRates(windowMs) {
    const cutoff = this.nowFn() - (windowMs || this.retentionMs);
    const relevant = this._prEvents.filter(e => e.timestamp >= cutoff);

    let total = 0;
    let successes = 0;
    let failures = 0;

    for (const event of relevant) {
      total += 1;
      if (event.success) {
        successes += 1;
      } else {
        failures += 1;
      }
    }

    return {
      total,
      successes,
      failures,
      rate: total > 0 ? round(successes / total, 4) : 0,
      recentFailures: failures
    };
  }

  // ─── Time to Approval ────────────────────────────────────────

  /**
   * Get time-to-approval for models that have reached 'selectable' state.
   * @param {number} [windowMs]
   * @returns {{ avgMs: number, minMs: number, maxMs: number, count: number }}
   */
  getTimeToApproval(windowMs) {
    const cutoff = this.nowFn() - (windowMs || this.retentionMs);
    const relevant = this._transitionEvents.filter(
      e => e.timestamp >= cutoff && e.toState === 'selectable'
    );

    const durations = [];
    for (const event of relevant) {
      const detectedAt = this._detectedTimestamps.get(event.modelId);
      if (detectedAt != null) {
        durations.push(Math.max(0, event.timestamp - detectedAt));
      }
    }

    if (durations.length === 0) {
      return { avgMs: 0, minMs: 0, maxMs: 0, count: 0 };
    }

    const sum = durations.reduce((a, b) => a + b, 0);
    return {
      avgMs: round(sum / durations.length, 2),
      minMs: Math.min(...durations),
      maxMs: Math.max(...durations),
      count: durations.length
    };
  }

  // ─── Catalog Freshness ───────────────────────────────────────

  /**
   * Get catalog freshness info.
   * @returns {{ lastUpdateTimestamp: number|null, ageMs: number, stale: boolean }}
   */
  getCatalogFreshness() {
    const now = this.nowFn();
    const lastUpdate = this._lastCatalogUpdate;
    const ageMs = lastUpdate != null ? Math.max(0, now - lastUpdate) : Infinity;
    const stale = ageMs > DEFAULT_RETENTION_MS;

    return {
      lastUpdateTimestamp: lastUpdate,
      ageMs: Number.isFinite(ageMs) ? ageMs : -1,
      stale
    };
  }

  /**
   * Manually set the catalog last update timestamp.
   * @param {number} [timestamp]
   */
  markCatalogUpdated(timestamp) {
    this._lastCatalogUpdate = Number.isFinite(Number(timestamp)) ? Number(timestamp) : this.nowFn();
  }

  // ─── Aggregate ───────────────────────────────────────────────

  /**
   * Get all metrics as a single snapshot.
   * @param {number} [windowMs]
   * @returns {object}
   */
  getSnapshot(windowMs) {
    return {
      timestamp: this.nowFn(),
      discovery: this.getDiscoveryRates(windowMs),
      cache: this.getCacheRates(windowMs),
      transitions: this.getTransitionCounts(windowMs),
      prCreation: this.getPRRates(windowMs),
      timeToApproval: this.getTimeToApproval(windowMs),
      catalogFreshness: this.getCatalogFreshness()
    };
  }

  /**
   * Export metrics in Prometheus text exposition format.
   * @param {number} [windowMs]
   * @returns {string}
   */
  toPrometheus(windowMs) {
    const lines = [];
    const snapshot = this.getSnapshot(windowMs);

    // Discovery
    lines.push('# HELP model_discovery_total Total discovery attempts per provider');
    lines.push('# TYPE model_discovery_total counter');
    for (const [provider, data] of Object.entries(snapshot.discovery)) {
      lines.push(`model_discovery_total{provider="${provider}",result="success"} ${data.successes}`);
      lines.push(`model_discovery_total{provider="${provider}",result="failure"} ${data.failures}`);
    }

    lines.push('# HELP model_discovery_success_rate Discovery success rate per provider');
    lines.push('# TYPE model_discovery_success_rate gauge');
    for (const [provider, data] of Object.entries(snapshot.discovery)) {
      lines.push(`model_discovery_success_rate{provider="${provider}"} ${data.rate}`);
    }

    lines.push('# HELP model_discovery_consecutive_failures Consecutive discovery failures per provider');
    lines.push('# TYPE model_discovery_consecutive_failures gauge');
    for (const [provider, data] of Object.entries(snapshot.discovery)) {
      lines.push(`model_discovery_consecutive_failures{provider="${provider}"} ${data.consecutiveFailures}`);
    }

    // Cache
    lines.push('# HELP model_cache_total Total cache accesses');
    lines.push('# TYPE model_cache_total counter');
    for (const tier of ['l1', 'l2']) {
      const data = snapshot.cache[tier];
      lines.push(`model_cache_total{tier="${tier}",result="hit"} ${data.hits}`);
      lines.push(`model_cache_total{tier="${tier}",result="miss"} ${data.misses}`);
    }

    lines.push('# HELP model_cache_hit_rate Cache hit rate');
    lines.push('# TYPE model_cache_hit_rate gauge');
    for (const tier of ['l1', 'l2']) {
      lines.push(`model_cache_hit_rate{tier="${tier}"} ${snapshot.cache[tier].hitRate}`);
    }

    // Transitions
    lines.push('# HELP model_transitions_total State transition counts');
    lines.push('# TYPE model_transitions_total counter');
    for (const [transition, count] of Object.entries(snapshot.transitions)) {
      const [from, to] = transition.split('->');
      lines.push(`model_transitions_total{from="${from}",to="${to}"} ${count}`);
    }

    // PR
    lines.push('# HELP model_pr_total PR creation attempts');
    lines.push('# TYPE model_pr_total counter');
    lines.push(`model_pr_total{result="success"} ${snapshot.prCreation.successes}`);
    lines.push(`model_pr_total{result="failure"} ${snapshot.prCreation.failures}`);

    lines.push('# HELP model_pr_success_rate PR creation success rate');
    lines.push('# TYPE model_pr_success_rate gauge');
    lines.push(`model_pr_success_rate ${snapshot.prCreation.rate}`);

    // Time to approval
    lines.push('# HELP model_time_to_approval_ms Time from detected to selectable');
    lines.push('# TYPE model_time_to_approval_ms gauge');
    lines.push(`model_time_to_approval_avg_ms ${snapshot.timeToApproval.avgMs}`);
    lines.push(`model_time_to_approval_min_ms ${snapshot.timeToApproval.minMs}`);
    lines.push(`model_time_to_approval_max_ms ${snapshot.timeToApproval.maxMs}`);

    // Catalog freshness
    lines.push('# HELP model_catalog_age_ms Time since last catalog update');
    lines.push('# TYPE model_catalog_age_ms gauge');
    lines.push(`model_catalog_age_ms ${snapshot.catalogFreshness.ageMs}`);
    lines.push(`model_catalog_stale ${snapshot.catalogFreshness.stale ? 1 : 0}`);

    return lines.join('\n') + '\n';
  }

  // ─── Persistence ──────────────────────────────────────────────

  /**
   * Flush current in-memory metrics to SQLite as a daily summary.
   * Aggregates across all providers. Prunes records older than 90 days.
   * Never throws — degrades gracefully if DB is unavailable.
   */
  flushDailySummary() {
    if (!this._db) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const snapshot = this.getSnapshot();

      // Aggregate discovery stats across all providers
      let discoveryTotal = 0, discoverySuccesses = 0, discoveryFailures = 0;
      for (const data of Object.values(snapshot.discovery)) {
        discoveryTotal += data.total;
        discoverySuccesses += data.successes;
        discoveryFailures += data.failures;
      }

      // Cache stats
      const cacheHits = snapshot.cache.l1.hits + snapshot.cache.l2.hits;
      const cacheMisses = snapshot.cache.l1.misses + snapshot.cache.l2.misses;

      // Transition total
      let transitionsTotal = 0;
      for (const count of Object.values(snapshot.transitions)) {
        transitionsTotal += count;
      }

      // PR stats
      const prsCreated = snapshot.prCreation.total;
      const prsMerged = snapshot.prCreation.successes;

      this._db.prepare(`
        INSERT OR REPLACE INTO daily_metrics (
          date, discovery_total, discovery_successes, discovery_failures,
          cache_hits, cache_misses, cache_l1_hits, cache_l2_hits,
          transitions_total, prs_created, prs_merged, summary_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        today, discoveryTotal, discoverySuccesses, discoveryFailures,
        cacheHits, cacheMisses, snapshot.cache.l1.hits, snapshot.cache.l2.hits,
        transitionsTotal, prsCreated, prsMerged, JSON.stringify(snapshot)
      );

      // Prune records older than retention period
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this._historyRetentionDays);
      const cutoff = cutoffDate.toISOString().slice(0, 10);
      this._db.prepare('DELETE FROM daily_metrics WHERE date < ?').run(cutoff);
    } catch (_err) {
      // Never throw from flush — degrade gracefully
    }
  }

  /**
   * Load daily metric summaries from SQLite history.
   * @param {number} [days=30] - Number of days of history to load
   * @returns {Array<object>} Array of { date, discoveryTotal, ... }
   */
  loadHistory(days = 30) {
    if (!this._db) return [];
    try {
      const numDays = Math.max(0, Math.floor(Number(days) || 30));
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - numDays);
      const cutoff = cutoffDate.toISOString().slice(0, 10);

      const rows = this._db.prepare(
        'SELECT * FROM daily_metrics WHERE date >= ? ORDER BY date ASC'
      ).all(cutoff);

      return rows.map(row => ({
        date: row.date,
        discoveryTotal: row.discovery_total,
        discoverySuccesses: row.discovery_successes,
        discoveryFailures: row.discovery_failures,
        cacheHits: row.cache_hits,
        cacheMisses: row.cache_misses,
        cacheL1Hits: row.cache_l1_hits,
        cacheL2Hits: row.cache_l2_hits,
        transitionsTotal: row.transitions_total,
        prsCreated: row.prs_created,
        prsMerged: row.prs_merged,
        summary: safeJsonParse(row.summary_json, null),
        createdAt: row.created_at
      }));
    } catch (_err) {
      return [];
    }
  }

  // ─── Cleanup ─────────────────────────────────────────────────

  /**
   * Remove events older than retention window.
   */
  cleanup() {
    const cutoff = this.nowFn() - this.retentionMs;
    this._discoveryEvents = this._discoveryEvents.filter(e => e.timestamp >= cutoff);
    this._cacheEvents = this._cacheEvents.filter(e => e.timestamp >= cutoff);
    this._transitionEvents = this._transitionEvents.filter(e => e.timestamp >= cutoff);
    this._prEvents = this._prEvents.filter(e => e.timestamp >= cutoff);
  }

  /**
   * Reset all metrics.
   */
  reset() {
    this._discoveryEvents = [];
    this._cacheEvents = [];
    this._transitionEvents = [];
    this._prEvents = [];
    this._detectedTimestamps.clear();
    this._lastCatalogUpdate = null;
  }

  /**
   * Stop cleanup timer and release resources.
   */
  close() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    if (this._db) {
      try {
        this._db.close();
      } catch (_err) {
        // ignore close errors
      }
      this._db = null;
    }
  }

  // ─── Internal ────────────────────────────────────────────────

  /**
   * Evict oldest (first) elements when array exceeds maxEvents cap.
   * @param {Array} arr
   */
  _enforceLimit(arr) {
    while (arr.length > this._maxEvents) {
      arr.shift();
    }
  }

  _getConsecutiveFailures(provider) {
    let count = 0;
    for (let i = this._discoveryEvents.length - 1; i >= 0; i--) {
      const event = this._discoveryEvents[i];
      if (event.provider !== provider) continue;
      if (event.success) break;
      count += 1;
    }
    return count;
  }

  _startCleanup() {
    this._cleanupTimer = setInterval(() => this.cleanup(), this._cleanupIntervalMs);
    if (this._cleanupTimer && typeof this._cleanupTimer.unref === 'function') {
      this._cleanupTimer.unref();
    }
  }

  _initDb() {
    try {
      const dir = path.dirname(this._dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Prefer bun:sqlite (Bun-native), fall back to better-sqlite3
      let Database;
      try {
        Database = require('bun:sqlite').Database;
      } catch (_bunErr) {
        try {
          Database = require('better-sqlite3');
        } catch (_bsErr) {
          this._db = null;
          return;
        }
      }
      this._db = new Database(this._dbPath);
      this._db.pragma('journal_mode = WAL');
      this._db.pragma('synchronous = NORMAL');

      this._db.exec(`
        CREATE TABLE IF NOT EXISTS daily_metrics (
          date TEXT PRIMARY KEY,
          discovery_total INTEGER,
          discovery_successes INTEGER,
          discovery_failures INTEGER,
          cache_hits INTEGER,
          cache_misses INTEGER,
          cache_l1_hits INTEGER,
          cache_l2_hits INTEGER,
          transitions_total INTEGER,
          prs_created INTEGER,
          prs_merged INTEGER,
          summary_json TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch (_err) {
      // SQLite unavailable (missing module, permissions, etc.) — continue in-memory only
      this._db = null;
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function normalizeProvider(provider) {
  return String(provider || '').trim().toLowerCase();
}

function toNonNegativeInt(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : fallback;
}

function toNonNegativeNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function safeJsonParse(raw, fallback) {
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return fallback;
  }
}

module.exports = {
  PipelineMetricsCollector,
  PROVIDERS
};
