#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ModelRouter } = require('../../packages/opencode-model-router-x/src/index.js');

function main() {
  const router = new ModelRouter({
    tuning: {
      min_samples_for_tuning: 1,
      max_p95_latency_ms: 2200,
      max_p99_latency_ms: 3500,
      tail_latency_penalty_cap: 0.25,
    },
    latencySampleWindow: 100,
  });

  const modelId = Object.keys(router.models)[0];
  if (!modelId) throw new Error('No models available for FG-06 test');

  for (let i = 0; i < 80; i++) router.recordResult(modelId, true, 600);
  for (let i = 0; i < 18; i++) router.recordResult(modelId, true, 3000);
  router.recordResult(modelId, true, 9000);
  router.recordResult(modelId, true, 9000);

  const scoreObj = router._scoreModel(modelId, { taskType: 'general' });
  const reason = String(scoreObj.reason || '');
  if (!reason.includes('tail=p95:')) {
    throw new Error(`Expected tail latency reason annotation, got: ${reason}`);
  }

  const p95 = router._getLatencyPercentile(modelId, 95);
  const p99 = router._getLatencyPercentile(modelId, 99);
  if (p95 <= 2200 || p99 <= 3500) {
    throw new Error(`Expected p95/p99 to exceed SLO thresholds, got p95=${p95}, p99=${p99}`);
  }

  console.log(
    JSON.stringify(
      {
        status: 'pass',
        modelId,
        score: scoreObj.score,
        reason,
        p95_ms: p95,
        p99_ms: p99,
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
