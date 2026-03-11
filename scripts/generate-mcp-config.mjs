#!/usr/bin/env node
/**
 * generate-mcp-config.mjs — Merges canonical MCP config into user config
 * 
 * Usage: bun run scripts/generate-mcp-config.mjs [--dry-run]
 * 
 * Reads canonical opencode-config/opencode.json and merges its MCP entries into
 * the user's opencode.json while preserving user-defined custom MCP entries.
 * Also generates tool-manifest.json for the preload-skills plugin.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { resolveRoot, userConfigDir } from './resolve-root.mjs';

function replaceRootPlaceholder(value, rootForward) {
  if (typeof value === 'string') {
    return value.replaceAll('{{OPENCODE_ROOT}}', rootForward);
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceRootPlaceholder(item, rootForward));
  }

  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, innerValue] of Object.entries(value)) {
      next[key] = replaceRootPlaceholder(innerValue, rootForward);
    }
    return next;
  }

  return value;
}

export function buildManifestFromConfig(config) {
  const mcpMap = config.mcp || config.mcpServers || {};
  return {
    opencode_root: '{{OPENCODE_ROOT}}',
    mcp_servers: Object.entries(mcpMap).map(([name, cfg]) => ({
      name,
      command: cfg.command,
      args: cfg.args,
      enabled: cfg.enabled === true,
      type: cfg.url ? 'remote' : 'local',
    })),
  };
}

export function listSupplementalConfigArtifacts(root) {
  return [
    {
      sourcePath: join(root, 'opencode-config', 'tool-tiers.json'),
      targetName: 'tool-tiers.json',
    },
  ];
}

function normalizeMcpEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return entry;
  }

  if (entry.type !== 'local') {
    return entry;
  }

  const normalized = { ...entry };

  if (Array.isArray(entry.args) && entry.args.length > 0) {
    const commandParts = Array.isArray(entry.command)
      ? entry.command
      : (typeof entry.command === 'string' && entry.command ? [entry.command] : []);

    normalized.command = [...commandParts, ...entry.args];
  }

  delete normalized.args;
  delete normalized.description;
  return normalized;
}

function normalizeMcpMap(mcp) {
  if (!mcp || typeof mcp !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(mcp).map(([name, entry]) => [name, normalizeMcpEntry(entry)]),
  );
}

export function mergeMcpIntoUserConfig(userConfig, sourceConfig) {
  const current = userConfig && typeof userConfig === 'object' ? userConfig : {};
  const source = sourceConfig && typeof sourceConfig === 'object' ? sourceConfig : {};
  const currentMcp = normalizeMcpMap(current.mcp && typeof current.mcp === 'object' ? current.mcp : {});
  const sourceMcp = source.mcp && typeof source.mcp === 'object'
    ? normalizeMcpMap(source.mcp)
    : normalizeMcpMap(source.mcpServers && typeof source.mcpServers === 'object' ? source.mcpServers : {});

  return {
    ...current,
    mcp: {
      ...currentMcp,
      ...sourceMcp,
    },
  };
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const writeRepoArtifacts = process.argv.includes('--write-repo');
  const root = resolveRoot();

  // Normalize to forward slashes (MCP config uses forward slashes even on Windows)
  const rootForward = root.replace(/\\/g, '/');

  const canonicalConfigPath = join(root, 'opencode-config', 'opencode.json');
  const userOpencodePath = join(userConfigDir(), 'opencode.json');

  if (!existsSync(canonicalConfigPath)) {
    console.error(`[generate-mcp-config] Canonical config not found: ${canonicalConfigPath}`);
    console.error('Expected: opencode-config/opencode.json');
    process.exit(1);
  }

  const canonicalConfig = JSON.parse(readFileSync(canonicalConfigPath, 'utf8'));
  const resolvedCanonical = replaceRootPlaceholder(canonicalConfig, rootForward);
  const existingUserConfig = existsSync(userOpencodePath)
    ? JSON.parse(readFileSync(userOpencodePath, 'utf8'))
    : {};
  const mergedUserConfig = mergeMcpIntoUserConfig(existingUserConfig, resolvedCanonical);
  const mergedJson = JSON.stringify(mergedUserConfig, null, 2);

  // Validate JSON before writing
  try {
    JSON.parse(mergedJson);
  } catch (e) {
    console.error('[generate-mcp-config] Generated config is not valid JSON:', e.message);
    process.exit(1);
  }

  if (dryRun) {
    console.log('[generate-mcp-config] DRY RUN — would generate:');
    console.log(`  Root: ${rootForward}`);
    console.log(`  Canonical Source: ${canonicalConfigPath}`);
    console.log(`  User Config Target: ${userOpencodePath}`);
    console.log('\nMerged user config preview:');
    console.log(mergedJson);
    process.exit(0);
  }

  console.log(`  Root detected as: ${rootForward}`);

  mkdirSync(userConfigDir(), { recursive: true });
  writeFileSync(userOpencodePath, mergedJson, 'utf8');
  console.log(`[generate-mcp-config] Synced MCP entries into: ${userOpencodePath}`);

  if (writeRepoArtifacts) {
    console.log('[generate-mcp-config] --write-repo is deprecated for MCP config artifacts; canonical source is opencode-config/opencode.json');
  }

  // --- Also generate tool-manifest.json for preload-skills ---
  const manifest = buildManifestFromConfig(mergedUserConfig);

  const userManifestPath = join(userConfigDir(), 'tool-manifest.json');
  writeFileSync(userManifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`[generate-mcp-config] Synced: ${userManifestPath}`);

  for (const artifact of listSupplementalConfigArtifacts(root)) {
    if (!existsSync(artifact.sourcePath)) {
      console.warn(`[generate-mcp-config] Supplemental artifact missing, skipping: ${artifact.sourcePath}`);
      continue;
    }

    const targetPath = join(userConfigDir(), artifact.targetName);
    writeFileSync(targetPath, readFileSync(artifact.sourcePath, 'utf8'), 'utf8');
    console.log(`[generate-mcp-config] Synced: ${targetPath}`);
  }

  if (writeRepoArtifacts) {
    const manifestPath = join(root, 'mcp-servers', 'tool-manifest.json');
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`[generate-mcp-config] Generated (repo): ${manifestPath}`);
  }
}

const thisFilePath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(thisFilePath);
if (isDirectRun) {
  main();
}
