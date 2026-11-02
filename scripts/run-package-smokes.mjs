#!/usr/bin/env node

import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();
const outputJson = process.argv.includes('--json');
const dryRun = process.argv.includes('--dry-run');

// Cache Bun.which() results to avoid repeated PATH lookups
const commandExistsCache = new Map();

function commandExists(command) {
  if (!command || typeof command !== 'string') {
    return false;
  }
  // Check cache first
  if (commandExistsCache.has(command)) {
    return commandExistsCache.get(command);
  }
  // Perform lookup and cache result
  let exists = false;
  try {
    // Bun.which for Bun runtime, fallback to PATH lookups for Node.js
    if (typeof Bun !== 'undefined') {
      exists = !!Bun.which(command);
    } else {
      // Node.js fallback: check if command exists in PATH
      const { execSync } = require('child_process');
      try {
        execSync(`${command} --version`, { stdio: 'ignore', timeout: 5000 });
        exists = true;
      } catch {
        exists = false;
      }
    }
    commandExistsCache.set(command, exists);
    return exists;
  } catch {
    commandExistsCache.set(command, false);
    return false;
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function listSmokePackages() {
  const packagesDir = path.join(root, 'packages');
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDir, entry.name))
    .filter((pkgDir) => existsSync(path.join(pkgDir, 'package.json')))
    .map((pkgDir) => {
      const pkg = readJson(path.join(pkgDir, 'package.json'));
      return {
        dir: pkgDir,
        name: pkg.name,
        smokeCommand: pkg.scripts?.['test:smoke'] || null,
      };
    })
    .filter((pkg) => pkg.smokeCommand);
}

function listPlugins() {
  const pluginsDir = path.join(root, 'plugins');
  if (!existsSync(pluginsDir)) {
    return [];
  }

  return readdirSync(pluginsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      id: entry.name,
      dir: path.join(pluginsDir, entry.name),
    }))
    .filter((plugin) => existsSync(path.join(plugin.dir, 'package.json')))
    .map((plugin) => {
      const pkg = readJson(path.join(plugin.dir, 'package.json'));
      return {
        ...plugin,
        name: pkg.name || plugin.id,
        smokeCommand: pkg.scripts?.['test:smoke'] || null,
      };
    });
}

function runSmoke(pkg) {
  if (dryRun) {
    return {
      name: pkg.name,
      ok: true,
      dryRun: true,
      command: pkg.smokeCommand,
    };
  }

  if (!commandExists('bun')) {
    return {
      name: pkg.name,
      ok: false,
      exitCode: 1,
      stdout: '',
      stderr: 'Command not found: bun',
    };
  }

  const result = spawnSync('bun', ['run', 'test:smoke'], {
    cwd: pkg.dir,
    timeout: 30000,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  return {
    name: pkg.name,
    ok: result.status === 0,
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function runPluginSmoke(plugin) {
  if (!plugin.smokeCommand) {
    return {
      id: plugin.id,
      name: plugin.name,
      ok: true,
      skipped: true,
      reasonCode: 'PLUGIN_SMOKE_MISSING',
      reason: `No test:smoke script declared for plugin:${plugin.id}`,
    };
  }

  if (dryRun) {
    return {
      id: plugin.id,
      name: plugin.name,
      ok: true,
      dryRun: true,
      command: plugin.smokeCommand,
    };
  }

  if (!commandExists('bun')) {
    return {
      id: plugin.id,
      name: plugin.name,
      ok: false,
      exitCode: 1,
      stdout: '',
      stderr: 'Command not found: bun',
      reasonCode: 'PLUGIN_SMOKE_FAILED',
      reason: `Plugin smoke execution failed for plugin:${plugin.id}`,
    };
  }

  const result = spawnSync('bun', ['run', 'test:smoke'], {
    cwd: plugin.dir,
    timeout: 30000,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  return {
    id: plugin.id,
    name: plugin.name,
    ok: result.status === 0,
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    ...(result.status === 0
      ? {}
      : {
          reasonCode: 'PLUGIN_SMOKE_FAILED',
          reason: `Plugin smoke execution failed for plugin:${plugin.id}`,
        }),
  };
}

function main() {
  const packages = listSmokePackages();
  const plugins = listPlugins();
  const packageResults = packages.map(runSmoke);
  const pluginResults = plugins.map(runPluginSmoke);
  const payload = {
    packageCount: packageResults.length,
    packages: packageResults,
    pluginCount: pluginResults.length,
    plugins: pluginResults,
  };

  if (outputJson) {
    process.stdout.write(JSON.stringify(payload, null, 2));
  } else {
    console.log('# Package + Plugin Smoke Runner');
    console.log('');
    console.log('## Packages');
    for (const result of packageResults) {
      console.log(`- ${result.name}: ${result.ok ? 'PASS' : 'FAIL'}`);
    }
    if (pluginResults.length > 0) {
      console.log('');
      console.log('## Plugins');
      for (const result of pluginResults) {
        if (result.skipped) {
          console.log(`- ${result.name}: SKIP (${result.reasonCode})`);
        } else {
          console.log(`- ${result.name}: ${result.ok ? 'PASS' : 'FAIL'}`);
        }
      }
    }
  }

  process.exit(
    packageResults.some((result) => !result.ok) || pluginResults.some((result) => !result.ok)
      ? 1
      : 0,
  );
}

main();
