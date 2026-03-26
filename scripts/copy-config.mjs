#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { hostname, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePath, userConfigDir, userDataDir } from './resolve-root.mjs';
import { mergeMcpIntoUserConfig } from './generate-mcp-config.mjs';

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
  'docs',
  'learning-updates',
  'models',
  'supermemory',
  // NOTE: 'skills' is intentionally excluded — handled below with MERGE logic
  // to preserve user-installed skills not tracked in this repo.
];

// Directories that are MERGED (repo entries copied in, existing user entries preserved).
// Never replace wholesale — user may have skills/agents not in this repo.
const MERGE_DIRS = [
  'skills',
];

const backupEnabled = String(process.env.OPENCODE_COPY_CONFIG_BACKUP || '1') !== '0';

export const DEPRECATED_REPO_AGENT_FILES = [
  'code-searcher.md',
  'codebase-auditor.md',
  'distill-compressor.md',
  'memory-keeper.md',
  'playwright-browser.md',
  'researcher.md',
  'thinker.md',
];

function readDormantMcpNames(configDir = SOURCE_CONFIG_DIR) {
  const dormantPolicyPath = path.join(configDir, 'mcp-dormant-policy.json');
  if (!existsSync(dormantPolicyPath)) {
    return new Set();
  }

  try {
    const policy = JSON.parse(readFileSync(dormantPolicyPath, 'utf8'));
    return new Set(Object.keys(policy || {}));
  } catch {
    return new Set();
  }
}

export function buildRuntimeSafeUserConfig(canonicalConfig, userConfig, dormantMcpNames = new Set()) {
  return mergeMcpIntoUserConfig(userConfig, canonicalConfig, { dormantMcpNames });
}

export function pruneDeprecatedRuntimeAgentPrompts(targetConfigDir = TARGET_CONFIG_DIR, deprecatedFiles = DEPRECATED_REPO_AGENT_FILES) {
  const agentsDir = path.join(targetConfigDir, 'agents');
  if (!existsSync(agentsDir)) {
    return [];
  }

  const removed = [];
  for (const fileName of deprecatedFiles) {
    const filePath = path.join(agentsDir, fileName);
    if (!existsSync(filePath)) {
      continue;
    }
    rmSync(filePath, { force: true });
    removed.push(fileName);
  }

  return removed;
}

function syncRuntimeSafeUserConfig() {
  const canonicalPath = path.join(SOURCE_CONFIG_DIR, 'opencode.json');
  const targetPath = path.join(TARGET_CONFIG_DIR, 'opencode.json');
  if (!existsSync(canonicalPath) || !existsSync(targetPath)) {
    return;
  }

  const dormantMcpNames = readDormantMcpNames();
  const canonicalConfig = JSON.parse(readFileSync(canonicalPath, 'utf8'));
  const userConfig = JSON.parse(readFileSync(targetPath, 'utf8'));
  const mergedConfig = buildRuntimeSafeUserConfig(canonicalConfig, userConfig, dormantMcpNames);
  writeFileSync(targetPath, `${JSON.stringify(mergedConfig, null, 2)}\n`, 'utf8');
}

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function createBackupPath(targetPath, timestamp) {
  return `${targetPath}.backup.${timestamp}`;
}

function stageOperations(stagingRoot) {
  const operations = [];

  for (const fileName of CONFIG_FILES) {
    const sourcePath = path.join(SOURCE_CONFIG_DIR, fileName);
    const targetPath = path.join(TARGET_CONFIG_DIR, fileName);
    if (!existsSync(sourcePath)) {
      console.warn(`[copy-config] Skipping missing source file: ${fileName}`);
      continue;
    }

    const stagedPath = path.join(stagingRoot, 'config', fileName);
    ensureDir(path.dirname(stagedPath));
    cpSync(sourcePath, stagedPath, { force: true });
    operations.push({ label: fileName, stagedPath, targetPath });
  }

  for (const dirName of CONFIG_DIRS) {
    const sourcePath = path.join(SOURCE_CONFIG_DIR, dirName);
    const targetPath = path.join(TARGET_CONFIG_DIR, dirName);
    if (!existsSync(sourcePath)) {
      console.warn(`[copy-config] Skipping missing source directory: ${dirName}`);
      continue;
    }

    const stagedPath = path.join(stagingRoot, 'config', dirName);
    ensureDir(path.dirname(stagedPath));
    cpSync(sourcePath, stagedPath, { recursive: true, force: true });
    operations.push({ label: `${dirName}/`, stagedPath, targetPath });
  }

  // MERGE directories: copy repo entries into target without removing user entries.
  // Each top-level entry in the source is copied individually, leaving any
  // user-installed entries that don't exist in the source untouched.
  for (const dirName of MERGE_DIRS) {
    const sourcePath = path.join(SOURCE_CONFIG_DIR, dirName);
    const targetPath = path.join(TARGET_CONFIG_DIR, dirName);
    if (!existsSync(sourcePath)) {
      console.warn(`[copy-config] Skipping missing merge source directory: ${dirName}`);
      continue;
    }
    ensureDir(targetPath);
    for (const entry of readdirSync(sourcePath)) {
      const entrySrc = path.join(sourcePath, entry);
      const entryDst = path.join(targetPath, entry);
      cpSync(entrySrc, entryDst, { recursive: true, force: true });
      console.log(`[copy-config] Merged ${dirName}/${entry}`);
    }
  }

  const dataConfigSourcePath = path.join(SOURCE_CONFIG_DIR, 'config.yaml');
  if (existsSync(dataConfigSourcePath)) {
    const stagedDataPath = path.join(stagingRoot, 'data', 'config.yaml');
    ensureDir(path.dirname(stagedDataPath));
    cpSync(dataConfigSourcePath, stagedDataPath, { force: true });
    operations.push({ label: 'config.yaml (data dir)', stagedPath: stagedDataPath, targetPath: path.join(TARGET_DATA_DIR, 'config.yaml') });
  }

  return operations;
}

function rollbackOperations(operations) {
  for (const operation of [...operations].reverse()) {
    try {
      if (existsSync(operation.targetPath)) {
        rmSync(operation.targetPath, { recursive: true, force: true });
      }
      if (operation.swapPath && existsSync(operation.swapPath)) {
        renameSync(operation.swapPath, operation.targetPath);
      }
    } catch {
      // Best-effort rollback.
    }
  }
}

export function writeConfigManifest(runtimeConfigDir, configFiles) {
  const manifestPath = path.join(runtimeConfigDir, 'config-manifest.json');
  let existingManifest = null;

  if (existsSync(manifestPath)) {
    try {
      existingManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      existingManifest = null;
    }
  }

  const files = {};
  for (const fileName of configFiles) {
    const filePath = path.join(runtimeConfigDir, fileName);
    if (!existsSync(filePath)) continue;
    const digest = createHash('sha256').update(readFileSync(filePath)).digest('hex');
    files[fileName] = digest;
  }

  const manifest = {
    version: ((existingManifest && existingManifest.version) || 0) + 1,
    lastSync: new Date().toISOString(),
    machineId: hostname(),
    files,
  };

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function main() {
  ensureDir(TARGET_CONFIG_DIR);
  ensureDir(TARGET_DATA_DIR);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stagingRoot = mkdtempSync(path.join(tmpdir(), 'opencode-copy-config-'));

  try {
    const operations = stageOperations(stagingRoot);
    const applied = [];

    try {
      for (const operation of operations) {
        const targetDir = path.dirname(operation.targetPath);
        ensureDir(targetDir);

        const swapPath = existsSync(operation.targetPath) ? `${operation.targetPath}.swap.${timestamp}` : null;
        if (swapPath) {
          renameSync(operation.targetPath, swapPath);
        }

        renameSync(operation.stagedPath, operation.targetPath);
        applied.push({ ...operation, swapPath });
        console.log(`[copy-config] Copied ${operation.label}`);
      }

      for (const operation of applied) {
        if (!operation.swapPath || !existsSync(operation.swapPath)) continue;
        if (backupEnabled) {
          const backupPath = createBackupPath(operation.targetPath, timestamp);
          renameSync(operation.swapPath, backupPath);
          console.log(`[copy-config] Backed up existing file: ${path.basename(operation.targetPath)} -> ${path.basename(backupPath)}`);
        } else {
          rmSync(operation.swapPath, { recursive: true, force: true });
        }
      }
    } catch (error) {
      rollbackOperations(applied);
      throw error;
    }
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }

  const removedAgentPrompts = pruneDeprecatedRuntimeAgentPrompts();
  if (removedAgentPrompts.length > 0) {
    console.log(`[copy-config] Removed deprecated agent prompts: ${removedAgentPrompts.join(', ')}`);
  }

  syncRuntimeSafeUserConfig();
  writeConfigManifest(TARGET_CONFIG_DIR, CONFIG_FILES);
  console.log('[copy-config] Configuration sync complete');
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(thisFile)) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[copy-config] Failed: ${message}`);
    process.exit(1);
  }
}
