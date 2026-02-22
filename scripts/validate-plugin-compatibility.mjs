#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { resolveRoot } from './resolve-root.mjs';

const ROOT = resolveRoot();

function fail(message) {
  throw new Error(`validate-plugin-compatibility: ${message}`);
}

function normalizeName(entry) {
  if (typeof entry === 'string') return entry.trim();
  if (entry && typeof entry === 'object') {
    const name = entry.name || entry.id;
    if (typeof name === 'string') return name.trim();
  }
  return '';
}

function main() {
  const configPath = path.join(ROOT, 'opencode-config', 'opencode.json');
  const pluginsDir = path.join(ROOT, 'plugins');
  const lifecyclePath = path.join(ROOT, '.opencode', 'plugin-runtime-state.json');

  if (!fs.existsSync(configPath)) {
    fail(`missing config file: ${configPath}`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const configuredPlugins = (Array.isArray(config.plugins) ? config.plugins : [])
    .map(normalizeName)
    .filter(Boolean);

  const mcpEntries = Object.entries(config.mcp || {});
  const enabledMcp = mcpEntries
    .filter(([, value]) => value && typeof value === 'object' && value.enabled === true)
    .map(([name]) => name);

  const discoveredPlugins = fs.existsSync(pluginsDir)
    ? fs
        .readdirSync(pluginsDir)
        .filter((entry) => fs.statSync(path.join(pluginsDir, entry)).isDirectory())
    : [];

  const duplicateConfigured = configuredPlugins.filter((name, idx) => configuredPlugins.indexOf(name) !== idx);
  if (duplicateConfigured.length > 0) {
    fail(`duplicate configured plugins found: ${[...new Set(duplicateConfigured)].join(', ')}`);
  }

  const missingConfigured = configuredPlugins.filter((name) => !discoveredPlugins.includes(name));
  if (missingConfigured.length > 0) {
    fail(`configured plugins missing in plugins/ directory: ${missingConfigured.join(', ')}`);
  }

  const duplicateMcp = enabledMcp.filter((name, idx) => enabledMcp.indexOf(name) !== idx);
  if (duplicateMcp.length > 0) {
    fail(`duplicate enabled MCP entries found: ${[...new Set(duplicateMcp)].join(', ')}`);
  }

  for (const [name, cfg] of mcpEntries) {
    if (!cfg || typeof cfg !== 'object') {
      fail(`mcp.${name} must be an object`);
    }
    if (!Object.prototype.hasOwnProperty.call(cfg, 'enabled')) {
      fail(`mcp.${name} missing required 'enabled' property`);
    }
  }

  if (fs.existsSync(lifecyclePath)) {
    const runtime = JSON.parse(fs.readFileSync(lifecyclePath, 'utf8'));
    if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) {
      fail('plugin-runtime-state.json must be an object map keyed by plugin name');
    }
  }

  console.log('validate-plugin-compatibility: PASS');
  console.log(`- configured plugins: ${configuredPlugins.length}`);
  console.log(`- discovered plugins: ${discoveredPlugins.length}`);
  console.log(`- enabled mcp servers: ${enabledMcp.length}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
