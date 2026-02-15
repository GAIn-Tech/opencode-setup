#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { resolveRoot, userConfigDir } from './resolve-root.mjs';

const root = resolveRoot();

function printStatus(level, label, details, fix) {
  console.log(`[${level}] ${label}`);
  if (details) {
    console.log(`  ${details}`);
  }
  if ((level === 'WARN' || level === 'FAIL') && fix) {
    console.log(`  Fix: ${fix}`);
  }
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const values = {};
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function getScopedWorkspacePackages() {
  const packagesDir = path.join(root, 'packages');
  if (!existsSync(packagesDir)) {
    return [];
  }

  const entries = readdirSync(packagesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const packageNames = [];
  for (const entry of entries) {
    const packageJsonPath = path.join(packagesDir, entry.name, 'package.json');
    if (!existsSync(packageJsonPath)) {
      continue;
    }
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      if (typeof pkg.name === 'string' && pkg.name.startsWith('@')) {
        packageNames.push(pkg.name);
      }
    } catch {
      // Ignore malformed files.
    }
  }
  return packageNames;
}

function detectScope(rootPackageName, scopedPackageNames) {
  const override = process.env.PLUGIN_SCOPE?.trim();
  if (override) {
    return override.startsWith('@') ? override : `@${override}`;
  }

  if (typeof rootPackageName === 'string' && rootPackageName.startsWith('@')) {
    return rootPackageName.split('/')[0];
  }

  const counts = new Map();
  for (const packageName of scopedPackageNames) {
    const scope = packageName.split('/')[0];
    counts.set(scope, (counts.get(scope) || 0) + 1);
  }

  let selectedScope = null;
  let maxCount = 0;
  for (const [scope, count] of counts.entries()) {
    if (count > maxCount) {
      selectedScope = scope;
      maxCount = count;
    }
  }
  return selectedScope;
}

function requiredEnvKeys(examplePath) {
  if (!existsSync(examplePath)) {
    return [];
  }

  const keys = [];
  for (const line of readFileSync(examplePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    if (!key) {
      continue;
    }
    keys.push(key);
  }
  return keys;
}

function hasHardcodedSecret(content) {
  return [
    /tvly-[A-Za-z0-9_-]{10,}/,
    /sm_[A-Za-z0-9_-]{20,}/,
    /sk-[A-Za-z0-9_-]{16,}/,
    /ghp_[A-Za-z0-9]{20,}/,
  ].some((pattern) => pattern.test(content));
}

function main() {
  console.log('== OpenCode Health Check ==');

  let failures = 0;
  let warnings = 0;

  const cli = spawnSync('opencode', ['--version'], { encoding: 'utf8' });
  if (cli.status === 0) {
    const version = `${cli.stdout || ''}${cli.stderr || ''}`.trim().split(/\r?\n/)[0] || 'version available';
    printStatus('PASS', 'OpenCode CLI responds', version);
  } else {
    failures += 1;
    printStatus('FAIL', 'OpenCode CLI responds', null, 'Install or repair opencode CLI and verify PATH.');
  }

  const rootPackage = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const scopedPackages = getScopedWorkspacePackages();
  const pluginScope = detectScope(rootPackage.name, scopedPackages);

  if (!pluginScope) {
    failures += 1;
    printStatus('FAIL', 'Bun plugin link check', 'Could not detect plugin scope.', 'Set PLUGIN_SCOPE (for example: @your-scope) and rerun.');
  } else {
    const bunInstall = process.env.BUN_INSTALL || path.join(homedir(), '.bun', 'install');
    const globalNodeModules = path.join(bunInstall, 'global', 'node_modules');
    const packagesForScope = scopedPackages.filter((packageName) => packageName.startsWith(`${pluginScope}/`));

    if (packagesForScope.length === 0) {
      warnings += 1;
      printStatus('WARN', `Bun plugin link check (${pluginScope})`, 'No scoped workspace packages found to verify.');
    } else {
      const missing = packagesForScope.filter((packageName) => {
        const packageLeaf = packageName.split('/')[1];
        const linkedPath = path.join(globalNodeModules, pluginScope, packageLeaf);
        if (!existsSync(linkedPath)) {
          return true;
        }
        try {
          return !lstatSync(linkedPath).isSymbolicLink();
        } catch {
          return true;
        }
      });

      if (missing.length > 0) {
        failures += 1;
        printStatus('FAIL', `Bun plugin link check (${pluginScope})`, `Missing links: ${missing.join(', ')}`, 'Run: bun run scripts/link-packages.mjs');
      } else {
        printStatus('PASS', `Bun plugin link check (${pluginScope})`, `${packagesForScope.length}/${packagesForScope.length} links present`);
      }
    }
  }

  const configCandidates = [
    path.join(userConfigDir(), 'opencode.json'),
    path.join(root, 'opencode-config', 'opencode.json'),
  ];
  const configFiles = configCandidates.filter((candidate, index) => configCandidates.indexOf(candidate) === index && existsSync(candidate));
  const secretMatches = configFiles.filter((filePath) => {
    try {
      return hasHardcodedSecret(readFileSync(filePath, 'utf8'));
    } catch {
      return false;
    }
  });

  if (secretMatches.length > 0) {
    failures += 1;
    printStatus('FAIL', 'Hardcoded secret scan', `Potential literal secrets found in: ${secretMatches.join(', ')}`, 'Use {env:KEY} placeholders in config JSON.');
  } else {
    printStatus('PASS', 'Hardcoded secret scan', configFiles.length > 0 ? `Scanned ${configFiles.length} file(s)` : 'No config files found to scan');
  }

  let mcpConfigured = false;
  let mcpEnabled = 0;
  if (configFiles.length > 0) {
    try {
      const config = JSON.parse(readFileSync(configFiles[0], 'utf8'));
      mcpConfigured = Boolean(config.mcp && typeof config.mcp === 'object' && Object.keys(config.mcp).length > 0);
      if (mcpConfigured) {
        mcpEnabled = Object.values(config.mcp).filter((entry) => entry && entry.enabled !== false).length;
      }
    } catch {
      mcpConfigured = false;
    }
  }

  if (!mcpConfigured) {
    warnings += 1;
    printStatus('WARN', 'MCP server configuration', null, 'Add MCP entries under "mcp" in opencode.json.');
  } else {
    printStatus('PASS', 'MCP server configuration', `${mcpEnabled} enabled server(s)`);
  }

  const envExamplePath = path.join(root, '.env.example');
  const envPath = path.join(root, '.env');
  const requiredKeys = requiredEnvKeys(envExamplePath);
  const envValues = { ...parseEnvFile(envPath), ...process.env };
  const missingKeys = requiredKeys.filter((key) => !String(envValues[key] || '').trim());

  if (requiredKeys.length === 0) {
    warnings += 1;
    printStatus('WARN', 'Required env keys', 'No keys parsed from .env.example');
  } else if (missingKeys.length > 0) {
    warnings += 1;
    printStatus('WARN', 'Required env keys', `Missing keys: ${missingKeys.join(', ')}`, 'Set missing keys in shell environment or .env.');
  } else {
    printStatus('PASS', 'Required env keys', `${requiredKeys.length}/${requiredKeys.length} present`);
  }

  const hasAnyApiKey = requiredKeys
    .filter((key) => key.includes('API_KEY'))
    .some((key) => String(envValues[key] || '').trim().length > 0);

  if (!hasAnyApiKey) {
    warnings += 1;
    printStatus('WARN', 'Model connectivity smoke test', 'Skipped (no API keys detected).');
  } else {
    const smokeTest = spawnSync('opencode', ['run', 'ping', '--model=google/antigravity-gemini-3-pro'], {
      encoding: 'utf8',
      timeout: 60000,
    });
    if (smokeTest.status === 0) {
      printStatus('PASS', 'Model connectivity smoke test', 'Model request succeeded');
    } else {
      warnings += 1;
      printStatus('WARN', 'Model connectivity smoke test', 'Request failed', 'Check provider credentials, network, and quotas.');
    }
  }

  console.log('');
  console.log(`Health check complete: ${failures} fail, ${warnings} warn.`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
