#!/usr/bin/env node

/**
 * smoke-pipeline.mjs — Fresh-machine smoke pipeline
 *
 * Runs end-to-end smoke tests for opencode-setup:
 * 1. setup      — bun install, link packages, copy config, generate artifacts
 * 2. verify     — validate binaries, symlinks, git hooks, config presence
 * 3. api-sanity — smoke test dashboard API endpoints
 *
 * Flags:
 *  --no-setup   Skip setup step
 *  --no-api     Skip api-sanity step
 *  --json       Emit final machine-readable summary JSON
 *
 * Exit codes:
 *  0 — all checks passed
 *  1 — one or more checks failed
 *  2 — pipeline aborted (environment/preflight issue)
 */

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();
const args = new Set(process.argv.slice(2));
const outputJson = args.has('--json');

const allSteps = [
  { name: 'setup', cmd: 'bun', args: ['run', 'setup'], critical: true, scriptPath: path.join(root, 'package.json') },
  { name: 'verify', cmd: 'node', args: ['scripts/verify-setup.mjs'], critical: true, scriptPath: path.join(root, 'scripts', 'verify-setup.mjs') },
  { name: 'api-sanity', cmd: 'node', args: ['scripts/api-sanity.mjs'], critical: true, scriptPath: path.join(root, 'scripts', 'api-sanity.mjs') },
];

const steps = allSteps.filter((step) => {
  if (step.name === 'setup' && args.has('--no-setup')) return false;
  if (step.name === 'api-sanity' && args.has('--no-api')) return false;
  return true;
});

function commandLocation(command) {
  const locator = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(locator, [command], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const first = (result.stdout || '').split(/\r?\n/).find((line) => line.trim());
  return first ? first.trim() : null;
}

function preflight() {
  const failures = [];
  const requiredCommands = [...new Set(steps.map((step) => step.cmd))];

  for (const command of requiredCommands) {
    if (!commandLocation(command)) {
      failures.push(`Missing required command on PATH: ${command}`);
    }
  }

  for (const step of steps) {
    if (step.scriptPath && !existsSync(step.scriptPath)) {
      failures.push(`Missing required file for step '${step.name}': ${step.scriptPath}`);
    }
  }

  return failures;
}

function runStep(step) {
  const startedAt = Date.now();
  console.log(`\n🔵 [${step.name}] Running...`);

  const result = spawnSync(step.cmd, step.args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  const durationMs = Date.now() - startedAt;
  const ok = result.status === 0;

  if (ok) {
    console.log(`✅ [${step.name}] passed (${durationMs}ms)`);
  } else {
    console.log(`❌ [${step.name}] failed (exit code: ${result.status}, ${durationMs}ms)`);
  }

  return {
    name: step.name,
    critical: step.critical,
    ok,
    exitCode: result.status,
    durationMs,
  };
}

function printSummary(summary) {
  console.log('\n📊 Pipeline summary:');
  console.log(`   Steps run: ${summary.total}`);
  console.log(`   Passed: ${summary.passed}`);
  console.log(`   Failed: ${summary.failed}`);
  console.log(`   Aborted: ${summary.aborted ? 'yes' : 'no'}`);
  console.log(`   Duration: ${summary.durationMs}ms`);

  if (outputJson) {
    console.log('\n' + JSON.stringify(summary, null, 2));
  }
}

function main() {
  console.log('🧪 opencode-setup smoke pipeline starting...');
  console.log(`📁 Root: ${root}`);
  console.log(`⚙️  Steps: ${steps.map((s) => s.name).join(', ') || '(none)'}`);

  const preflightFailures = preflight();
  if (preflightFailures.length > 0) {
    console.error('\n⚠️  Preflight failed:');
    for (const failure of preflightFailures) {
      console.error(`   - ${failure}`);
    }

    const summary = {
      status: 'aborted',
      aborted: true,
      total: steps.length,
      passed: 0,
      failed: preflightFailures.length,
      durationMs: 0,
      preflightFailures,
      results: [],
    };
    printSummary(summary);
    process.exit(2);
  }

  const startedAt = Date.now();
  const results = [];
  let aborted = false;

  for (const step of steps) {
    const result = runStep(step);
    results.push(result);

    if (!result.ok && step.critical) {
      aborted = true;
      break;
    }
  }

  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;
  const summary = {
    status: failed === 0 ? 'pass' : aborted ? 'aborted' : 'fail',
    aborted,
    total: results.length,
    passed,
    failed,
    durationMs: Date.now() - startedAt,
    preflightFailures: [],
    results,
  };

  printSummary(summary);

  if (aborted) process.exit(2);
  if (failed > 0) process.exit(1);

  console.log('\n✅ All smoke tests passed. Fresh-machine setup validated.');
  process.exit(0);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n💥 Pipeline error: ${message}`);
  process.exit(2);
}
