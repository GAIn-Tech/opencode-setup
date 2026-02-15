#!/usr/bin/env node

/**
 * smoke-pipeline.mjs — Fresh-machine smoke pipeline
 *
 * Runs end-to-end smoke tests for opencode-setup:
 * 1. setup          — bun install, link packages, copy config, generate artifacts
 * 2. verify         — validate binaries, symlinks, git hooks, config presence
 * 3. api-sanity     — smoke test dashboard API endpoints
 *
 * Exit codes:
 *  0 — all checks passed
 *  1 — one or more checks failed
 *  2 — pipeline aborted (environment issue)
 */

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { resolveRoot } from './resolve-root.mjs';

const steps = [
  { name: 'setup', cmd: 'bun', args: ['run', 'setup'], critical: true },
  { name: 'verify', cmd: 'node', args: ['scripts/verify-setup.mjs'], critical: true },
  { name: 'api-sanity', cmd: 'node', args: ['scripts/api-sanity.mjs'], critical: true },
];

function runStep(step) {
  console.log(`\n🔵 [${step.name}] Running...`);

  const result = spawnSync(step.cmd, step.args, {
    cwd: resolveRoot(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status === 0) {
    console.log(`✅ [${step.name}] passed`);
    return true;
  }

  console.log(`❌ [${step.name}] failed (exit code: ${result.status})`);
  return false;
}

function main() {
  console.log('🧪 opencode-setup smoke pipeline starting...');

  let passed = 0;
  let failed = 0;
  let aborted = false;

  for (const step of steps) {
    const ok = runStep(step);

    if (ok) {
      passed++;
    } else if (step.critical) {
      failed++;
      aborted = true;
      break;
    }
  }

  console.log(`\n📊 Pipeline summary:`);
  console.log(`   Passed: ${passed}/${steps.length}`);
  console.log(`   Failed: ${failed}/${steps.length}`);

  if (aborted) {
    console.log(`\n⚠️  Pipeline aborted due to critical failure.`);
    process.exit(2);
  }

  if (failed > 0) {
    console.log(`\n❌ Pipeline failed.`);
    process.exit(1);
  }

  console.log(`\n✅ All smoke tests passed. Fresh-machine setup validated.`);
  process.exit(0);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n💥 Pipeline error: ${message}`);
  process.exit(2);
}
