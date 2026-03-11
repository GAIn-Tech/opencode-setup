#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveRoot, userConfigDir, userDataDir } from './resolve-root.mjs';

const root = resolveRoot();
const isWindows = process.platform === 'win32';

function commandLocation(command) {
  const locator = isWindows ? 'where' : 'which';
  const result = spawnSync(locator, [command], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const firstLine = (result.stdout || '').split(/\r?\n/).find((line) => line.trim());
  return firstLine ? firstLine.trim() : null;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function printCheck(name, passed, details = null) {
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}`);
  if (details) console.log(`  ${details}`);
}

export function normalizePluginName(specifier) {
  if (typeof specifier !== 'string') return '';
  const s = specifier.trim();
  if (!s) return '';

  if (s.startsWith('@')) {
    const slash = s.indexOf('/');
    if (slash === -1) return s;
    const versionSep = s.indexOf('@', slash + 1);
    return versionSep === -1 ? s : s.slice(0, versionSep);
  }

  const versionSep = s.indexOf('@');
  return versionSep === -1 ? s : s.slice(0, versionSep);
}

export function extractEnvPlaceholders(value, found = new Set()) {
  if (typeof value === 'string') {
    const matches = value.matchAll(/\{env:([A-Z0-9_]+)\}/g);
    for (const m of matches) found.add(m[1]);
    return found;
  }

  if (Array.isArray(value)) {
    for (const item of value) extractEnvPlaceholders(item, found);
    return found;
  }

  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) extractEnvPlaceholders(v, found);
  }

  return found;
}

export function getEnabledLocalMcpCommands(mcpConfig) {
  if (!mcpConfig || typeof mcpConfig !== 'object') return [];

  const commands = [];
  for (const [name, cfg] of Object.entries(mcpConfig)) {
    if (!cfg || typeof cfg !== 'object') continue;
    if (cfg.enabled !== true) continue;
    if (cfg.type !== 'local') continue;
    if (!Array.isArray(cfg.command) || cfg.command.length === 0) continue;
    if (typeof cfg.command[0] !== 'string' || !cfg.command[0].trim()) continue;
    commands.push({ name, command: cfg.command[0].trim() });
  }

  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

function checkUserConfigSyncFailures() {
  const failures = [];
  const cfgHome = userConfigDir();
  const dataHome = userDataDir();

  const requiredFiles = [
    'opencode.json',
    'antigravity.json',
    'oh-my-opencode.json',
    'compound-engineering.json',
    'rate-limit-fallback.json',
    'supermemory.json',
    'tool-tiers.json',
    'tool-manifest.json',
  ];

  for (const name of requiredFiles) {
    const target = path.join(cfgHome, name);
    if (!existsSync(target)) failures.push(`Missing user config file: ${target}`);
  }

  const requiredDirs = ['skills', 'agents', 'commands', 'models', 'docs', 'supermemory', 'learning-updates'];
  for (const name of requiredDirs) {
    const target = path.join(cfgHome, name);
    if (!existsSync(target)) failures.push(`Missing user config directory: ${target}`);
  }

  const dataConfig = path.join(dataHome, 'config.yaml');
  if (!existsSync(dataConfig)) failures.push(`Missing user data config: ${dataConfig}`);

  return failures;
}

function checkRegistryMirrorFailures() {
  const failures = [];
  const registryPath = path.join(root, 'opencode-config', 'skills', 'registry.json');
  if (!existsSync(registryPath)) return ['Missing repo skill registry: opencode-config/skills/registry.json'];

  const skillsRoot = path.join(root, 'opencode-config', 'skills');
  const userSkillsRoot = path.join(userConfigDir(), 'skills');

  const stack = [skillsRoot];
  const relativeSkillPaths = [];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && entry.name === 'SKILL.md') {
        relativeSkillPaths.push(path.relative(skillsRoot, path.dirname(full)));
      }
    }
  }

  // Registry must exist, but mirror only what the repo actually ships.
  readJson(registryPath);

  for (const skillName of relativeSkillPaths) {
    const skillFile = path.join(userSkillsRoot, skillName, 'SKILL.md');
    if (!existsSync(skillFile)) {
      failures.push(`Missing mirrored skill: ${skillName} (${skillFile})`);
    }
  }

  return failures;
}

function checkAgentMirrorFailures() {
  const failures = [];
  const repoAgentsDir = path.join(root, 'opencode-config', 'agents');
  const userAgentsDir = path.join(userConfigDir(), 'agents');

  if (!existsSync(repoAgentsDir)) return ['Missing repo agents directory: opencode-config/agents'];
  if (!existsSync(userAgentsDir)) return [`Missing user agents directory: ${userAgentsDir}`];

  const repoAgents = readdirSync(repoAgentsDir).filter((f) => f.endsWith('.md'));
  for (const agent of repoAgents) {
    const target = path.join(userAgentsDir, agent);
    if (!existsSync(target)) failures.push(`Missing mirrored agent: ${agent}`);
  }

  return failures;
}

function checkPluginDeclarationFailures(repoConfig, userConfig) {
  const failures = [];

  const repoPlugins = (Array.isArray(repoConfig.plugin) ? repoConfig.plugin : [])
    .map(normalizePluginName)
    .filter(Boolean)
    .sort();
  const userPlugins = (Array.isArray(userConfig.plugin) ? userConfig.plugin : [])
    .map(normalizePluginName)
    .filter(Boolean)
    .sort();

  for (const plugin of repoPlugins) {
    if (!userPlugins.includes(plugin)) failures.push(`Missing plugin declaration in user config: ${plugin}`);
  }

  return failures;
}

function checkEnabledLocalMcpCommandFailures(userConfig) {
  const failures = [];
  const enabledLocal = getEnabledLocalMcpCommands(userConfig.mcp || {});
  for (const item of enabledLocal) {
    if (!commandLocation(item.command)) {
      failures.push(`Missing local MCP command '${item.command}' for enabled server '${item.name}'`);
    }
  }
  return failures;
}

export function checkRequiredEnvFailures(userConfig, strictMode) {
  const failures = [];

  const enabledMcpOnly = {};
  for (const [name, cfg] of Object.entries(userConfig.mcp || {})) {
    if (cfg && typeof cfg === 'object' && cfg.enabled === true) {
      enabledMcpOnly[name] = cfg;
    }
  }

  const requiredEnvVars = extractEnvPlaceholders({
    provider: userConfig.provider || {},
    mcp: enabledMcpOnly,
  });

  for (const envVar of requiredEnvVars) {
    const isSet = typeof process.env[envVar] === 'string' && process.env[envVar].trim().length > 0;
    if (!isSet) failures.push(`Missing required env var from active config: ${envVar}`);
  }

  // Strict mode enforces presence of required placeholders only when placeholders exist.
  // A config with zero env placeholders is valid.

  return failures;
}

export function runPortabilityVerification({ strict = false } = {}) {
  const failures = [];

  const repoConfigPath = path.join(root, 'opencode-config', 'opencode.json');
  const userConfigPath = path.join(userConfigDir(), 'opencode.json');

  if (!existsSync(repoConfigPath)) {
    failures.push(`Missing repo config: ${repoConfigPath}`);
    return { ok: false, failures };
  }
  if (!existsSync(userConfigPath)) {
    failures.push(`Missing user config: ${userConfigPath}`);
    return { ok: false, failures };
  }

  const repoConfig = readJson(repoConfigPath);
  const userConfig = readJson(userConfigPath);

  failures.push(...checkUserConfigSyncFailures());
  failures.push(...checkRegistryMirrorFailures());
  failures.push(...checkAgentMirrorFailures());
  failures.push(...checkPluginDeclarationFailures(repoConfig, userConfig));
  failures.push(...checkEnabledLocalMcpCommandFailures(userConfig));
  failures.push(...checkRequiredEnvFailures(userConfig, strict));

  return {
    ok: failures.length === 0,
    failures,
  };
}

function main() {
  const strict = process.argv.includes('--strict');
  console.log(`== Portability Verification${strict ? ' (strict)' : ''} ==`);

  const result = runPortabilityVerification({ strict });

  printCheck('Portable clone/setup transfer', result.ok, result.ok ? 'All transfer invariants satisfied.' : `${result.failures.length} issue(s) detected.`);

  if (!result.ok) {
    for (const failure of result.failures) {
      console.log(`  - ${failure}`);
    }
    process.exit(1);
  }
}

const thisFilePath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(thisFilePath);
if (isDirectRun) {
  main();
}
