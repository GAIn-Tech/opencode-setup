#!/usr/bin/env bun

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, '..');

export const REASON_CODES = Object.freeze({
  LOCAL_DEPENDENCY_IN_RELEASE_PATH: 'LOCAL_DEPENDENCY_IN_RELEASE_PATH',
  PARITY_SOURCE_NOT_SOURCE_CONTROLLED: 'PARITY_SOURCE_NOT_SOURCE_CONTROLLED',
  PARITY_PROOF_GENERATED_FROM_GOVERNED_INPUTS: 'PARITY_PROOF_GENERATED_FROM_GOVERNED_INPUTS',
});

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function normalizePathForOutput(filePath) {
  return filePath.split(path.sep).join('/');
}

function insideRoot(rootDir, candidate) {
  const normalizedRoot = path.resolve(rootDir);
  const normalizedCandidate = path.resolve(candidate);
  const rootWithSep = normalizedRoot.endsWith(path.sep) ? normalizedRoot : `${normalizedRoot}${path.sep}`;
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(rootWithSep);
}

function isLocalCoupledPath(value) {
  return /(^|[\\/])local([\\/]|$)/i.test(String(value || ''));
}

function collectStringPaths(value, prefix = '') {
  if (typeof value === 'string') {
    return [{ path: prefix || '(root)', value }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectStringPaths(item, prefix ? `${prefix}.${index}` : `${index}`));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).flatMap(([key, nested]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    return collectStringPaths(nested, next);
  });
}

function listPluginMetadata(rootDir) {
  const pluginsDir = path.join(rootDir, 'plugins');
  if (!existsSync(pluginsDir)) return [];

  return readdirSync(pluginsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `plugins/${entry.name}/info.md`)
    .filter((relativePath) => existsSync(path.join(rootDir, relativePath)));
}

function gatherGovernedInputs(rootDir, manifestPath, configPath, manifest) {
  const configuredInputs = Array.isArray(manifest?.portability?.pluginParity?.evidenceInputs)
    ? manifest.portability.pluginParity.evidenceInputs
    : [];

  const defaults = [
    path.relative(rootDir, manifestPath),
    path.relative(rootDir, configPath),
    ...listPluginMetadata(rootDir),
  ].map(normalizePathForOutput);

  const selected = configuredInputs.length > 0 ? configuredInputs : defaults;
  return [...new Set(selected.map((item) => String(item || '').trim()).filter(Boolean))];
}

function validateGovernedInputs(rootDir, governedInputs) {
  const issues = [];
  for (const input of governedInputs) {
    const resolved = path.resolve(rootDir, input);
    if (!insideRoot(rootDir, resolved)) {
      issues.push({ input, issue: 'outside-root' });
      continue;
    }

    const rel = normalizePathForOutput(path.relative(rootDir, resolved));
    if (isLocalCoupledPath(rel)) {
      issues.push({ input, issue: 'local-coupled' });
      continue;
    }

    if (!existsSync(resolved)) {
      issues.push({ input, issue: 'missing' });
      continue;
    }
  }

  return issues;
}

function buildProofDigest({ governedInputs, manifest, config, rootDir }) {
  const manifestPlugins = Array.isArray(manifest?.officialPlugins)
    ? manifest.officialPlugins
      .map((plugin) => String(plugin?.package || '').trim())
      .filter(Boolean)
      .sort()
    : [];

  const configuredPlugins = Array.isArray(config?.plugin)
    ? config.plugin.map((item) => String(item || '').trim()).filter(Boolean).sort()
    : [];

  const metadataStats = governedInputs
    .map((input) => {
      const resolved = path.resolve(rootDir, input);
      const stat = statSync(resolved);
      return {
        input,
        size: stat.size,
        mtimeMs: Number(stat.mtimeMs),
      };
    })
    .sort((a, b) => a.input.localeCompare(b.input));

  const payload = {
    governedInputs: [...governedInputs].sort(),
    manifestPlugins,
    configuredPlugins,
    metadataStats,
  };

  return {
    payload,
    digest: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  };
}

function failure(reasonCode, reason, details = {}) {
  return {
    ok: false,
    reasonCode,
    reason,
    details,
  };
}

function success(details = {}) {
  return {
    ok: true,
    reasonCode: REASON_CODES.PARITY_PROOF_GENERATED_FROM_GOVERNED_INPUTS,
    reason: 'parity proof generated from governed source-controlled inputs',
    details,
  };
}

export function verifyPluginParity(options = {}) {
  const rootDir = path.resolve(options.rootDir || DEFAULT_ROOT);
  const manifestPath = path.resolve(options.manifestPath || path.join(rootDir, 'scripts', 'bootstrap-manifest.json'));
  const configPath = path.resolve(options.configPath || path.join(rootDir, 'opencode-config', 'opencode.json'));

  const manifest = readJson(manifestPath);
  const config = readJson(configPath);

  const localDependencyPaths = collectStringPaths(manifest)
    .filter((entry) => isLocalCoupledPath(entry.value))
    .map((entry) => `${entry.path}=${entry.value}`);

  if (localDependencyPaths.length > 0) {
    return failure(
      REASON_CODES.LOCAL_DEPENDENCY_IN_RELEASE_PATH,
      'release decision path references gitignored local inputs',
      { localDependencyPaths },
    );
  }

  const governedInputs = gatherGovernedInputs(rootDir, manifestPath, configPath, manifest);
  const issues = validateGovernedInputs(rootDir, governedInputs);
  if (issues.length > 0) {
    return failure(
      REASON_CODES.PARITY_SOURCE_NOT_SOURCE_CONTROLLED,
      'parity source inputs must be source-controlled or deterministic governed paths',
      { issues },
    );
  }

  const proof = buildProofDigest({ governedInputs, manifest, config, rootDir });
  return success({
    governedInputs,
    parityProofDigest: proof.digest,
    parityProof: proof.payload,
  });
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') options.rootDir = argv[i + 1], i += 1;
    else if (arg === '--manifest') options.manifestPath = argv[i + 1], i += 1;
    else if (arg === '--config') options.configPath = argv[i + 1], i += 1;
  }
  return options;
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = verifyPluginParity(options);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      reasonCode: 'PARITY_FATAL_ERROR',
      reason: error.message,
    }, null, 2));
    process.exit(2);
  }
}
