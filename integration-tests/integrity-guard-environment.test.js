import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');

function runIntegrityGuard(envOverrides = {}) {
  const proc = Bun.spawnSync(['node', 'scripts/integrity-guard.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      ...envOverrides
    },
    stdout: 'pipe',
    stderr: 'pipe'
  });

  return {
    exitCode: proc.exitCode,
    stdout: new TextDecoder().decode(proc.stdout),
    stderr: new TextDecoder().decode(proc.stderr)
  };
}

describe('integrity-guard environment validation', () => {
  test('logs environment details at startup', () => {
    const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'integrity-guard-data-'));

    const result = runIntegrityGuard({
      OPENCODE_DATA_DIR: tempDataDir
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('=== Environment ===');
    expect(result.stdout).toContain(`OPENCODE_DATA_DIR: ${tempDataDir}`);
    expect(result.stdout).toContain('Working directory:');
    expect(result.stdout).toContain('Runtime:');
  });

  test('fails with clear error when OPENCODE_DATA_DIR points to a missing path', () => {
    const missingDataDir = path.join(os.tmpdir(), `integrity-guard-missing-${Date.now()}`);

    const result = runIntegrityGuard({
      OPENCODE_DATA_DIR: missingDataDir
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing critical data directory');
    expect(result.stderr).toContain(missingDataDir);
  });
});
