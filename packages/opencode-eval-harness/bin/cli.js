#!/usr/bin/env node
'use strict';

const { Harness } = require('../src/index');
const { toText, toJSON, toCSV } = require('../src/reporter');

const args = process.argv.slice(2);
const format = args.includes('--csv') ? 'csv' : args.includes('--json') ? 'json' : 'text';

async function main() {
  const harness = new Harness();

  // Demo run with mock adapters simulating two models
  const models = [
    {
      name: 'mock-gpt-4o',
      adapter: Harness.createMockAdapter({
        successProbability: 0.9,
        latencyMs: 200,
        avgTokens: 180,
      }),
    },
    {
      name: 'mock-claude-sonnet',
      adapter: Harness.createMockAdapter({
        successProbability: 0.85,
        latencyMs: 150,
        avgTokens: 160,
      }),
    },
    {
      name: 'mock-gpt-3.5',
      adapter: Harness.createMockAdapter({
        successProbability: 0.65,
        latencyMs: 80,
        avgTokens: 120,
      }),
    },
  ];

  console.log('Running benchmark with mock adapters...\n');
  const comparison = await harness.compareModels(models);

  switch (format) {
    case 'json':
      console.log(toJSON(comparison));
      break;
    case 'csv':
      console.log(toCSV(comparison));
      break;
    default:
      console.log(toText(comparison));
      break;
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err.message);
  process.exit(1);
});
