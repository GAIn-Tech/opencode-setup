# opencode-eval-harness

Evaluation harness and benchmarker for AI models. Measures success rate, latency (p50/p95/mean), and cost across a standardized test suite.

## Install

```bash
npm install opencode-eval-harness
# or globally
npm install -g opencode-eval-harness
```

## Quick Start

```js
const { Harness } = require('opencode-eval-harness');

const harness = new Harness();

// Your adapter wraps the model API
const adapter = async (prompt, opts) => {
  const res = await callYourModelAPI(prompt, opts);
  return {
    response: res.text,
    inputTokens: res.usage.input,
    outputTokens: res.usage.output,
  };
};

// Run benchmark
const result = await harness.runBenchmark('gpt-4o', adapter);
console.log(result.success_rate);   // 0.9
console.log(result.latency_p95_ms); // 342.5
console.log(result.cost_per_call_usd); // 0.00234
```

## Compare Models

```js
const comparison = await harness.compareModels([
  { name: 'gpt-4o',       adapter: gpt4oAdapter },
  { name: 'claude-sonnet', adapter: sonnetAdapter },
  { name: 'gpt-3.5',      adapter: gpt35Adapter },
]);

console.log(comparison.best_model); // "gpt-4o"
console.log(comparison.rankings);   // sorted by composite score
```

## Reporter

```js
const { toJSON, toCSV, toText } = require('opencode-eval-harness/src/reporter');

console.log(toJSON(comparison));  // formatted JSON
console.log(toCSV(comparison));   // CSV for Excel
console.log(toText(comparison));  // terminal table
```

## CLI (Demo)

```bash
opencode-eval         # text table
opencode-eval --json  # JSON output
opencode-eval --csv   # CSV output
```

## Test Suite

Built-in suite (`src/test-suite.json`) includes 10 tasks across categories:

| Category | Tasks | Tiers |
|----------|-------|-------|
| math | arithmetic-basic | 1 |
| concept-explanation | js-closure-explain, time-complexity | 1-2 |
| code-generation | string-reverse, json-parse, regex-email, sql-select | 1-3 |
| debugging | bug-detection | 2 |
| refactoring | refactor-extract | 2 |
| system-design | api-design | 3 |

Custom suites: pass `{ testSuite: yourArray }` to `runBenchmark()`.

## Adapter Contract

```ts
type Adapter = (prompt: string, opts: { model: string, max_tokens: number }) =>
  Promise<{ response: string, inputTokens: number, outputTokens: number }>;
```

## Mock Adapter (Testing)

```js
const mock = Harness.createMockAdapter({
  successProbability: 0.8,
  latencyMs: 100,
  avgTokens: 150,
});
const result = await harness.runBenchmark('test-model', mock);
```
