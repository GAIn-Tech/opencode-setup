#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveRoot } from './resolve-root.mjs';

const BASELINE_RELATIVE_PATH = path.join('opencode-config', 'warning-baseline.json');
const WARNING_SIGNAL_PATTERN = /(?:^|\b)warning\b|\[warning\]|warning:|deprecated/i;

function parseArgs(argv) {
  const args = {
    updateBaseline: false,
    json: false
  };

  for (const arg of argv) {
    if (arg === '--update-baseline') {
      args.updateBaseline = true;
      continue;
    }
    if (arg === '--json') {
      args.json = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function ensureBunAvailable() {
  const probe = spawnSync('bun', ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (probe.error) {
    if (probe.error.code === 'ENOENT') {
      throw new Error('bun is not installed or not on PATH. Install Bun 1.3.x before running ci-warning-budget.');
    }
    throw probe.error;
  }

  if (probe.status !== 0) {
    const details = (probe.stderr || probe.stdout || '').trim();
    throw new Error(`Unable to run bun --version.${details ? ` Output: ${details}` : ''}`);
  }
}

function loadBaselineFile(baselinePath) {
  if (!existsSync(baselinePath)) {
    return null;
  }

  const raw = JSON.parse(readFileSync(baselinePath, 'utf8'));
  if (!Array.isArray(raw.categories)) {
    throw new Error(`Invalid baseline format: categories must be an array (${BASELINE_RELATIVE_PATH}).`);
  }

  return raw;
}

export function compileWarningCategories(categories) {
  return categories.map((category) => {
    if (!category?.id || !category?.pattern) {
      throw new Error(`Invalid category entry in ${BASELINE_RELATIVE_PATH}: missing id or pattern.`);
    }

    if (!Number.isFinite(category.maxCount) || category.maxCount < 0) {
      throw new Error(`Invalid category '${category.id}' in ${BASELINE_RELATIVE_PATH}: maxCount must be a non-negative number.`);
    }

    let regex;
    try {
      regex = new RegExp(category.pattern, 'i');
    } catch (error) {
      throw new Error(`Invalid regex in warning baseline category '${category.id}': ${error.message}`);
    }

    return {
      ...category,
      regex
    };
  });
}

function runBunTests(rootDir) {
  ensureBunAvailable();

  const result = spawnSync('bun', ['test'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024
  });

  if (result.error) {
    throw result.error;
  }

  return {
    exitCode: result.status ?? 1,
    output: `${result.stdout || ''}\n${result.stderr || ''}`
  };
}

export function analyzeWarningOutput(output, categories) {
  const categoryCounts = Object.fromEntries(categories.map((category) => [category.id, 0]));
  const unknownMap = new Map();
  const lines = String(output || '').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const matchedCategoryIds = [];
    for (const category of categories) {
      if (category.regex.test(line)) {
        matchedCategoryIds.push(category.id);
      }
    }

    if (matchedCategoryIds.length > 0) {
      for (const id of matchedCategoryIds) {
        categoryCounts[id] += 1;
      }
      continue;
    }

    if (!WARNING_SIGNAL_PATTERN.test(line)) {
      continue;
    }

    unknownMap.set(line, (unknownMap.get(line) || 0) + 1);
  }

  const unknownWarnings = Array.from(unknownMap.entries()).map(([line, count]) => ({ line, count }));
  return {
    categoryCounts,
    unknownWarnings,
    totalUnknownCount: unknownWarnings.reduce((sum, entry) => sum + entry.count, 0)
  };
}

export function evaluateWarningBudget(analysis, categories) {
  const exceeded = [];

  for (const category of categories) {
    const count = analysis.categoryCounts[category.id] || 0;
    if (count > category.maxCount) {
      exceeded.push({
        id: category.id,
        count,
        maxCount: category.maxCount,
        pattern: category.pattern
      });
    }
  }

  return {
    pass: exceeded.length === 0 && analysis.unknownWarnings.length === 0,
    exceeded,
    unknownWarnings: analysis.unknownWarnings
  };
}

function toJsonPayload(result, testRun, baselinePath, mode) {
  return {
    schema: 'ci-warning-budget-result',
    mode,
    baselinePath,
    pass: result.pass,
    testExitCode: testRun.exitCode,
    categoryCounts: result.categoryCounts,
    exceeded: result.exceeded,
    unknownWarnings: result.unknownWarnings
  };
}

function printVerifyResult(result, baselinePath) {
  console.log(`ci-warning-budget: baseline ${path.relative(process.cwd(), baselinePath).replace(/\\/g, '/')}`);

  for (const [id, count] of Object.entries(result.categoryCounts)) {
    const maxCount = result.categoryMax[id];
    console.log(`- ${id}: ${count}/${maxCount}`);
  }

  if (result.exceeded.length > 0) {
    console.error('\nExceeded warning categories:');
    for (const entry of result.exceeded) {
      console.error(`- ${entry.id}: ${entry.count} > ${entry.maxCount} (pattern: ${entry.pattern})`);
    }
  }

  if (result.unknownWarnings.length > 0) {
    console.error('\nUnknown warning lines detected:');
    for (const entry of result.unknownWarnings) {
      console.error(`- (${entry.count}x) ${entry.line}`);
    }
  }
}

function defaultBaselineDocument() {
  return {
    $schema: 'warning-baseline',
    version: 1,
    description:
      'Baseline of known, intentional warnings in test/build output. Update via: node scripts/ci-warning-budget.mjs --update-baseline',
    categories: []
  };
}

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildUpdatedBaseline(existingBaseline, analysis) {
  const baseline = existingBaseline ? structuredClone(existingBaseline) : defaultBaselineDocument();
  if (!Array.isArray(baseline.categories)) baseline.categories = [];

  for (const category of baseline.categories) {
    const observed = analysis.categoryCounts[category.id] || 0;
    category.maxCount = observed;
  }

  if (analysis.unknownWarnings.length > 0) {
    let seed = 1;
    for (const warning of analysis.unknownWarnings) {
      const id = `auto-warning-${seed}`;
      seed += 1;
      baseline.categories.push({
        id,
        pattern: escapeForRegex(warning.line),
        maxCount: warning.count,
        intentional: false,
        reason: 'Auto-captured by --update-baseline from current test output'
      });
    }
  }

  return baseline;
}

function writeBaseline(baselinePath, baseline) {
  mkdirSync(path.dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[ci-warning-budget] ${error.message}`);
    process.exit(1);
  }

  const rootDir = resolveRoot();
  const baselinePath = path.join(rootDir, BASELINE_RELATIVE_PATH);
  const baseline = loadBaselineFile(baselinePath);

  if (!baseline && !args.updateBaseline) {
    console.error(
      `[ci-warning-budget] Missing baseline file ${BASELINE_RELATIVE_PATH}. Run: node scripts/ci-warning-budget.mjs --update-baseline`
    );
    process.exit(1);
  }

  const testRun = runBunTests(rootDir);
  if (testRun.exitCode !== 0) {
    console.error(`[ci-warning-budget] bun test failed with exit code ${testRun.exitCode}.`);
    process.exit(1);
  }

  const compiledCategories = compileWarningCategories((baseline?.categories || []));
  const analysis = analyzeWarningOutput(testRun.output, compiledCategories);

  if (args.updateBaseline) {
    const updated = buildUpdatedBaseline(baseline, analysis);
    writeBaseline(baselinePath, updated);

    const updatedCompiled = compileWarningCategories(updated.categories);
    const updatedAnalysis = analyzeWarningOutput(testRun.output, updatedCompiled);
    const verdict = evaluateWarningBudget(updatedAnalysis, updatedCompiled);
    const result = {
      ...verdict,
      categoryCounts: updatedAnalysis.categoryCounts,
      categoryMax: Object.fromEntries(updatedCompiled.map((category) => [category.id, category.maxCount]))
    };

    if (args.json) {
      console.log(JSON.stringify(toJsonPayload(result, testRun, baselinePath, 'update-baseline'), null, 2));
    } else {
      console.log(`[ci-warning-budget] Updated ${BASELINE_RELATIVE_PATH} from current test output.`);
      printVerifyResult(result, baselinePath);
      console.log('ci-warning-budget: PASS');
    }

    process.exit(0);
  }

  const verdict = evaluateWarningBudget(analysis, compiledCategories);
  const result = {
    ...verdict,
    categoryCounts: analysis.categoryCounts,
    categoryMax: Object.fromEntries(compiledCategories.map((category) => [category.id, category.maxCount]))
  };

  if (args.json) {
    console.log(JSON.stringify(toJsonPayload(result, testRun, baselinePath, 'verify'), null, 2));
  } else {
    printVerifyResult(result, baselinePath);
    console.log(`ci-warning-budget: ${result.pass ? 'PASS' : 'FAIL'}`);
  }

  process.exit(result.pass ? 0 : 1);
}

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  try {
    main();
  } catch (error) {
    console.error(`[ci-warning-budget] Failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
