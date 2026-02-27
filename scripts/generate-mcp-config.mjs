#!/usr/bin/env node
/**
 * generate-mcp-config.mjs — Generates portable MCP artifacts from template
 * 
 * Usage: bun run scripts/generate-mcp-config.mjs [--dry-run]
 * 
 * Reads opencode-mcp-config.template.json and writes a portable
 * opencode-mcp-config.json (placeholder-based).
 * Also generates tool-manifest.json for the preload-skills plugin.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
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

// --- Main ---
const dryRun = process.argv.includes('--dry-run');
const root = resolveRoot();

// Normalize to forward slashes (MCP config uses forward slashes even on Windows)
const rootForward = root.replace(/\\/g, '/');

const mcpDir = join(root, 'mcp-servers');
const templatePath = join(mcpDir, 'opencode-mcp-config.template.json');
const outputPath = join(mcpDir, 'opencode-mcp-config.json');
const userOutputPath = join(userConfigDir(), 'opencode-mcp-config.json');

if (!existsSync(templatePath)) {
  console.error(`[generate-mcp-config] Template not found: ${templatePath}`);
  console.error('Expected: mcp-servers/opencode-mcp-config.template.json');
  process.exit(1);
}

const template = readFileSync(templatePath, 'utf8');
const parsedTemplate = JSON.parse(template);
const resolvedObject = replaceRootPlaceholder(parsedTemplate, rootForward);
const resolved = JSON.stringify(resolvedObject, null, 2);

// Validate JSON before writing
try {
  JSON.parse(resolved);
} catch (e) {
  console.error('[generate-mcp-config] Generated config is not valid JSON:', e.message);
  process.exit(1);
}

if (dryRun) {
  console.log('[generate-mcp-config] DRY RUN — would generate:');
  console.log(`  Root: ${rootForward}`);
  console.log(`  Template: ${templatePath}`);
  console.log(`  Output: ${outputPath}`);
  console.log('\nGenerated config:');
  console.log(resolved);
  process.exit(0);
}

writeFileSync(outputPath, resolved, 'utf8');
console.log(`[generate-mcp-config] Generated: ${outputPath}`);
console.log(`  Root detected as: ${rootForward}`);

mkdirSync(userConfigDir(), { recursive: true });
writeFileSync(userOutputPath, resolved, 'utf8');
console.log(`[generate-mcp-config] Synced: ${userOutputPath}`);

// --- Also generate tool-manifest.json for preload-skills ---
const config = JSON.parse(resolved);
const manifest = {
  generated_at: new Date().toISOString(),
  opencode_root: '{{OPENCODE_ROOT}}',
  mcp_servers: Object.entries(config.mcpServers || {}).map(([name, cfg]) => ({
    name,
    command: cfg.command,
    enabled: !cfg.disabled,
    type: cfg.url ? 'remote' : 'local',
  })),
};

const manifestPath = join(mcpDir, 'tool-manifest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log(`[generate-mcp-config] Generated: ${manifestPath}`);
