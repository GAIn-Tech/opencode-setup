#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveRoot, userConfigDir, userDataDir } from './resolve-root.mjs';

const root = resolveRoot();
const cfgDir = userConfigDir();
const dataDir = userDataDir();
const backupRoot = path.join(dataDir, 'repair-backups');

const args = new Set(process.argv.slice(2));
const safeMode = !args.has('--unsafe');
const rollbackIndex = process.argv.indexOf('--rollback');
const rollbackId = rollbackIndex >= 0 ? process.argv[rollbackIndex + 1] : null;

function run(command, cmdArgs, extraEnv = {}) {
  const result = spawnSync(command, cmdArgs, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      OPENCODE_VERIFY_ENV_PROFILE: process.env.OPENCODE_VERIFY_ENV_PROFILE || 'none',
      OPENAI_API_KEYS: process.env.OPENAI_API_KEYS || 'repair-placeholder',
      ...extraEnv,
    },
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${cmdArgs.join(' ')} failed with exit code ${result.status}`);
  }
}

function createBackup() {
  mkdirSync(backupRoot, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(backupRoot, stamp);
  mkdirSync(dir, { recursive: true });

  const cfgBackup = path.join(dir, 'user-config');
  if (existsSync(cfgDir)) {
    cpSync(cfgDir, cfgBackup, { recursive: true });
  }

  const dataConfigPath = path.join(dataDir, 'config.yaml');
  if (existsSync(dataConfigPath)) {
    cpSync(dataConfigPath, path.join(dir, 'config.yaml'));
  }

  writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
    createdAt: new Date().toISOString(),
    sourceConfigDir: cfgDir,
    sourceDataDir: dataDir,
  }, null, 2));

  return { id: stamp, dir };
}

function rollbackBackup(id) {
  if (!id) {
    throw new Error('Missing rollback id. Use: bun run repair --rollback <backup-id>');
  }

  const dir = path.join(backupRoot, id);
  if (!existsSync(dir)) {
    throw new Error(`Backup not found: ${dir}`);
  }

  const cfgBackup = path.join(dir, 'user-config');
  if (existsSync(cfgBackup)) {
    rmSync(cfgDir, { recursive: true, force: true });
    mkdirSync(path.dirname(cfgDir), { recursive: true });
    cpSync(cfgBackup, cfgDir, { recursive: true });
  }

  const dataConfigBackup = path.join(dir, 'config.yaml');
  if (existsSync(dataConfigBackup)) {
    mkdirSync(dataDir, { recursive: true });
    cpSync(dataConfigBackup, path.join(dataDir, 'config.yaml'));
  }

  console.log(`Rollback complete from backup: ${id}`);
}

function clearStaleLocks(maxAgeMs = 30000) {
  if (!existsSync(dataDir)) return [];
  const removed = [];
  const stack = [dataDir];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.lock')) continue;
      if (entry.name === 'bun.lock') continue;

      try {
        const ageMs = Date.now() - statSync(full).mtimeMs;
        if (ageMs <= maxAgeMs) continue;

        const raw = readFileSync(full, 'utf8').trim();
        let pid = Number.NaN;
        if (raw.startsWith('{')) {
          try {
            pid = Number(JSON.parse(raw)?.pid);
          } catch {
            pid = Number.NaN;
          }
        } else {
          pid = Number(raw);
        }

        let alive = false;
        if (Number.isInteger(pid) && pid > 0) {
          try {
            process.kill(pid, 0);
            alive = true;
          } catch (error) {
            alive = error?.code === 'EPERM';
          }
        }

        if (!alive) {
          rmSync(full, { force: true });
          removed.push(full);
        }
      } catch {
        // continue best-effort cleanup
      }
    }
  }

  return removed;
}

function main() {
  if (rollbackId) {
    rollbackBackup(rollbackId);
    return;
  }

  const backup = createBackup();
  console.log(`Created repair backup: ${backup.id}`);

  run('bun', ['run', 'link-all']);
  run('node', ['scripts/copy-config.mjs']);
  run('node', ['scripts/generate-mcp-config.mjs']);
  run('node', ['scripts/mcp-mirror-coherence.mjs', '--write']);

  const removedLocks = clearStaleLocks();
  if (removedLocks.length > 0) {
    console.log(`Removed ${removedLocks.length} stale lock file(s).`);
  }

  if (!safeMode) {
    run('node', ['scripts/learning-gate.mjs', '--generate-hashes']);
  }

  run('node', ['scripts/supply-chain-guard.mjs']);
  run('node', ['scripts/verify-setup.mjs']);
  run('node', ['scripts/verify-portability.mjs', '--strict', '--probe-mcp']);

  console.log('Repair completed successfully.');
  console.log(`Rollback (if needed): bun run repair --rollback ${backup.id}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
