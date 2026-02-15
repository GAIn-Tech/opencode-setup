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

function commandVersion(command) {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    return null;
  }
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return output.split(/\r?\n/)[0] || null;
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

function main() {
  console.log('== OpenCode Setup Verification ==');

  let failed = 0;

  for (const binary of ['bun', 'node', 'opencode']) {
    const location = commandLocation(binary);
    const version = location ? commandVersion(binary) : null;
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
    const bunInstall = process.env.BUN_INSTALL || path.join(homedir(), '.bun', 'install');
    const globalNodeModules = path.join(bunInstall, 'global', 'node_modules');
    const scopedRoot = path.join(globalNodeModules, pluginScope);

    const missing = scopedPackages.filter((packageName) => {
      const packageLeaf = packageName.split('/')[1];
      const linkedPath = path.join(scopedRoot, packageLeaf);
      if (!existsSync(linkedPath)) {
        return true;
      }
      try {
        return !lstatSync(linkedPath).isSymbolicLink();
      } catch {
        return true;
      }
    });

    const passed = scopedPackages.length > 0 && missing.length === 0;
    if (!passed) {
      failed += 1;
    }
    const details = scopedPackages.length === 0
      ? `No workspace package names found for scope ${pluginScope}.`
      : missing.length === 0
        ? `${scopedPackages.length}/${scopedPackages.length} linked at ${scopedRoot}`
        : `Missing links: ${missing.join(', ')}`;

    printCheck(
      `Plugin symlinks (${pluginScope})`,
      passed,
      details,
      'Run: bun run scripts/link-packages.mjs'
    );
  }

  const hooksDir = path.join(root, '.git', 'hooks');
  const preCommitHook = path.join(hooksDir, 'pre-commit');
  const commitMsgHook = path.join(hooksDir, 'commit-msg');
  const hooksInstalled = existsSync(preCommitHook) && existsSync(commitMsgHook) && hasExecBitUnix(preCommitHook) && hasExecBitUnix(commitMsgHook);
  if (!hooksInstalled) {
    failed += 1;
  }

  printCheck(
    'Git hooks installed',
    hooksInstalled,
    hooksInstalled ? `Found ${preCommitHook} and ${commitMsgHook}` : null,
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

  console.log('');
  if (failed > 0) {
    console.log(`Verification failed (${failed} check${failed === 1 ? '' : 's'}).`);
    process.exit(1);
  }

  console.log('Verification passed. Setup looks ready.');
}

main();
