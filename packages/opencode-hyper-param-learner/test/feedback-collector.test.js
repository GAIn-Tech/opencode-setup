'use strict';

const { describe, test, expect } = require('bun:test');

const {
  FeedbackCollector,
  SIGNAL_TYPES,
} = require('../src/feedback-collector');

describe('FeedbackCollector', () => {
  test('exposes the expected signal types', () => {
    expect(SIGNAL_TYPES.outcome_signal).toBe('outcome_signal');
    expect(SIGNAL_TYPES.precision_signal).toBe('precision_signal');
    expect(SIGNAL_TYPES.efficiency_signal).toBe('efficiency_signal');
    expect(SIGNAL_TYPES.stability_signal).toBe('stability_signal');

    expect(FeedbackCollector.SIGNAL_TYPES).toEqual(SIGNAL_TYPES);
  });

  test('aggregates outcome_signal into success rate', async () => {
    const collector = new FeedbackCollector({ now: () => 1234 });

    collector.recordOutcome({ success: true });
    collector.recordOutcome({ success: false });
    collector.recordOutcome({ outcome: 'success' });

    await collector.flush();

    const agg = collector.getAggregate(SIGNAL_TYPES.outcome_signal);
    expect(agg.total).toBe(3);
    expect(agg.success).toBe(2);
    expect(agg.failure).toBe(1);
    expect(agg.success_rate).toBeCloseTo(2 / 3, 8);
    expect(agg.last_at).toBe(1234);
  });

  test('aggregates precision_signal into confusion-matrix rates', async () => {
    const collector = new FeedbackCollector({ now: () => 999 });

    collector.recordPrecision({ true_positive: 8, false_positive: 2, true_negative: 10, false_negative: 0 });
    await collector.flush();

    const agg = collector.getAggregate(SIGNAL_TYPES.precision_signal);
    expect(agg.true_positive).toBe(8);
    expect(agg.false_positive).toBe(2);
    expect(agg.true_negative).toBe(10);
    expect(agg.false_negative).toBe(0);
    expect(agg.precision).toBeCloseTo(8 / 10, 8);
    expect(agg.recall).toBeCloseTo(8 / 8, 8);
    expect(agg.false_positive_rate).toBeCloseTo(2 / 12, 8);
    expect(agg.false_negative_rate).toBeCloseTo(0 / 8, 8);
    expect(agg.last_at).toBe(999);
  });

  test('aggregates efficiency_signal as ratios to baseline', async () => {
    const collector = new FeedbackCollector({ now: () => 55 });

    collector.recordEfficiency({
      cost: 2,
      baseline_cost: 1,
      latency_ms: 200,
      baseline_latency_ms: 100,
      tokens_used: 300,
      baseline_tokens_used: 200,
    });
    collector.recordEfficiency({
      cost_usd: 1,
      baseline_cost_usd: 1,
      time_taken_ms: 100,
      baseline_time_taken_ms: 100,
      tokens_used: 200,
      baseline_tokens_used: 200,
    });

    await collector.flush();

    const agg = collector.getAggregate(SIGNAL_TYPES.efficiency_signal);
    expect(agg.samples).toBe(2);
    expect(agg.avg_cost_ratio).toBeCloseTo((2 / 1 + 1 / 1) / 2, 8);
    expect(agg.avg_latency_ratio).toBeCloseTo((200 / 100 + 100 / 100) / 2, 8);
    expect(agg.avg_tokens_ratio).toBeCloseTo((300 / 200 + 200 / 200) / 2, 8);
    expect(agg.last_at).toBe(55);
  });

  test('aggregates stability_signal via variance over time (Welford)', async () => {
    const collector = new FeedbackCollector({ now: () => 8080 });
    collector.recordStability({ param_name: 'request_timeout_ms', value: 10 });
    collector.recordStability({ param_name: 'request_timeout_ms', value: 20 });
    collector.recordStability({ parameter: 'retry_max_attempts', value: 1 });
    collector.recordStability({ parameter: 'retry_max_attempts', value: 1 });

    await collector.flush();

    const agg = collector.getAggregate(SIGNAL_TYPES.stability_signal);
    expect(agg.parameters.request_timeout_ms.n).toBe(2);
    expect(agg.parameters.request_timeout_ms.mean).toBeCloseTo(15, 8);
    // sample variance for [10, 20] is 50
    expect(agg.parameters.request_timeout_ms.variance).toBeCloseTo(50, 8);

    expect(agg.parameters.retry_max_attempts.n).toBe(2);
    expect(agg.parameters.retry_max_attempts.variance).toBeCloseTo(0, 8);
    expect(agg.overall_variance_mean).toBeCloseTo((50 + 0) / 2, 8);
    expect(agg.last_at).toBe(8080);
  });

  test('hooks are async/non-blocking and fail-open on handler errors', async () => {
    const collector = new FeedbackCollector({ now: () => 1 });

    let recordedSync = false;
    let recordedLater = false;
    let hookError = null;

    collector.on('signalRecorded', () => {
      recordedLater = true;
    });
    collector.on('aggregateUpdated', () => {
      throw new Error('boom');
    });
    collector.on('hook:error', (payload) => {
      hookError = payload;
    });

    collector.recordOutcome({ success: true });
    // Should not have run hooks synchronously.
    recordedSync = recordedLater;
    expect(recordedSync).toBe(false);

    await collector.flush();
    expect(recordedLater).toBe(true);
    expect(hookError).toBeTruthy();
    expect(String(hookError.error)).toMatch(/boom/);
  });

  test('registerSource is fail-open and provides a source api', async () => {
    const collector = new FeedbackCollector({ now: () => 77 });

    let sourceError = null;
    collector.on('source:error', (payload) => {
      sourceError = payload;
    });

    collector.registerSource('bad-source', () => {
      throw new Error('attach failed');
    });

    let gotSourceMeta = null;
    collector.registerSource('good-source', (api) => {
      api.emitOutcome({ success: true });
      api.emitPrecision({ predicted_warning: true, actual_warning: true });
      api.emitEfficiency({ cost: 1, baseline_cost: 1 });
      api.emitStability({ param_name: 'x', value: 1 });
      api.emit(SIGNAL_TYPES.outcome_signal, { success: false }, { tag: 'from-source' });
      api.emitOutcome({ success: true }, { extra: 'meta' });
      gotSourceMeta = api.source;
    });

    await collector.flush();

    expect(gotSourceMeta).toBe('good-source');
    expect(sourceError).toBeTruthy();
    expect(String(sourceError.error)).toMatch(/attach failed/);

    const outcome = collector.getAggregate(SIGNAL_TYPES.outcome_signal);
    expect(outcome.total).toBe(3);
    expect(outcome.success).toBe(2);
    expect(outcome.failure).toBe(1);
  });

  test('unknown signal types do not throw (fail-open)', async () => {
    const collector = new FeedbackCollector();
    let hookError = null;
    collector.on('hook:error', (payload) => {
      hookError = payload;
    });

    collector.recordSignal('custom_signal', { foo: 'bar' });
    await collector.flush();

    expect(collector.getAggregate('custom_signal')).toBeNull();
    expect(hookError).toBeTruthy();
    expect(String(hookError.error)).toMatch(/Unknown signal type/);
  });
});
