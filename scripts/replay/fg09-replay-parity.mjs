#!/usr/bin/env node

import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ModelRouter } = require('../../packages/opencode-model-router-x/src/index.js');

function hashPath(pathRows) {
  return crypto.createHash('sha256').update(JSON.stringify(pathRows)).digest('hex');
}

async function runScenario(seed) {
  process.env.OPENCODE_REPLAY_SEED = seed;
  const router = new ModelRouter({
    tuning: { min_samples_for_tuning: 1 },
    latencySampleWindow: 50,
  });

  const paths = [];
  for (let i = 0; i < 30; i++) {
    const ctx = {
      task: { intent: i % 2 === 0 ? 'orchestration' : 'analysis' },
      taskType: i % 2 === 0 ? 'orchestration' : 'general',
      complexity: i % 3 === 0 ? 'high' : 'moderate',
    };
    const route = await router.routeAsync(ctx);
    paths.push({
      modelId: route.modelId,
      reason: route.reason,
      strategy: route.orchestration?.strategy || 'none',
    });
    router.recordResult(route.modelId, i % 5 !== 0, 600 + (i % 6) * 300);
  }
  return {
    hash: hashPath(paths),
    paths,
  };
}

async function main() {
  const runA = await runScenario('fg09-seed');
  const runB = await runScenario('fg09-seed');

  const matches = runA.paths.filter((row, idx) => {
    const other = runB.paths[idx];
    return other && other.modelId === row.modelId && other.strategy === row.strategy && other.reason === row.reason;
  }).length;
  const parity = Number((matches / runA.paths.length).toFixed(4));

  if (runA.hash !== runB.hash || parity < 0.99) {
    throw new Error(`Replay parity failed: hash_equal=${runA.hash === runB.hash}, parity=${parity}`);
  }

  console.log(
    JSON.stringify(
      {
        status: 'pass',
        path_hash: runA.hash,
        parity,
        samples: runA.paths.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
