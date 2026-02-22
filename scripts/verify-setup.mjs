#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { resolveRoot, userConfigDir } from './resolve-root.mjs';

const root = resolveRoot();
const isWindows = process.platform === 'win32';

function commandLocation(command) {
  const locator = isWindows ? 'where' : 'which';
  const result = spawnSync(locator, [command], { encoding: 'utf8' });
  if (result.status !== 0) {
    return null;
  }
  const firstLine = (result.stdout || '').split(/\r?\n/).find((line) => line.trim());
  return firstLine ? firstLine.trim() : null;
}

function commandLocations(command) {
  const locator = isWindows ? 'where' : 'which';
  const args = isWindows ? [command] : ['-a', command];
  const result = spawnSync(locator, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    return [];
  }
  const lines = (result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return [...new Set(lines)];
}

function commandVersion(command) {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    return null;
  }
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return output.split(/\r?\n/)[0] || null;
}

function commandVersionAt(executablePath) {
  const result = spawnSync(executablePath, ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    return null;
  }
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return output.split(/\r?\n/)[0] || null;
}

function normalizedBunVersion(rawVersion) {
  return rawVersion ? rawVersion.replace(/^bun\s+/i, '').trim() : null;
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

function resolvePreferredBunPath() {
  const all = commandLocations('bun');
  const configured = String(process.env.OPENCODE_BUN_PATH || '').trim();

  if (configured) {
    return { path: configured, all };
  }

  if (all.length === 0) {
    return { path: null, all };
  }

  const nonNodeModules = all.filter((entry) => !/node_modules/i.test(entry));
  const preferred = nonNodeModules[0] || all[0];
  return { path: preferred, all };
}

function printCheck(name, passed, details, fix) {
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}`);
  if (details) {
    console.log(`  ${details}`);
  }
  if (!passed && fix) {
    console.log(`  Fix: ${fix}`);
  }
}

function listWorkspacePackages() {
  const packagesDir = path.join(root, 'packages');
  if (!existsSync(packagesDir)) {
    return [];
  }

  const entries = readdirSync(packagesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const packages = [];
  for (const entry of entries) {
    const packageJsonPath = path.join(packagesDir, entry.name, 'package.json');
    if (!existsSync(packageJsonPath)) {
      continue;
    }
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      if (typeof pkg.name === 'string' && pkg.name.trim()) {
        packages.push(pkg.name.trim());
      }
    } catch {
      // Ignore malformed files.
    }
  }
  return packages;
}

function detectPluginScope(rootPackageName, workspacePackageNames) {
  const override = process.env.PLUGIN_SCOPE?.trim();
  if (override) {
    return override.startsWith('@') ? override : `@${override}`;
  }

  if (typeof rootPackageName === 'string' && rootPackageName.startsWith('@')) {
    return rootPackageName.split('/')[0];
  }

  const counts = new Map();
  for (const packageName of workspacePackageNames) {
    if (!packageName.startsWith('@')) {
      continue;
    }
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

function hasExecBitUnix(filePath) {
  if (isWindows) {
    return true;
  }
  try {
    return (lstatSync(filePath).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function hasNonEmptyEnvVar(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
}

function main() {
  console.log('== OpenCode Setup Verification ==');

  let failed = 0;
  const expectedBunVersion = String(process.env.OPENCODE_REQUIRED_BUN_VERSION || '1.3.9').trim();

  const { path: preferredBunPath, all: allBunPaths } = resolvePreferredBunPath();

  for (const binary of ['bun', 'node', 'opencode']) {
    const location = binary === 'bun' ? preferredBunPath : commandLocation(binary);
    const version = location
      ? (binary === 'bun' ? commandVersionAt(location) : commandVersion(binary))
      : null;
    const passed = Boolean(location);
    if (!passed) {
      failed += 1;
    }

    printCheck(
      `${binary} installed`,
      passed,
      passed ? `Found at: ${location}${version ? ` (${version})` : ''}` : null,
      `Install ${binary} and ensure it is on PATH.`
    );
  }

  const bunVersionRaw = preferredBunPath ? commandVersionAt(preferredBunPath) : null;
  const bunVersion = normalizedBunVersion(bunVersionRaw);
  const bunVersionOk = Boolean(bunVersion && bunVersion === expectedBunVersion);
  if (!bunVersionOk) {
    failed += 1;
  }
  printCheck(
    'Bun version matches repo policy',
    bunVersionOk,
    bunVersion ? `Found ${bunVersion}; expected ${expectedBunVersion}` : null,
    `Install Bun ${expectedBunVersion} and ensure it is first on PATH.`
  );

  const pathBunPath = commandLocation('bun');
  const pathBunVersion = normalizedBunVersion(pathBunPath ? commandVersionAt(pathBunPath) : null);
  const pathBunVersionOk = Boolean(pathBunVersion && pathBunVersion === expectedBunVersion);
  if (!pathBunVersionOk) {
    failed += 1;
  }
  printCheck(
    'PATH bun version matches repo policy',
    pathBunVersionOk,
    pathBunPath && pathBunVersion
      ? `PATH resolves to ${pathBunPath} (${pathBunVersion}); expected ${expectedBunVersion}`
      : null,
    'Ensure plain `bun --version` returns the required version. On Windows, run: bun run fix:bun-path'
  );

  const nodeModulesBun = allBunPaths.filter((entry) => /node_modules/i.test(entry));
  const configuredBunPath = String(process.env.OPENCODE_BUN_PATH || '').trim();
  const allowNodeModulesOnPath = Boolean(configuredBunPath);
  if (nodeModulesBun.length > 0) {
    if (!allowNodeModulesOnPath) {
      failed += 1;
    }
    printCheck(
      'No Bun binary from node_modules on PATH',
      allowNodeModulesOnPath,
      `Found: ${nodeModulesBun.join(', ')}`,
      'Remove node_modules Bun shims from PATH or set OPENCODE_BUN_PATH to the expected Bun binary.'
    );
  } else {
    printCheck('No Bun binary from node_modules on PATH', true);
  }

  const rootPackage = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const workspacePackages = listWorkspacePackages();
  const pluginScope = detectPluginScope(rootPackage.name, workspacePackages);

  if (!pluginScope) {
    failed += 1;
    printCheck(
      'Plugin symlinks',
      false,
      'No scope could be detected from root/workspace package names.',
      'Set PLUGIN_SCOPE (for example: @your-scope) and rerun.'
    );
  } else {
    const scopedPackages = workspacePackages.filter((packageName) => packageName.startsWith(`${pluginScope}/`));
    const globalNodeModulesPaths = resolveGlobalNodeModulesPaths();

    const missing = scopedPackages.filter((packageName) => {
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

    const passed = scopedPackages.length > 0 && missing.length === 0;
    if (!passed) {
      failed += 1;
    }
    const details = scopedPackages.length === 0
      ? `No workspace package names found for scope ${pluginScope}.`
      : missing.length === 0
        ? `${scopedPackages.length}/${scopedPackages.length} linked across ${globalNodeModulesPaths.join(', ')}`
        : `Missing links: ${missing.join(', ')}`;

    printCheck(
      `Plugin symlinks (${pluginScope})`,
      passed,
      details,
      'Run: bun run scripts/link-packages.mjs'
    );
  }

  const hooksDir = path.join(root, '.githooks');
  const preCommitHook = path.join(hooksDir, 'pre-commit');
  const commitMsgHook = path.join(hooksDir, 'commit-msg');
  const hooksPathResult = spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: root, encoding: 'utf8' });
  const hooksPath = hooksPathResult.status === 0 ? (hooksPathResult.stdout || '').trim() : '';
  const hooksPathOk = hooksPath === '.githooks';
  const hooksInstalled = hooksPathOk && existsSync(preCommitHook) && existsSync(commitMsgHook) && hasExecBitUnix(preCommitHook) && hasExecBitUnix(commitMsgHook);
  if (!hooksInstalled) {
    failed += 1;
  }

  printCheck(
    'Git hooks installed',
    hooksInstalled,
    hooksInstalled ? `core.hooksPath=${hooksPath}; found ${preCommitHook} and ${commitMsgHook}` : null,
    'Run: bun run scripts/install-git-hooks.mjs'
  );

  const configPath = path.join(userConfigDir(), 'opencode.json');

  const configExists = existsSync(configPath);
  if (!configExists) {
    failed += 1;
  }

  printCheck(
    'User opencode.json exists',
    configExists,
    configExists ? `Found at ${configPath}` : null,
    `Copy ${path.join(root, 'opencode-config', 'opencode.json')} to ${configPath}`
  );

  const repoConfigPath = path.join(root, 'opencode-config', 'opencode.json');
  const configsToValidate = [
    { label: 'Repo opencode.json is valid JSON', filePath: repoConfigPath },
    { label: 'User opencode.json is valid JSON', filePath: configPath },
  ];

  for (const { label, filePath } of configsToValidate) {
    const exists = existsSync(filePath);
    let valid = false;
    let details = null;
    if (exists) {
      try {
        JSON.parse(readFileSync(filePath, 'utf8'));
        valid = true;
      } catch (error) {
        details = error instanceof Error ? error.message : String(error);
      }
    }

    if (!exists || !valid) {
      failed += 1;
    }

    printCheck(
      label,
      exists && valid,
      exists && valid ? filePath : details,
      exists ? `Fix JSON syntax in ${filePath}` : `Missing file: ${filePath}`
    );
  }

  const mcpConfigPath = path.join(userConfigDir(), 'opencode-mcp-config.json');
  const mcpConfigExists = existsSync(mcpConfigPath);
  let mcpDeclaredInUserConfig = false;
  if (configExists) {
    try {
      const userConfig = JSON.parse(readFileSync(configPath, 'utf8'));
      mcpDeclaredInUserConfig = Boolean(userConfig && typeof userConfig === 'object' && userConfig.mcp && Object.keys(userConfig.mcp).length > 0);
    } catch {
      mcpDeclaredInUserConfig = false;
    }
  }
  const mcpCoverageOk = mcpConfigExists || mcpDeclaredInUserConfig;
  if (!mcpCoverageOk) {
    failed += 1;
  }
  printCheck(
    'User MCP config coverage',
    mcpCoverageOk,
    mcpConfigExists
      ? `Found generated config at ${mcpConfigPath}`
      : (mcpDeclaredInUserConfig ? `MCP declared directly in ${configPath}` : null),
    'Run: bun run generate && bun run copy-config'
  );

  const skillsDir = path.join(userConfigDir(), 'skills');
  const skillsExists = existsSync(skillsDir) && readdirSync(skillsDir).length > 0;
  if (!skillsExists) {
    failed += 1;
  }
  printCheck(
    'User skills directory populated',
    skillsExists,
    skillsExists ? `Found skills in ${skillsDir}` : null,
    'Run: bun run copy-config'
  );

  const envProfile = String(process.env.OPENCODE_VERIFY_ENV_PROFILE || 'none').trim().toLowerCase();
  if (envProfile !== 'none') {
    let envReady = true;
    let detail = null;

    if (envProfile === 'core') {
      const providerKeys = ['ANTHROPIC_API_KEYS', 'OPENAI_API_KEYS', 'GOOGLE_API_KEYS'];
      envReady = providerKeys.some(hasNonEmptyEnvVar);
      detail = envReady ? 'At least one provider key set.' : `Missing provider keys: ${providerKeys.join(', ')}`;
    } else {
      const profileRequirements = {
        mcp: ['GITHUB_TOKEN'],
        research: ['TAVILY_API_KEY', 'SUPERMEMORY_API_KEY'],
        strict: ['ANTHROPIC_API_KEYS', 'OPENAI_API_KEYS', 'GOOGLE_API_KEYS', 'GITHUB_TOKEN'],
      };
      const required = profileRequirements[envProfile] || [];
      const missing = required.filter((name) => !hasNonEmptyEnvVar(name));
      envReady = missing.length === 0;
      detail = envReady ? `Profile ${envProfile} requirements satisfied.` : `Missing: ${missing.join(', ')}`;
    }

    if (!envReady) {
      failed += 1;
    }

    printCheck(
      `Environment readiness profile (${envProfile})`,
      envReady,
      detail,
      'Populate required variables in your environment and rerun verify.'
    );
  } else {
    printCheck('Environment readiness profile', true, 'Skipped (OPENCODE_VERIFY_ENV_PROFILE=none).');
  }

  console.log('');
  if (failed > 0) {
    console.log(`Verification failed (${failed} check${failed === 1 ? '' : 's'}).`);
    process.exit(1);
  }

  console.log('Verification passed. Setup looks ready.');
}

main();
