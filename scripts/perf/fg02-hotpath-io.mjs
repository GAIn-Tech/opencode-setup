#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LearningEngine } = require('../../packages/opencode-learning-engine/src/index.js');

async function main() {
  const learningDir = path.join(os.homedir(), '.opencode', 'learning');
  fs.mkdirSync(learningDir, { recursive: true });

  const iterations = 200;

  function runBatch(autoSave) {
    const engine = new LearningEngine({
      autoLoad: false,
      autoSave,
      saveDebounceMs: 50,
      requireValidProvenance: false,
    });
    const start = Date.now();
    for (let i = 0; i < iterations; i++) {
      engine.addAntiPattern({
        type: 'failed_debug',
        description: `fg02-${autoSave ? 'autosave' : 'baseline'}-${i}`,
        severity: 'low',
        context: { session_id: 'fg02' },
      });
    }
    return Date.now() - start;
  }

  const baselineElapsedMs = runBatch(false);
  const autosaveElapsedMs = runBatch(true);

  await sleep(250);

  const overheadRatio = baselineElapsedMs > 0 ? autosaveElapsedMs / baselineElapsedMs : 0;

  if (autosaveElapsedMs > baselineElapsedMs * 1.25 + 100) {
    throw new Error(
      `Hot-path autosave overhead too high: baseline=${baselineElapsedMs}ms autosave=${autosaveElapsedMs}ms ratio=${overheadRatio.toFixed(2)}`
    );
  }

  console.log(
    JSON.stringify(
      {
        status: 'pass',
        iterations,
        baseline_elapsed_ms: baselineElapsedMs,
        autosave_elapsed_ms: autosaveElapsedMs,
        overhead_ratio: Number(overheadRatio.toFixed(3)),
        threshold_ratio: 1.25,
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
