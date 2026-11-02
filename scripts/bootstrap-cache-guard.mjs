#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveRoot, userDataDir } from './resolve-root.mjs';

const root = resolveRoot();

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function main() {
  const offline = process.argv.includes('--offline') || String(process.env.OPENCODE_OFFLINE || '') === '1';
  const failures = [];
  const warnings = [];

  const lockPath = path.join(root, 'bun.lock');
  const modulesPath = path.join(root, 'node_modules');
  const dataHome = userDataDir();
  const distillCli = path.join(dataHome, 'mcp-cache', 'distill-mcp', '0.8.1', 'node_modules', 'distill-mcp', 'bin', 'cli.js');

  if (!existsSync(lockPath)) {
    failures.push('bun.lock missing. Bootstrap reproducibility cannot be guaranteed.');
  }

  const config = readJson(path.join(root, 'opencode-config', 'opencode.json'), {});
  const enabledLocal = Object.entries(config?.mcp || {})
    .filter(([, value]) => value?.enabled === true && value?.type === 'local')
    .map(([name]) => name);

  if (offline) {
    if (!existsSync(modulesPath)) {
      failures.push('Offline mode requires prewarmed node_modules. Run bun install once online.');
    }
    if (enabledLocal.includes('distill') && !existsSync(distillCli)) {
      failures.push(`Offline mode requires cached distill CLI: ${distillCli}`);
    }
  } else if (enabledLocal.includes('distill') && !existsSync(distillCli)) {
    warnings.push('Distill cache is cold; first run will download distill-mcp.');
  }

  console.log(`== Bootstrap Cache Guard${offline ? ' (offline)' : ''} ==`);
  for (const warning of warnings) {
    console.log(`  - WARNING: ${warning}`);
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.log(`  - FAIL: ${failure}`);
    }
    process.exit(1);
  }

  console.log('PASS: bootstrap cache guard satisfied.');
}

main();
