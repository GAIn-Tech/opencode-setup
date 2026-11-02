#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { resolveRoot } from './resolve-root.mjs';

const ROOT = resolveRoot();
const POLICY_PATH = path.join(ROOT, 'opencode-config', 'docs-governance.json');

function parseArgs(argv) {
  const args = { staged: false, base: null };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--staged') {
      args.staged = true;
    } else if (token === '--base') {
      args.base = argv[i + 1] ?? null;
      i += 1;
    }
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizePath(input) {
  return input.replace(/\\/g, '/').replace(/^\.\//, '');
}

function getChangedFiles({ staged, base }) {
  if (!staged && !base) {
    const trackedOut = execSync('git diff --name-only', { cwd: ROOT, encoding: 'utf8' }).trim();
    const untrackedOut = execSync('git ls-files --others --exclude-standard', {
      cwd: ROOT,
      encoding: 'utf8'
    }).trim();
    const combined = [trackedOut, untrackedOut].filter(Boolean).join('\n');
    if (!combined) {
      return [];
    }
    return combined.split('\n').map((line) => line.trim()).filter(Boolean);
  }

  const cmd = staged
    ? 'git diff --cached --name-only'
    : `git diff --name-only ${base}...HEAD`;

  const output = execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
  if (!output) {
    return [];
  }
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function matchesAnyPrefix(filePath, prefixes = []) {
  const normalizedFile = normalizePath(filePath);
  return prefixes.some((prefix) => normalizedFile.startsWith(normalizePath(prefix)));
}

function pickImpactSample(files) {
  return files.slice(0, 4).join(', ');
}

function main() {
  const args = parseArgs(process.argv);
  const policy = readJson(POLICY_PATH);
  const changedFiles = getChangedFiles(args);

  if (changedFiles.length === 0) {
    console.log('docs-gate: no changed files, skipping');
    return;
  }

  const changedSet = new Set(changedFiles.map(normalizePath));
  const failures = [];

  for (const rule of policy.rules || []) {
    const governedPaths = rule.governed_paths || [];
    const excludedPaths = rule.exclude_paths || [];

    const impacted = changedFiles
      .map(normalizePath)
      .filter((file) => matchesAnyPrefix(file, governedPaths))
      .filter((file) => !matchesAnyPrefix(file, excludedPaths));

    if (impacted.length === 0) {
      continue;
    }

    const requiredDocs = (rule.require_any && rule.require_any.length > 0)
      ? rule.require_any
      : (policy.central_docs || []);

    const hasDocUpdate = requiredDocs
      .map(normalizePath)
      .some((docPath) => changedSet.has(docPath));

    if (!hasDocUpdate) {
      failures.push({
        id: rule.id,
        title: rule.title,
        requiredDocs,
        impacted
      });
    }
  }

  if (failures.length > 0) {
    const message = failures.map((failure) => {
      return [
        `- ${failure.id}: ${failure.title}`,
        `  impacted: ${pickImpactSample(failure.impacted)}`,
        `  update one of: ${failure.requiredDocs.join(', ')}`
      ].join('\n');
    }).join('\n');

    throw new Error([
      'docs-gate: documentation drift detected.',
      message,
      'Fix: update central docs to reflect these changes, then re-run governance checks.'
    ].join('\n'));
  }

  console.log('docs-gate: PASS');
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
