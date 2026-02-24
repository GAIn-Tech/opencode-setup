// @ts-nocheck
const { afterEach, beforeEach, describe, expect, mock, test } = require('bun:test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { ModelAssessor } = require('../../src/assessment/model-assessor');

function createBenchmarkResult(overrides = {}) {
  return {
    score: 0.8,
    passed: 8,
    total: 10,
    details: [],
    ...overrides
  };
}

describe('ModelAssessor', () => {
  let tempDir;
  let dbPath;
  let assessor;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'model-assessor-'));
    dbPath = path.join(tempDir, 'assessments.db');
  });

  afterEach(async () => {
    if (assessor) {
      assessor.close();
      assessor = null;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('runs benchmark subsets with fixed sizes using mocked execution', async () => {
    const executePrompt = mock(async () => 'def stub():\n    return 1');
    assessor = new ModelAssessor({ dbPath, executePrompt, promptTimeout: 100 });

    assessor._evaluatePythonProblem = mock(async () => ({
      passed: true,
      error: null,
      diagnostics: []
    }));

    const model = { id: 'gpt-5', provider: 'openai' };
    const humaneval = await assessor.runBenchmark(model, 'humaneval');
    const mbpp = await assessor.runBenchmark(model, 'mbpp');
    const latency = await assessor.runBenchmark(model, 'latency');

    expect(humaneval.total).toBe(10);
    expect(mbpp.total).toBe(10);
    expect(humaneval.passed).toBe(10);
    expect(mbpp.passed).toBe(10);
    expect(latency.samples).toHaveLength(5);
    expect(executePrompt.mock.calls).toHaveLength(25);
  });

  test('stores and retrieves assessment results in sqlite', async () => {
    assessor = new ModelAssessor({ dbPath, timeout: 60_000 });

    assessor.runBenchmark = mock(async (_model, benchmarkType) => {
      if (benchmarkType === 'latency') {
        return {
          avgMs: 900,
          p50: 870,
          p95: 1020,
          p99: 1100,
          samples: [870, 880, 890, 920, 940]
        };
      }

      return createBenchmarkResult();
    });

    const model = { id: 'claude-sonnet-4-5', provider: 'anthropic' };
    const result = await assessor.assess(model);
    const stored = await assessor.getResults(model.id);

    expect(result.modelId).toBe(model.id);
    expect(result.benchmarks.humaneval.total).toBe(10);
    expect(result.benchmarks.mbpp.total).toBe(10);
    expect(result.benchmarks.latency.avgMs).toBe(900);
    expect(stored).not.toBeNull();
    expect(stored.modelId).toBe(model.id);
    expect(stored.benchmarks.latency.p95).toBe(1020);
    expect(stored.zScore).toBe(result.zScore);
  });

  test('calculateScore follows z-score normalization logic', () => {
    assessor = new ModelAssessor({ dbPath });

    const benchmarks = {
      humaneval: { score: 0.85, passed: 9, total: 10 },
      mbpp: { score: 0.81, passed: 8, total: 10 },
      latency: { avgMs: 800, p50: 760, p95: 920, p99: 980 }
    };

    const expected = (
      ((0.85 - 0.70) / 0.15) +
      ((0.81 - 0.75) / 0.12) +
      ((1200 - 800) / 400)
    ) / 3;

    expect(assessor.calculateScore(benchmarks)).toBeCloseTo(expected, 6);
  });

  test('enforces assessment timeout below five-minute bound', async () => {
    assessor = new ModelAssessor({ dbPath, timeout: 20 });

    assessor.runBenchmark = mock(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return createBenchmarkResult();
    });

    const model = { id: 'timeout-model', provider: 'openai' };

    await expect(assessor.assess(model)).rejects.toMatchObject({
      code: 'ASSESSMENT_TIMEOUT'
    });
  });

  test('handles partial benchmark failures and still persists successful results', async () => {
    assessor = new ModelAssessor({ dbPath, timeout: 60_000 });

    assessor.runBenchmark = mock(async (_model, benchmarkType) => {
      if (benchmarkType === 'mbpp') {
        throw new Error('MBPP runner failed');
      }

      if (benchmarkType === 'latency') {
        return {
          avgMs: 1100,
          p50: 1000,
          p95: 1300,
          p99: 1400,
          samples: [900, 1000, 1100, 1200, 1300]
        };
      }

      return createBenchmarkResult({ score: 0.9, passed: 9 });
    });

    const model = { id: 'partial-failure-model', provider: 'openai' };
    const result = await assessor.assess(model);
    const stored = await assessor.getResults(model.id);

    expect(result.failures).toContain('mbpp');
    expect(result.benchmarks.mbpp.error).toContain('MBPP runner failed');
    expect(result.benchmarks.humaneval.score).toBe(0.9);
    expect(result.benchmarks.latency.avgMs).toBe(1100);
    expect(stored.failures).toContain('mbpp');
  });
});
