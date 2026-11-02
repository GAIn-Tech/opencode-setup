'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_AUDIT_ROTATION_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_AUDIT_ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily
const DEFAULT_AUDIT_ROTATION_MAX_ARCHIVED_FILES = 7;
const DEFAULT_AUDIT_ROTATION_MAX_ARCHIVE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_AUDIT_ROTATION_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

function toOptionalNonNegativeInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.max(0, Math.floor(num));
}

/**
 * TelemetryQualityGate implements VISION-style fail-closed enforcement for telemetry data.
 * Ensures telemetry data meets quality standards before acceptance, with mandatory veto
 * mechanisms for poor quality data.
 */
class TelemetryQualityGate {
  constructor(options = {}) {
    // Quality thresholds (0-1)
    this.thresholds = Object.freeze({
      completeness: Math.max(0, Math.min(1, options.completenessThreshold || 0.8)),
      timeliness: Math.max(0, Math.min(1, options.timelinessThreshold || 0.9)),
      consistency: Math.max(0, Math.min(1, options.consistencyThreshold || 0.85)),
      validity: Math.max(0, Math.min(1, options.validityThreshold || 0.95)),
      overall: Math.max(0, Math.min(1, options.overallThreshold || 0.75)),
    });

    // Veto configuration
    this.vetoEnabled = options.vetoEnabled !== false;
    this.gracePeriodMs = Math.max(0, Number(options.gracePeriodMs) || 7 * 24 * 60 * 60 * 1000); // 7 days
    this.auditLogPath = options.auditLogPath || path.join(process.cwd(), 'telemetry-quality-audit.log');
    
    // Quality scoring history
    this._qualityScores = new Map(); // telemetryType -> {scores[], lastScore, lastTimestamp}
    this._maxScoreHistory = Math.max(1, Number(options.maxScoreHistory) || 100);
    
    // Veto decisions tracking
    this._vetoDecisions = new Map(); // telemetryType -> {rejectedCount, lastRejection, overrideUsed}
    
    // Now function for testing
    this.nowFn = typeof options.nowFn === 'function' ? options.nowFn : () => Date.now();

    // Async audit logging queue (non-blocking)
    this._pendingAuditLines = [];
    this._auditFlushScheduled = false;
    this._auditWriteInFlight = Promise.resolve();
    this._auditBatchSize = Math.max(1, Number(options.auditBatchSize) || 100);
    this._maxQueuedAuditLines = Math.max(this._auditBatchSize, Number(options.maxQueuedAuditLines) || 5000);

    const auditRotation = options.auditRotation && typeof options.auditRotation === 'object'
      ? options.auditRotation
      : {};
    this._auditRotation = Object.freeze({
      maxBytes: toOptionalNonNegativeInt(auditRotation.maxBytes, DEFAULT_AUDIT_ROTATION_MAX_BYTES),
      intervalMs: toOptionalNonNegativeInt(auditRotation.intervalMs, DEFAULT_AUDIT_ROTATION_INTERVAL_MS),
      maxArchivedFiles: Math.max(1, toOptionalNonNegativeInt(auditRotation.maxArchivedFiles, DEFAULT_AUDIT_ROTATION_MAX_ARCHIVED_FILES)),
      maxArchiveAgeMs: toOptionalNonNegativeInt(auditRotation.maxArchiveAgeMs, DEFAULT_AUDIT_ROTATION_MAX_ARCHIVE_AGE_MS),
    });
    this._auditRotationCheckIntervalMs = Math.max(
      1000,
      toOptionalNonNegativeInt(auditRotation.checkIntervalMs, DEFAULT_AUDIT_ROTATION_CHECK_INTERVAL_MS)
    );
    this._lastAuditRotationCheck = 0;
  }

  /**
   * Validate telemetry data with mandatory quality gates.
   * @param {string} telemetryType - Type of telemetry (e.g., 'discovery', 'cache', 'policy_decision')
   * @param {object} data - Telemetry data to validate
   * @param {object} context - Additional context (sessionId, timestamp, source)
   * @returns {{valid: boolean, score: number, components: object, veto: object|null}}
   */
  validate(telemetryType, data, context = {}) {
    if (!telemetryType || typeof telemetryType !== 'string') {
      throw new Error('Telemetry type is required');
    }

    // Calculate quality components
    const components = {
      completeness: this._calculateCompleteness(data, context),
      timeliness: this._calculateTimeliness(data, context),
      consistency: this._calculateConsistency(data, context),
      validity: this._calculateValidity(data, context),
    };

    // Calculate overall score (weighted average)
    const overallScore = this._calculateOverallScore(components);
    
    // Apply veto if quality is below threshold and veto is enabled
    let veto = null;
    if (this.vetoEnabled && overallScore < this.thresholds.overall) {
      veto = this._applyVeto(telemetryType, data, overallScore, components, context);
    }

    // Record quality score
    this._recordQualityScore(telemetryType, overallScore, components);

    // Audit log the validation
    this._auditValidation(telemetryType, data, overallScore, components, veto, context);

    return {
      valid: overallScore >= this.thresholds.overall && (veto === null || veto.override),
      score: overallScore,
      components,
      veto,
      recommendations: overallScore < this.thresholds.overall 
        ? this._generateRecommendations(components) 
        : []
    };
  }

  /**
   * Get quality statistics for a telemetry type.
   * @param {string} telemetryType
   * @param {number} windowMs
   * @returns {{avgScore: number, minScore: number, maxScore: number, count: number, vetoRate: number}}
   */
  getQualityStats(telemetryType, windowMs = 24 * 60 * 60 * 1000) {
    const history = this._qualityScores.get(telemetryType);
    if (!history) {
      return { avgScore: 0, minScore: 0, maxScore: 0, count: 0, vetoRate: 0 };
    }

    const cutoff = this.nowFn() - windowMs;
    const relevantScores = history.scores.filter(s => s.timestamp >= cutoff);
    
    if (relevantScores.length === 0) {
      return { avgScore: 0, minScore: 0, maxScore: 0, count: 0, vetoRate: 0 };
    }

    const scores = relevantScores.map(s => s.score);
    const vetoCount = relevantScores.filter(s => s.veto && !s.veto.override).length;
    
    return {
      avgScore: this._round(scores.reduce((a, b) => a + b, 0) / scores.length, 4),
      minScore: Math.min(...scores),
      maxScore: Math.max(...scores),
      count: scores.length,
      vetoRate: this._round(vetoCount / scores.length, 4),
    };
  }

  /**
   * Override a veto decision (with audit trail).
   * @param {string} telemetryType
   * @param {string} reason
   * @param {string} authorizedBy
   * @returns {boolean}
   */
  overrideVeto(telemetryType, reason, authorizedBy = 'system') {
    const vetoDecisions = this._vetoDecisions.get(telemetryType);
    if (!vetoDecisions || vetoDecisions.lastRejection === null) {
      return false;
    }

    const override = {
      telemetryType,
      timestamp: this.nowFn(),
      reason: String(reason || 'manual override'),
      authorizedBy,
      previousRejections: vetoDecisions.rejectedCount,
    };

    vetoDecisions.overrideUsed = true;
    vetoDecisions.lastRejection = null;

    this._auditOverride(override);
    return true;
  }

  /**
   * Reset quality tracking for a telemetry type.
   * @param {string} telemetryType
   */
  resetTracking(telemetryType) {
    this._qualityScores.delete(telemetryType);
    this._vetoDecisions.delete(telemetryType);
  }

  /**
   * Get all telemetry types with quality issues.
   * @returns {Array<{telemetryType: string, avgScore: number, vetoRate: number, lastVeto: number|null}>}
   */
  getQualityIssues() {
    const issues = [];
    for (const [telemetryType, history] of this._qualityScores.entries()) {
      const stats = this.getQualityStats(telemetryType);
      const vetoDecisions = this._vetoDecisions.get(telemetryType);
      
      if (stats.avgScore < this.thresholds.overall || stats.vetoRate > 0) {
        issues.push({
          telemetryType,
          avgScore: stats.avgScore,
          vetoRate: stats.vetoRate,
          lastVeto: vetoDecisions?.lastRejection || null,
          scoreHistory: history.scores.slice(-10).map(s => s.score),
        });
      }
    }
    return issues;
  }

  /**
   * Export quality configuration for monitoring.
   * @returns {object}
   */
  exportConfig() {
    return {
      thresholds: { ...this.thresholds },
      vetoEnabled: this.vetoEnabled,
      gracePeriodMs: this.gracePeriodMs,
      maxScoreHistory: this._maxScoreHistory,
      trackedTypes: Array.from(this._qualityScores.keys()),
      auditRotation: { ...this._auditRotation },
    };
  }

  // ─── Private Methods ────────────────────────────────────────

  _calculateCompleteness(data, context) {
    if (!data || typeof data !== 'object') {
      return 0;
    }

    let requiredFields = 0;
    let presentFields = 0;

    // Determine required fields based on telemetry type
    const required = this._getRequiredFields(context.telemetryType || 'generic');
    requiredFields = required.length;

    for (const field of required) {
      if (data[field] !== undefined && data[field] !== null) {
        presentFields++;
      }
    }

    return requiredFields > 0 ? presentFields / requiredFields : 1;
  }

  _calculateTimeliness(data, context) {
    const now = this.nowFn();
    const eventTime = context.timestamp || data.timestamp || now;
    const ageMs = Math.max(0, now - eventTime);
    
    // Score decays linearly from 1 to 0 over 24 hours
    const maxAgeMs = 24 * 60 * 60 * 1000;
    return Math.max(0, 1 - (ageMs / maxAgeMs));
  }

  _calculateConsistency(data, context) {
    const telemetryType = context.telemetryType || 'generic';
    const history = this._qualityScores.get(telemetryType);
    
    if (!history || history.scores.length < 2) {
      return 1; // No history, assume consistent
    }

    // Check if data structure matches previous patterns
    const lastData = history.lastData;
    if (!lastData) {
      return 1;
    }

    // Compare keys between current and last data
    const currentKeys = Object.keys(data).sort();
    const lastKeys = Object.keys(lastData).sort();
    
    const matchingKeys = currentKeys.filter(k => lastKeys.includes(k));
    const keyConsistency = matchingKeys.length / Math.max(currentKeys.length, lastKeys.length);
    
    return keyConsistency;
  }

  _calculateValidity(data, context) {
    let validFields = 0;
    let totalFields = 0;

    for (const [key, value] of Object.entries(data)) {
      totalFields++;
      
      // Basic type validation
      if (value === null || value === undefined) {
        continue; // Skip null/undefined values
      }
      
      // Field-specific validation
      switch (key) {
        case 'timestamp':
          if (typeof value === 'number' && value > 0 && value < Date.now() + 86400000) {
            validFields++;
          }
          break;
        case 'success':
          if (typeof value === 'boolean') {
            validFields++;
          }
          break;
        case 'durationMs':
        case 'latency':
        case 'tokens':
          if (typeof value === 'number' && value >= 0) {
            validFields++;
          }
          break;
        case 'error':
          if (typeof value === 'string' || value === null) {
            validFields++;
          }
          break;
        default:
          // For unknown fields, accept any non-null value
          validFields++;
      }
    }

    return totalFields > 0 ? validFields / totalFields : 1;
  }

  _calculateOverallScore(components) {
    const weights = {
      completeness: 0.3,
      timeliness: 0.2,
      consistency: 0.2,
      validity: 0.3,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [component, weight] of Object.entries(weights)) {
      const score = components[component];
      if (score !== undefined) {
        weightedSum += score * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? this._round(weightedSum / totalWeight, 4) : 0;
  }

  _applyVeto(telemetryType, data, score, components, context) {
    const now = this.nowFn();
    const vetoDecisions = this._vetoDecisions.get(telemetryType) || {
      rejectedCount: 0,
      lastRejection: null,
      overrideUsed: false,
    };

    // Check if in grace period
    const inGracePeriod = vetoDecisions.lastRejection 
      ? (now - vetoDecisions.lastRejection) < this.gracePeriodMs
      : false;

    const veto = {
      telemetryType,
      timestamp: now,
      score,
      components,
      reason: `Quality score ${score.toFixed(4)} below threshold ${this.thresholds.overall}`,
      gracePeriod: inGracePeriod,
      override: context.forceAccept === true || inGracePeriod,
    };

    if (!veto.override) {
      vetoDecisions.rejectedCount++;
      vetoDecisions.lastRejection = now;
    }

    this._vetoDecisions.set(telemetryType, vetoDecisions);
    return veto;
  }

  _generateRecommendations(components) {
    const recommendations = [];
    
    if (components.completeness < this.thresholds.completeness) {
      recommendations.push(`Increase data completeness (current: ${(components.completeness * 100).toFixed(1)}%, threshold: ${(this.thresholds.completeness * 100).toFixed(1)}%)`);
    }
    
    if (components.timeliness < this.thresholds.timeliness) {
      recommendations.push(`Improve data timeliness (current: ${(components.timeliness * 100).toFixed(1)}%, threshold: ${(this.thresholds.timeliness * 100).toFixed(1)}%)`);
    }
    
    if (components.consistency < this.thresholds.consistency) {
      recommendations.push(`Ensure data consistency (current: ${(components.consistency * 100).toFixed(1)}%, threshold: ${(this.thresholds.consistency * 100).toFixed(1)}%)`);
    }
    
    if (components.validity < this.thresholds.validity) {
      recommendations.push(`Validate data fields (current: ${(components.validity * 100).toFixed(1)}%, threshold: ${(this.thresholds.validity * 100).toFixed(1)}%)`);
    }
    
    return recommendations;
  }

  _recordQualityScore(telemetryType, score, components) {
    let history = this._qualityScores.get(telemetryType);
    if (!history) {
      history = {
        scores: [],
        lastScore: null,
        lastTimestamp: null,
        lastData: null,
      };
    }

    const record = {
      score,
      components,
      timestamp: this.nowFn(),
    };

    history.scores.push(record);
    history.lastScore = score;
    history.lastTimestamp = record.timestamp;
    history.lastData = components; // Store for consistency checking

    // Trim history
    while (history.scores.length > this._maxScoreHistory) {
      history.scores.shift();
    }

    this._qualityScores.set(telemetryType, history);
  }

  _auditValidation(telemetryType, data, score, components, veto, context) {
    try {
      const auditEntry = {
        timestamp: this.nowFn(),
        telemetryType,
        score,
        components,
        veto: veto ? {
          applied: true,
          override: veto.override,
          reason: veto.reason,
        } : { applied: false },
        context: {
          sessionId: context.sessionId || 'unknown',
          source: context.source || 'unknown',
        },
        dataSummary: this._summarizeData(data),
      };

      const logLine = JSON.stringify(auditEntry) + '\n';
      this._enqueueAuditLine(logLine);
    } catch (err) {
      // Non-fatal - audit logging failures shouldn't break validation
    }
  }

  _auditOverride(override) {
    try {
      const logLine = JSON.stringify({
        type: 'veto_override',
        timestamp: this.nowFn(),
        ...override,
      }) + '\n';
      this._enqueueAuditLine(logLine);
    } catch (err) {
      // Non-fatal
    }
  }

  _enqueueAuditLine(logLine) {
    if (typeof logLine !== 'string' || logLine.length === 0) {
      return;
    }

    this._pendingAuditLines.push(logLine);
    if (this._pendingAuditLines.length > this._maxQueuedAuditLines) {
      const overflow = this._pendingAuditLines.length - this._maxQueuedAuditLines;
      this._pendingAuditLines.splice(0, overflow);
    }

    this._scheduleAuditFlush();
  }

  _scheduleAuditFlush() {
    if (this._auditFlushScheduled) {
      return;
    }

    this._auditFlushScheduled = true;
    setImmediate(() => {
      this._auditFlushScheduled = false;
      this._auditWriteInFlight = this._auditWriteInFlight
        .then(() => this._flushQueuedAuditLines())
        .catch(() => {
          // Non-fatal - keep validation path resilient if queue flush fails
        });
    });
  }

  async _flushQueuedAuditLines() {
    await this._rotateAuditLogIfNeeded();

    while (this._pendingAuditLines.length > 0) {
      const batch = this._pendingAuditLines.splice(0, this._auditBatchSize);
      const payload = batch.join('');

      try {
        await fs.promises.appendFile(this.auditLogPath, payload, { encoding: 'utf8', flag: 'a' });
      } catch (err) {
        // Non-fatal - audit logging failures shouldn't break validation
      }
    }
  }

  async _rotateAuditLogIfNeeded() {
    const now = this.nowFn();
    if ((now - this._lastAuditRotationCheck) < this._auditRotationCheckIntervalMs) {
      return;
    }
    this._lastAuditRotationCheck = now;

    const filePath = this.auditLogPath;
    if (typeof filePath !== 'string' || filePath.length === 0) {
      return;
    }

    let stat;
    try {
      stat = await fs.promises.stat(filePath);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        return;
      }
      return;
    }

    const shouldRotateBySize = this._auditRotation.maxBytes > 0 && stat.size >= this._auditRotation.maxBytes;
    const shouldRotateByTime = this._auditRotation.intervalMs > 0 && (now - stat.mtimeMs) >= this._auditRotation.intervalMs;

    if (!shouldRotateBySize && !shouldRotateByTime) {
      await this._cleanupRotatedAuditLogs(now);
      return;
    }

    const directory = path.dirname(filePath);
    const basename = path.basename(filePath);
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
      await fs.promises.rename(filePath, rotatedPath);
    } catch (err) {
      if (!err || err.code !== 'ENOENT') {
        return;
      }
    }

    await this._cleanupRotatedAuditLogs(now);
  }

  async _cleanupRotatedAuditLogs(now) {
    const directory = path.dirname(this.auditLogPath);
    const basename = path.basename(this.auditLogPath);
    const prefix = `${basename}.`;

    let entries;
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch (_err) {
      return;
    }

    const rotated = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith(prefix)) {
        continue;
      }
      const fullPath = path.join(directory, entry.name);
      try {
        const stat = await fs.promises.stat(fullPath);
        rotated.push({ fullPath, mtimeMs: stat.mtimeMs });
      } catch (_err) {
        // Ignore files that disappear during cleanup.
      }
    }

    if (rotated.length === 0) {
      return;
    }

    rotated.sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (let index = 0; index < rotated.length; index++) {
      const file = rotated[index];
      const tooManyFiles = index >= this._auditRotation.maxArchivedFiles;
      const tooOld = this._auditRotation.maxArchiveAgeMs > 0 && (now - file.mtimeMs) >= this._auditRotation.maxArchiveAgeMs;
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

  async _flushAuditQueueForTest() {
    this._scheduleAuditFlush();

    while (this._auditFlushScheduled || this._pendingAuditLines.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await this._auditWriteInFlight;
      if (this._pendingAuditLines.length > 0) {
        this._scheduleAuditFlush();
      }
    }

    await this._auditWriteInFlight;
  }

  _getRequiredFields(telemetryType) {
    // Define required fields for different telemetry types
    const fieldRequirements = {
      discovery: ['provider', 'success', 'timestamp'],
      cache: ['tier', 'hit', 'timestamp'],
      policy_decision: ['sessionId', 'taskType', 'timestamp', 'score'],
      compression: ['sessionId', 'tokensBefore', 'tokensAfter', 'pipeline', 'timestamp'],
      context7: ['libraryName', 'resolved', 'snippetCount', 'timestamp'],
      generic: ['timestamp'],
    };

    return fieldRequirements[telemetryType] || fieldRequirements.generic;
  }

  _summarizeData(data) {
    if (!data || typeof data !== 'object') {
      return 'null';
    }

    // Create a summary without sensitive information
    const summary = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' && value.length > 100) {
        summary[key] = value.substring(0, 100) + '...';
      } else if (value && typeof value === 'object') {
        summary[key] = `Object(${Object.keys(value).length} keys)`;
      } else {
        summary[key] = value;
      }
    }

    return summary;
  }

  _round(value, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }
}

module.exports = {
  TelemetryQualityGate,
};
