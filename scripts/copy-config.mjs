#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { resolvePath, userConfigDir, userDataDir } from './resolve-root.mjs';

const SOURCE_CONFIG_DIR = resolvePath('opencode-config');
const TARGET_CONFIG_DIR = userConfigDir();
const TARGET_DATA_DIR = userDataDir();

const CONFIG_FILES = [
  'opencode.json',
  'antigravity.json',
  'oh-my-opencode.json',
  'compound-engineering.json',
  'config.yaml',
  'rate-limit-fallback.json',
  'deployment-state.json',
  'learning-update-policy.json',
  'supermemory.json',
  'tool-tiers.json',
];

const CONFIG_DIRS = [
  'commands',
  'agents',
  'docs',
  'models',
  'supermemory',
  'skills',
];

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function copyFileSafe(fileName) {
  const sourcePath = path.join(SOURCE_CONFIG_DIR, fileName);
  const targetPath = path.join(TARGET_CONFIG_DIR, fileName);

  if (!existsSync(sourcePath)) {
    console.warn(`[copy-config] Skipping missing source file: ${fileName}`);
    return;
  }

  cpSync(sourcePath, targetPath, { force: true });
  console.log(`[copy-config] Copied ${fileName}`);
}

function copyDirSafe(dirName) {
  const sourcePath = path.join(SOURCE_CONFIG_DIR, dirName);
  const targetPath = path.join(TARGET_CONFIG_DIR, dirName);

  if (!existsSync(sourcePath)) {
    console.warn(`[copy-config] Skipping missing source directory: ${dirName}`);
    return;
  }

  cpSync(sourcePath, targetPath, { recursive: true, force: true });
  console.log(`[copy-config] Copied ${dirName}/`);
}

function copyDataConfig() {
  const sourcePath = path.join(SOURCE_CONFIG_DIR, 'config.yaml');
  const targetPath = path.join(TARGET_DATA_DIR, 'config.yaml');

  if (!existsSync(sourcePath)) {
    return;
  }

  cpSync(sourcePath, targetPath, { force: true });
  console.log('[copy-config] Copied config.yaml to user data directory');
}

function main() {
  ensureDir(TARGET_CONFIG_DIR);
  ensureDir(TARGET_DATA_DIR);

  for (const file of CONFIG_FILES) {
    copyFileSafe(file);
  }

  for (const dir of CONFIG_DIRS) {
    copyDirSafe(dir);
  }

  copyDirSafe('learning-updates');
  copyDataConfig();

  console.log('[copy-config] Configuration sync complete');
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[copy-config] Failed: ${message}`);
  process.exit(1);
}
