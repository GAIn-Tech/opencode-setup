// @ts-nocheck
'use strict';

const { describe, test, expect } = require('bun:test');
const { PipelineMetricsCollector } = require('../src/monitoring/metrics-collector');

describe('PipelineMetricsCollector predictive alerting', () => {
  test('emits discovery alert predictions for rising provider failure trend', () => {
    let now = 1_700_000_000_000;
    const collector = new PipelineMetricsCollector({
      nowFn: () => now,
      autoCleanup: false,
      enableDb: false,
      predictionMinSamples: 6,
      predictionWindowMs: 60 * 60 * 1000,
      predictionFailureRateThreshold: 0.7,
      predictionDeltaThreshold: 0.25,
    });

    const pattern = [true, true, true, false, false, false];
    for (const success of pattern) {
      collector.recordDiscovery('openai', success, { durationMs: 100 });
      now += 1000;
    }

    const predictionSummary = collector.getDiscoveryAlertPredictions();
    expect(predictionSummary.totalEvents).toBeGreaterThan(0);
    expect(predictionSummary.byProvider.openai).toBeDefined();
    expect(predictionSummary.byProvider.openai.secondHalfFailureRate).toBeGreaterThanOrEqual(0.7);

    const snapshot = collector.getSnapshot();
    expect(snapshot.predictions).toBeDefined();
    expect(snapshot.predictions.discoveryAlerts.byProvider.openai).toBeDefined();
  });

  test('does not emit prediction when failure trend is flat', () => {
    let now = 1_700_000_000_000;
    const collector = new PipelineMetricsCollector({
      nowFn: () => now,
      autoCleanup: false,
      enableDb: false,
      predictionMinSamples: 6,
      predictionWindowMs: 60 * 60 * 1000,
      predictionFailureRateThreshold: 0.7,
      predictionDeltaThreshold: 0.25,
    });

    const pattern = [true, false, true, false, true, false];
    for (const success of pattern) {
      collector.recordDiscovery('google', success, { durationMs: 100 });
      now += 1000;
    }

    const predictionSummary = collector.getDiscoveryAlertPredictions();
    expect(predictionSummary.totalEvents).toBe(0);
    expect(predictionSummary.byProvider.google).toBeUndefined();
  });
});
