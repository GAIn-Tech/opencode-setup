'use strict';

const { DOMAIN_KEYS, DEFAULT_DOMAIN_WEIGHTS } = require('./meta-awareness-rules');
const { mean, stdDev } = require('./meta-awareness-stability');

function getDefaultDomains() {
  return Object.values(DOMAIN_KEYS).reduce((acc, domain) => {
    acc[domain] = {
      score_mean: 50,
      score_ci_low: 50,
      score_ci_high: 50,
      sample_count: 0,
      last_updated: null,
      history: [],
      latest_reasons: [],
    };
    return acc;
  }, {});
}

function initializeRollups() {
  return {
    generated_at: new Date().toISOString(),
    total_events: 0,
    domain_weights: { ...DEFAULT_DOMAIN_WEIGHTS },
    domains: getDefaultDomains(),
    composite: {
      score_mean: 50,
      score_ci_low: 50,
      score_ci_high: 50,
      sample_count: 0,
      trend_7d: 0,
      trend_30d: 0,
      last_updated: null,
    },
    timeline: {
      points: [],
    },
    stability: {
      bounded_update_count: 0,
      anomaly_count: 0,
      confidence_rejected_count: 0,
      confidence_accepted_count: 0,
      last_anomalies: [],
    },
  };
}

function calculateConfidenceInterval(history) {
  const values = (history || []).map((entry) => entry.score).filter((score) => Number.isFinite(score));
  if (values.length === 0) {
    return { score_mean: 50, score_ci_low: 50, score_ci_high: 50, sample_count: 0 };
  }

  const m = mean(values);
  const sd = stdDev(values);
  const half = values.length > 1 ? 1.96 * (sd / Math.sqrt(values.length)) : 0;
  return {
    score_mean: Number(m.toFixed(2)),
    score_ci_low: Number(Math.max(0, m - half).toFixed(2)),
    score_ci_high: Number(Math.min(100, m + half).toFixed(2)),
    sample_count: values.length,
  };
}

function calculateComposite(domains, domainWeights = DEFAULT_DOMAIN_WEIGHTS) {
  const keys = Object.keys(domains || {});
  if (keys.length === 0) {
    return { score_mean: 50, score_ci_low: 50, score_ci_high: 50, sample_count: 0 };
  }

  let weightedSum = 0;
  let weightedLow = 0;
  let weightedHigh = 0;
  let weightTotal = 0;
  let sampleCount = 0;

  for (const key of keys) {
    const domain = domains[key];
    const w = Number(domainWeights[key] || 1);
    weightedSum += (domain.score_mean || 0) * w;
    weightedLow += (domain.score_ci_low || 0) * w;
    weightedHigh += (domain.score_ci_high || 0) * w;
    weightTotal += w;
    sampleCount += domain.sample_count || 0;
  }

  if (weightTotal <= 0) {
    return { score_mean: 50, score_ci_low: 50, score_ci_high: 50, sample_count: sampleCount };
  }

  return {
    score_mean: Number((weightedSum / weightTotal).toFixed(2)),
    score_ci_low: Number((weightedLow / weightTotal).toFixed(2)),
    score_ci_high: Number((weightedHigh / weightTotal).toFixed(2)),
    sample_count: sampleCount,
  };
}

module.exports = {
  calculateComposite,
  calculateConfidenceInterval,
  initializeRollups,
};
