#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRoot } from './resolve-root.mjs';
import { buildManifestFromConfig } from './generate-mcp-config.mjs';

const ROOT_PLACEHOLDER = '{{OPENCODE_ROOT}}';
const MCP_DESCRIPTIONS = {
  'opencode-dashboard-launcher': 'Auto-starts the OpenCode dashboard when sessions begin',
  'opencode-memory-graph': 'Session-to-error graph builder from OpenCode runtime logs',
  'opencode-context-governor': 'Token budget controller per model/session',
  'opencode-runbooks': 'Auto-remediation based on error signatures',
};

function normalizeLocalArg(value) {
  if (typeof value !== 'string') return value;
  if (value.startsWith(ROOT_PLACEHOLDER)) return value;
  if (value.includes('/') || value.includes('\\')) {
    const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
    return `${ROOT_PLACEHOLDER}/${normalized}`;
  }
  return value;
}

function buildOpencodeOnlyMcpConfig(canonicalConfig) {
  const entries = Object.entries(canonicalConfig?.mcp || {})
    .filter(([name, cfg]) => name.startsWith('opencode-') && cfg?.type === 'local' && Array.isArray(cfg.command) && cfg.command.length > 0);

  const mcpServers = {};
  for (const [name, cfg] of entries) {
    const [command, ...args] = cfg.command;
    mcpServers[name] = {
      command,
      args: args.map(normalizeLocalArg),
      description: MCP_DESCRIPTIONS[name] || `${name} MCP server`,
      enabled: cfg.enabled === true,
    };
  }

  return { mcpServers };
}

function stringifyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function compareFile(filePath, expected) {
  if (!existsSync(filePath)) {
    return { ok: false, reason: 'missing file' };
  }

  const actual = readFileSync(filePath, 'utf8');
  return {
    ok: actual === expected,
    reason: actual === expected ? 'ok' : 'content mismatch',
  };
}

function main() {
  const write = process.argv.includes('--write');
  const root = resolveRoot();
  const canonicalPath = path.join(root, 'opencode-config', 'opencode.json');

  if (!existsSync(canonicalPath)) {
    throw new Error(`Missing canonical config: ${canonicalPath}`);
  }

  const canonicalConfig = readJson(canonicalPath);
  const expectedManifest = stringifyJson(buildManifestFromConfig(canonicalConfig));
  const expectedOpencodeMcpConfig = stringifyJson(buildOpencodeOnlyMcpConfig(canonicalConfig));

  const targets = [
    { path: path.join(root, 'mcp-servers', 'tool-manifest.json'), expected: expectedManifest },
    { path: path.join(root, 'mcp-servers', 'opencode-mcp-config.json'), expected: expectedOpencodeMcpConfig },
    { path: path.join(root, 'mcp-servers', 'opencode-mcp-config.template.json'), expected: expectedOpencodeMcpConfig },
  ];

  const failures = [];

  for (const target of targets) {
    const result = compareFile(target.path, target.expected);
    if (!result.ok) {
      if (write) {
        writeFileSync(target.path, target.expected, 'utf8');
        console.log(`[mcp-mirror-coherence] synced ${path.relative(root, target.path)}`);
      } else {
        failures.push(`${path.relative(root, target.path)}: ${result.reason}`);
      }
    } else {
      console.log(`[mcp-mirror-coherence] ok ${path.relative(root, target.path)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`MCP mirror drift detected:\n- ${failures.join('\n- ')}\nRun: node scripts/mcp-mirror-coherence.mjs --write`);
  }
}

const thisFilePath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(thisFilePath);

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(`[mcp-mirror-coherence] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
