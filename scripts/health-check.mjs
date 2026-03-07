#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { resolveRoot, userConfigDir } from './resolve-root.mjs';

const root = resolveRoot();

function commandLocation(command) {
  const isWin = process.platform === 'win32';
  const locators = isWin ? ['where.exe', 'where', 'which'] : ['which'];

  for (const locator of locators) {
    const result = spawnSync(locator, [command], { encoding: 'utf8' });
    if (result.status !== 0) continue;
    const first = `${result.stdout || ''}`.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (first) return first;
  }

  return null;
}

function runCommand(command, args, options = {}) {
  const direct = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (direct.status === 0) return direct;

  const shellFallback = spawnSync(command, args, { encoding: 'utf8', shell: true, ...options });
  if (shellFallback.status === 0) return shellFallback;

  const located = commandLocation(command);
  if (located) {
    const resolved = spawnSync(located, args, { encoding: 'utf8', ...options });
    if (resolved.status === 0) return resolved;
  }

  return direct;
}

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

function requiredEnvKeysForProfile(profile, allKeys) {
  const profiles = {
    none: [],
    core: ['ANTHROPIC_API_KEYS', 'OPENAI_API_KEYS', 'GOOGLE_API_KEYS', 'NVIDIA_API_KEY'],
    mcp: ['SUPERMEMORY_API_KEY', 'TAVILY_API_KEY', 'GITHUB_TOKEN'],
    strict: allKeys,
  };

  const selected = profiles[profile] || profiles.core;
  if (selected === allKeys) return allKeys;
  return selected.filter((key) => allKeys.includes(key));
}

function hasHardcodedSecret(content) {
  return [
    /tvly-[A-Za-z0-9_-]{10,}/,
    /sm_[A-Za-z0-9_-]{20,}/,
    /sk-[A-Za-z0-9_-]{16,}/,
    /ghp_[A-Za-z0-9]{20,}/,
  ].some((pattern) => pattern.test(content));
}

function evaluateMcpServer(name, cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    return {
      level: 'FAIL',
      label: `MCP ${name}`,
      details: 'Invalid MCP entry (expected object).',
      fix: `Set mcp.${name} to an object with type and enabled fields.`,
      enabled: false,
    };
  }

  const hasEnabled = Object.prototype.hasOwnProperty.call(cfg, 'enabled');
  if (!hasEnabled) {
    return {
      level: 'WARN',
      label: `MCP ${name}`,
      details: 'Missing explicit enabled flag (implicitly treated as enabled).',
      fix: `Set mcp.${name}.enabled to true or false explicitly.`,
      enabled: true,
    };
  }

  if (cfg.enabled !== true) {
    return {
      level: 'PASS',
      label: `MCP ${name}`,
      details: 'Disabled in config (skipped by health checks).',
      enabled: false,
    };
  }

  const type = typeof cfg.type === 'string' ? cfg.type.trim().toLowerCase() : '';

  if (type === 'remote') {
    const url = typeof cfg.url === 'string' ? cfg.url.trim() : '';
    if (!url) {
      return {
        level: 'FAIL',
        label: `MCP ${name}`,
        details: 'Enabled remote MCP is missing URL.',
        fix: `Set mcp.${name}.url to a valid https endpoint.`,
        enabled: true,
      };
    }
    try {
      // URL constructor enforces parseable URL format.
      // eslint-disable-next-line no-new
      new URL(url);
    } catch {
      return {
        level: 'FAIL',
        label: `MCP ${name}`,
        details: `Invalid remote URL: ${url}`,
        fix: `Set mcp.${name}.url to a valid absolute URL.`,
        enabled: true,
      };
    }

    return {
      level: 'PASS',
      label: `MCP ${name}`,
      details: `Remote MCP enabled (${url})`,
      enabled: true,
      type: 'remote',
    };
  }

  if (type === 'local') {
    const command = Array.isArray(cfg.command) ? cfg.command : [];
    const executable = command.length > 0 ? String(command[0] || '').trim() : '';

    if (!executable) {
      return {
        level: 'FAIL',
        label: `MCP ${name}`,
        details: 'Enabled local MCP is missing command[0] executable.',
        fix: `Set mcp.${name}.command to a non-empty command array.`,
        enabled: true,
      };
    }

    const location = commandLocation(executable);
    if (!location) {
      return {
        level: 'FAIL',
        label: `MCP ${name}`,
        details: `Enabled local MCP executable not found: ${executable}`,
        fix: `Install '${executable}' or disable mcp.${name} if not needed.`,
        enabled: true,
      };
    }

    return {
      level: 'PASS',
      label: `MCP ${name}`,
      details: `Local MCP enabled (${executable} at ${location})`,
      enabled: true,
      type: 'local',
    };
  }

  return {
    level: 'WARN',
    label: `MCP ${name}`,
    details: `Unknown MCP type '${type || 'missing'}' (expected 'local' or 'remote').`,
    fix: `Set mcp.${name}.type to 'local' or 'remote'.`,
    enabled: true,
  };
}

function resolveGlobalNodeModulesPaths() {
  const candidates = [];

  const pmBin = spawnSync('bun', ['pm', 'bin', '-g'], { encoding: 'utf8' });
  if (pmBin.status === 0) {
    const binPath = (pmBin.stdout || '').trim().split(/\r?\n/)[0];
    if (binPath) {
      candidates.push(path.resolve(binPath, '..', 'node_modules'));
    }
  }

  const bunInstall = process.env.BUN_INSTALL || path.join(homedir(), '.bun', 'install');
  candidates.push(path.join(bunInstall, 'global', 'node_modules'));
  candidates.push(path.join(homedir(), '.bun', 'install', 'global', 'node_modules'));

  return [...new Set(candidates)];
}

function main() {
  console.log('== OpenCode Health Check ==');

  let failures = 0;
  let warnings = 0;

  const cli = runCommand('opencode', ['--version']);
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
    warnings += 1;
    printStatus('WARN', 'Bun plugin link check', 'Skipped: no scoped workspace packages detected.', 'Set PLUGIN_SCOPE (for example: @your-scope) to enforce scoped link checks.');
  } else {
    const globalNodeModulesPaths = resolveGlobalNodeModulesPaths();
    const packagesForScope = scopedPackages.filter((packageName) => packageName.startsWith(`${pluginScope}/`));

    if (packagesForScope.length === 0) {
      warnings += 1;
      printStatus('WARN', `Bun plugin link check (${pluginScope})`, 'No scoped workspace packages found to verify.');
    } else {
      const missing = packagesForScope.filter((packageName) => {
        const packageLeaf = packageName.split('/')[1];
        const linkedInAnyPath = globalNodeModulesPaths.some((basePath) => {
          const linkedPath = path.join(basePath, pluginScope, packageLeaf);
          if (!existsSync(linkedPath)) {
            return false;
          }
          try {
            return lstatSync(linkedPath).isSymbolicLink();
          } catch {
            return false;
          }
        });
        return !linkedInAnyPath;
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
  let mcpDisabled = 0;
  let mcpPass = 0;
  let mcpWarn = 0;
  let mcpFail = 0;
  if (configFiles.length > 0) {
    try {
      const config = JSON.parse(readFileSync(configFiles[0], 'utf8'));
      mcpConfigured = Boolean(config.mcp && typeof config.mcp === 'object' && Object.keys(config.mcp).length > 0);
      if (mcpConfigured) {
        const evaluations = Object.entries(config.mcp).map(([name, entry]) => evaluateMcpServer(name, entry));
        for (const evaluation of evaluations) {
          if (evaluation.level === 'FAIL') {
            failures += 1;
            mcpFail += 1;
          } else if (evaluation.level === 'WARN') {
            warnings += 1;
            mcpWarn += 1;
          } else {
            mcpPass += 1;
          }

          if (evaluation.enabled) {
            mcpEnabled += 1;
          } else {
            mcpDisabled += 1;
          }

          printStatus(evaluation.level, evaluation.label, evaluation.details, evaluation.fix);
        }
      }
    } catch {
      mcpConfigured = false;
    }
  }

  if (!mcpConfigured) {
    warnings += 1;
    printStatus('WARN', 'MCP server configuration', null, 'Add MCP entries under "mcp" in opencode.json.');
  } else {
    const summary = `${mcpEnabled} enabled, ${mcpDisabled} disabled, ${mcpPass} pass, ${mcpWarn} warn, ${mcpFail} fail`;
    if (mcpFail > 0) {
      printStatus('FAIL', 'MCP server configuration', summary, 'Fix failing MCP entries or disable them in opencode.json.');
    } else if (mcpWarn > 0) {
      printStatus('WARN', 'MCP server configuration', summary, 'Address MCP warnings for stricter config accuracy.');
    } else {
      printStatus('PASS', 'MCP server configuration', summary);
    }
  }

  const envExamplePath = path.join(root, '.env.example');
  const envPath = path.join(root, '.env');
  const requiredKeys = requiredEnvKeys(envExamplePath);
  const envProfile = String(process.env.OPENCODE_HEALTH_ENV_PROFILE || 'core').trim().toLowerCase();
  const requiredForProfile = requiredEnvKeysForProfile(envProfile, requiredKeys);
  const envValues = { ...parseEnvFile(envPath), ...process.env };
  const missingKeys = requiredForProfile.filter((key) => !String(envValues[key] || '').trim());

  if (requiredForProfile.length === 0) {
    warnings += 1;
    printStatus('WARN', 'Required env keys', `Skipped (OPENCODE_HEALTH_ENV_PROFILE=${envProfile}).`);
  } else if (missingKeys.length > 0) {
    warnings += 1;
    printStatus(
      'WARN',
      'Required env keys',
      `Missing keys for profile ${envProfile}: ${missingKeys.join(', ')}`,
      `Set missing keys in shell environment or .env, or adjust OPENCODE_HEALTH_ENV_PROFILE (${envProfile}).`
    );
  } else {
    printStatus('PASS', 'Required env keys', `${requiredForProfile.length}/${requiredForProfile.length} present (profile: ${envProfile})`);
  }

  const hasAnyApiKey = requiredKeys
    .filter((key) => key.includes('API_KEY'))
    .some((key) => String(envValues[key] || '').trim().length > 0);

  if (!hasAnyApiKey) {
    warnings += 1;
    printStatus('WARN', 'Model connectivity smoke test', 'Skipped (no API keys detected).');
  } else {
    const configPath = path.join(userConfigDir(), 'opencode.json');
    let smokeModel = 'google/antigravity-gemini-3-pro';
    try {
      const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
      const providers = cfg.provider || cfg.models || {};
      if (providers.google?.models?.['antigravity-gemini-3-pro']) {
        smokeModel = 'google/antigravity-gemini-3-pro';
      } else if (providers.google?.models) {
        const firstGoogle = Object.keys(providers.google.models)[0];
        if (firstGoogle) smokeModel = `google/${firstGoogle}`;
      }
    } catch {
      // Keep default smoke model.
    }

    const smokeTest = runCommand('opencode', ['run', 'ping', `--model=${smokeModel}`], {
      timeout: 60000,
    });
    if (smokeTest.status === 0) {
      printStatus('PASS', 'Model connectivity smoke test', `Model request succeeded (${smokeModel})`);
    } else {
      warnings += 1;
      printStatus('WARN', 'Model connectivity smoke test', `Request failed (${smokeModel})`, 'Check provider credentials, network, and quotas.');
    }
  }

  console.log('');
  console.log(`Health check complete: ${failures} fail, ${warnings} warn.`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
