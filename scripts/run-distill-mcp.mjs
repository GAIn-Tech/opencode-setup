#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { resolveUserDataPath } from './resolve-root.mjs';

const DISTILL_VERSION = '0.8.1';
const DISTILL_PACKAGE = `distill-mcp@${DISTILL_VERSION}`;
const OFFLINE = String(process.env.OPENCODE_OFFLINE || '').trim() === '1' || process.argv.includes('--offline');

const PATCH_RULES = [
  { relativePath: path.join('dist', 'shared', 'index.js'), replacements: [['./types"', './types.js"'], ["'./types'", "'./types.js'"], ['./constants"', './constants.js"'], ["'./constants'", "'./constants.js'"], ['./utils"', './utils.js"'], ["'./utils'", "'./utils.js'"]] },
  { relativePath: path.join('dist', 'shared', 'utils.js'), replacements: [['./constants"', './constants.js"'], ["'./constants'", "'./constants.js'"]] },
];

export function resolveExecutable(name, platform = process.platform) {
  if (platform === 'win32') {
    if (name === 'npm' || name === 'npx') {
      return path.join(path.dirname(process.execPath), `${name}.cmd`);
    }
    return `${name}.exe`;
  }
  return name;
}

export function requiresShell(command, platform = process.platform) {
  return platform === 'win32' && /\.(cmd|bat)$/i.test(command);
}

function quoteCmdArg(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '\\"')}"`;
}

function run(command, args, options = {}) {
  const baseOptions = {
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    cwd: options.cwd,
    env: options.env || process.env,
  };

  const result = requiresShell(command)
    ? spawnSync(`${quoteCmdArg(command)} ${args.map(quoteCmdArg).join(' ')}`, { ...baseOptions, shell: true })
    : spawnSync(command, args, { ...baseOptions, shell: false });

  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }

  return result;
}

export function resolveDistillConfig() {
  return {
    command: ['bun'],
    args: ['scripts/run-distill-mcp.mjs', 'serve', '--lazy'],
  };
}

export function patchDistillPackage(packageRoot) {
  let changed = false;

  for (const rule of PATCH_RULES) {
    const filePath = path.join(packageRoot, rule.relativePath);
    if (!existsSync(filePath)) continue;

    let content = readFileSync(filePath, 'utf8');
    const original = content;
    for (const [from, to] of rule.replacements) {
      content = content.replaceAll(from, to);
    }

    if (content !== original) {
      writeFileSync(filePath, content, 'utf8');
      changed = true;
    }
  }

  return changed;
}

function getCacheRoot() {
  return resolveUserDataPath('mcp-cache', 'distill-mcp', DISTILL_VERSION);
}

function getPreparedCliPath() {
  return path.join(getCacheRoot(), 'node_modules', 'distill-mcp', 'bin', 'cli.js');
}

export function ensurePreparedPackage({ offline = OFFLINE } = {}) {
  const cliPath = getPreparedCliPath();
  if (existsSync(cliPath)) {
    patchDistillPackage(path.join(getCacheRoot(), 'node_modules', 'distill-mcp'));
    return cliPath;
  }

  if (offline) {
    throw new Error(
      `Distill cache missing in offline mode: ${cliPath}. ` +
      'Run once online or prewarm via node scripts/run-distill-mcp.mjs --version.'
    );
  }

  const cacheRoot = getCacheRoot();
  mkdirSync(cacheRoot, { recursive: true });

  const packageJsonPath = path.join(cacheRoot, 'package.json');
  if (!existsSync(packageJsonPath)) {
    writeFileSync(packageJsonPath, JSON.stringify({ private: true, type: 'module' }, null, 2), 'utf8');
  }

  rmSync(path.join(cacheRoot, 'node_modules', 'distill-mcp'), { recursive: true, force: true });
  run(resolveExecutable('npm'), ['install', '--no-save', DISTILL_PACKAGE], { cwd: cacheRoot });

  const packageRoot = path.join(cacheRoot, 'node_modules', 'distill-mcp');
  patchDistillPackage(packageRoot);
  return path.join(packageRoot, 'bin', 'cli.js');
}

function main() {
  const cliPath = ensurePreparedPackage();
  const nodeArgs = [cliPath, ...process.argv.slice(2)];
  const result = spawnSync(process.execPath, nodeArgs, { stdio: 'inherit', env: process.env });

  if (result.error) {
    throw result.error;
  }
  process.exit(result.status ?? 0);
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntrypoint) {
  main();
}
