#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();
const localOhMyOpenCode = path.join(root, 'local', 'oh-my-opencode');
const expectedPackageManager = 'bun@1.2.23';
const expectedBunVersion = expectedPackageManager.split('@')[1];

function isKnownUnsafeBunVersion(version) {
  const [major, minor] = version.split('.').map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(major) || Number.isNaN(minor)) {
    return false;
  }

  return major > 1 || (major === 1 && minor >= 3);
}

function runStep(title, command, args, options = {}) {
  console.log(`\n== ${title} ==`);
  console.log(`$ ${command} ${args.join(' ')}`);

  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  });

  const status = result.status ?? 1;
  if (status !== 0) {
    console.error(`\n[FAIL] ${title} (exit ${status})`);
    process.exit(status);
  }
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
    ...options,
  });

  if ((result.status ?? 1) !== 0) {
    return null;
  }

  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return output;
}

function resolveBunExecutableFromPath() {
  const whereCmd = process.platform === 'win32' ? 'where' : 'which';
  const bunPath = capture(whereCmd, ['bun']);
  if (!bunPath) {
    return { bunExecutable: 'bun', bunPath: 'bun not found on PATH' };
  }

  const paths = bunPath.split(/\r?\n/).filter((line) => line.trim());
  const nonNodeModules = paths.find((entry) => !entry.includes('node_modules'));

  return {
    bunExecutable: nonNodeModules || paths[0],
    bunPath,
  };
}

function resolveBunExecutable() {
  const envOverride = process.env.OPENCODE_BUN_PATH;
  if (envOverride && fs.existsSync(envOverride)) {
    return {
      bunExecutable: envOverride,
      bunPath: `${envOverride} (from OPENCODE_BUN_PATH)`,
    };
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const preferred = path.join(localAppData, 'bun-bin', 'bun.exe');
      if (fs.existsSync(preferred)) {
        return {
          bunExecutable: preferred,
          bunPath: `${preferred} (preferred local runtime)`,
        };
      }
    }
  }

  return resolveBunExecutableFromPath();
}

function checkBunRuntime() {
  console.log('== Runtime Check ==');
  const { bunExecutable, bunPath } = resolveBunExecutable();
  const allBunPaths = capture(process.platform === 'win32' ? 'where' : 'which', ['bun']);
  const paths = (allBunPaths || '').split(/\r?\n/).filter((line) => line.trim());

  const bunVersionRaw = capture(bunExecutable, ['--version']) || 'unknown';
  const bunVersion = bunVersionRaw.split(/\r?\n/)[0].trim();
  const bunRevision = capture(bunExecutable, ['--revision']) || 'unknown';

  console.log(`Expected (repo packageManager): ${expectedPackageManager}`);
  console.log(`Active bun --version: ${bunVersion}`);
  console.log(`Active bun --revision: ${bunRevision}`);
  console.log(`Bun executable locked: ${bunExecutable}`);
  console.log(`bun path resolution:\n${bunPath}`);

  if (isKnownUnsafeBunVersion(bunVersion)) {
    console.error(
      `\n[FAIL] Active Bun ${bunVersion} is blocked for this repo (known Windows segfault range is >=1.3.0).`
    );
    console.error(`Install pinned version ${expectedBunVersion} and retry.`);
    process.exit(1);
  }

  if (bunVersion !== expectedBunVersion) {
    console.warn(
      `\n[WARN] Active Bun (${bunVersion}) does not match pinned ${expectedBunVersion}. ` +
      'Proceeding, but align PATH and local install to prevent runtime drift.'
    );
  }

  if (paths.length > 1) {
    console.warn(
      '\n[WARN] Multiple Bun binaries detected on PATH. This can cause inconsistent propagation across shells.'
    );
  }

  return { bunExecutable };
}

function main() {
  const { bunExecutable } = checkBunRuntime();

  runStep('Root dependency refresh', bunExecutable, ['install'], { cwd: root });
  runStep('Workspace relink', bunExecutable, ['run', 'link-all'], { cwd: root });
  runStep('Second root install pass', bunExecutable, ['install'], { cwd: root });

  runStep('Local oh-my-opencode install', bunExecutable, ['install'], { cwd: localOhMyOpenCode });
  runStep(
    'Local oh-my-opencode bundle core',
    bunExecutable,
    [
      'build',
      'src/index.ts',
      '--outdir',
      'dist',
      '--target',
      'bun',
      '--format',
      'esm',
      '--external',
      '@ast-grep/napi',
    ],
    { cwd: localOhMyOpenCode }
  );
  runStep('Local oh-my-opencode emit declarations', bunExecutable, ['x', 'tsc', '--emitDeclarationOnly'], {
    cwd: localOhMyOpenCode,
  });
  runStep(
    'Local oh-my-opencode bundle CLI',
    bunExecutable,
    [
      'build',
      'src/cli/index.ts',
      '--outdir',
      'dist/cli',
      '--target',
      'bun',
      '--format',
      'esm',
      '--external',
      '@ast-grep/napi',
    ],
    { cwd: localOhMyOpenCode }
  );
  runStep('Local oh-my-opencode build schema', bunExecutable, ['run', 'script/build-schema.ts'], {
    cwd: localOhMyOpenCode,
  });
  if (process.env.OPENCODE_Q_RECOVER_BUILD_BINARIES === '1') {
    runStep('Local oh-my-opencode build binaries', bunExecutable, ['run', 'script/build-binaries.ts'], {
      cwd: localOhMyOpenCode,
      env: {
        ...process.env,
        OPENCODE_BUN_PATH: bunExecutable,
      },
    });
  } else {
    console.log(
      '\n== Local oh-my-opencode build binaries ==\n' +
        '[SKIP] Skipping cross-platform --compile step in q recovery (set OPENCODE_Q_RECOVER_BUILD_BINARIES=1 to enable).'
    );
  }

  runStep('Governance flow verification', bunExecutable, ['run', 'governance:check'], { cwd: root });

  console.log('\n[PASS] q runtime recovery flow completed successfully.');
}

main();
