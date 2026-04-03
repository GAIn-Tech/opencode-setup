'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { evaluateMetaAwarenessEvent, DEFAULT_DOMAIN_WEIGHTS } = require('./meta-awareness-rules');
const { boundedDelta, clamp, detectAnomaly, selectiveReassessmentWeight } = require('./meta-awareness-stability');
const { initializeRollups, calculateConfidenceInterval, calculateComposite } = require('./meta-awareness-rollups');
const { safeJsonParse } = require('opencode-safe-io');

const OPENCODE_DIRNAME = '.opencode';

function resolveDataHome() {
  if (process.env.OPENCODE_DATA_HOME) return process.env.OPENCODE_DATA_HOME;
  if (process.env.XDG_DATA_HOME) return path.join(process.env.XDG_DATA_HOME, 'opencode');
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(homeDir, OPENCODE_DIRNAME);
}

class MetaAwarenessTracker {
  constructor(options = {}) {
    this.telemetryDir = options.telemetryDir || path.join(resolveDataHome(), 'telemetry');
    this.eventsPath = options.eventsPath || path.join(this.telemetryDir, 'orchestration-intel.jsonl');
    this.rollupsPath = options.rollupsPath || path.join(this.telemetryDir, 'orchestration-intel-rollups.json');

    this.maxUpdateDelta = options.maxUpdateDelta ?? 5;
    this.minSamplesForSignal = options.minSamplesForSignal ?? 5;
    this.signalMaxInfluence = options.signalMaxInfluence ?? 0.15;
    this.confidenceThreshold = options.confidenceThreshold ?? 0.85;
    this.anomalyZThreshold = options.anomalyZThreshold ?? 3;

    this._maxEventLines = options.maxEventLines ?? 50000;
    this._rotateKeepLines = options.rotateKeepLines ?? 40000;
    this._appendCount = 0;
    this._rotationCheckInterval = options.rotationCheckInterval ?? 1000;

    this._flushDebounceMs = options.flushDebounceMs ?? 500;
    this._rollupCache = null;   // in-memory rollup; null = not yet loaded
    this._flushTimer = null;

    // One-time sync setup (constructor cannot be async)
    if (!fs.existsSync(this.telemetryDir)) {
      fs.mkdirSync(this.telemetryDir, { recursive: true });
    }

    // Eagerly populate cache so subsequent _readRollups() always hits cache
    if (!fs.existsSync(this.rollupsPath)) {
      this._writeRollups(initializeRollups());
    } else {
      try {
        const parsed = safeJsonParse(fs.readFileSync(this.rollupsPath, 'utf8'), null, 'meta-awareness-rollups');
        this._rollupCache = (parsed && typeof parsed === 'object') ? parsed : initializeRollups();
      } catch {
        this._rollupCache = initializeRollups();
      }
    }
  }

  async trackEvent(event = {}, options = {}) {
    const normalized = {
      timestamp: event.timestamp || new Date().toISOString(),
      session_id: event.session_id || 'unknown',
      task_id: event.task_id || null,
      agent: event.agent || 'unknown',
      task_type: event.task_type || 'general',
      complexity: event.complexity || 'moderate',
      intent: event.intent || null,
      event_type: event.event_type || 'unknown',
      outcome: event.outcome || null,
      evidence_refs: Array.isArray(event.evidence_refs) ? event.evidence_refs : [],
      metadata: event.metadata || {},
    };

    try {
      await this._appendEvent(normalized);
    } catch (err) {
      console.warn(`[MetaAwarenessTracker] Event append failed (non-fatal): ${err.message}`);
    }

    const rollups = await this._readRollups();
    rollups.total_events += 1;
    const baselineTaskType = normalized.metadata.baseline_task_type || normalized.task_type;
    const baselineComplexity = normalized.metadata.baseline_complexity || normalized.complexity;
    const reassessmentWeight = selectiveReassessmentWeight({
      eventTaskType: normalized.task_type,
      baselineTaskType,
      eventComplexity: normalized.complexity,
      baselineComplexity,
    });

    const deltasByDomain = evaluateMetaAwarenessEvent(normalized, options.context || {});

    for (const [domain, entries] of Object.entries(deltasByDomain)) {
      const bucket = rollups.domains[domain] || {
        score_mean: 50,
        score_ci_low: 50,
        score_ci_high: 50,
        sample_count: 0,
        last_updated: null,
        history: [],
        latest_reasons: [],
      };

      for (const entry of entries) {
        const bounded = boundedDelta(entry.delta * reassessmentWeight, this.maxUpdateDelta);
        if (bounded !== entry.delta * reassessmentWeight) {
          rollups.stability.bounded_update_count += 1;
        }

        const nextScore = clamp((bucket.score_mean || 50) + bounded, 0, 100);
        const anomaly = detectAnomaly({
          value: nextScore,
          history: (bucket.history || []).map((h) => h.score),
          zThreshold: this.anomalyZThreshold,
        });

        if (anomaly.isAnomaly) {
          rollups.stability.anomaly_count += 1;
          rollups.stability.last_anomalies.push({
            timestamp: normalized.timestamp,
            domain,
            z_score: Number(anomaly.zScore.toFixed(2)),
            event_type: normalized.event_type,
          });
          if (rollups.stability.last_anomalies.length > 100) {
            rollups.stability.last_anomalies = rollups.stability.last_anomalies.slice(-100);
          }
        }

        bucket.history = bucket.history || [];
        bucket.history.push({
          timestamp: normalized.timestamp,
          score: nextScore,
          delta: bounded,
          reason: entry.reason,
          event_type: normalized.event_type,
        });
        if (bucket.history.length > 2000) {
          bucket.history = bucket.history.slice(-2000);
        }

        bucket.latest_reasons = [entry.reason, ...(bucket.latest_reasons || [])].slice(0, 5);
        bucket.last_updated = normalized.timestamp;
        const ci = calculateConfidenceInterval(bucket.history);
        bucket.score_mean = ci.score_mean;
        bucket.score_ci_low = ci.score_ci_low;
        bucket.score_ci_high = ci.score_ci_high;
        bucket.sample_count = ci.sample_count;
      }

      rollups.domains[domain] = bucket;
    }

    const composite = calculateComposite(rollups.domains, rollups.domain_weights || DEFAULT_DOMAIN_WEIGHTS);
    rollups.composite = {
      ...rollups.composite,
      ...composite,
      last_updated: normalized.timestamp,
    };

    rollups.timeline.points.push({
      timestamp: normalized.timestamp,
      composite_score: rollups.composite.score_mean,
      event_type: normalized.event_type,
      session_id: normalized.session_id,
    });
    if (rollups.timeline.points.length > 5000) {
      rollups.timeline.points = rollups.timeline.points.slice(-5000);
    }

    rollups.generated_at = new Date().toISOString();
    this._writeRollups(rollups);

    return {
      accepted: true,
      composite_score: rollups.composite.score_mean,
      domains_updated: Object.keys(deltasByDomain),
    };
  }

  async getOverview() {
    const rollups = await this._readRollups();
    const confidence = this._compositeConfidence(rollups.composite);
    const accepted = confidence >= this.confidenceThreshold && rollups.composite.sample_count >= this.minSamplesForSignal;

    if (accepted) {
      rollups.stability.confidence_accepted_count += 1;
    } else {
      rollups.stability.confidence_rejected_count += 1;
    }
    this._writeRollups(rollups);

    return {
      generated_at: rollups.generated_at,
      composite: rollups.composite,
      domains: rollups.domains,
      stability: rollups.stability,
      rl_signal: {
        accepted,
        confidence,
        max_influence: this.signalMaxInfluence,
        confidence_threshold: this.confidenceThreshold,
      },
    };
  }

  async getTimeline({ sinceDays = 30 } = {}) {
    const rollups = await this._readRollups();
    const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    return rollups.timeline.points.filter((point) => new Date(point.timestamp).getTime() >= cutoff);
  }

  async getCorrelation({ sinceDays = 30 } = {}) {
    const events = await this._readEvents({ sinceDays });
    const byModel = {};
    const bySkill = {};
    const byTool = {};
    const byOutcome = {};

    for (const event of events) {
      const m = String(event.metadata?.model || event.metadata?.model_id || 'unknown');
      const s = String(event.metadata?.skill || 'unknown');
      const t = String(event.metadata?.tool || 'unknown');
      const o = String(event.outcome || 'unknown');
      byModel[m] = (byModel[m] || 0) + 1;
      bySkill[s] = (bySkill[s] || 0) + 1;
      byTool[t] = (byTool[t] || 0) + 1;
      byOutcome[o] = (byOutcome[o] || 0) + 1;
    }

    return {
      generated_at: new Date().toISOString(),
      since_days: sinceDays,
      totals: {
        events: events.length,
        models: Object.keys(byModel).length,
        skills: Object.keys(bySkill).length,
        tools: Object.keys(byTool).length,
        outcomes: Object.keys(byOutcome).length,
      },
      distributions: {
        model: byModel,
        skill: bySkill,
        tool: byTool,
        outcome: byOutcome,
      },
    };
  }

  async getStability() {
    const rollups = await this._readRollups();
    const accepted = rollups.stability.confidence_accepted_count || 0;
    const rejected = rollups.stability.confidence_rejected_count || 0;
    const total = accepted + rejected;

    return {
      generated_at: rollups.generated_at,
      bounded_update_count: rollups.stability.bounded_update_count,
      anomaly_count: rollups.stability.anomaly_count,
      last_anomalies: rollups.stability.last_anomalies || [],
      confidence_gate: {
        accepted,
        rejected,
        acceptance_rate: total > 0 ? Number((accepted / total).toFixed(3)) : 0,
      },
    };
  }

  async getForensics({ sessionId, limit = 200 } = {}) {
    const events = (await this._readEvents({ sessionId })).slice(-Math.max(1, Math.min(limit, 2000)));
    return {
      generated_at: new Date().toISOString(),
      count: events.length,
      events,
    };
  }

  async _appendEvent(event) {
    await fs.promises.appendFile(this.eventsPath, `${JSON.stringify(event)}\n`, 'utf8');
    this._appendCount += 1;
    if (this._appendCount >= this._rotationCheckInterval) {
      this._appendCount = 0;
      await this._maybeRotateJSONL();
    }
  }

  async _maybeRotateJSONL() {
    try {
      const content = await fs.promises.readFile(this.eventsPath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      if (lines.length <= this._maxEventLines) return;
      const kept = lines.slice(-this._rotateKeepLines).join('\n') + '\n';
      const tmp = `${this.eventsPath}.tmp`;
      await fs.promises.writeFile(tmp, kept, 'utf8');
      await fs.promises.rename(tmp, this.eventsPath);
      console.log(`[MetaAwarenessTracker] Rotated JSONL: kept ${this._rotateKeepLines} of ${lines.length} lines`);
    } catch (err) {
      if (err.code === 'ENOENT') return;
      console.warn(`[MetaAwarenessTracker] JSONL rotation failed (non-fatal): ${err.message}`);
    }
  }

  async _readEvents({ sinceDays = 30, sessionId } = {}) {
    const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    let raw;
    try {
      raw = await fs.promises.readFile(this.eventsPath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const events = [];
    for (const line of lines) {
      const parsed = safeJsonParse(line);
      if (!parsed) continue;
      const ts = new Date(parsed.timestamp || 0).getTime();
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      if (sessionId && parsed.session_id !== sessionId) continue;
      events.push(parsed);
    }
    return events;
  }

  async _readRollups() {
    if (this._rollupCache !== null) return this._rollupCache;
    try {
      const raw = await fs.promises.readFile(this.rollupsPath, 'utf8');
      const parsed = JSON.parse(raw);
      this._rollupCache = (parsed && typeof parsed === 'object') ? parsed : initializeRollups();
    } catch {
      this._rollupCache = initializeRollups();
    }
    return this._rollupCache;
  }

  _writeRollups(rollups) {
    this._rollupCache = rollups;  // update cache immediately
    this._scheduleFlush();
  }

  _scheduleFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this._flushNow().catch((err) => {
        console.warn(`[MetaAwarenessTracker] Async flush error: ${err.message}`);
      });
    }, this._flushDebounceMs);
    if (this._flushTimer.unref) this._flushTimer.unref();
  }

  async _flushNow() {
    if (!this._rollupCache) return;
    try {
      const tmp = `${this.rollupsPath}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(this._rollupCache, null, 2), 'utf8');
      await fs.promises.rename(tmp, this.rollupsPath);
    } catch (err) {
      console.warn(`[MetaAwarenessTracker] Failed to flush rollups: ${err.message}`);
    }
  }

  /** Force immediate flush — call before process exit to ensure last events are persisted. */
  async flush() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    await this._flushNow();
  }

  _compositeConfidence(composite = {}) {
    const meanScore = Number(composite.score_mean || 0);
    const low = Number(composite.score_ci_low || 0);
    const high = Number(composite.score_ci_high || 0);
    const span = Math.abs(high - low);
    const confidence = clamp((meanScore / 100) * (1 - span / 100), 0, 1);
    return Number(confidence.toFixed(4));
  }
}

module.exports = {
  MetaAwarenessTracker,
};
