#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { hostname, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePath, userConfigDir, userDataDir } from './resolve-root.mjs';
import { mergeMcpIntoUserConfig } from './generate-mcp-config.mjs';

const SOURCE_CONFIG_DIR = process.env.OPENCODE_TEST_REPO_CONFIG_DIR || resolvePath('opencode-config');
const TARGET_CONFIG_DIR = process.env.OPENCODE_TEST_RUNTIME_CONFIG_DIR || userConfigDir();
const TARGET_DATA_DIR = process.env.OPENCODE_TEST_RUNTIME_DATA_DIR || userDataDir();
const RUNTIME_PLUGIN_PINS_FILE = 'plugin-pins.json';
const ALLOW_FILE_PLUGIN_PINS = process.env.OPENCODE_ALLOW_FILE_PLUGIN_PIN === '1';
const LEGACY_OH_MY_PLUGIN = 'oh-my-opencode';
const CURRENT_OH_MY_PLUGIN = 'oh-my-openagent';

export const CONFIG_FILES = [
  'opencode.json',
  'plugin-pins.json',
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

export const CONFIG_DIRS = [
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
export const MERGE_DIRS = [
  'skills',
  'agents',
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

export function readRuntimePluginPins(configDir = TARGET_CONFIG_DIR) {
  const pinsPath = path.join(configDir, RUNTIME_PLUGIN_PINS_FILE);
  if (!existsSync(pinsPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(pinsPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    let changed = false;
    if (typeof parsed[LEGACY_OH_MY_PLUGIN] === 'string' && !parsed[CURRENT_OH_MY_PLUGIN]) {
      parsed[CURRENT_OH_MY_PLUGIN] = parsed[LEGACY_OH_MY_PLUGIN].replace(`${LEGACY_OH_MY_PLUGIN}@`, `${CURRENT_OH_MY_PLUGIN}@`);
      delete parsed[LEGACY_OH_MY_PLUGIN];
      changed = true;
    }

    if (changed) {
      writeFileSync(pinsPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    }

    return parsed;
  } catch {
    return {};
  }
}

export function writeRuntimePluginPins(pins, configDir = TARGET_CONFIG_DIR) {
  const pinsPath = path.join(configDir, RUNTIME_PLUGIN_PINS_FILE);
  writeFileSync(pinsPath, `${JSON.stringify(pins, null, 2)}\n`, 'utf8');
}

export function getPackageNameFromPluginRef(ref) {
  if (typeof ref !== 'string' || !ref.includes('@')) {
    return null;
  }

  if (ref.startsWith('@')) {
    const at = ref.indexOf('@', 1);
    return at === -1 ? null : ref.slice(0, at);
  }

  return ref.slice(0, ref.indexOf('@'));
}

export function applyPluginPins(pluginEntries, pins) {
  const result = [...pluginEntries];
  if (!pins || typeof pins !== 'object') {
    return result;
  }

  for (const [pkg, pinnedRef] of Object.entries(pins)) {
    if (typeof pinnedRef !== 'string' || !pinnedRef.trim()) {
      continue;
    }

    if (!ALLOW_FILE_PLUGIN_PINS && pinnedRef.includes('@file:')) {
      console.warn(`[copy-config] Skipping file plugin pin for ${pkg}; set OPENCODE_ALLOW_FILE_PLUGIN_PIN=1 to allow it.`);
      continue;
    }

    const effectivePkg = pkg === LEGACY_OH_MY_PLUGIN ? CURRENT_OH_MY_PLUGIN : pkg;
    const normalizedPinnedRef = pinnedRef.replace(`${LEGACY_OH_MY_PLUGIN}@`, `${CURRENT_OH_MY_PLUGIN}@`);
    const existingIndex = result.findIndex((entry) => {
      const packageName = getPackageNameFromPluginRef(entry);
      return packageName === effectivePkg || (effectivePkg === CURRENT_OH_MY_PLUGIN && packageName === LEGACY_OH_MY_PLUGIN);
    });

    if (existingIndex === -1) {
      result.push(normalizedPinnedRef);
    } else {
      result[existingIndex] = normalizedPinnedRef;
    }
  }

  return result;
}

export function findRuntimeLocalOhMyPlugin(runtimeConfig) {
  const plugins = runtimeConfig?.plugin;
  if (!Array.isArray(plugins)) {
    return null;
  }

  return (
    plugins.find(
      (entry) =>
        typeof entry === 'string' &&
        (entry.startsWith(`${LEGACY_OH_MY_PLUGIN}@file:`) || entry.startsWith(`${CURRENT_OH_MY_PLUGIN}@file:`))
    ) ?? null
  );
}

export function bootstrapLocalOhMyPin(previousRuntimeConfig, configDir = TARGET_CONFIG_DIR) {
  if (!ALLOW_FILE_PLUGIN_PINS) {
    return null;
  }

  const localRef = findRuntimeLocalOhMyPlugin(previousRuntimeConfig);
  if (!localRef) {
    return null;
  }

  const pins = readRuntimePluginPins(configDir);
  if (typeof pins[CURRENT_OH_MY_PLUGIN] === 'string' && pins[CURRENT_OH_MY_PLUGIN].trim()) {
    return pins[CURRENT_OH_MY_PLUGIN];
  }

  const normalizedLocalRef = localRef.replace(`${LEGACY_OH_MY_PLUGIN}@file:`, `${CURRENT_OH_MY_PLUGIN}@file:`);
  const nextPins = { ...pins, [CURRENT_OH_MY_PLUGIN]: normalizedLocalRef };
  delete nextPins[LEGACY_OH_MY_PLUGIN];
  writeRuntimePluginPins(nextPins, configDir);
  console.log(`[copy-config] Persisted local plugin pin: ${normalizedLocalRef}`);
  return normalizedLocalRef;
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
  const pluginPins = readRuntimePluginPins(TARGET_CONFIG_DIR);
  mergedConfig.plugin = applyPluginPins(Array.isArray(mergedConfig.plugin) ? mergedConfig.plugin : [], pluginPins);
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
        moveWithExdevFallback(operation.swapPath, operation.targetPath);
      }
    } catch {
      // Best-effort rollback.
    }
  }
}

function moveWithExdevFallback(sourcePath, targetPath) {
  try {
    renameSync(sourcePath, targetPath);
    return;
  } catch (error) {
    if (error?.code !== 'EXDEV') {
      throw error;
    }
  }

  cpSync(sourcePath, targetPath, { recursive: true, force: true });
  rmSync(sourcePath, { recursive: true, force: true });
}

function isLegacyModelReference(modelRef) {
  if (typeof modelRef !== 'string' || !modelRef.trim()) return false;
  const value = modelRef.trim();
  if (!value.includes('/')) return true;
  return value.startsWith('anthropic/') || value.startsWith('claude-') || value.startsWith('antigravity-claude-');
}

function migrateOhMyModelDefaults() {
  const canonicalPath = path.join(SOURCE_CONFIG_DIR, 'oh-my-opencode.json');
  const runtimePath = path.join(TARGET_CONFIG_DIR, 'oh-my-opencode.json');
  if (!existsSync(canonicalPath) || !existsSync(runtimePath)) {
    return { changed: false, migrated: [] };
  }

  const canonical = JSON.parse(readFileSync(canonicalPath, 'utf8'));
  const runtime = JSON.parse(readFileSync(runtimePath, 'utf8'));
  const migrated = [];

  const migrateSection = (sectionName) => {
    const canonicalSection = canonical?.[sectionName];
    const runtimeSection = runtime?.[sectionName];
    if (!canonicalSection || !runtimeSection || typeof canonicalSection !== 'object' || typeof runtimeSection !== 'object') {
      return;
    }

    for (const [name, canonicalEntry] of Object.entries(canonicalSection)) {
      if (!canonicalEntry || typeof canonicalEntry !== 'object' || typeof canonicalEntry.model !== 'string') continue;
      const runtimeEntry = runtimeSection[name];
      if (!runtimeEntry || typeof runtimeEntry !== 'object') continue;
      if (!isLegacyModelReference(runtimeEntry.model)) continue;
      if (runtimeEntry.model === canonicalEntry.model) continue;
      runtimeEntry.model = canonicalEntry.model;
      migrated.push(`${sectionName}.${name}`);
    }
  };

  migrateSection('agents');
  migrateSection('categories');

  if (migrated.length > 0) {
    writeFileSync(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`, 'utf8');
  }

  return { changed: migrated.length > 0, migrated };
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

  let previousRuntimeOpencodeConfig = null;
  const runtimeOpencodePath = path.join(TARGET_CONFIG_DIR, 'opencode.json');
  if (existsSync(runtimeOpencodePath)) {
    try {
      previousRuntimeOpencodeConfig = JSON.parse(readFileSync(runtimeOpencodePath, 'utf8'));
    } catch {
      previousRuntimeOpencodeConfig = null;
    }
  }

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

        moveWithExdevFallback(operation.stagedPath, operation.targetPath);
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

  bootstrapLocalOhMyPin(previousRuntimeOpencodeConfig);
  syncRuntimeSafeUserConfig();
  const migration = migrateOhMyModelDefaults();
  if (migration.changed) {
    console.log(`[copy-config] Migrated legacy oh-my model defaults: ${migration.migrated.join(', ')}`);
  }
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
