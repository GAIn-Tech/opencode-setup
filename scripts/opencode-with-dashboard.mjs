#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();
const launcherCli = path.join(root, 'packages', 'opencode-dashboard-launcher', 'src', 'cli.js');
const args = process.argv.slice(2);

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  return result.status ?? 1;
}

const launchStatus = run('node', [launcherCli, 'start']);
if (launchStatus !== 0) {
  process.exit(launchStatus);
}

const opencodeStatus = run('opencode', args, { cwd: process.cwd() });
process.exit(opencodeStatus);
