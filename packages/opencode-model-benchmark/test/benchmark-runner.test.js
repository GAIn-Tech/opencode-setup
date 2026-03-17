import { beforeEach, describe, expect, test } from 'bun:test';
import { BENCHMARKS, ModelBenchmarkRunner } from '../src/benchmark-runner.js';

describe('ModelBenchmarkRunner', () => {
  let runner;

  beforeEach(() => {
    runner = new ModelBenchmarkRunner();
  });

  test('constructor sets defaults', () => {
    expect(Array.isArray(runner.benchmarks)).toBe(true);
    expect(runner.benchmarks).toEqual(Object.keys(BENCHMARKS));
    expect(runner.results).toEqual([]);
    expect(runner.modelClient).toBeNull();
    expect(runner.evaluator).toBeNull();
  });

  test('loadProblems returns built-in problems when benchmark file is unavailable', async () => {
    const problems = await runner.loadProblems('humaneval');
    expect(problems.length).toBeGreaterThanOrEqual(3);
    expect(problems[0]).toHaveProperty('task_id');
    expect(problems[0]).toHaveProperty('prompt');
    expect(problems[0]).toHaveProperty('test');
    expect(problems[0]).toHaveProperty('entry_point');
    expect(problems[0].language).toBe('python');
  });

  test('calculateMetrics computes pass@k and resolve_rate', () => {
    const results = Array.from({ length: 10 }, (_, i) => ({ passed: i < 8 }));
    const metrics = runner.calculateMetrics(results, ['pass@1', 'pass@10', 'resolve_rate']);

    expect(metrics['pass@1']).toBeCloseTo(0.8);
    expect(metrics['pass@10']).toBe(1);
    expect(metrics.resolve_rate).toBeCloseTo(0.8);
  });

  test('calculatePassAtK uses estimator formula with known values', () => {
    const results = Array.from({ length: 10 }, (_, i) => ({ passed: i < 8 }));
    expect(runner.calculatePassAtK(results, 1)).toBeCloseTo(0.8);
    expect(runner.calculatePassAtK(results, 10)).toBe(1);
    expect(runner.calculatePassAtK(results, 0)).toBe(0);
  });

  test('runBenchmark returns structured results when sandbox and model client are unavailable', async () => {
    runner.getPythonSandbox = async () => null;
    const result = await runner.runBenchmark('demo-model', 'humaneval');

    expect(result.modelId).toBe('demo-model');
    expect(result.benchmark).toBe('humaneval');
    expect(Array.isArray(result.problems)).toBe(true);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.problems.every((problem) => problem.passed === false)).toBe(true);
    expect(result.summary).toHaveProperty('pass@1');
  });

  test('storeResults falls back to in-memory storage without database', async () => {
    const results = {
      modelId: 'm1',
      benchmark: 'humaneval',
      timestamp: new Date().toISOString(),
      summary: { 'pass@1': 0.2 },
      problems: [{ problemId: 'x', passed: false }]
    };

    await runner.storeResults(results);
    const history = await runner.getHistory('m1', 'humaneval');
    expect(history.length).toBe(1);
    expect(history[0].summary['pass@1']).toBe(0.2);
  });

  test('unknown benchmark throws', async () => {
    await expect(runner.runBenchmark('model-a', 'does-not-exist')).rejects.toThrow(
      'Unknown benchmark: does-not-exist'
    );
  });

  test('evaluateProblem calls model client and evaluator when provided', async () => {
    let clientCalled = false;
    let evaluatorCalled = false;
    const modelClient = {
      complete: async (payload) => {
        clientCalled = true;
        expect(payload.model).toBe('model-a');
        expect(payload.maxTokens).toBe(500);
        expect(payload.temperature).toBe(0.2);
        return { text: 'def reverse_words(text): return ""' };
      }
    };
    const evaluator = {
      evaluate: async (completion, testCode, language) => {
        evaluatorCalled = true;
        expect(typeof completion).toBe('string');
        expect(typeof testCode).toBe('string');
        expect(language).toBe('python');
        return true;
      }
    };

    const injected = new ModelBenchmarkRunner({ modelClient, evaluator });
    const result = await injected.evaluateProblem(
      'model-a',
      {
        task_id: 'mini-x',
        prompt: 'prompt',
        test: 'assert True',
        language: 'python',
        entry_point: 'x'
      },
      BENCHMARKS.humaneval
    );

    expect(clientCalled).toBe(true);
    expect(evaluatorCalled).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.completion.length).toBeGreaterThan(0);
  });
});
