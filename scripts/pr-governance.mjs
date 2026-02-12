#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();
const POLICY_PATH = path.join(ROOT, 'opencode-config', 'learning-update-policy.json');

function parseArgs(argv) {
  const args = { base: null, head: 'HEAD', body: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--base') {
      args.base = argv[i + 1] ?? null;
      i += 1;
    } else if (token === '--head') {
      args.head = argv[i + 1] ?? 'HEAD';
      i += 1;
    } else if (token === '--body') {
      args.body = argv[i + 1] ?? '';
      i += 1;
    }
  }
  return args;
}

function normalizePath(input) {
  return input.replace(/\\/g, '/').replace(/^\.\//, '');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function diffFiles(base, head) {
  if (!base) {
    return [];
  }
  const out = execSync(`git diff --name-only ${base}...${head}`, { cwd: ROOT, encoding: 'utf8' }).trim();
  if (!out) {
    return [];
  }
  return out.split('\n').map((line) => normalizePath(line.trim())).filter(Boolean);
}

function main() {
  const args = parseArgs(process.argv);
  const policy = readJson(POLICY_PATH);
  const changed = diffFiles(args.base, args.head);

  if (changed.length === 0) {
    console.log('pr-governance: no changed files in range');
    return;
  }

  const governed = changed.filter((file) =>
    policy.governed_paths.some((prefix) => file.startsWith(normalizePath(prefix)))
  );

  if (governed.length === 0) {
    console.log('pr-governance: no governed changes');
    return;
  }

  const body = args.body || '';
  if (!/Learning-Update:\s+opencode-config\/learning-updates\/.+\.json/i.test(body)) {
    throw new Error(
      'pr-governance: PR body missing `Learning-Update: opencode-config/learning-updates/<file>.json`'
    );
  }

  if (changed.includes('opencode-config/deployment-state.json') && !/Deployment-State:\s+(set|promote|rollback):.+/i.test(body)) {
    throw new Error('pr-governance: deployment-state changed, PR body must include `Deployment-State: <action>:<details>`');
  }

  console.log('pr-governance: PASS');
  console.log(`- governed files: ${governed.length}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
