import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluateBootstrapPrereqs } from '../verify-bootstrap-prereqs.mjs';

const VERIFY_BOOTSTRAP_PREREQS_PATH = path.join(import.meta.dir, '..', 'verify-bootstrap-prereqs.mjs');

function makeTempRootWithBunVersion(version = '1.3.10') {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'verify-bootstrap-prereqs-'));
  writeFileSync(path.join(tempRoot, '.bun-version'), `${version}\n`, 'utf8');
  return tempRoot;
}

describe('verify-bootstrap-prereqs', () => {
  test('returns deterministic failure when required command is missing', () => {
    const tempRoot = makeTempRootWithBunVersion('1.3.10');

    try {
      const report = evaluateBootstrapPrereqs({
        strict: true,
        rootDir: tempRoot,
        env: {
          LC_ALL: 'C',
          TZ: 'UTC',
          LANG: 'C.UTF-8',
        },
        commandLocator: (command) => (command === 'bun' ? null : `/usr/bin/${command}`),
        commandVersionReader: (command) => {
          if (command === 'node') return 'v22.11.0';
          if (command === 'git') return 'git version 2.46.0';
          return '';
        },
      });

      expect(report.ok).toBe(false);
      expect(report.missing).toContain('bun');
      expect(report.invalid).toEqual([]);
      expect(report.reasons).toContain("missing required prerequisite: bun");
      expect(Array.isArray(report.prereqs)).toBe(true);
      expect(report.prereqs.find((entry) => entry.name === 'bun')).toEqual(expect.objectContaining({
        ok: false,
        status: 'missing',
      }));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('strict mode rejects deterministic env baseline mismatches', () => {
    const tempRoot = makeTempRootWithBunVersion('1.3.10');

    try {
      const report = evaluateBootstrapPrereqs({
        strict: true,
        rootDir: tempRoot,
        env: {
          LC_ALL: 'en_US.UTF-8',
          TZ: 'America/New_York',
          LANG: '',
        },
        commandLocator: () => '/usr/bin/mock',
        commandVersionReader: (command) => {
          if (command === 'bun') return '1.3.10';
          if (command === 'node') return 'v22.11.0';
          if (command === 'git') return 'git version 2.46.0';
          return '';
        },
      });

      expect(report.ok).toBe(false);
      expect(report.invalid).toContain('LC_ALL');
      expect(report.invalid).toContain('TZ');
      expect(report.invalid).toContain('LANG');
      expect(report.reasons).toContain('LC_ALL must be C in strict mode');
      expect(report.reasons).toContain('TZ must be UTC in strict mode');
      expect(report.reasons).toContain('LANG must be set in strict mode');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('strict mode rejects invalid bun version mismatch against source of truth', () => {
    const tempRoot = makeTempRootWithBunVersion('1.3.10');

    try {
      const report = evaluateBootstrapPrereqs({
        strict: true,
        rootDir: tempRoot,
        env: {
          LC_ALL: 'C',
          TZ: 'UTC',
          LANG: 'C.UTF-8',
        },
        commandLocator: () => '/usr/bin/mock',
        commandVersionReader: (command) => {
          if (command === 'bun') return '1.3.9';
          if (command === 'node') return 'v22.11.0';
          if (command === 'git') return 'git version 2.46.0';
          return '';
        },
      });

      expect(report.ok).toBe(false);
      expect(report.invalid).toContain('bun');
      expect(report.reasons).toContain('bun version mismatch: required 1.3.10, detected 1.3.9');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('strict mode CLI emits prerequisite report JSON and exits non-zero on failure', () => {
    const run = spawnSync(process.execPath, [VERIFY_BOOTSTRAP_PREREQS_PATH, '--strict'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        LC_ALL: 'en_US.UTF-8',
        TZ: 'America/New_York',
        LANG: '',
      },
    });

    expect(run.status).toBe(1);
    const payload = JSON.parse(run.stdout);
    expect(payload).toEqual(expect.objectContaining({
      ok: false,
      prereqs: expect.any(Array),
      missing: expect.any(Array),
      invalid: expect.any(Array),
      reasons: expect.any(Array),
    }));
    expect(payload.reasons.length).toBeGreaterThan(0);
  });
});
