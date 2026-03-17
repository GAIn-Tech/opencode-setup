#!/usr/bin/env node

/**
 * CI Warning Budget Enforcement
 *
 * --capture: Run test suite, count warning occurrences, write baseline
 * --check:   Load baseline, run test suite, compare counts to max (default)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveRoot } from './resolve-root.mjs';

const ROOT = resolveRoot();
const BASELINE_PATH = join(ROOT, 'opencode-config', 'warning-baseline.json');

/** @type {Record<string, RegExp>} */
const CATEGORY_PATTERNS = {
  'integration-layer-degraded': /IntegrationLayer.*degraded/i,
  'orchestration-advisor-stub': /OrchestrationAdvisor.*stub/i,
  'dashboard-write-token': /write.*token.*(missing|invalid)/i,
  'skills-api-parse': /skills.*parse.*error|JSON.*parse.*skill/i,
  'skillrl-corrupted': /SkillRL.*corrupted|Rejected corrupted skill/i,
};

const DESCRIPTIONS = {
  'integration-layer-degraded': 'IntegrationLayer degraded mode warnings',
  'orchestration-advisor-stub': 'OrchestrationAdvisor operating in stub mode',
  'dashboard-write-token': 'Dashboard write token missing/invalid warnings',
  'skills-api-parse': 'Skills API JSON parse warnings',
  'skillrl-corrupted': 'SkillRL corrupted skill update rejections',
};

// ANSI colors
const C = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

/**
 * Count occurrences of each warning category in test output.
 * @param {string} output - Combined stdout+stderr from test run
 * @returns {Record<string, number>}
 */
function countWarnings(output) {
  const counts = {};
  for (const category of Object.keys(CATEGORY_PATTERNS)) {
    counts[category] = 0;
  }

  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    for (const [category, pattern] of Object.entries(CATEGORY_PATTERNS)) {
      if (pattern.test(line)) {
        counts[category]++;
      }
    }
  }

  return counts;
}

/**
 * Run `bun test` and return combined output.
 * Sets __CI_WARNING_BUDGET__ env to prevent recursion from test file.
 * @returns {string}
 */
function runTestSuite() {
  const result = spawnSync('bun', ['test'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, __CI_WARNING_BUDGET__: '1' },
    timeout: 300_000,
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      console.error(`${C.red}[warning-budget] bun not found on PATH${C.reset}`);
      process.exit(1);
    }
    throw result.error;
  }

  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

/**
 * Print colored report of warning counts vs budget.
 * @param {Record<string, number>} counts
 * @param {Record<string, {max: number, description: string}>} categories
 */
function printReport(counts, categories) {
  console.log(`\n${C.bold}Warning Budget Report${C.reset}`);
  console.log('\u2500'.repeat(60));

  for (const [category, count] of Object.entries(counts)) {
    const max = categories[category]?.max ?? 0;
    const ok = count <= max;
    const icon = ok ? `${C.green}\u2713${C.reset}` : `${C.red}\u2717${C.reset}`;
    const countStr = ok ? `${C.green}${count}${C.reset}` : `${C.red}${count}${C.reset}`;
    const desc = categories[category]?.description || '';
    console.log(`  ${icon} ${category}: ${countStr} / ${max} ${C.dim}${desc}${C.reset}`);
  }

  console.log('\u2500'.repeat(60));
}

/**
 * --capture mode: Run tests, count warnings, write baseline.
 */
function captureMode() {
  console.log(`${C.cyan}[warning-budget]${C.reset} Capturing warning baseline...`);
  const output = runTestSuite();
  const counts = countWarnings(output);

  const baseline = {
    version: '1.0.0',
    generated_at: new Date().toISOString(),
    categories: {},
  };

  for (const [category, count] of Object.entries(counts)) {
    baseline.categories[category] = {
      max: count,
      description: DESCRIPTIONS[category] || category,
    };
  }

  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');

  console.log(`${C.green}[warning-budget]${C.reset} Baseline written to opencode-config/warning-baseline.json`);
  printReport(counts, baseline.categories);
  console.log(`\n${C.green}${C.bold}CAPTURED${C.reset} Baseline updated successfully`);
}

/**
 * --check mode (default): Load baseline, run tests, compare counts.
 */
function checkMode() {
  if (!existsSync(BASELINE_PATH)) {
    console.error(`${C.red}[warning-budget] No baseline found at opencode-config/warning-baseline.json${C.reset}`);
    console.error('Run with --capture first');
    process.exit(1);
  }

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  if (!baseline.categories || typeof baseline.categories !== 'object') {
    console.error(`${C.red}[warning-budget] Invalid baseline: missing categories object${C.reset}`);
    process.exit(1);
  }

  console.log(`${C.cyan}[warning-budget]${C.reset} Checking warnings against baseline (v${baseline.version})...`);
  const output = runTestSuite();
  const counts = countWarnings(output);

  const exceeded = [];
  for (const [category, count] of Object.entries(counts)) {
    const max = baseline.categories[category]?.max ?? 0;
    if (count > max) {
      exceeded.push({ category, count, max });
    }
  }

  printReport(counts, baseline.categories);

  if (exceeded.length > 0) {
    console.error(`\n${C.red}${C.bold}FAIL${C.reset} Warning budget exceeded:`);
    for (const { category, count, max } of exceeded) {
      console.error(`  ${C.red}\u2717${C.reset} ${category}: ${count} > ${max}`);
    }
    process.exit(1);
  }

  console.log(`\n${C.green}${C.bold}PASS${C.reset} All warning categories within budget`);
}

// Main execution guard
const isDirectExecution = process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectExecution) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--capture')) {
      captureMode();
    } else {
      checkMode();
    }
  } catch (error) {
    console.error(`[warning-budget] Failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
