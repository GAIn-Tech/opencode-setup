#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_MANIFEST_PATH = path.join(DEFAULT_ROOT, 'scripts', 'bootstrap-manifest.json');
const DEFAULT_CONFIG_PATH = path.join(DEFAULT_ROOT, 'opencode-config', 'opencode.json');

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

function pushFailure(result, key, reason) {
  result.failed.push(key);
  result.reasons.push(reason);
}

function pushMissing(result, key, reason) {
  result.missing.push(key);
  result.reasons.push(reason);
}

function validateComponentShape(component, componentKind, result) {
  const prefix = `${componentKind}:${component?.id || 'unknown'}`;

  if (!isObject(component)) {
    pushFailure(result, `${componentKind}:invalid-object`, `${componentKind} entry must be an object.`);
    return false;
  }

  if (typeof component.id !== 'string' || component.id.trim().length === 0) {
    pushFailure(result, `${prefix}:missing-id`, `Missing id for ${componentKind} entry.`);
    return false;
  }

  if (!isObject(component.ownership)) {
    pushFailure(result, `${prefix}:missing-ownership`, `Missing ownership metadata for ${prefix}.`);
    return false;
  }

  const { owner, contact, failureAction } = component.ownership;
  if (typeof owner !== 'string' || owner.trim().length === 0) {
    pushFailure(result, `${prefix}:ownership:owner`, `Missing ownership.owner for ${prefix}.`);
  }
  if (typeof contact !== 'string' || contact.trim().length === 0) {
    pushFailure(result, `${prefix}:ownership:contact`, `Missing ownership.contact for ${prefix}.`);
  }
  if (typeof failureAction !== 'string' || failureAction.trim().length === 0) {
    pushFailure(result, `${prefix}:ownership:failure-action`, `Missing ownership.failureAction for ${prefix}.`);
  }

  if (!isObject(component.loadChecks)) {
    pushFailure(result, `${prefix}:missing-load-checks`, `Missing loadChecks for ${prefix}.`);
    return false;
  }

  if (!isStringArray(component.loadChecks.requiredFiles)) {
    pushFailure(result, `${prefix}:required-files`, `loadChecks.requiredFiles must be a non-empty string array for ${prefix}.`);
  }

  if (!isStringArray(component.loadChecks.entryPoints)) {
    pushFailure(result, `${prefix}:entry-points`, `loadChecks.entryPoints must be a non-empty string array for ${prefix}.`);
  }

  return true;
}

function verifyPaths(component, componentKind, rootDir, result) {
  const prefix = `${componentKind}:${component.id}`;
  const requiredFiles = component.loadChecks.requiredFiles || [];
  const entryPoints = component.loadChecks.entryPoints || [];

  for (const relativeFile of requiredFiles) {
    const fullPath = path.join(rootDir, relativeFile);
    if (!existsSync(fullPath)) {
      pushMissing(result, `${prefix}:required:${relativeFile}`, `Missing required file for ${prefix}: ${relativeFile}`);
    }
  }

  for (const relativeEntry of entryPoints) {
    const fullPath = path.join(rootDir, relativeEntry);
    if (!existsSync(fullPath)) {
      pushMissing(result, `${prefix}:entry:${relativeEntry}`, `Missing entry point for ${prefix}: ${relativeEntry}`);
    }
  }
}

function verifyPluginConfigReference(pluginComponent, pluginSpecs, result) {
  const spec = pluginComponent?.loadChecks?.opencodePluginSpec;
  if (typeof spec !== 'string' || spec.trim().length === 0) {
    pushFailure(
      result,
      `plugin:${pluginComponent.id}:missing-opencode-plugin-spec`,
      `Missing loadChecks.opencodePluginSpec for plugin:${pluginComponent.id}.`,
    );
    return;
  }

  if (!pluginSpecs.has(spec)) {
    pushFailure(
      result,
      `plugin:${pluginComponent.id}:opencode-config:missing-spec:${spec}`,
      `Plugin spec missing from opencode-config/opencode.json for plugin:${pluginComponent.id}: ${spec}`,
    );
  }
}

function verifyOfficialPluginCoverage(officialPlugins, pluginSpecs, result) {
  const manifestSpecs = new Set();

  for (const pluginComponent of officialPlugins) {
    const spec = pluginComponent?.loadChecks?.opencodePluginSpec;
    if (typeof spec === 'string' && spec.trim().length > 0) {
      manifestSpecs.add(spec);
    }
  }

  for (const pluginSpec of pluginSpecs) {
    if (!manifestSpecs.has(pluginSpec)) {
      pushFailure(
        result,
        `manifest:official-plugins:missing-from-manifest:${pluginSpec}`,
        `Official plugin declared in opencode-config/opencode.json is missing from manifest: ${pluginSpec}`,
      );
    }
  }
}

export function verifyBootstrapManifest(options = {}) {
  const rootDir = path.resolve(options.rootDir || DEFAULT_ROOT);
  const manifestPath = path.resolve(options.manifestPath || DEFAULT_MANIFEST_PATH);
  const configPath = path.resolve(options.configPath || path.join(rootDir, 'opencode-config', 'opencode.json'));

  const result = {
    valid: true,
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
    result.valid = false;
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
    result.valid = false;
    result.missing = stableSort(result.missing);
    result.failed = stableSort(result.failed);
    result.reasons = stableSort(result.reasons);
    return result;
  }

  try {
    config = readJson(configPath);
  } catch (error) {
    pushFailure(result, 'config:json-parse', `Unable to parse opencode-config JSON: ${error.message}`);
    result.valid = false;
    result.missing = stableSort(result.missing);
    result.failed = stableSort(result.failed);
    result.reasons = stableSort(result.reasons);
    return result;
  }

  if (!isObject(manifest)) {
    pushFailure(result, 'manifest:invalid-object', 'Manifest root must be an object.');
  }

  if (!Number.isInteger(manifest?.schemaVersion) || manifest.schemaVersion <= 0) {
    pushFailure(result, 'manifest:schema-version', 'Manifest schemaVersion must be a positive integer.');
  }

  if (!isObject(manifest?.ownershipDefaults)) {
    pushFailure(result, 'manifest:ownership-defaults', 'Manifest ownershipDefaults must be an object.');
  }

  const core = Array.isArray(manifest?.core) ? manifest.core : null;
  if (!core) {
    pushFailure(result, 'manifest:core-array', 'Manifest core must be an array.');
  }

  const officialPlugins = Array.isArray(manifest?.officialPlugins) ? manifest.officialPlugins : null;
  if (!officialPlugins) {
    pushFailure(result, 'manifest:official-plugins-array', 'Manifest officialPlugins must be an array.');
  }

  const pluginSpecs = new Set(Array.isArray(config?.plugin) ? config.plugin : []);
  if (!Array.isArray(config?.plugin)) {
    pushFailure(result, 'config:plugin-array', 'opencode-config/opencode.json plugin field must be an array.');
  }

  for (const component of core || []) {
    if (!validateComponentShape(component, 'core', result)) {
      continue;
    }
    verifyPaths(component, 'core', rootDir, result);
  }

  for (const pluginComponent of officialPlugins || []) {
    if (!validateComponentShape(pluginComponent, 'plugin', result)) {
      continue;
    }

    if (typeof pluginComponent.package !== 'string' || pluginComponent.package.trim().length === 0) {
      pushFailure(
        result,
        `plugin:${pluginComponent.id}:package`,
        `Missing package field for plugin:${pluginComponent.id}.`,
      );
    }

    verifyPaths(pluginComponent, 'plugin', rootDir, result);
    verifyPluginConfigReference(pluginComponent, pluginSpecs, result);
  }

  if (officialPlugins && Array.isArray(config?.plugin)) {
    verifyOfficialPluginCoverage(officialPlugins, pluginSpecs, result);
  }

  result.missing = stableSort(result.missing);
  result.failed = stableSort(result.failed);
  result.reasons = stableSort(result.reasons);
  result.valid = result.missing.length === 0 && result.failed.length === 0;
  return result;
}

function main() {
  const output = verifyBootstrapManifest({
    rootDir: DEFAULT_ROOT,
    manifestPath: DEFAULT_MANIFEST_PATH,
    configPath: DEFAULT_CONFIG_PATH,
  });

  console.log(JSON.stringify(output, null, 2));
  process.exit(output.valid ? 0 : 1);
}

if (import.meta.main) {
  main();
}
