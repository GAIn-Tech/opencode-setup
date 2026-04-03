#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_MANIFEST_PATH = path.join(DEFAULT_ROOT, 'scripts', 'bootstrap-manifest.json');
const DEFAULT_CONFIG_PATH = path.join(DEFAULT_ROOT, 'opencode-config', 'opencode.json');
const REASON_CODES = {
  PLUGIN_MISSING_INFO_MD: 'PLUGIN_MISSING_INFO_MD',
  PLUGIN_MISSING_SPEC: 'PLUGIN_MISSING_SPEC',
  PLUGIN_NOT_IN_CONFIG: 'PLUGIN_NOT_IN_CONFIG',
};

function stableSort(items) {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b));
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function pushMissing(result, key, reason) {
  result.missing.push(key);
  result.reasons.push(reason);
}

function pushFailure(result, key, reason) {
  result.failed.push(key);
  result.reasons.push(reason);
}

function pushMissingWithCode(result, key, code, reason) {
  pushMissing(result, key, `${code}: ${reason}`);
}

function pushFailureWithCode(result, key, code, reason) {
  pushFailure(result, key, `${code}: ${reason}`);
}

function normalizeRelativePath(relativePath) {
  return String(relativePath || '').replaceAll('\\\\', '/');
}

function extractPluginDirectoryFromPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const match = normalized.match(/^plugins\/([^/]+)\//);
  return match ? match[1] : null;
}

function getDeclaredPluginDirectories(rootDir) {
  const pluginsRoot = path.join(rootDir, 'plugins');
  if (!existsSync(pluginsRoot)) {
    return [];
  }

  return readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function getPluginSpecFromLocalMetadata(rootDir, pluginDir) {
  const metadataCandidates = [
    path.join(rootDir, 'plugins', pluginDir, 'opencodePluginSpec'),
    path.join(rootDir, 'plugins', pluginDir, 'opencodePluginSpec.txt'),
    path.join(rootDir, 'plugins', pluginDir, 'opencodePluginSpec.md'),
    path.join(rootDir, 'plugins', pluginDir, 'opencodePluginSpec.json'),
  ];

  for (const candidatePath of metadataCandidates) {
    if (!existsSync(candidatePath)) continue;

    const raw = readFileSync(candidatePath, 'utf8').trim();
    if (!raw) return '';

    if (candidatePath.endsWith('.json')) {
      try {
        const payload = JSON.parse(raw);
        if (typeof payload?.opencodePluginSpec === 'string') {
          return payload.opencodePluginSpec.trim();
        }
      } catch {
        return raw;
      }
    }

    return raw;
  }

  return null;
}

function buildOfficialSpecByDirectory(officialPlugins) {
  const officialSpecByDir = new Map();

  for (const pluginComponent of officialPlugins || []) {
    if (!isObject(pluginComponent) || !isObject(pluginComponent.loadChecks)) continue;

    const candidatePaths = [
      ...(isStringArray(pluginComponent.loadChecks.requiredFiles) ? pluginComponent.loadChecks.requiredFiles : []),
      ...(isStringArray(pluginComponent.loadChecks.entryPoints) ? pluginComponent.loadChecks.entryPoints : []),
    ];

    const candidateDirFromPath = candidatePaths
      .map((item) => extractPluginDirectoryFromPath(item))
      .find((item) => typeof item === 'string' && item.trim().length > 0);

    const candidateDir = candidateDirFromPath || (typeof pluginComponent.id === 'string' ? pluginComponent.id.trim() : '');
    if (!candidateDir) continue;

    const spec = typeof pluginComponent.loadChecks.opencodePluginSpec === 'string'
      ? pluginComponent.loadChecks.opencodePluginSpec.trim()
      : null;

    officialSpecByDir.set(candidateDir, spec && spec.length > 0 ? spec : '');
  }

  return officialSpecByDir;
}

function verifyDeclaredPluginSurface(rootDir, officialPlugins, configPlugins, result) {
  const pluginDirs = getDeclaredPluginDirectories(rootDir);
  const officialSpecByDir = buildOfficialSpecByDirectory(officialPlugins);

  for (const pluginDir of pluginDirs) {
    if (officialSpecByDir.has(pluginDir)) {
      continue;
    }

    const infoRelativePath = `plugins/${pluginDir}/info.md`;
    const infoAbsolutePath = path.join(rootDir, infoRelativePath);

    if (!existsSync(infoAbsolutePath)) {
      pushMissingWithCode(
        result,
        `plugin:${pluginDir}:required:${infoRelativePath}`,
        REASON_CODES.PLUGIN_MISSING_INFO_MD,
        `Missing plugin metadata file for plugin:${pluginDir}: ${infoRelativePath}`,
      );
    }

    const localMetadataSpec = getPluginSpecFromLocalMetadata(rootDir, pluginDir);
    const applicableSpec = localMetadataSpec;

    if (applicableSpec === '') {
      pushFailureWithCode(
        result,
        `plugin:${pluginDir}:missing-opencode-plugin-spec`,
        REASON_CODES.PLUGIN_MISSING_SPEC,
        `Missing opencodePluginSpec metadata for plugin:${pluginDir}.`,
      );
      continue;
    }

    if (typeof applicableSpec === 'string' && applicableSpec.length > 0 && !configPlugins.has(applicableSpec)) {
      pushFailureWithCode(
        result,
        `plugin:${pluginDir}:opencode-config:missing-spec:${applicableSpec}`,
        REASON_CODES.PLUGIN_NOT_IN_CONFIG,
        `Plugin spec missing from opencode-config/opencode.json for plugin:${pluginDir}: ${applicableSpec}`,
      );
    }
  }
}

function verifyPluginPaths(pluginId, rootDir, loadChecks, result) {
  const requiredFiles = isStringArray(loadChecks?.requiredFiles) ? loadChecks.requiredFiles : [];
  const entryPoints = isStringArray(loadChecks?.entryPoints) ? loadChecks.entryPoints : [];

  for (const relativeFile of requiredFiles) {
    const fullPath = path.join(rootDir, relativeFile);
    if (!existsSync(fullPath)) {
      pushMissing(
        result,
        `plugin:${pluginId}:required:${relativeFile}`,
        `Missing required file for plugin:${pluginId}: ${relativeFile}`,
      );
    }
  }

  for (const relativeEntry of entryPoints) {
    const fullPath = path.join(rootDir, relativeEntry);
    if (!existsSync(fullPath)) {
      pushMissing(
        result,
        `plugin:${pluginId}:entry:${relativeEntry}`,
        `Missing entry point for plugin:${pluginId}: ${relativeEntry}`,
      );
    }
  }
}

function verifyPluginComponent(pluginComponent, rootDir, configPlugins, result) {
  if (!isObject(pluginComponent)) {
    pushFailure(result, 'plugin:invalid-object', 'Official plugin entry must be an object.');
    return;
  }

  const pluginId = typeof pluginComponent.id === 'string' && pluginComponent.id.trim().length > 0
    ? pluginComponent.id.trim()
    : 'unknown';

  if (pluginId === 'unknown') {
    pushFailure(result, 'plugin:missing-id', 'Official plugin entry is missing id.');
  }

  if (!isObject(pluginComponent.loadChecks)) {
    pushFailure(
      result,
      `plugin:${pluginId}:missing-load-checks`,
      `Missing loadChecks for plugin:${pluginId}.`,
    );
    return;
  }

  if (!isStringArray(pluginComponent.loadChecks.requiredFiles)) {
    pushFailure(
      result,
      `plugin:${pluginId}:required-files`,
      `loadChecks.requiredFiles must be a non-empty string array for plugin:${pluginId}.`,
    );
  }

  if (!isStringArray(pluginComponent.loadChecks.entryPoints)) {
    pushFailure(
      result,
      `plugin:${pluginId}:entry-points`,
      `loadChecks.entryPoints must be a non-empty string array for plugin:${pluginId}.`,
    );
  }

  const pluginSpec = pluginComponent.loadChecks.opencodePluginSpec;
  if (typeof pluginSpec !== 'string' || pluginSpec.trim().length === 0) {
    pushFailureWithCode(
      result,
      `plugin:${pluginId}:missing-opencode-plugin-spec`,
      REASON_CODES.PLUGIN_MISSING_SPEC,
      `Missing loadChecks.opencodePluginSpec for plugin:${pluginId}.`,
    );
  } else {
    const normalizedSpec = pluginSpec.trim();
    result.plugins.push(normalizedSpec);
    if (!configPlugins.has(normalizedSpec)) {
      pushFailureWithCode(
        result,
        `plugin:${pluginId}:opencode-config:missing-spec:${normalizedSpec}`,
        REASON_CODES.PLUGIN_NOT_IN_CONFIG,
        `Plugin spec missing from opencode-config/opencode.json for plugin:${pluginId}: ${normalizedSpec}`,
      );
    }
  }

  verifyPluginPaths(pluginId, rootDir, pluginComponent.loadChecks, result);
}

export function verifyPluginReadiness(options = {}) {
  const rootDir = path.resolve(options.rootDir || DEFAULT_ROOT);
  const manifestPath = path.resolve(options.manifestPath || DEFAULT_MANIFEST_PATH);
  const configPath = path.resolve(options.configPath || DEFAULT_CONFIG_PATH);

  const result = {
    ok: true,
    plugins: [],
    missing: [],
    failed: [],
    reasons: [],
  };

  if (!existsSync(manifestPath)) {
    pushMissing(result, `manifest:${path.relative(rootDir, manifestPath).replaceAll('\\\\', '/')}`, `Manifest file not found: ${manifestPath}`);
  }

  if (!existsSync(configPath)) {
    pushMissing(result, `config:${path.relative(rootDir, configPath).replaceAll('\\\\', '/')}`, `Config file not found: ${configPath}`);
  }

  if (result.missing.length > 0) {
    result.ok = false;
    result.plugins = stableSort(result.plugins);
    result.missing = stableSort(result.missing);
    result.failed = stableSort(result.failed);
    result.reasons = stableSort(result.reasons);
    return result;
  }

  let manifest;
  let config;

  try {
    manifest = readJson(manifestPath);
  } catch (error) {
    pushFailure(result, 'manifest:json-parse', `Unable to parse manifest JSON: ${error.message}`);
  }

  try {
    config = readJson(configPath);
  } catch (error) {
    pushFailure(result, 'config:json-parse', `Unable to parse opencode-config JSON: ${error.message}`);
  }

  if (result.failed.length > 0) {
    result.ok = false;
    result.plugins = stableSort(result.plugins);
    result.missing = stableSort(result.missing);
    result.failed = stableSort(result.failed);
    result.reasons = stableSort(result.reasons);
    return result;
  }

  const officialPlugins = Array.isArray(manifest?.officialPlugins) ? manifest.officialPlugins : null;
  if (!officialPlugins) {
    pushFailure(result, 'manifest:official-plugins-array', 'Manifest officialPlugins must be an array.');
  }

  const configPlugins = new Set(Array.isArray(config?.plugin) ? config.plugin : []);
  if (!Array.isArray(config?.plugin)) {
    pushFailure(result, 'config:plugin-array', 'opencode-config/opencode.json plugin field must be an array.');
  }

  for (const pluginComponent of officialPlugins || []) {
    verifyPluginComponent(pluginComponent, rootDir, configPlugins, result);
  }

  verifyDeclaredPluginSurface(rootDir, officialPlugins || [], configPlugins, result);

  result.plugins = stableSort(result.plugins);
  result.missing = stableSort(result.missing);
  result.failed = stableSort(result.failed);
  result.reasons = stableSort(result.reasons);
  result.ok = result.missing.length === 0 && result.failed.length === 0;
  return result;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--root') {
      options.rootDir = argv[index + 1];
      index += 1;
    } else if (token === '--manifest') {
      options.manifestPath = argv[index + 1];
      index += 1;
    } else if (token === '--config') {
      options.configPath = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const output = verifyPluginReadiness(options);
  console.log(JSON.stringify(output, null, 2));
  process.exit(output.ok ? 0 : 1);
}

if (import.meta.main) {
  main();
}
