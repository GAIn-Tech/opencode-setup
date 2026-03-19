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
  try {
    const exists = !!Bun.which(command);
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

function main() {
  const packages = listSmokePackages();
  const results = packages.map(runSmoke);
  const payload = {
    packageCount: results.length,
    packages: results,
  };

  if (outputJson) {
    process.stdout.write(JSON.stringify(payload, null, 2));
  } else {
    console.log('# Package Smoke Runner');
    console.log('');
    for (const result of results) {
      console.log(`- ${result.name}: ${result.ok ? 'PASS' : 'FAIL'}`);
    }
  }

  process.exit(results.some((result) => !result.ok) ? 1 : 0);
}

main();
