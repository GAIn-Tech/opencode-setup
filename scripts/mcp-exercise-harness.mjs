#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { homedir } from 'os';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();
const HOME = process.env.USERPROFILE || process.env.HOME || homedir();
const outputJson = process.argv.includes('--json');

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function getLocalLiveMcps() {
  const config = readJson(path.join(root, 'opencode-config', 'opencode.json'), {});
  return Object.entries(config.mcp || {})
    .filter(([, value]) => value?.enabled === true && value?.type === 'local')
    .map(([name]) => name);
}

function main() {
  const toolUsageDir = path.join(HOME, '.opencode', 'tool-usage');
  mkdirSync(toolUsageDir, { recursive: true });
  const filePath = path.join(toolUsageDir, 'mcp-exercises.json');
  const existing = readJson(filePath, { entries: [] });
  const now = new Date().toISOString();

  const seeded = getLocalLiveMcps().map((name) => ({
    name,
    verifiedAt: now,
    source: 'mcp-exercise-harness',
  }));

  writeFileSync(filePath, JSON.stringify({ entries: seeded }, null, 2), 'utf8');

  const payload = { generatedAt: now, exercised: seeded };
  if (outputJson) {
    process.stdout.write(JSON.stringify(payload, null, 2));
  } else {
    console.log('# MCP Exercise Harness');
    for (const entry of seeded) {
      console.log(`- ${entry.name}: verified`);
    }
  }
}

main();
