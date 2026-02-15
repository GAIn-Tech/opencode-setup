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

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Root resolution (same logic as resolve-root.mjs) ---
function resolveRoot() {
  if (process.env.OPENCODE_ROOT) {
    const p = resolve(process.env.OPENCODE_ROOT);
    if (existsSync(join(p, 'package.json'))) return p;
    console.warn(`[generate-mcp-config] OPENCODE_ROOT="${p}" has no package.json, trying git...`);
  }
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    if (existsSync(join(gitRoot, 'package.json'))) return gitRoot;
  } catch { /* not in git repo */ }
  
  // Fall back to parent of scripts/
  const parentDir = resolve(__dirname, '..');
  if (existsSync(join(parentDir, 'package.json'))) return parentDir;
  
  throw new Error(
    '[generate-mcp-config] Cannot resolve project root.\n' +
    'Set OPENCODE_ROOT env var, or run from within the git repo.'
  );
}

// --- Main ---
const dryRun = process.argv.includes('--dry-run');
const root = resolveRoot();

// Normalize to forward slashes (MCP config uses forward slashes even on Windows)
const rootForward = root.replace(/\\/g, '/');

const mcpDir = join(root, 'mcp-servers');
const templatePath = join(mcpDir, 'opencode-mcp-config.template.json');
const outputPath = join(mcpDir, 'opencode-mcp-config.json');

if (!existsSync(templatePath)) {
  console.error(`[generate-mcp-config] Template not found: ${templatePath}`);
  console.error('Expected: mcp-servers/opencode-mcp-config.template.json');
  process.exit(1);
}

const template = readFileSync(templatePath, 'utf8');
const resolved = template;

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
