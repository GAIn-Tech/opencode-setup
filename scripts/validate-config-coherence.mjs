#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePath, userConfigDir } from './resolve-root.mjs';
import * as copyConfig from './copy-config.mjs';

const FALLBACK_CONFIG_FILES = ['opencode.json', 'antigravity.json', 'oh-my-opencode.json', 'compound-engineering.json', 'config.yaml', 'rate-limit-fallback.json', 'deployment-state.json', 'learning-update-policy.json', 'supermemory.json', 'tool-tiers.json'];
const FALLBACK_CONFIG_DIRS = ['commands', 'docs', 'models', 'supermemory'];
const FALLBACK_MERGE_DIRS = ['skills'];

// Files that are copied from repo then intentionally enriched by post-copy scripts
// (e.g. generate-mcp-config.mjs resolves $ROOT placeholders and merges MCP entries).
// For these, compare all top-level JSON keys EXCEPT the enriched ones.
const ENRICHED_JSON_FILES = {
  'opencode.json': { ignoreKeys: new Set(['mcp', 'mcpServers']) },
};

function choose(value, fallback) {
  return Array.isArray(value) ? value : fallback;
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function walkFiles(dirPath, basePath = dirPath) {
  if (!existsSync(dirPath)) return [];
  const files = [];
  for (const entry of readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) files.push(...walkFiles(fullPath, basePath));
    else if (stats.isFile()) files.push(path.relative(basePath, fullPath).split(path.sep).join('/'));
  }
  return files.sort();
}

function addDrift(result, type, target, detail) {
  result.drift.push({ type, target, detail });
}

/**
 * Deep-equal check for JSON values (plain objects, arrays, primitives).
 * Returns true if structurally identical.
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k, i) => k === bKeys[i] && deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * Compare enriched JSON files structurally, ignoring specified top-level keys.
 * Returns null if values match, or a description of the first mismatch found.
 */
function compareEnrichedJson(repoPath, runtimePath, ignoreKeys) {
  let repoObj, runtimeObj;
  try {
    repoObj = JSON.parse(readFileSync(repoPath, 'utf8'));
  } catch {
    return 'repo file is not valid JSON';
  }
  try {
    runtimeObj = JSON.parse(readFileSync(runtimePath, 'utf8'));
  } catch {
    return 'runtime file is not valid JSON';
  }
  const driftKeys = [];
  for (const key of Object.keys(repoObj)) {
    if (ignoreKeys.has(key)) continue;
    if (!(key in runtimeObj)) {
      driftKeys.push(`key "${key}" missing in runtime`);
    } else if (!deepEqual(repoObj[key], runtimeObj[key])) {
      driftKeys.push(`key "${key}" differs`);
    }
  }
  return driftKeys.length > 0 ? driftKeys.join(', ') : null;
}

function compareTrackedFiles(result, repoConfigDir, runtimeConfigDir, configFiles, enrichedJsonFiles) {
  for (const fileName of configFiles) {
    const repoPath = path.join(repoConfigDir, fileName);
    const runtimePath = path.join(runtimeConfigDir, fileName);
    if (!existsSync(repoPath)) {
      addDrift(result, 'repo-file-missing', fileName, 'missing in repo source config');
      continue;
    }
    if (!existsSync(runtimePath)) {
      addDrift(result, 'runtime-file-missing', fileName, 'missing in runtime config');
      continue;
    }

    // Enriched JSON files: structural compare ignoring enriched keys
    const enrichment = enrichedJsonFiles[fileName];
    if (enrichment) {
      const mismatch = compareEnrichedJson(repoPath, runtimePath, enrichment.ignoreKeys);
      if (mismatch) {
        addDrift(result, 'enriched-mismatch', fileName, mismatch);
      }
      continue;
    }

    // Standard files: hash comparison
    const repoHash = sha256File(repoPath);
    const runtimeHash = sha256File(runtimePath);
    if (repoHash !== runtimeHash) {
      addDrift(result, 'file-mismatch', fileName, `sha256 differs (repo=${repoHash.slice(0, 12)}..., runtime=${runtimeHash.slice(0, 12)}...)`);
    }
  }
}

function compareTrackedDirs(result, repoConfigDir, runtimeConfigDir, configDirs) {
  for (const dirName of configDirs) {
    const repoDirPath = path.join(repoConfigDir, dirName);
    const runtimeDirPath = path.join(runtimeConfigDir, dirName);
    if (!existsSync(repoDirPath)) {
      addDrift(result, 'repo-dir-missing', `${dirName}/`, 'missing in repo source config');
      continue;
    }
    if (!existsSync(runtimeDirPath)) {
      addDrift(result, 'runtime-dir-missing', `${dirName}/`, 'missing in runtime config');
      continue;
    }

    const repoFiles = walkFiles(repoDirPath);
    const runtimeFiles = walkFiles(runtimeDirPath);
    const runtimeFileSet = new Set(runtimeFiles);
    const repoFileSet = new Set(repoFiles);

    for (const relPath of repoFiles) {
      if (!runtimeFileSet.has(relPath)) {
        addDrift(result, 'runtime-file-missing', `${dirName}/${relPath}`, 'missing in runtime config dir');
        continue;
      }
      const repoHash = sha256File(path.join(repoDirPath, relPath));
      const runtimeHash = sha256File(path.join(runtimeDirPath, relPath));
      if (repoHash !== runtimeHash) {
        addDrift(result, 'dir-file-mismatch', `${dirName}/${relPath}`, `sha256 differs (repo=${repoHash.slice(0, 12)}..., runtime=${runtimeHash.slice(0, 12)}...)`);
      }
    }

    for (const relPath of runtimeFiles) {
      if (!repoFileSet.has(relPath)) {
        addDrift(result, 'runtime-extra-file', `${dirName}/${relPath}`, 'extra file not present in repo source');
      }
    }
  }
}

function compareMergeDirs(result, repoConfigDir, runtimeConfigDir, mergeDirs) {
  for (const dirName of mergeDirs) {
    const repoDirPath = path.join(repoConfigDir, dirName);
    const runtimeDirPath = path.join(runtimeConfigDir, dirName);
    if (!existsSync(repoDirPath)) {
      addDrift(result, 'repo-dir-missing', `${dirName}/`, 'missing merge dir in repo source config');
      continue;
    }
    if (!existsSync(runtimeDirPath)) {
      addDrift(result, 'runtime-dir-missing', `${dirName}/`, 'missing merge dir in runtime config');
      continue;
    }
    for (const entry of readdirSync(repoDirPath)) {
      if (!existsSync(path.join(runtimeDirPath, entry))) {
        addDrift(result, 'runtime-entry-missing', `${dirName}/${entry}`, 'required merge entry missing in runtime config');
      }
    }
  }
}

export function validateConfigCoherence(options = {}) {
  const repoConfigDir = options.repoConfigDir || resolvePath('opencode-config');
  const runtimeConfigDir = options.runtimeConfigDir || userConfigDir();
  const configFiles = choose(options.configFiles, choose(copyConfig.CONFIG_FILES, FALLBACK_CONFIG_FILES));
  const configDirs = choose(options.configDirs, choose(copyConfig.CONFIG_DIRS, FALLBACK_CONFIG_DIRS));
  const mergeDirs = choose(options.mergeDirs, choose(copyConfig.MERGE_DIRS, FALLBACK_MERGE_DIRS));

  const result = {
    ok: true,
    repoConfigDir,
    runtimeConfigDir,
    checked: { configFiles: configFiles.length, configDirs: configDirs.length, mergeDirs: mergeDirs.length },
    drift: []
  };

  if (!existsSync(runtimeConfigDir)) {
    result.ok = false;
    addDrift(result, 'runtime-not-synced', runtimeConfigDir, 'runtime config directory does not exist (not synced yet)');
    return result;
  }

  const enrichedJsonFiles = options.enrichedJsonFiles || ENRICHED_JSON_FILES;
  compareTrackedFiles(result, repoConfigDir, runtimeConfigDir, configFiles, enrichedJsonFiles);
  compareTrackedDirs(result, repoConfigDir, runtimeConfigDir, configDirs);
  compareMergeDirs(result, repoConfigDir, runtimeConfigDir, mergeDirs);
  result.ok = result.drift.length === 0;
  return result;
}

function runCli() {
  const args = process.argv.slice(2);
  const quiet = args.includes('--quiet');
  const json = args.includes('--json');
  const result = validateConfigCoherence();

  if (!quiet) {
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.ok) {
      console.log('config-coherence: PASS');
    } else {
      console.error(`config-coherence: FAIL (${result.drift.length} drift item${result.drift.length === 1 ? '' : 's'})`);
      for (const item of result.drift) {
        console.error(`- [${item.type}] ${item.target}: ${item.detail}`);
      }
    }
  }

  process.exitCode = result.ok ? 0 : 1;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(thisFile)) {
  try {
    runCli();
  } catch (error) {
    console.error(`[validate-config-coherence] Failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
