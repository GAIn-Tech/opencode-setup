'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { evaluateMetaAwarenessEvent, DEFAULT_DOMAIN_WEIGHTS } = require('./meta-awareness-rules');
const { boundedDelta, clamp, detectAnomaly, selectiveReassessmentWeight } = require('./meta-awareness-stability');
const { initializeRollups, calculateConfidenceInterval, calculateComposite } = require('./meta-awareness-rollups');

function safeJsonParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

class MetaAwarenessTracker {
  constructor(options = {}) {
    const home = os.homedir();
    this.telemetryDir = options.telemetryDir || path.join(home, '.opencode', 'telemetry');
    this.eventsPath = options.eventsPath || path.join(this.telemetryDir, 'orchestration-intel.jsonl');
    this.rollupsPath = options.rollupsPath || path.join(this.telemetryDir, 'orchestration-intel-rollups.json');

    this.maxUpdateDelta = options.maxUpdateDelta ?? 5;
    this.minSamplesForSignal = options.minSamplesForSignal ?? 5;
    this.signalMaxInfluence = options.signalMaxInfluence ?? 0.15;
    this.confidenceThreshold = options.confidenceThreshold ?? 0.85;
    this.anomalyZThreshold = options.anomalyZThreshold ?? 3;

    if (!fs.existsSync(this.telemetryDir)) {
      fs.mkdirSync(this.telemetryDir, { recursive: true });
    }

    if (!fs.existsSync(this.rollupsPath)) {
      this._writeRollups(initializeRollups());
    }
  }

  trackEvent(event = {}, options = {}) {
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

    this._appendEvent(normalized);

    const rollups = this._readRollups();
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

  getOverview() {
    const rollups = this._readRollups();
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

  getTimeline({ sinceDays = 30 } = {}) {
    const rollups = this._readRollups();
    const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    return rollups.timeline.points.filter((point) => new Date(point.timestamp).getTime() >= cutoff);
  }

  getCorrelation({ sinceDays = 30 } = {}) {
    const events = this._readEvents({ sinceDays });
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

  getStability() {
    const rollups = this._readRollups();
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

  getForensics({ sessionId, limit = 200 } = {}) {
    const events = this._readEvents({ sessionId }).slice(-Math.max(1, Math.min(limit, 2000)));
    return {
      generated_at: new Date().toISOString(),
      count: events.length,
      events,
    };
  }

  _appendEvent(event) {
    fs.appendFileSync(this.eventsPath, `${JSON.stringify(event)}\n`, 'utf8');
  }

  _readEvents({ sinceDays = 30, sessionId } = {}) {
    if (!fs.existsSync(this.eventsPath)) return [];

    const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    const lines = fs.readFileSync(this.eventsPath, 'utf8').split(/\r?\n/).filter(Boolean);
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

  _readRollups() {
    if (!fs.existsSync(this.rollupsPath)) {
      return initializeRollups();
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.rollupsPath, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : initializeRollups();
    } catch {
      return initializeRollups();
    }
  }

  _writeRollups(rollups) {
    const tmp = `${this.rollupsPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rollups, null, 2), 'utf8');
    fs.renameSync(tmp, this.rollupsPath);
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
