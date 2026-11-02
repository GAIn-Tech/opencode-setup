#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();
const DEFAULT_LATEST_ALLOWLIST = Object.freeze(['playwright', 'sequentialthinking', 'websearch']);
const RELEASE_ENV_KEYS = Object.freeze([
  'OPENCODE_SUPPLY_CHAIN_RELEASE_MODE',
  'OPENCODE_RELEASE_MODE',
  'OPENCODE_PORTABILITY_STRICT',
]);

function isTruthyEnv(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'release', 'strict'].includes(normalized);
}

export function detectReleaseMode({ argv = process.argv, env = process.env } = {}) {
  if (argv.includes('--release') || argv.includes('--release-mode') || argv.includes('--strict')) {
    return true;
  }
  return RELEASE_ENV_KEYS.some((key) => isTruthyEnv(env[key]));
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function parseAllowlist({ env = process.env, releaseMode = false } = {}) {
  if (releaseMode) {
    return new Set();
  }
  const raw = String(env.OPENCODE_ALLOW_LATEST_MCP || '').trim();
  if (!raw) {
    return new Set(DEFAULT_LATEST_ALLOWLIST);
  }
  return new Set(raw.split(',').map((item) => item.trim()).filter(Boolean));
}

export function getActiveLatestBypassKeys(env = process.env) {
  return Object.keys(env)
    .filter((key) => /^OPENCODE_.*ALLOW_LATEST/.test(key))
    .filter((key) => String(env[key] || '').trim().length > 0);
}

export function evaluateMcpLatestPolicy({ mcp = {}, env = process.env, releaseMode = false } = {}) {
  const failures = [];
  const warnings = [];
  const allowlistedLatest = parseAllowlist({ env, releaseMode });
  const activeBypassKeys = releaseMode ? getActiveLatestBypassKeys(env) : [];

  for (const [name, entry] of Object.entries(mcp || {})) {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.command)) continue;
    const joined = entry.command.join(' ');
    if (!joined.includes('@latest')) continue;

    if (releaseMode) {
      const bypassNote = activeBypassKeys.length > 0
        ? ` Active bypass env ignored in release mode: ${activeBypassKeys.join(', ')}.`
        : '';
      failures.push(`[SCG_RELEASE_LATEST_BLOCKED] MCP '${name}' uses @latest; release mode requires pinned versions.${bypassNote}`);
      continue;
    }

    if (allowlistedLatest.has(name)) {
      warnings.push(`[SCG_ALLOWLISTED_LATEST] MCP '${name}' uses @latest (allowlisted)`);
      continue;
    }
    failures.push("[SCG_LATEST_BLOCKED] MCP '" + name + "' uses @latest. Pin explicit versions or allowlist via OPENCODE_ALLOW_LATEST_MCP.");
  }

  return { failures, warnings };
}

export function evaluatePluginLatestPolicy({ plugins = [], env = process.env, releaseMode = false } = {}) {
  const failures = [];
  const warnings = [];
  const allowlistedLatest = parseAllowlist({ env, releaseMode });
  const activeBypassKeys = releaseMode ? getActiveLatestBypassKeys(env) : [];

  for (const pluginSpec of plugins) {
    if (typeof pluginSpec !== 'string') continue;
    if (!pluginSpec.includes('@latest')) continue;

    // Parse plugin name from spec (e.g., "@tarquinen/opencode-dcp@latest" -> "@tarquinen/opencode-dcp")
    const atIndex = pluginSpec.lastIndexOf('@');
    const pluginName = atIndex > 0 ? pluginSpec.substring(0, atIndex) : pluginSpec;

    if (releaseMode) {
      const bypassNote = activeBypassKeys.length > 0
        ? ` Active bypass env ignored in release mode: ${activeBypassKeys.join(', ')}.`
        : '';
      failures.push(`[SCG_PLUGIN_LATEST_BLOCKED] Plugin '${pluginSpec}' uses @latest; release mode requires pinned versions.${bypassNote}`);
      continue;
    }

    if (allowlistedLatest.has(pluginName)) {
      warnings.push(`[SCG_PLUGIN_ALLOWLISTED_LATEST] Plugin '${pluginSpec}' uses @latest (allowlisted)`);
      continue;
    }
    failures.push(`[SCG_PLUGIN_LATEST_BLOCKED] Plugin '${pluginSpec}' uses @latest. Pin explicit versions or allowlist via OPENCODE_ALLOW_LATEST_MCP.`);
  }

  return { failures, warnings };
}

function main() {
  const failures = [];
  const warnings = [];
  const releaseMode = detectReleaseMode();

  const packageJsonPath = path.join(root, 'package.json');
  const lockfilePath = path.join(root, 'bun.lock');
  const configPath = path.join(root, 'opencode-config', 'opencode.json');
  const distillRunnerPath = path.join(root, 'scripts', 'run-distill-mcp.mjs');

  const pkg = readJson(packageJsonPath);
  const packageManager = String(pkg.packageManager || '').trim();
  if (!/^bun@\d+\.\d+\.\d+$/.test(packageManager)) {
    failures.push(`[SCG_BUN_PIN_REQUIRED] packageManager must pin Bun to exact semver (found '${packageManager || '(missing)'}')`);
  }

  if (!existsSync(lockfilePath)) {
    failures.push('[SCG_LOCKFILE_MISSING] Missing bun.lock; dependency graph is not reproducible.');
  }

  const config = readJson(configPath);
  const latestPolicy = evaluateMcpLatestPolicy({
    mcp: config.mcp || {},
    env: process.env,
    releaseMode,
  });
  failures.push(...latestPolicy.failures);
  warnings.push(...latestPolicy.warnings);

  // Plugin spec validation (P03)
  const pluginPolicy = evaluatePluginLatestPolicy({
    plugins: config.plugin || [],
    env: process.env,
    releaseMode,
  });
  failures.push(...pluginPolicy.failures);
  warnings.push(...pluginPolicy.warnings);

  const distillSource = readFileSync(distillRunnerPath, 'utf8');
  const hasPinnedDistill = /const\s+DISTILL_VERSION\s*=\s*['"]\d+\.\d+\.\d+['"]/.test(distillSource);
  if (!hasPinnedDistill) {
    failures.push('[SCG_DISTILL_PIN_REQUIRED] run-distill-mcp.mjs must pin DISTILL_VERSION to exact semver.');
  }

  console.log('== Supply Chain Guard ==');
  console.log(`Mode: ${releaseMode ? 'release' : 'non-release'}`);
  if (warnings.length > 0) {
    console.log('Warnings:');
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  }

  if (failures.length > 0) {
    console.log('Failures:');
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log('PASS: supply-chain guardrails satisfied.');
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main();
}
