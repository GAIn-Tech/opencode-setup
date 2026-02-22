#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ModelRouter } = require('../../packages/opencode-model-router-x/src/index.js');

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg01-stats-'));
  const statsPath = path.join(tmpDir, 'stats.json');

  const router = new ModelRouter({
    statsPersistPath: statsPath,
    statsPersistIntervalMs: 25,
  });

  const modelId = Object.keys(router.models)[0];
  if (!modelId) {
    throw new Error('No models available for durability test');
  }

  const iterations = 100;
  for (let i = 0; i < iterations; i++) {
    router.recordResult(modelId, true, 10);
  }

  await sleep(250);
  router._flushStatsNow();

  if (!fs.existsSync(statsPath)) {
    throw new Error(`Stats file not created at ${statsPath}`);
  }

  const persisted = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
  const calls = persisted?.[modelId]?.calls ?? 0;
  const successes = persisted?.[modelId]?.successes ?? 0;

  if (calls !== iterations || successes !== iterations) {
    throw new Error(`Durability mismatch: expected ${iterations}, got calls=${calls}, successes=${successes}`);
  }

  console.log(
    JSON.stringify(
      {
        status: 'pass',
        modelId,
        iterations,
        calls,
        successes,
        statsPath,
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
