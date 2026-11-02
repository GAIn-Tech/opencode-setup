#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveRoot, userDataDir } from './resolve-root.mjs';

const root = resolveRoot();
const dataHome = userDataDir();
const outputJson = process.argv.includes('--json');

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8',
    env: {
      ...process.env,
      OPENCODE_VERIFY_ENV_PROFILE: process.env.OPENCODE_VERIFY_ENV_PROFILE || 'none',
      OPENAI_API_KEYS: process.env.OPENAI_API_KEYS || 'diagnostic-placeholder',
    },
    ...opts,
  });

  return {
    command: `${command} ${args.join(' ')}`,
    status: result.status ?? -1,
    ok: result.status === 0,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    error: result.error ? String(result.error.message || result.error) : null,
  };
}

function findStaleLocks(maxAgeMs = 30000) {
  const stale = [];
  const lockRoot = dataHome;
  if (!existsSync(lockRoot)) return stale;

  const stack = [lockRoot];
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
            const parsed = JSON.parse(raw);
            pid = Number(parsed?.pid);
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
            const code = error?.code;
            alive = code === 'EPERM';
          }
        }

        if (!alive) {
          stale.push({ file: full, ageMs, pid: Number.isInteger(pid) ? pid : null });
        }
      } catch {
        // best effort
      }
    }
  }

  return stale;
}

function main() {
  const checks = [
    run('node', ['scripts/mcp-mirror-coherence.mjs']),
    run('node', ['scripts/check-skill-consistency.mjs']),
    run('node', ['scripts/verify-setup.mjs']),
    run('node', ['scripts/verify-portability.mjs', '--strict', '--probe-mcp']),
    run('node', ['scripts/supply-chain-guard.mjs']),
  ];

  const staleLocks = findStaleLocks();
  const ok = checks.every((check) => check.ok) && staleLocks.length === 0;

  const payload = {
    generatedAt: new Date().toISOString(),
    ok,
    checks,
    staleLocks,
    hints: [
      'Run: bun run repair --safe',
      'If stale locks persist, inspect processes and remove dead lock files via repair.',
    ],
  };

  if (outputJson) {
    process.stdout.write(JSON.stringify(payload, null, 2));
  } else {
    console.log('== OpenCode Doctor ==');
    for (const check of checks) {
      console.log(`[${check.ok ? 'PASS' : 'FAIL'}] ${check.command}`);
      if (!check.ok && check.stderr) console.log(`  ${check.stderr.split(/\r?\n/)[0]}`);
      if (!check.ok && !check.stderr && check.error) console.log(`  ${check.error}`);
    }
    if (staleLocks.length > 0) {
      console.log('[FAIL] stale lock files detected:');
      for (const lock of staleLocks) {
        console.log(`  - ${lock.file}`);
      }
    }
    if (ok) {
      console.log('PASS: environment is healthy and portable.');
    } else {
      console.log('FAIL: issues detected. Run `bun run repair --safe` for guided remediation.');
    }
  }

  process.exit(ok ? 0 : 1);
}

main();
