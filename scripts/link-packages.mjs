#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();
const packagesDir = path.join(root, 'packages');
const isWindows = process.platform === 'win32';

function findPackageDirs() {
  if (!existsSync(packagesDir)) {
    return [];
  }

  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDir, entry.name))
    .filter((dirPath) => existsSync(path.join(dirPath, 'package.json')));
}

function getPackageName(packageDir) {
  const packageJsonPath = path.join(packageDir, 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return pkg.name || path.basename(packageDir);
  } catch {
    return path.basename(packageDir);
  }
}

function main() {
  const packageDirs = findPackageDirs();
  if (packageDirs.length === 0) {
    console.log('No packages found in packages/.');
    process.exit(1);
  }

  console.log(`Linking ${packageDirs.length} package(s) with bun link...`);

  const failed = [];
  for (const packageDir of packageDirs) {
    const name = getPackageName(packageDir);
    process.stdout.write(`- ${name}: `);

    const result = spawnSync('bun', ['link'], {
      cwd: packageDir,
      encoding: 'utf8',
      stdio: 'pipe',
      shell: isWindows,
    });

    if (!result.error && result.status === 0) {
      console.log('PASS');
    } else {
      console.log('FAIL');
      const detail = (result.error?.message || result.stderr || result.stdout || '').trim();
      if (detail) {
        console.log(`  ${detail.split(/\r?\n/)[0]}`);
      }
      failed.push(name);
    }
  }

  if (failed.length > 0) {
    console.log(`\nLinking failed for ${failed.length} package(s): ${failed.join(', ')}`);
    process.exit(1);
  }

  console.log('\nAll packages linked successfully.');
}

main();
