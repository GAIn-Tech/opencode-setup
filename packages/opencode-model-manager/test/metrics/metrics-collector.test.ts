// @ts-nocheck
const { afterEach, beforeEach, describe, expect, mock, test } = require('bun:test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { MetricsCollector } = require('../../src/metrics/metrics-collector');

const LATENCY_PROMPTS = [
  'latency prompt 1',
  'latency prompt 2',
  'latency prompt 3',
  'latency prompt 4',
  'latency prompt 5'
];

function createModel(overrides = {}) {
  return {
    id: 'gpt-5',
    provider: 'openai',
    displayName: 'GPT-5',
    contextTokens: 200000,
    outputTokens: 4096,
    pricing: {
      inputTokenPrice: 2,
      outputTokenPrice: 8,
      currency: 'USD'
    },
    typicalUsage: {
      inputTokens: 1200,
      outputTokens: 800
    },
    ...overrides
  };
}

describe('MetricsCollector', () => {
  let tempDir;
  let dbPath;
  let collector;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'metrics-collector-'));
    dbPath = path.join(tempDir, 'metrics.db');
  });

  afterEach(async () => {
    if (collector) {
      collector.close();
      collector = null;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('measureLatency computes percentiles with timing accuracy inside 10%', async () => {
    const model = createModel();
    let now = 0;
    const latencySamples = [100, 200, 150, 250, 300];
    let latencyIndex = 0;

    const executePrompt = mock(async () => {
      now += latencySamples[latencyIndex];
      latencyIndex += 1;
      return 'ok';
    });

    collector = new MetricsCollector({
      dbPath,
      executePrompt,
      nowMs: () => now,
      latencyPrompts: LATENCY_PROMPTS
    });

    const metrics = await collector.measureLatency(model, LATENCY_PROMPTS);
    const expectedAvg = 200;

    expect(Math.abs(metrics.avgMs - expectedAvg) / expectedAvg).toBeLessThanOrEqual(0.1);
    expect(metrics.p50).toBe(200);
    expect(metrics.p95).toBe(300);
    expect(metrics.p99).toBe(300);
    expect(metrics.samples).toBe(5);
    expect(executePrompt.mock.calls).toHaveLength(5);
  });

  test('calculateCost uses metadata pricing and supports multiple currencies', () => {
    collector = new MetricsCollector({ dbPath });

    const model = createModel({
      pricing: {
        input: 2.5,
        output: 10,
        currency: 'EUR'
      }
    });

    const cost = collector.calculateCost(model, {
      inputTokens: 1000,
      outputTokens: 500
    });

    expect(cost).toEqual({
      inputTokenPrice: 2.5,
      outputTokenPrice: 10,
      avgCostPerRequest: 0.0075,
      currency: 'EUR'
    });
  });

  test('measureRobustness calculates variance and consistency from repeated runs', async () => {
    const model = createModel();
    const outputs = [
      'Stable response text',
      'Stable response text',
      'Stable response text with one extra phrase'
    ];
    let index = 0;

    collector = new MetricsCollector({
      dbPath,
      executePrompt: mock(async () => {
        const output = outputs[index] || outputs[outputs.length - 1];
        index += 1;
        return output;
      })
    });

    const robustness = await collector.measureRobustness(model, ['robustness prompt']);

    expect(robustness.variance).toBeGreaterThan(0);
    expect(robustness.consistency).toBeGreaterThan(0);
    expect(robustness.consistency).toBeLessThan(1);
    expect(robustness.score).toBe(robustness.consistency);
  });

  test('collectMetrics stores full 4-pillar metrics with model metadata', async () => {
    const model = createModel();
    let now = 0;
    const latencySamples = [90, 110, 95, 100, 105];
    let latencyIndex = 0;

    const executePrompt = mock(async (_model, _prompt, context = {}) => {
      if (context.metricType === 'latency') {
        now += latencySamples[latencyIndex] || 100;
        latencyIndex += 1;
        return 'latency-response';
      }

      return 'consistent robustness output';
    });

    collector = new MetricsCollector({
      dbPath,
      executePrompt,
      nowMs: () => now,
      latencyPrompts: LATENCY_PROMPTS
    });

    const assessmentResults = {
      benchmarks: {
        humaneval: { score: 0.8 },
        mbpp: { score: 0.7 }
      },
      usage: {
        inputTokens: 1500,
        outputTokens: 750
      }
    };

    const metrics = await collector.collectMetrics(model, assessmentResults);
    const stored = await collector.getMetrics(model.id);

    expect(metrics.modelId).toBe(model.id);
    expect(metrics.accuracy.humaneval).toBe(0.8);
    expect(metrics.accuracy.mbpp).toBe(0.7);
    expect(metrics.accuracy.overall).toBe(0.75);
    expect(metrics.latency.samples).toBe(5);
    expect(metrics.cost.avgCostPerRequest).toBe(0.009);
    expect(metrics.robustness.variance).toBe(0);
    expect(metrics.robustness.consistency).toBe(1);
    expect(metrics.modelMetadata.provider).toBe('openai');
    expect(metrics.modelMetadata.pricing.inputTokenPrice).toBe(2);

    expect(stored).not.toBeNull();
    expect(stored.modelId).toBe(model.id);
    expect(stored.modelMetadata.provider).toBe('openai');
    expect(stored.cost.currency).toBe('USD');
  });

  test('handles zero latency and missing pricing edge cases', async () => {
    const modelWithoutPricing = createModel({
      id: 'no-pricing-model',
      pricing: undefined
    });

    collector = new MetricsCollector({
      dbPath,
      executePrompt: mock(async () => 'ok'),
      nowMs: () => 1000,
      latencyPrompts: LATENCY_PROMPTS
    });

    const latency = await collector.measureLatency(modelWithoutPricing, LATENCY_PROMPTS);
    const cost = collector.calculateCost(modelWithoutPricing, {
      inputTokens: 1000,
      outputTokens: 500
    });

    expect(latency.avgMs).toBe(0);
    expect(latency.p50).toBe(0);
    expect(latency.p95).toBe(0);
    expect(latency.p99).toBe(0);
    expect(latency.samples).toBe(5);

    expect(cost).toEqual({
      inputTokenPrice: 0,
      outputTokenPrice: 0,
      avgCostPerRequest: 0,
      currency: 'USD'
    });
  });

  test('storeMetrics and getMetrics round trip metrics payload', async () => {
    collector = new MetricsCollector({ dbPath });
    const payload = {
      modelId: 'manual-model',
      timestamp: 1_730_000_000_000,
      accuracy: { humaneval: 0.5, mbpp: 0.6, overall: 0.55 },
      latency: { avgMs: 200, p50: 180, p95: 260, p99: 300, samples: 5 },
      cost: { inputTokenPrice: 1, outputTokenPrice: 2, avgCostPerRequest: 0.003, currency: 'USD' },
      robustness: { score: 0.8, variance: 0.02, consistency: 0.8 },
      modelMetadata: { provider: 'openai' }
    };

    await collector.storeMetrics(payload.modelId, payload);
    const loaded = await collector.getMetrics(payload.modelId);

    expect(loaded).toEqual(payload);
    expect(await collector.getMetrics('missing-model')).toBeNull();
  });
});
