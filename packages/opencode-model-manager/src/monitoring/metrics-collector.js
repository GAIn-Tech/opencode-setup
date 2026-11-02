'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

// VISION-inspired telemetry quality enforcement
const { TelemetryQualityGate } = require('./telemetry-quality');

// Helper functions
function toNonNegativeInt(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : fallback;
}

function toNonNegativeNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_EVENTS = 10000;
const PROVIDERS = Object.freeze([
  'openai', 'anthropic', 'google', 'groq', 'cerebras', 'nvidia'
]);
const DEFAULT_HISTORY_RETENTION_DAYS = 90;
const DEFAULT_HISTORY_ROTATION_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_HISTORY_ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily
const DEFAULT_HISTORY_ROTATION_MAX_ARCHIVED_FILES = 7;
const DEFAULT_HISTORY_ROTATION_MAX_ARCHIVE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_HISTORY_ROTATION_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute
const SQL_ENABLE_WAL_MODE = 'PRAGMA journal_mode=WAL';
const SQL_SET_SYNC_NORMAL = 'PRAGMA synchronous=NORMAL';
const SQL_INSERT_COMPRESSION_EVENT =
  'INSERT INTO compression_events (session_id, compression_type, input_tokens, output_tokens, ratio, strategy, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)';
const SQL_SELECT_COMPRESSION_STATS =
  'SELECT compression_type, input_tokens, output_tokens, ratio, strategy FROM compression_events WHERE timestamp >= ?';
const SQL_INSERT_CONTEXT7_EVENT =
  'INSERT INTO context7_events (session_id, library_id, resolved, duration_ms, source, timestamp) VALUES (?, ?, ?, ?, ?, ?)';
const SQL_SELECT_CONTEXT7_STATS =
  'SELECT library_id, resolved, source FROM context7_events WHERE timestamp >= ?';
const SQL_DELETE_COMPRESSION_EVENTS = 'DELETE FROM compression_events';
const SQL_DELETE_CONTEXT7_EVENTS = 'DELETE FROM context7_events';

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
this._randomFn = typeof options.randomFn === 'function' ? options.randomFn : Math.random;
    
    // Event sequence counter for ordering events with same timestamp
    this._eventSequence = 0;

    // Discovery metrics per provider
    this._discoveryEvents = [];

    // Predictive alerting events (shadow-mode advisory)
    this._discoveryPredictionEvents = [];
    this._predictiveAlertingEnabled = options.predictiveAlertingEnabled !== false;
    this._predictionMinSamples = Math.max(4, Number(options.predictionMinSamples) || 6);
    this._predictionWindowMs = Math.max(60_000, Number(options.predictionWindowMs) || (30 * 60 * 1000));
    this._predictionFailureRateThreshold = Number(options.predictionFailureRateThreshold) || 0.7;
    this._predictionDeltaThreshold = Number(options.predictionDeltaThreshold) || 0.25;

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

    // T16: Distill compression metrics
    this._compressionEvents = [];

    // T17: Context7 lookup metrics
    this._context7Events = [];

    // Orchestration policy telemetry decision events
    this._policyDecisionEvents = [];

    // Parallel utilization telemetry (requested vs applied controls)
    this._parallelControlEvents = [];

    // Package utilization telemetry (execution success/latency by package)
    this._packageExecutionEvents = [];

    // T18: Error trend metrics (backfilled from invocations.json)
    this._invocationsPath = path.join(os.homedir(), '.opencode', 'tool-usage', 'invocations.json');
    this._errorTrendCache = null;
    this._errorTrendCacheMs = 0;
    this._errorTrendCacheTTL = 60_000; // 60s cache

    // Cleanup timer
    this._cleanupTimer = null;
    if (typeof options.autoCleanup === 'undefined' || options.autoCleanup) {
      this._startCleanup();
    }

    // SQLite persistence for daily metric summaries
    this._db = null;
    this._dbPath = options.dbPath || path.join(os.homedir(), '.opencode', 'metrics-history.db');
    this._historyFilePath = options.historyFilePath || `${this._dbPath}.events.json`;
    this._historyRetentionDays = DEFAULT_HISTORY_RETENTION_DAYS;
    const historyRotation = options.historyLogRotation && typeof options.historyLogRotation === 'object'
      ? options.historyLogRotation
      : {};
    this._historyLogRotation = Object.freeze({
      maxBytes: toNonNegativeInt(historyRotation.maxBytes, DEFAULT_HISTORY_ROTATION_MAX_BYTES),
      intervalMs: toNonNegativeInt(historyRotation.intervalMs, DEFAULT_HISTORY_ROTATION_INTERVAL_MS),
      maxArchivedFiles: Math.max(1, toNonNegativeInt(historyRotation.maxArchivedFiles, DEFAULT_HISTORY_ROTATION_MAX_ARCHIVED_FILES)),
      maxArchiveAgeMs: toNonNegativeInt(historyRotation.maxArchiveAgeMs, DEFAULT_HISTORY_ROTATION_MAX_ARCHIVE_AGE_MS),
    });
    this._historyRotationCheckIntervalMs = Math.max(
      1000,
      toNonNegativeInt(historyRotation.checkIntervalMs, DEFAULT_HISTORY_ROTATION_CHECK_INTERVAL_MS)
    );
    this._historySnapshotEnabled = options.historySnapshotEnabled !== false;
    this._historyMaintenanceInFlight = Promise.resolve();
    this._lastHistoryRotationCheck = 0;
    
    // T11: Prepared statement cache for SQLite performance
    this._stmtCache = new Map();
    this._maxStmtCacheSize = 20; // Cache most frequently used statements
    
    // VISION-inspired telemetry quality enforcement (disabled by default for backward compatibility)
    this._telemetryQualityGate = new TelemetryQualityGate(options.telemetryQuality || {});
    this._telemetryQualityEnabled = options.telemetryQualityEnabled === true;
    
    // Initialize database if configured
    if (options.enableDb !== false) {
      this._initDb();
    }
  }

_createSqliteClient(dbPath) {
    // Try bun:sqlite first, then better-sqlite3
    try {
      // Check if bun:sqlite is available
      const { createRequire } = require('node:module');
      const localRequire = createRequire(__filename);
      const bunSqlite = localRequire('bun:sqlite');
      if (bunSqlite && typeof bunSqlite.Database === 'function') {
        console.log(`[DEBUG] _createSqliteClient: Using bun:sqlite with path ${dbPath}`);
        const database = new bunSqlite.Database(dbPath, { create: true });
        return {
          prepare: (sql) => database.query(sql),
          exec: (sql) => database.exec(sql),
          run: (sql, params) => database.query(sql).run(...(params || [])),
          get: (sql, params) => database.query(sql).get(...(params || [])),
          all: (sql, params) => database.query(sql).all(...(params || [])),
          close: () => database.close()
        };
      }
    } catch (error) {
      console.log(`[DEBUG] _createSqliteClient: bun:sqlite failed: ${error.message}`);
      // bun:sqlite not available, try better-sqlite3
    }
    
    try {
      // Resolve optionally via createRequire to avoid hard bundler resolution.
      const { createRequire } = require('node:module');
      const localRequire = createRequire(__filename);
      const BetterSqliteDatabase = localRequire('better-sqlite3');
      const database = new BetterSqliteDatabase(dbPath);
      return {
        prepare: (sql) => database.prepare(sql),
        exec: (sql) => database.exec(sql),
        run: (sql, params) => database.prepare(sql).run(...(params || [])),
        get: (sql, params) => database.prepare(sql).get(...(params || [])) || null,
        all: (sql, params) => database.prepare(sql).all(...(params || [])),
        close: () => database.close()
      };
    } catch (error) {
      // If SQLite is not available, create a mock for tests
      console.warn(`[PipelineMetricsCollector] SQLite not available, using in-memory mock: ${error.message}`);
      const mockData = { compression_events: [], context7_events: [] };
      return {
        exec: (sql) => {
          if (sql.includes('CREATE TABLE')) {
            // Just track that tables were created
            return;
          }
        },
        run: (sql, params) => {
          if (sql.startsWith('INSERT INTO compression_events')) {
            console.log(`[MOCK DB] Insert compression event, params[4]=${params?.[4]}`);
            mockData.compression_events.push({ params });
          } else if (sql.startsWith('INSERT INTO context7_events')) {
            mockData.context7_events.push({ params });
          }
        },
        get: (sql, params) => null,
        all: (sql, params) => {
          if (sql.includes('compression_events')) {
            return mockData.compression_events.map(e => ({
              compression_type: e.params[1],
              input_tokens: e.params[2] || 0,
              output_tokens: e.params[3] || 0,
              ratio: e.params[4] || 0,
              strategy: e.params[5] || ''
            }));
          } else if (sql.includes('context7_events')) {
            return mockData.context7_events.map(e => ({
              library_id: e.params[1],
              resolved: e.params[2] ? 1 : 0,
              source: e.params[4]
            }));
          }
          return [];
        },
        close: () => {}
      };
    }
  }

  // ─── Discovery Metrics ───────────────────────────────────────

  /**
   * Record a discovery attempt for a provider.
   * @param {string} provider
   * @param {boolean} success
   * @param {object} [details] - Optional: { modelCount, durationMs, error }
   */
recordDiscovery(provider, success, details = {}) {
    // Validate telemetry quality before acceptance (VISION fail-closed pattern)
    let qualityValidation = null;
    
    // Create base event object
    const event = {
      provider: String(provider).toLowerCase().trim(),
      success: Boolean(success),
      timestamp: this.nowFn(),
      modelCount: toNonNegativeInt(details.modelCount, 0),
      durationMs: toNonNegativeNumber(details.durationMs, 0),
      error: success ? null : String(details.error || 'unknown'),
      sessionId: details.sessionId,
      source: details.source || 'discovery_engine',
      qualityValidated: false,
      qualityRejected: false,
      veto: null,
      _sequence: ++this._eventSequence // For ordering events with same timestamp
    };
    
    if (this._telemetryQualityEnabled) {
      qualityValidation = this._telemetryQualityGate.validate('discovery', event, {
        sessionId: details.sessionId,
        timestamp: event.timestamp,
        telemetryType: 'discovery',
        source: 'metrics-collector'
      });
      
      // Apply veto if quality is insufficient
      if (qualityValidation.veto && !qualityValidation.veto.override) {
        // Telemetry rejected - log but don't store
        console.warn(`TelemetryQualityGate veto applied for discovery: ${qualityValidation.veto.reason}`);
        return { 
          ...event, 
          qualityRejected: true, 
          qualityValidated: false,
          veto: qualityValidation.veto 
        };
      }
      
      // Telemetry quality check passed
      event.qualityValidated = true;
      event.qualityRejected = false;
      event.veto = null;
    }
    
    // Store the event if quality check passes
    this._discoveryEvents.push(event);

    // Predictive alerting (shadow mode): detect rising failure trend before threshold breach.
    const prediction = this._calculateDiscoveryFailurePrediction(event.provider);
    if (prediction) {
      const predictionEvent = {
        ...prediction,
        eventType: 'provider_failure_alert_prediction',
      };
      this._discoveryPredictionEvents.push(predictionEvent);
      if (this._discoveryPredictionEvents.length > this._maxEvents) {
        this._discoveryPredictionEvents.splice(0, this._discoveryPredictionEvents.length - this._maxEvents);
      }

    }
    
    // Update catalog freshness timestamp for successful discoveries
    if (success) {
      this.markCatalogUpdated(event.timestamp);
    }
    
    // Clean up if needed
    if (this._discoveryEvents.length > this._maxEvents) {
      this._discoveryEvents.splice(0, this._discoveryEvents.length - this._maxEvents);
    }
    
    // Return the event as-is (don't override success)
    return event;
  }
  
  /**
   * Calculate overall telemetry quality score from quality gate.
   * @private
   */
  _calculateTelemetryQualityScore() {
    if (!this._telemetryQualityEnabled) {
      return null;
    }
    
    const issues = this._telemetryQualityGate.getQualityIssues();
    if (issues.length === 0) {
      return 1.0; // Perfect quality
    }
    
    // Average of all telemetry type scores
    let totalScore = 0;
    for (const issue of issues) {
      totalScore += issue.avgScore;
    }
    
    return issues.length > 0 ? round(totalScore / issues.length, 4) : 1.0;
  }
  
  /**
   * Check if any telemetry types have active vetoes (not overridden).
   * @private
   */
  _hasActiveVetoes() {
    if (!this._telemetryQualityEnabled) {
      return false;
    }
    
    const issues = this._telemetryQualityGate.getQualityIssues();
    for (const issue of issues) {
      if (issue.lastVeto !== null) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Initialize database if configured
   * @private
   */
  _initDb() {
    try {
      // Use same SQLite client pattern as state-machine.js
      const sqliteClient = this._createSqliteClient(this._dbPath);
      this._db = sqliteClient;

      // Task 11: Enable WAL mode for SQLite performance and concurrency.
      try {
        this._db.exec(SQL_ENABLE_WAL_MODE);
        this._db.exec(SQL_SET_SYNC_NORMAL);
      } catch (pragmaError) {
        console.warn(`[PipelineMetricsCollector] Failed to apply SQLite pragmas: ${pragmaError.message}`);
      }
      
      // Create tables if they don't exist
      this._db.exec(`
        CREATE TABLE IF NOT EXISTS compression_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT,
          compression_type TEXT,
          input_tokens INTEGER,
          output_tokens INTEGER,
          ratio REAL,
          strategy TEXT,
          timestamp INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      this._db.exec(`
        CREATE TABLE IF NOT EXISTS context7_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT,
          library_id TEXT,
          resolved INTEGER,
          duration_ms INTEGER,
          source TEXT,
          timestamp INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      console.log(`[PipelineMetricsCollector] Database initialized at ${this._dbPath}`);
    } catch (error) {
      // Fallback to in-memory only if SQLite fails
      console.error(`[PipelineMetricsCollector] Failed to initialize database: ${error.message}`);
      console.error('[PipelineMetricsCollector] Falling back to in-memory storage');
      this._db = null;
    }
  }

  /**
   * Cleanup and close the collector
   */
  close() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    // Close database connection if open
    if (this._db) {
      try {
        this._db.close();
      } catch (error) {
        console.error(`[PipelineMetricsCollector] Failed to close database: ${error.message}`);
      }
      this._db = null;
    }
    // Clear all arrays
    this._discoveryEvents = [];
    this._cacheEvents = [];
    this._transitionEvents = [];
    this._prEvents = [];
    this._discoveryPredictionEvents = [];
    this._compressionEvents = [];
    this._context7Events = [];
    this._policyDecisionEvents = [];
    this._parallelControlEvents = [];
    this._packageExecutionEvents = [];
    // Clear maps
    this._detectedTimestamps.clear();
    this._stmtCache.clear();
  }

  _prepareStatement(sql) {
    if (!this._db || typeof this._db.prepare !== 'function') {
      return null;
    }

    if (this._stmtCache.has(sql)) {
      return this._stmtCache.get(sql);
    }

    try {
      const statement = this._db.prepare(sql);
      if (!statement) {
        return null;
      }

      if (this._stmtCache.size >= this._maxStmtCacheSize) {
        const oldestKey = this._stmtCache.keys().next().value;
        if (oldestKey !== undefined) {
          this._stmtCache.delete(oldestKey);
        }
      }

      this._stmtCache.set(sql, statement);
      return statement;
    } catch (_error) {
      return null;
    }
  }

  _runWithPreparedStatement(sql, params = []) {
    const statement = this._prepareStatement(sql);
    if (statement && typeof statement.run === 'function') {
      return statement.run(...params);
    }
    return this._db.run(sql, params);
  }

  _allWithPreparedStatement(sql, params = []) {
    const statement = this._prepareStatement(sql);
    if (statement && typeof statement.all === 'function') {
      return statement.all(...params);
    }
    return this._db.all(sql, params);
  }

  /**
   * Mark catalog as updated (for stale catalog detection)
   * @param {number} timestamp
   */
  markCatalogUpdated(timestamp) {
    this._lastCatalogUpdate = Number(timestamp) || Date.now();
  }

  /**
   * Get discovery success rates per provider
   * @returns {Object}
   */
  getDiscoveryRates(timeWindowMs = null) {
    const now = this.nowFn();
    const cutoff = timeWindowMs !== null ? now - timeWindowMs : now - this.retentionMs;
    
    const rates = {};
    for (const provider of PROVIDERS) {
      const events = this._discoveryEvents.filter(e => 
        e.provider === provider && e.timestamp >= cutoff && !e.qualityRejected
      );
      
      console.log(`[DEBUG] getDiscoveryRates ${provider}: ${events.length} events, cutoff=${cutoff}, now=${now}`);
      events.forEach(e => console.log(`  - success=${e.success}, ts=${e.timestamp}, rejected=${e.qualityRejected}`));
      
      const total = events.length;
      const successes = events.filter(e => e.success).length;
      const failures = events.filter(e => !e.success).length;
      const consecutiveFailures = this._calculateConsecutiveFailures(provider, events);
      
      rates[provider] = {
        total,
        successes,
        failures,
        rate: total > 0 ? round(successes / total, 4) : 0,
        consecutiveFailures,
        lastFailure: events.find(e => !e.success)?.timestamp || null,
        lastSuccess: events.find(e => e.success)?.timestamp || null
      };
    }
    
    return rates;
  }

  /**
   * Calculate consecutive failures for a provider
   * @private
   */
  _calculateConsecutiveFailures(provider, events) {
    if (events.length === 0) return 0;
    
    // Sort events by timestamp (newest first), then by sequence number for equal timestamps
    const sorted = events.slice().sort((a, b) => {
      const timeDiff = b.timestamp - a.timestamp;
      if (timeDiff !== 0) return timeDiff;
      // When timestamps equal, higher sequence = newer
      return (b._sequence || 0) - (a._sequence || 0);
    });
    
    let consecutive = 0;
    
    for (const event of sorted) {
      if (!event.success) {
        consecutive++;
      } else {
        break; // Success breaks the streak
      }
    }
    
    return consecutive;
  }

  /**
   * Build a predictive advisory for provider discovery failures.
   * Conservative extension: read-only signal, no automatic state mutation.
   */
  _calculateDiscoveryFailurePrediction(provider) {
    if (!this._predictiveAlertingEnabled) return null;

    const now = this.nowFn();
    const cutoff = now - this._predictionWindowMs;
    const events = this._discoveryEvents
      .filter((e) => e.provider === provider && e.timestamp >= cutoff && !e.qualityRejected)
      .sort((a, b) => {
        const timeDiff = a.timestamp - b.timestamp;
        if (timeDiff !== 0) return timeDiff;
        return (a._sequence || 0) - (b._sequence || 0);
      });

    if (events.length < this._predictionMinSamples) return null;

    const midpoint = Math.floor(events.length / 2);
    const firstHalf = events.slice(0, midpoint);
    const secondHalf = events.slice(midpoint);
    const failureRate = (slice) => {
      if (slice.length === 0) return 0;
      return slice.filter((e) => !e.success).length / slice.length;
    };

    const firstHalfFailureRate = failureRate(firstHalf);
    const secondHalfFailureRate = failureRate(secondHalf);
    const delta = round(secondHalfFailureRate - firstHalfFailureRate, 4);
    const likelyAlert = secondHalfFailureRate >= this._predictionFailureRateThreshold
      && delta >= this._predictionDeltaThreshold;

    if (!likelyAlert) return null;

    return {
      provider,
      sampleSize: events.length,
      firstHalfFailureRate: round(firstHalfFailureRate, 4),
      secondHalfFailureRate: round(secondHalfFailureRate, 4),
      delta,
      predictedConsecutiveFailures: this._calculateConsecutiveFailures(provider, events),
      threshold: {
        failureRate: this._predictionFailureRateThreshold,
        delta: this._predictionDeltaThreshold,
      },
      timestamp: now,
    };
  }

  getDiscoveryAlertPredictions(timeWindowMs = null) {
    const now = this.nowFn();
    const cutoff = timeWindowMs !== null ? now - timeWindowMs : now - this.retentionMs;
    const events = this._discoveryPredictionEvents.filter((e) => e.timestamp >= cutoff);

    const latestByProvider = {};
    for (const event of events) {
      const existing = latestByProvider[event.provider];
      if (!existing || event.timestamp > existing.timestamp) {
        latestByProvider[event.provider] = event;
      }
    }

    return {
      totalEvents: events.length,
      byProvider: latestByProvider,
    };
  }

  /**
   * Record cache access metrics
   */
  recordCacheAccess(cacheType, hit, key, details = {}) {
    // Telemetry quality validation would go here
    const normalizedTier = String(cacheType).toLowerCase();
    const validTier = ['l1', 'l2'].includes(normalizedTier) ? normalizedTier : 'l1';
    
    // Handle string 'hit'/'miss' or boolean
    const hitValue = typeof hit === 'string' 
      ? hit.toLowerCase() === 'hit'
      : Boolean(hit);
    
    const event = {
      tier: validTier,
      hit: hitValue,
      key: String(key),
      timestamp: this.nowFn(),
      details: { ...details }
    };
    
    this._cacheEvents.push(event);
    
    // Clean up if needed
    if (this._cacheEvents.length > this._maxEvents) {
      this._cacheEvents.splice(0, this._cacheEvents.length - this._maxEvents);
    }
    
    return event;
  }

  /**
   * Record package execution telemetry
   */
  recordPackageExecution(details = {}) {
    // Telemetry quality validation would go here
    const event = {
      eventType: 'package_execution',
      timestamp: this.nowFn(),
      packageName: details.package || details.packageName || '',
      method: details.method || '',
      success: !!details.success,
      durationMs: Math.max(0, Number(details.durationMs) || 0),
      taskType: details.taskType || 'unknown',
      error: details.error || null,
      details: { ...details }
    };
    
    this._packageExecutionEvents.push(event);
    return event;
  }

  /**
   * Record orchestration policy decisions (mandatory enforcement pattern)
   */
  recordPolicyDecision(details = {}, options = {}) {
    // Apply sampling if configured (use options.sampleRate if provided, otherwise instance default)
    const sampleRate = options.sampleRate !== undefined ? options.sampleRate : this._policyDecisionSampleRate;
    if (sampleRate < 1.0 && this._randomFn() > sampleRate) {
      return null;
    }
    
    // Extract decisionType from details.explain.precedence.appliedRule
    const decisionType = details.explain?.precedence?.appliedRule || 'unknown';
    
    // Telemetry quality validation would go here
    const event = {
      eventType: 'orchestration_policy_decision',
      decisionType: String(decisionType),
      timestamp: this.nowFn(),
      schemaVersion: '1.0',
      decisionVersion: details.contractVersion || '1.0',
      // Promote fields from details to top-level
      sessionId: options.sessionId || details.sessionId,
      taskId: options.taskId || details.taskId,
      taskType: options.taskType || details.taskType,
      // Promote inputs, outputs, score from details
      inputs: details.inputs || {},
      outputs: {
        // Copy all outputs fields
        ...(details.outputs || {}),
        // Promote fallbackReason from routing.fallback.reason if present
        fallbackReason: details.outputs?.routing?.fallback?.reason,
        // Promote precedenceRule from routing.fallback.metadata.precedenceRule if present
        precedenceRule: details.outputs?.routing?.fallback?.metadata?.precedenceRule,
        // Promote failOpen from routing.fallback.allowFailOpen if present
        failOpen: details.outputs?.routing?.fallback?.allowFailOpen
      },
      score: details.explain?.budget ? {
        // Copy all fields except 'score' if it exists (avoid duplication)
        ...Object.fromEntries(Object.entries(details.explain.budget).filter(([k]) => k !== 'score')),
        combinedBudgetScore: details.explain.budget.score
      } : {
        score: 0,
        components: {},
        combinedBudgetScore: 0
      },
      details: { ...details }
    };
    
    this._policyDecisionEvents.push(event);
    return event;
  }

  /**
   * Record compression metrics
   */
  recordCompression(compressionType, details = {}) {
    // Support both old signature (compressionType, details) and new (details object)
    let actualCompressionType = 'compression';
    let actualDetails = details;
    
    if (typeof compressionType === 'string') {
      actualCompressionType = compressionType;
    } else {
      // Single parameter call: recordCompression(details)
      actualDetails = compressionType || {};
      actualCompressionType = actualDetails.compressionType || 'compression';
    }
    
    const event = {
      compressionType: String(actualCompressionType),
      timestamp: this.nowFn(),
      details: { ...actualDetails }
    };
    
    this._compressionEvents.push(event);
    
    // Persist to database if available
      if (this._db) {
        try {
          console.log(`[DEBUG] recordCompression calling _db.run(), _db exists: ${!!this._db}`);
          this._runWithPreparedStatement(SQL_INSERT_COMPRESSION_EVENT, [
            actualDetails.sessionId || null,
            actualCompressionType,
            actualDetails.inputTokens || 0,
            actualDetails.outputTokens || 0,
            actualDetails.ratio || 0,
            actualDetails.strategy || '',
            event.timestamp
          ]);
          console.log(`[DEBUG] recordCompression insert completed`);
        } catch (error) {
          console.error(`[PipelineMetricsCollector] Failed to persist compression event: ${error.message}`);
        }
      }
    
    return event;
  }

  /**
   * Get compression statistics
   */
  getCompressionStats() {
    const now = this.nowFn();
    const cutoff = now - this.retentionMs;
    
    // Use database if available, otherwise use in-memory events
    if (this._db) {
      try {
        console.log(`[DEBUG] getCompressionStats querying DB with cutoff: ${cutoff}`);
        const rows = this._allWithPreparedStatement(SQL_SELECT_COMPRESSION_STATS, [cutoff]);
        console.log(`[DEBUG] getCompressionStats got ${rows.length} rows from DB`);
        
        const totalTokensSaved = rows.reduce((total, row) => {
          return total + ((row.input_tokens || 0) - (row.output_tokens || 0));
        }, 0);
        
        const totalInputTokens = rows.reduce((total, row) => total + (row.input_tokens || 0), 0);
        const totalOutputTokens = rows.reduce((total, row) => total + (row.output_tokens || 0), 0);
        // Calculate average of ratios (not weighted average)
        const totalRatio = rows.reduce((total, row) => total + (row.ratio || 0), 0);
        const avgCompressionRatio = rows.length > 0 ? round(totalRatio / rows.length, 4) : 0;
        
        const byType = rows.reduce((acc, row) => {
          acc[row.compression_type] = (acc[row.compression_type] || 0) + 1;
          return acc;
        }, {});
        
        return {
          totalEvents: rows.length,
          total: rows.length,
          totalTokensSaved,
          avgCompressionRatio,
          byType
        };
      } catch (error) {
        console.error(`[PipelineMetricsCollector] Failed to read compression stats from DB: ${error.message}`);
      }
    }
    
    // Fallback to in-memory events if no database or DB error
    const memoryEvents = this._compressionEvents.filter(e => e.timestamp >= cutoff);
    const memoryTokensSaved = memoryEvents.reduce((total, e) => {
      const inputTokens = e.details?.inputTokens || 0;
      const outputTokens = e.details?.outputTokens || 0;
      return total + (inputTokens - outputTokens);
    }, 0);
    
    const totalInputTokens = memoryEvents.reduce((total, e) => total + (e.details?.inputTokens || 0), 0);
    const totalOutputTokens = memoryEvents.reduce((total, e) => total + (e.details?.outputTokens || 0), 0);
    // Calculate average of ratios (not weighted average)
    const totalRatio = memoryEvents.reduce((total, e) => total + (e.details?.ratio || 0), 0);
    const avgCompressionRatio = memoryEvents.length > 0 ? round(totalRatio / memoryEvents.length, 4) : 0;
    
    return {
      totalEvents: memoryEvents.length,
      total: memoryEvents.length,
      totalTokensSaved: memoryTokensSaved,
      avgCompressionRatio,
      byType: memoryEvents.reduce((acc, e) => {
        acc[e.compressionType] = (acc[e.compressionType] || 0) + 1;
        return acc;
      }, {})
    };
  }

  /**
   * Record Context7 lookup metrics
   */
  recordContext7Lookup(details = {}) {
    // Support both old signature (lookupType, details) and new (details object)
    let lookupType = 'context7';
    let actualDetails = details;
    
    if (typeof details === 'string') {
      // Old signature: recordContext7Lookup(lookupType, details)
      lookupType = details;
      actualDetails = arguments[1] || {};
    } else if (details.lookupType) {
      lookupType = details.lookupType;
    }
    
    const event = {
      lookupType: String(lookupType),
      timestamp: this.nowFn(),
      details: { ...actualDetails }
    };
    
    this._context7Events.push(event);
    
    // Persist to database if available
      if (this._db) {
        try {
          this._runWithPreparedStatement(SQL_INSERT_CONTEXT7_EVENT, [
            actualDetails.sessionId || null,
            actualDetails.libraryId || null,
            actualDetails.resolved ? 1 : 0,
            actualDetails.durationMs || 0,
            actualDetails.source || null,
            event.timestamp
          ]);
        } catch (error) {
          console.error(`[PipelineMetricsCollector] Failed to persist context7 event: ${error.message}`);
        }
      }
    
    return event;
  }

  /**
   * Get Context7 lookup statistics
   */
  getContext7Stats() {
    const now = this.nowFn();
    const cutoff = now - this.retentionMs;
    
    // Use database if available, otherwise use in-memory events
    if (this._db) {
      try {
        const rows = this._allWithPreparedStatement(SQL_SELECT_CONTEXT7_STATS, [cutoff]);
        
        const resolved = rows.filter(row => row.resolved === 1).length;
        const failed = rows.length - resolved;
        const resolutionRate = rows.length > 0 ? round(resolved / rows.length, 4) : 0;
        
        const byType = rows.reduce((acc, row) => {
          const type = row.library_id || 'unknown';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {});
        
        return {
          totalLookups: rows.length,
          total: rows.length,
          resolved,
          failed,
          resolutionRate,
          byType
        };
      } catch (error) {
        console.error(`[PipelineMetricsCollector] Failed to read context7 stats from DB: ${error.message}`);
      }
    }
    
    // Fallback to in-memory events if no database or DB error
    const memoryEvents = this._context7Events.filter(e => e.timestamp >= cutoff);
    const memoryResolved = memoryEvents.filter(e => e.details?.resolved === true).length;
    const memoryFailed = memoryEvents.length - memoryResolved;
    const resolutionRate = memoryEvents.length > 0 ? round(memoryResolved / memoryEvents.length, 4) : 0;
    
    return {
      totalLookups: memoryEvents.length,
      total: memoryEvents.length,
      resolved: memoryResolved,
      failed: memoryFailed,
      resolutionRate,
      byType: memoryEvents.reduce((acc, e) => {
        acc[e.lookupType] = (acc[e.lookupType] || 0) + 1;
        return acc;
      }, {})
    };
  }

  // ─── Cache Rate Methods ──────────────────────────────────────

  /**
   * Get cache hit/miss rates for L1 and L2 caches
   */
  getCacheRates() {
    const now = this.nowFn();
    const cutoff = now - this.retentionMs;
    
    const events = this._cacheEvents.filter(e => e.timestamp >= cutoff);
    
    const l1Events = events.filter(e => e.tier === 'l1');
    const l2Events = events.filter(e => e.tier === 'l2');
    
    const calculateRates = (events) => {
      const hits = events.filter(e => e.hit === true).length;
      const misses = events.filter(e => e.hit === false).length;
      const total = hits + misses;
      
      return {
        hits,
        misses,
        total,
        hitRate: total > 0 ? round(hits / total, 4) : 0
      };
    };
    
    return {
      l1: calculateRates(l1Events),
      l2: calculateRates(l2Events)
    };
  }

  // ─── State Transition Methods ────────────────────────────────

  /**
   * Record state transition for a model
   */
  recordTransition(modelId, fromState, toState, details = {}) {
    const event = {
      modelId: String(modelId),
      fromState: String(fromState),
      toState: String(toState),
      timestamp: this.nowFn(),
      sessionId: details.sessionId,
      source: details.source || 'state_machine',
      trigger: details.trigger || 'auto'
    };
    
    this._transitionEvents.push(event);
    
    // Update time-to-approval tracking
    if (toState === 'detected') {
      this._detectedTimestamps.set(modelId, event.timestamp);
    }
    
    // Clean up old events
    if (this._transitionEvents.length > this._maxEvents) {
      this._transitionEvents.splice(0, this._transitionEvents.length - this._maxEvents);
    }
    
    return event;
  }

  /**
   * Get transition counts by type
   */
  getTransitionCounts(timeWindowMs = null) {
    const now = this.nowFn();
    const cutoff = timeWindowMs !== null ? now - timeWindowMs : now - this.retentionMs;
    
    const events = this._transitionEvents.filter(e => e.timestamp >= cutoff);
    
    return events.reduce((acc, e) => {
      const key = `${e.fromState}->${e.toState}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  // ─── PR Creation Methods ─────────────────────────────────────

  /**
   * Record PR creation attempt
   */
  recordPRCreation(success, details = {}) {
    const event = {
      success: Boolean(success),
      timestamp: this.nowFn(),
      prNumber: details.prNumber || null,
      branch: details.branch || null,
      repo: details.repo || null,
      author: details.author || null,
      error: success ? null : String(details.error || 'unknown'),
      diffSize: toNonNegativeInt(details.diffSize, 0),
      durationMs: toNonNegativeNumber(details.durationMs, 0)
    };
    
    this._prEvents.push(event);
    
    if (this._prEvents.length > this._maxEvents) {
      this._prEvents.splice(0, this._prEvents.length - this._maxEvents);
    }
    
    return event;
  }

  // ─── Catalog Freshness Methods ───────────────────────────────

  /**
   * Get catalog freshness metrics
   */
  getCatalogFreshness() {
    const now = this.nowFn();
    
    if (this._lastCatalogUpdate === null) {
      return {
        lastUpdateTimestamp: null,
        lastUpdate: null,
        ageMs: -1,
        stale: true,
        daysSinceUpdate: -1
      };
    }
    
    const ageMs = now - this._lastCatalogUpdate;
    
    return {
      lastUpdateTimestamp: this._lastCatalogUpdate,
      lastUpdate: this._lastCatalogUpdate,
      ageMs,
      stale: ageMs > (24 * 60 * 60 * 1000), // 24 hours
      daysSinceUpdate: round(ageMs / (24 * 60 * 60 * 1000), 2)
    };
  }

  // ─── Parallel Controls Methods ───────────────────────────────

  /**
   * Record parallel control decisions
   */
  recordParallelControls(details = {}) {
    const event = {
      timestamp: this.nowFn(),
      sessionId: details.sessionId,
      requestedFanout: toNonNegativeInt(details.requestedFanout, 1),
      appliedFanout: toNonNegativeInt(details.appliedFanout, 1),
      requestedConcurrency: toNonNegativeInt(details.requestedConcurrency, 1),
      appliedConcurrency: toNonNegativeInt(details.appliedConcurrency, 1),
      budgetBand: details.budgetBand || null,
      taskType: details.taskType || null,
      fallbackReason: details.fallbackReason || null,
      limitReason: details.limitReason || null,
      agentTypes: Array.isArray(details.agentTypes) ? details.agentTypes : [],
      success: typeof details.success === 'boolean' ? details.success : true
    };
    
    this._parallelControlEvents.push(event);
    
    if (this._parallelControlEvents.length > this._maxEvents) {
      this._parallelControlEvents.splice(0, this._parallelControlEvents.length - this._maxEvents);
    }
    
    return event;
  }

  // ─── Package Execution Methods ───────────────────────────────

  // ─── Snapshot & Export Methods ───────────────────────────────

  /**
   * Get comprehensive snapshot of all metrics
   */
  getSnapshot() {
    const now = this.nowFn();
    
    // Get discovery rates
    const discoveryRates = this.getDiscoveryRates();
    const discoveryPredictions = this.getDiscoveryAlertPredictions();
    
    // Get cache rates
    const cacheRates = this.getCacheRates();
    
    // Get transition counts
    const transitionCounts = this.getTransitionCounts();
    
    // Get catalog freshness
    const catalogFreshness = this.getCatalogFreshness();
    
    // Get compression stats
    const compressionStats = this.getCompressionStats();
    
    // Get Context7 stats
    const context7Stats = this.getContext7Stats();
    
    // Calculate time-to-approval
    const timeToApproval = this._calculateTimeToApproval();
    
    // Calculate PR success rate and counts
    const prSuccessRate = this._calculatePRSuccessRate();
    const recentPREvents = this._prEvents.filter(e => e.timestamp >= now - this.retentionMs);
    const prSuccesses = recentPREvents.filter(e => e.success).length;
    const prFailures = recentPREvents.filter(e => !e.success).length;
    
    return {
      timestamp: now,
      discovery: discoveryRates,
      predictions: {
        discoveryAlerts: discoveryPredictions,
      },
      cache: {
        l1: cacheRates.l1,
        l2: cacheRates.l2
      },
      transitions: {
        totalEvents: this._transitionEvents.length,
        recentEvents: this._transitionEvents.filter(e => e.timestamp >= now - this.retentionMs).length,
        counts: transitionCounts
      },
      prCreation: {
        total: this._prEvents.length, // Alias for test compatibility
        totalEvents: this._prEvents.length,
        recentEvents: this._prEvents.filter(e => e.timestamp >= now - this.retentionMs).length,
        successes: prSuccesses,
        failures: prFailures,
        recentFailures: prFailures, // Added for AlertManager compatibility
        successRate: prSuccessRate,
        rate: prSuccessRate // Added for AlertManager compatibility
      },
      timeToApproval,
      catalogFreshness,
      compression: compressionStats,
      context7: context7Stats,
      parallelControls: {
        totalEvents: this._parallelControlEvents.length,
        recentEvents: this._parallelControlEvents.filter(e => e.timestamp >= now - this.retentionMs).length
      },
      packageExecution: {
        totalEvents: this._packageExecutionEvents.length,
        recentEvents: this._packageExecutionEvents.filter(e => e.timestamp >= now - this.retentionMs).length,
        byPackage: this._calculatePackageExecutionRates()
      },
      telemetryQuality: {
        enabled: this._telemetryQualityEnabled,
        score: this._calculateTelemetryQualityScore(),
        hasActiveVetoes: this._hasActiveVetoes()
      }
    };
  }

  /**
   * Export metrics to Prometheus format
   */
  toPrometheus() {
    const snapshot = this.getSnapshot();
    
    const lines = [];
    
    lines.push('# HELP model_discovery_total Total discovery events per provider');
    lines.push('# TYPE model_discovery_total counter');
    lines.push('# HELP model_discovery_rate Discovery success rate per provider');
    lines.push('# TYPE model_discovery_rate gauge');
    lines.push('# HELP model_discovery_consecutive_failures Consecutive failures per provider');
    lines.push('# TYPE model_discovery_consecutive_failures gauge');
    
    // Discovery metrics - format with result labels for compatibility
    for (const [provider, rate] of Object.entries(snapshot.discovery)) {
      lines.push(`model_discovery_total{provider="${provider}",result="success"} ${rate.successes}`);
      lines.push(`model_discovery_total{provider="${provider}",result="failure"} ${rate.failures}`);
      lines.push(`model_discovery_rate{provider="${provider}"} ${rate.rate}`);
      lines.push(`model_discovery_consecutive_failures{provider="${provider}"} ${rate.consecutiveFailures}`);
    }
    
    lines.push('# HELP model_cache_total Cache events by tier');
    lines.push('# TYPE model_cache_total counter');
    lines.push('# HELP model_cache_hit_rate Cache hit rate by tier');
    lines.push('# TYPE model_cache_hit_rate gauge');
    
    // Cache metrics
    lines.push(`model_cache_total{tier="l1",result="hit"} ${snapshot.cache.l1.hits}`);
    lines.push(`model_cache_total{tier="l1",result="miss"} ${snapshot.cache.l1.misses}`);
    lines.push(`model_cache_total{tier="l2",result="hit"} ${snapshot.cache.l2.hits}`);
    lines.push(`model_cache_total{tier="l2",result="miss"} ${snapshot.cache.l2.misses}`);
    lines.push(`model_cache_hit_rate{tier="l1"} ${snapshot.cache.l1.hitRate}`);
    lines.push(`model_cache_hit_rate{tier="l2"} ${snapshot.cache.l2.hitRate}`);
    
    lines.push('# HELP model_transitions_total State transition counts');
    lines.push('# TYPE model_transitions_total counter');
    
    // Transition metrics
    for (const [transition, count] of Object.entries(snapshot.transitions.counts)) {
      const safeTransition = transition.replace(/[^a-zA-Z0-9_]/g, '_');
      const [from, to] = safeTransition.split('__');
      lines.push(`model_transitions_total{from="${from}",to="${to}"} ${count}`);
    }
    
    lines.push('# HELP model_pr_total PR creation events');
    lines.push('# TYPE model_pr_total counter');
    lines.push('# HELP model_pr_success_rate PR creation success rate');
    lines.push('# TYPE model_pr_success_rate gauge');
    
    // PR creation metrics
    lines.push(`model_pr_total{result="success"} ${snapshot.prCreation.successes}`);
    lines.push(`model_pr_total{result="failure"} ${snapshot.prCreation.failures}`);
    lines.push(`model_pr_success_rate ${snapshot.prCreation.successRate}`);
    
    lines.push('# HELP model_catalog_age_ms Age of last catalog update');
    lines.push('# TYPE model_catalog_age_ms gauge');
    lines.push('# HELP model_catalog_stale Whether catalog is stale');
    lines.push('# TYPE model_catalog_stale gauge');
    
    // Catalog freshness
    if (snapshot.catalogFreshness.lastUpdate !== null) {
      lines.push(`model_catalog_age_ms ${snapshot.catalogFreshness.ageMs}`);
      lines.push(`model_catalog_stale ${snapshot.catalogFreshness.stale ? 1 : 0}`);
    }
    
    lines.push('# HELP opencode_telemetry_quality_enabled Telemetry quality gate enabled');
    lines.push('# TYPE opencode_telemetry_quality_enabled gauge');
    lines.push('# HELP opencode_telemetry_quality_score Telemetry quality score');
    lines.push('# TYPE opencode_telemetry_quality_score gauge');
    lines.push('# HELP opencode_telemetry_quality_has_active_vetoes Active telemetry vetoes');
    lines.push('# TYPE opencode_telemetry_quality_has_active_vetoes gauge');
    
    // Telemetry quality
    lines.push(`opencode_telemetry_quality_enabled{} ${snapshot.telemetryQuality.enabled ? 1 : 0}`);
    if (snapshot.telemetryQuality.score !== null) {
      lines.push(`opencode_telemetry_quality_score{} ${snapshot.telemetryQuality.score}`);
    }
    lines.push(`opencode_telemetry_quality_has_active_vetoes{} ${snapshot.telemetryQuality.hasActiveVetoes ? 1 : 0}`);
    
    return lines.join('\n') + '\n';
  }

  // ─── Private Helper Methods ──────────────────────────────────

  /**
   * Calculate time-to-approval metrics
   * @private
   */
  _calculateTimeToApproval() {
    const now = this.nowFn();
    const completedModels = [];
    const pendingModels = [];
    
    // Track detected timestamps
    const detectedTimes = new Map();
    for (const e of this._transitionEvents) {
      if (e.toState === 'detected') {
        detectedTimes.set(e.modelId, e.timestamp);
      }
    }
    
    // Track selectable transitions
    const selectableTimes = new Map();
    for (const e of this._transitionEvents) {
      if (e.toState === 'selectable') {
        selectableTimes.set(e.modelId, e.timestamp);
      }
    }
    
    // Calculate times for models that reached selectable
    for (const [modelId, detectedAt] of detectedTimes.entries()) {
      const selectableAt = selectableTimes.get(modelId);
      if (selectableAt) {
        const timeMs = selectableAt - detectedAt;
        completedModels.push({
          modelId,
          detectedAt,
          selectableAt,
          timeMs,
          timeHours: round(timeMs / (60 * 60 * 1000), 2)
        });
      }
    }
    
    // Calculate pending models (detected but not selectable)
    for (const [modelId, detectedAt] of detectedTimes.entries()) {
      if (!selectableTimes.has(modelId)) {
        const ageMs = now - detectedAt;
        pendingModels.push({
          modelId,
          detectedAt,
          ageMs,
          ageHours: round(ageMs / (60 * 60 * 1000), 2)
        });
      }
    }
    
    const completedTimes = completedModels.map(m => m.timeMs);
    
    return {
      count: completedModels.length,
      pendingCount: pendingModels.length,
      avgMs: completedTimes.length > 0 ? Math.round(completedTimes.reduce((a, b) => a + b, 0) / completedTimes.length) : 0,
      minMs: completedTimes.length > 0 ? Math.min(...completedTimes) : 0,
      maxMs: completedTimes.length > 0 ? Math.max(...completedTimes) : 0,
      completedModels: completedModels.slice(0, 10),
      pendingModels: pendingModels.slice(0, 10)
    };
  }

  /**
   * Calculate PR success rate
   * @private
   */
  _calculatePRSuccessRate() {
    const now = this.nowFn();
    const cutoff = now - this.retentionMs;
    
    const events = this._prEvents.filter(e => e.timestamp >= cutoff);
    
    if (events.length === 0) {
      return 0;
    }
    
    const successes = events.filter(e => e.success).length;
    return round(successes / events.length, 4);
  }

  /**
   * Calculate package execution rates
   * @private
   */
  _calculatePackageExecutionRates() {
    const now = this.nowFn();
    const cutoff = now - this.retentionMs;
    
    const events = this._packageExecutionEvents.filter(e => e.timestamp >= cutoff);
    
    const byPackage = {};
    const byMethod = {};
    
    for (const event of events) {
      const pkg = event.packageName;
      const methodKey = `${pkg}.${event.method}`;
      
      // Update byPackage stats
      if (!byPackage[pkg]) {
        byPackage[pkg] = { total: 0, successes: 0, failures: 0, rate: 0 };
      }
      
      byPackage[pkg].total++;
      if (event.success) {
        byPackage[pkg].successes++;
      } else {
        byPackage[pkg].failures++;
      }
      
      // Update byMethod stats
      byMethod[methodKey] = (byMethod[methodKey] || 0) + 1;
    }
    
    // Calculate success rates
    for (const pkg in byPackage) {
      byPackage[pkg].rate = byPackage[pkg].total > 0 
        ? round(byPackage[pkg].successes / byPackage[pkg].total, 4)
        : 0;
    }
    
    return {
      byPackage,
      byMethod
    };
  }

  // ─── Additional Methods Required by Tests ─────────────────────

  /**
   * Get PR success rates
   */
  getPRRates() {
    const now = this.nowFn();
    const cutoff = now - this.retentionMs;
    
    const events = this._prEvents.filter(e => e.timestamp >= cutoff);
    
    const total = events.length;
    const successes = events.filter(e => e.success).length;
    const failures = events.filter(e => !e.success).length;
    const recentFailures = events.filter(e => !e.success && e.timestamp >= now - 3600000).length;
    
    return {
      total,
      successes,
      failures,
      rate: total > 0 ? round(successes / total, 4) : 0,
      recentFailures
    };
  }

  /**
   * Get time-to-approval metrics
   */
  getTimeToApproval() {
    const tta = this._calculateTimeToApproval();
    
    return {
      count: tta.count,
      pendingCount: tta.pendingCount,
      avgMs: tta.avgMs,
      minMs: tta.minMs,
      maxMs: tta.maxMs,
      completedModels: tta.completedModels,
      pendingModels: tta.pendingModels
    };
  }

  /**
   * Get parallel control statistics
   */
  getParallelControlStats() {
    const now = this.nowFn();
    const cutoff = now - this.retentionMs;
    
    const events = this._parallelControlEvents.filter(e => e.timestamp >= cutoff);
    
    if (events.length === 0) {
      return {
        totalEvents: 0,
        avgFanoutReduction: 0,
        avgConcurrencyReduction: 0,
        limitRate: 0,
        successRate: 0,
        byBudgetBand: {},
        byTaskType: {},
        fallbackReasons: {}
      };
    }
    
    const fanoutReductions = events.map(e => e.requestedFanout - e.appliedFanout);
    const concurrencyReductions = events.map(e => e.requestedConcurrency - e.appliedConcurrency);
    const avgFanoutReduction = events.length > 0 ? round(fanoutReductions.reduce((a, b) => a + b, 0) / events.length, 2) : 0;
    const avgConcurrencyReduction = events.length > 0 ? round(concurrencyReductions.reduce((a, b) => a + b, 0) / events.length, 2) : 0;
    
    const limitedEvents = events.filter(e => e.appliedFanout < e.requestedFanout || e.appliedConcurrency < e.requestedConcurrency).length;
    const successfulEvents = events.filter(e => e.success).length;
    
    const byBudgetBand = events.reduce((acc, e) => {
      const band = e.budgetBand || 'unknown';
      acc[band] = (acc[band] || 0) + 1;
      return acc;
    }, {});
    
    const byTaskType = events.reduce((acc, e) => {
      const type = e.taskType || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    
    const fallbackReasons = events.reduce((acc, e) => {
      const reason = e.fallbackReason || 'none';
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {});
    
    return {
      totalEvents: events.length,
      avgFanoutReduction,
      avgConcurrencyReduction,
      limitRate: round(limitedEvents / events.length, 4),
      successRate: round(successfulEvents / events.length, 4),
      byBudgetBand,
      byTaskType,
      fallbackReasons
    };
  }

  /**
   * Get policy decision statistics
   */
  getPolicyDecisionStats() {
    const now = this.nowFn();
    const cutoff = now - this.retentionMs;
    
    const events = this._policyDecisionEvents.filter(e => e.timestamp >= cutoff);
    
    const totalEvents = events.length;
    const sampledEvents = events.filter(e => e.details.sampleRate && e.details.sampleRate < 1).length;
    
    return {
      totalEvents,
      sampledEvents,
      eventsByType: events.reduce((acc, e) => {
        acc[e.decisionType] = (acc[e.decisionType] || 0) + 1;
        return acc;
      }, {})
    };
  }

  /**
   * Get package execution statistics
   */
  getPackageExecutionStats() {
    const now = this.nowFn();
    const cutoff = now - this.retentionMs;
    
    const events = this._packageExecutionEvents.filter(e => e.timestamp >= cutoff);
    
    const { byPackage, byMethod } = this._calculatePackageExecutionRates();
    
    const totalEvents = events.length;
    const successfulEvents = events.filter(e => e.success).length;
    const avgDurationMs = events.length > 0 
      ? round(events.reduce((sum, e) => sum + e.durationMs, 0) / events.length, 2)
      : 0;
    
    console.log('[DEBUG] Package execution stats:', { 
      totalEvents, successfulEvents, 
      allEvents: events.length, 
      successRate: totalEvents > 0 ? round(successfulEvents / totalEvents, 4) : 0,
      events: events.map(e => ({ success: e.success, packageName: e.packageName }))
    });
    
    return {
      totalEvents,
      successfulEvents,
      successRate: totalEvents > 0 ? round(successfulEvents / totalEvents, 4) : 0,
      avgDurationMs,
      byPackage,
      byMethod
    };
  }

  /**
   * Cleanup old events
   */
  cleanup() {
    const now = this.nowFn();
    const cutoff = now - this.retentionMs;
    
    // Clean up discovery events
    this._discoveryEvents = this._discoveryEvents.filter(e => e.timestamp >= cutoff);
    
    // Clean up cache events
    this._cacheEvents = this._cacheEvents.filter(e => e.timestamp >= cutoff);
    
    // Clean up transition events
    this._transitionEvents = this._transitionEvents.filter(e => e.timestamp >= cutoff);
    
    // Clean up PR events
    this._prEvents = this._prEvents.filter(e => e.timestamp >= cutoff);
    
    // Clean up other events
    this._compressionEvents = this._compressionEvents.filter(e => e.timestamp >= cutoff);
    this._context7Events = this._context7Events.filter(e => e.timestamp >= cutoff);
    this._policyDecisionEvents = this._policyDecisionEvents.filter(e => e.timestamp >= cutoff);
    this._parallelControlEvents = this._parallelControlEvents.filter(e => e.timestamp >= cutoff);
    this._packageExecutionEvents = this._packageExecutionEvents.filter(e => e.timestamp >= cutoff);
    
    // Clean up detected timestamps
    for (const [modelId, timestamp] of this._detectedTimestamps.entries()) {
      if (timestamp < cutoff) {
        this._detectedTimestamps.delete(modelId);
      }
    }

    this._scheduleHistoryMaintenance(now);
  }

  _scheduleHistoryMaintenance(now) {
    if (!this._historySnapshotEnabled) {
      return;
    }

    if (typeof this._historyFilePath !== 'string' || this._historyFilePath.length === 0) {
      return;
    }

    if ((now - this._lastHistoryRotationCheck) < this._historyRotationCheckIntervalMs) {
      return;
    }
    this._lastHistoryRotationCheck = now;

    this._historyMaintenanceInFlight = this._historyMaintenanceInFlight
      .then(() => this._maintainHistoryFile(now))
      .catch((error) => {
        console.error(`[PipelineMetricsCollector] History maintenance failed: ${error.message}`);
      });
  }

  async _maintainHistoryFile(now) {
    await this._rotateHistoryFileIfNeeded(now);
    await this._appendHistorySnapshot(now);
    await this._cleanupRotatedHistoryFiles(now);
  }

  async _rotateHistoryFileIfNeeded(now) {
    let stat;
    try {
      stat = await fs.promises.stat(this._historyFilePath);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    const shouldRotateBySize = this._historyLogRotation.maxBytes > 0 && stat.size >= this._historyLogRotation.maxBytes;
    const shouldRotateByTime = this._historyLogRotation.intervalMs > 0 && (now - stat.mtimeMs) >= this._historyLogRotation.intervalMs;
    if (!shouldRotateBySize && !shouldRotateByTime) {
      return;
    }

    const directory = path.dirname(this._historyFilePath);
    const basename = path.basename(this._historyFilePath);
    const timestamp = this._formatRotationTimestamp(now);

    let rotatedPath = null;
    for (let suffix = 0; suffix < 100; suffix++) {
      const candidate = path.join(
        directory,
        suffix === 0 ? `${basename}.${timestamp}` : `${basename}.${timestamp}.${suffix}`
      );
      try {
        await fs.promises.access(candidate);
      } catch (_err) {
        rotatedPath = candidate;
        break;
      }
    }

    if (!rotatedPath) {
      rotatedPath = path.join(directory, `${basename}.${timestamp}.${Date.now()}`);
    }

    try {
      await fs.promises.rename(this._historyFilePath, rotatedPath);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async _appendHistorySnapshot(now) {
    const entry = {
      timestamp: now,
      retentionMs: this.retentionMs,
      eventCounts: {
        discovery: this._discoveryEvents.length,
        cache: this._cacheEvents.length,
        transitions: this._transitionEvents.length,
        pr: this._prEvents.length,
        compression: this._compressionEvents.length,
        context7: this._context7Events.length,
        policyDecision: this._policyDecisionEvents.length,
        parallelControl: this._parallelControlEvents.length,
        packageExecution: this._packageExecutionEvents.length,
      },
      catalogUpdatedAt: this._lastCatalogUpdate,
    };

    await fs.promises.mkdir(path.dirname(this._historyFilePath), { recursive: true });
    await fs.promises.appendFile(
      this._historyFilePath,
      `${JSON.stringify(entry)}\n`,
      { encoding: 'utf8', flag: 'a' }
    );
  }

  async _cleanupRotatedHistoryFiles(now) {
    const directory = path.dirname(this._historyFilePath);
    const basename = path.basename(this._historyFilePath);
    const prefix = `${basename}.`;

    let entries;
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch (_err) {
      return;
    }

    const rotatedFiles = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith(prefix)) {
        continue;
      }
      const fullPath = path.join(directory, entry.name);
      try {
        const fileStat = await fs.promises.stat(fullPath);
        rotatedFiles.push({ fullPath, mtimeMs: fileStat.mtimeMs });
      } catch (_err) {
        // Ignore files that disappear during cleanup.
      }
    }

    rotatedFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (let index = 0; index < rotatedFiles.length; index++) {
      const file = rotatedFiles[index];
      const tooManyFiles = index >= this._historyLogRotation.maxArchivedFiles;
      const tooOld = this._historyLogRotation.maxArchiveAgeMs > 0
        && (now - file.mtimeMs) >= this._historyLogRotation.maxArchiveAgeMs;
      if (!tooManyFiles && !tooOld) {
        continue;
      }
      try {
        await fs.promises.unlink(file.fullPath);
      } catch (_err) {
        // Non-fatal cleanup failure.
      }
    }
  }

  _formatRotationTimestamp(timestamp) {
    const iso = new Date(timestamp).toISOString();
    return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }

  async _flushHistoryMaintenanceForTest() {
    await this._historyMaintenanceInFlight;
  }

  /**
   * Reset all metrics
   */
  reset() {
    this._discoveryEvents = [];
    this._cacheEvents = [];
    this._transitionEvents = [];
    this._prEvents = [];
    this._discoveryPredictionEvents = [];
    this._compressionEvents = [];
    this._context7Events = [];
    this._policyDecisionEvents = [];
    this._parallelControlEvents = [];
    this._packageExecutionEvents = [];
    this._detectedTimestamps.clear();
    this._lastCatalogUpdate = null;
    
    // Clear database tables if they exist
    if (this._db) {
      try {
        this._runWithPreparedStatement(SQL_DELETE_COMPRESSION_EVENTS);
        this._runWithPreparedStatement(SQL_DELETE_CONTEXT7_EVENTS);
      } catch (error) {
        console.error(`[PipelineMetricsCollector] Failed to clear database tables on reset: ${error.message}`);
      }
    }
  }

  /**
   * Start cleanup timer
   * @private
   */
  _startCleanup() {
    this._cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this._cleanupIntervalMs);
  }
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
