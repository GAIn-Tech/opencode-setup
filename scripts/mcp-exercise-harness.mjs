#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();
const HOME = process.env.USERPROFILE || process.env.HOME || homedir();
const outputJson = process.argv.includes('--json');
const require = createRequire(import.meta.url);

function resolveExecutable(name) {
  if (process.platform === 'win32') {
    if (name === 'node') return process.execPath;
    if (name === 'npm' || name === 'npx') {
      return path.join(path.dirname(process.execPath), `${name}.cmd`);
    }
    return `${name}.exe`;
  }
  return name;
}

function requiresShell(command) {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
}

function quoteCmdArg(value) {
  return `"${String(value ?? '').replaceAll('"', '\\"')}"`;
}

function runProbe(command, args) {
  const executable = resolveExecutable(command);
  const probeHome = process.env.OPENCODE_MCP_PROBE_HOME;
  const env = probeHome
    ? { ...process.env, HOME: probeHome, USERPROFILE: probeHome }
    : process.env;
  const result = requiresShell(executable)
    ? spawnSync(`${quoteCmdArg(executable)} ${args.map(quoteCmdArg).join(' ')}`, {
        encoding: 'utf8',
        shell: true,
        cwd: root,
        env,
      })
    : spawnSync(executable, args, {
        encoding: 'utf8',
        shell: false,
        cwd: root,
        env,
      });

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 1) !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} exited ${result.status}`).trim());
  }
}

const EXERCISE_PROBES = {
  distill: {
    source: 'distill-wrapper-help',
    run() {
      runProbe('node', ['scripts/run-distill-mcp.mjs', '--help']);
    },
  },
  grep: {
    source: 'grep-help',
    run() {
      runProbe('uvx', ['grep-mcp', '--help']);
    },
  },
  'opencode-context-governor': {
    source: 'package-smoke',
    run() {
      const { Governor } = require(path.join(root, 'packages', 'opencode-context-governor', 'src', 'index.js'));
      const governor = new Governor({ autoLoad: false });
      const check = governor.checkBudget('mcp-exercise-harness', 'anthropic/claude-sonnet-4-5', 1000);
      if (!check?.status) {
        throw new Error('Governor probe failed');
      }
    },
  },
  'opencode-runbooks': {
    source: 'package-smoke',
    run() {
      const { Runbooks } = require(path.join(root, 'packages', 'opencode-runbooks', 'src', 'index.js'));
      const runbooks = new Runbooks();
      const diagnosis = runbooks.diagnose('MCP command unavailable', { mcpName: 'supermemory' });
      if (!diagnosis?.match || !diagnosis?.remedy || !diagnosis?.result) {
        throw new Error('Runbooks probe failed');
      }
    },
  },
  playwright: {
    source: 'playwright-help',
    run() {
      runProbe('npx', ['@playwright/mcp@0.0.64', '--help']);
    },
  },
  sequentialthinking: {
    source: 'sequentialthinking-startup',
    run() {
      runProbe('npx', ['-y', '@modelcontextprotocol/server-sequential-thinking', '--help']);
    },
  },
  websearch: {
    source: 'websearch-startup',
    run() {
      runProbe('npx', ['-y', '@ignidor/web-search-mcp', '--help']);
    },
  },
};

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

function exerciseLocalMcps() {
  const now = new Date().toISOString();
  const exercised = [];
  const skipped = [];

  for (const name of getLocalLiveMcps()) {
    const probe = EXERCISE_PROBES[name];
    if (!probe) {
      skipped.push({
        name,
        skippedAt: now,
        reason: 'No repo-owned exercise probe available',
      });
      continue;
    }

    try {
      probe.run();
      exercised.push({
        name,
        verifiedAt: now,
        source: 'mcp-exercise-harness',
        probe: probe.source,
      });
    } catch (error) {
      skipped.push({
        name,
        skippedAt: now,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { exercised, skipped, generatedAt: now };
}

function main() {
  const toolUsageDir = path.join(HOME, '.opencode', 'tool-usage');
  mkdirSync(toolUsageDir, { recursive: true });
  const filePath = path.join(toolUsageDir, 'mcp-exercises.json');
  const { exercised, skipped, generatedAt } = exerciseLocalMcps();

  writeFileSync(filePath, JSON.stringify({ entries: exercised }, null, 2), 'utf8');

  const payload = { generatedAt, exercised, skipped };
  if (outputJson) {
    process.stdout.write(JSON.stringify(payload, null, 2));
  } else {
    console.log('# MCP Exercise Harness');
    for (const entry of exercised) {
      console.log(`- ${entry.name}: verified`);
    }
    for (const entry of skipped) {
      console.log(`- ${entry.name}: skipped (${entry.reason})`);
    }
  }
}

main();
