import { test, expect } from 'bun:test';
import { ModelBenchmarkRunner } from '../src/benchmark-runner.js';

test('benchmark runner returns summary', async () => {
  const runner = new ModelBenchmarkRunner({ benchmarks: ['humaneval'] });
  const result = await runner.runBenchmark('test-model', 'humaneval');
  expect(result).toHaveProperty('summary');
});
