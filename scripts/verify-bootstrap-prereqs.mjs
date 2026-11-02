#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveRoot } from './resolve-root.mjs';

const ENV_BASELINE = Object.freeze({
  LC_ALL: 'C',
  TZ: 'UTC',
});

const TOOLCHAIN_CONTRACT = Object.freeze({
  bun: Object.freeze({ kind: 'exact' }),
  node: Object.freeze({ kind: 'min-major', minimumMajor: 18 }),
  git: Object.freeze({ kind: 'min-major', minimumMajor: 2 }),
});

const REPO_ROOT = resolveRoot();
const IS_WINDOWS = process.platform === 'win32';

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readRequiredBunVersion(rootDir = REPO_ROOT) {
  const bunVersionPath = path.join(rootDir, '.bun-version');
  if (existsSync(bunVersionPath)) {
    const value = readFileSync(bunVersionPath, 'utf8').trim();
    if (value) return value;
  }

  const packageJsonPath = path.join(rootDir, 'package.json');
  if (existsSync(packageJsonPath)) {
    const packageJson = readJson(packageJsonPath);
    if (typeof packageJson.packageManager === 'string' && packageJson.packageManager.startsWith('bun@')) {
      const value = packageJson.packageManager.slice('bun@'.length).trim();
      if (value) return value;
    }
  }

  return '';
}

function defaultCommandLocator(command) {
  const locator = IS_WINDOWS ? 'where' : 'which';
  const result = spawnSync(locator, [command], { encoding: 'utf8', timeout: 5000 });
  if (result.error || result.status !== 0) return null;
  const firstLine = String(result.stdout || '').split(/\r?\n/).find((line) => line.trim());
  return firstLine ? firstLine.trim() : null;
}

function defaultCommandVersionReader(command) {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8', timeout: 5000 });
  if (result.error || result.status !== 0) return '';
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  return output.trim();
}

function parseSemverLike(rawVersion) {
  const normalized = String(rawVersion || '').trim();
  const match = normalized.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3] || '0', 10),
    normalized: `${match[1]}.${match[2]}.${match[3] || '0'}`,
  };
}

function extractVersionForCommand(command, rawVersionOutput) {
  const parsed = parseSemverLike(rawVersionOutput);
  if (!parsed) return '';

  if (command === 'bun') {
    return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  }

  if (command === 'node') {
    return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  }

  if (command === 'git') {
    return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  }

  return parsed.normalized;
}

function compareSemver(a, b) {
  const pa = parseSemverLike(a);
  const pb = parseSemverLike(b);
  if (!pa || !pb) return null;
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  return 0;
}

function createReport() {
  return {
    ok: true,
    prereqs: [],
    missing: [],
    invalid: [],
    reasons: [],
  };
}

function pushMissing(report, name, reason) {
  if (!report.missing.includes(name)) report.missing.push(name);
  report.reasons.push(reason);
}

function pushInvalid(report, name, reason) {
  if (!report.invalid.includes(name)) report.invalid.push(name);
  report.reasons.push(reason);
}

export function evaluateBootstrapPrereqs({
  strict = false,
  rootDir = REPO_ROOT,
  env = process.env,
  commandLocator = defaultCommandLocator,
  commandVersionReader = defaultCommandVersionReader,
} = {}) {
  const report = createReport();
  const requiredBunVersion = readRequiredBunVersion(rootDir);

  if (!requiredBunVersion) {
    pushInvalid(report, 'bun', 'bun version source-of-truth is missing (.bun-version or packageManager bun@...)');
  }

  for (const [command, contract] of Object.entries(TOOLCHAIN_CONTRACT)) {
    const location = commandLocator(command);
    const prereq = {
      name: command,
      type: 'toolchain',
      required: null,
      detected: null,
      status: 'ok',
      ok: true,
    };

    if (!location) {
      prereq.status = 'missing';
      prereq.ok = false;
      prereq.required = command === 'bun' ? requiredBunVersion || 'defined by .bun-version' : contract;
      prereq.detected = 'missing';
      report.prereqs.push(prereq);
      pushMissing(report, command, `missing required prerequisite: ${command}`);
      continue;
    }

    const rawVersion = commandVersionReader(command);
    const detectedVersion = extractVersionForCommand(command, rawVersion);
    prereq.detected = detectedVersion || 'unknown';

    if (!detectedVersion) {
      prereq.status = 'invalid';
      prereq.ok = false;
      report.prereqs.push(prereq);
      pushInvalid(report, command, `unable to parse ${command} version from output`);
      continue;
    }

    if (command === 'bun') {
      prereq.required = requiredBunVersion || '.bun-version';
      if (requiredBunVersion && detectedVersion !== requiredBunVersion) {
        prereq.status = 'invalid';
        prereq.ok = false;
        report.prereqs.push(prereq);
        pushInvalid(report, 'bun', `bun version mismatch: required ${requiredBunVersion}, detected ${detectedVersion}`);
        continue;
      }
    }

    if (contract.kind === 'min-major') {
      prereq.required = `>=${contract.minimumMajor}.0.0`;
      const parsed = parseSemverLike(detectedVersion);
      if (!parsed || parsed.major < contract.minimumMajor) {
        prereq.status = 'invalid';
        prereq.ok = false;
        report.prereqs.push(prereq);
        pushInvalid(
          report,
          command,
          `${command} version must be >=${contract.minimumMajor}.0.0 (detected ${detectedVersion})`,
        );
        continue;
      }
    }

    report.prereqs.push(prereq);
  }

  const lcAll = String(env.LC_ALL || '').trim();
  const tz = String(env.TZ || '').trim();
  const lang = String(env.LANG || '').trim();

  const envEntries = [
    {
      name: 'LC_ALL',
      expected: ENV_BASELINE.LC_ALL,
      actual: lcAll,
      valid: lcAll === ENV_BASELINE.LC_ALL,
      reason: `LC_ALL must be ${ENV_BASELINE.LC_ALL} in strict mode`,
    },
    {
      name: 'TZ',
      expected: ENV_BASELINE.TZ,
      actual: tz,
      valid: tz === ENV_BASELINE.TZ,
      reason: `TZ must be ${ENV_BASELINE.TZ} in strict mode`,
    },
    {
      name: 'LANG',
      expected: 'set',
      actual: lang,
      valid: Boolean(lang),
      reason: 'LANG must be set in strict mode',
    },
  ];

  for (const entry of envEntries) {
    const prereq = {
      name: entry.name,
      type: 'environment',
      required: entry.expected,
      detected: entry.actual || 'unset',
      status: entry.valid ? 'ok' : 'invalid',
      ok: entry.valid,
    };

    report.prereqs.push(prereq);

    if (strict && !entry.valid) {
      pushInvalid(report, entry.name, entry.reason);
    }
  }

  report.ok = report.missing.length === 0 && report.invalid.length === 0;
  return report;
}

function printHumanReport(report, { strict = false } = {}) {
  console.log(`== Bootstrap Prerequisites${strict ? ' (strict)' : ''} ==`);
  for (const prereq of report.prereqs) {
    const marker = prereq.ok ? 'PASS' : 'FAIL';
    console.log(`[${marker}] ${prereq.name}: required=${prereq.required ?? 'n/a'} detected=${prereq.detected ?? 'n/a'}`);
  }

  if (report.reasons.length > 0) {
    console.log('\nReasons:');
    for (const reason of report.reasons) {
      console.log(`- ${reason}`);
    }
  }
}

function main() {
  const strict = process.argv.includes('--strict');
  const json = process.argv.includes('--json');
  const report = evaluateBootstrapPrereqs({ strict });

  if (strict || json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report, { strict });
  }

  if (!report.ok) {
    process.exit(1);
  }
}

const thisFilePath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(thisFilePath);
if (isDirectRun) {
  main();
}

export { readRequiredBunVersion, compareSemver, parseSemverLike, extractVersionForCommand };
