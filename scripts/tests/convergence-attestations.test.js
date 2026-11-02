import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  buildConvergenceSnapshot,
  evaluateConvergenceAttestation,
} from '../sync-reconcile.mjs';
import { checkRestoreDrillReport } from '../verify-portability.mjs';

const GENERATE_REPORT_PATH = path.join(import.meta.dir, '..', 'generate-portability-report.mjs');

function makeTempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

describe('convergence attestations', () => {
  test('buildConvergenceSnapshot produces deterministic class hashes', () => {
    const root = makeTempDir('convergence-snapshot-');
    const runtimeDir = path.join(root, 'runtime');
    const configDir = path.join(root, 'opencode-config');

    try {
      mkdirSync(runtimeDir, { recursive: true });
      mkdirSync(configDir, { recursive: true });
      writeFileSync(path.join(root, 'bun.lock'), '# lock\n', 'utf8');
      writeFileSync(path.join(runtimeDir, 'opencode.json'), '{"ok":true}\n', 'utf8');
      writeFileSync(path.join(runtimeDir, 'tool-manifest.json'), '{"generated":true}\n', 'utf8');
      writeFileSync(path.join(configDir, 'opencode.json'), '{"source":true}\n', 'utf8');

      const a = buildConvergenceSnapshot({
        flow: 'fresh-clone',
        rootDir: root,
        runtimeConfigDir: runtimeDir,
        repoConfigDir: configDir,
        trackedConfigFiles: ['opencode.json'],
        generatedArtifacts: [path.join(runtimeDir, 'tool-manifest.json')],
      });

      const b = buildConvergenceSnapshot({
        flow: 'fresh-clone',
        rootDir: root,
        runtimeConfigDir: runtimeDir,
        repoConfigDir: configDir,
        trackedConfigFiles: ['opencode.json'],
        generatedArtifacts: [path.join(runtimeDir, 'tool-manifest.json')],
      });

      expect(a.hashesByClass).toEqual(b.hashesByClass);
      expect(Object.keys(a.hashesByClass).sort()).toEqual([
        'generatedArtifacts',
        'lockfile',
        'runtimeConfig',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('convergence snapshot includes runId and commitSha binding', () => {
    const root = makeTempDir('convergence-binding-');
    const runtimeDir = path.join(root, 'runtime');
    const configDir = path.join(root, 'opencode-config');

    try {
      mkdirSync(runtimeDir, { recursive: true });
      mkdirSync(configDir, { recursive: true });
      writeFileSync(path.join(root, 'bun.lock'), '# lock\n', 'utf8');
      writeFileSync(path.join(runtimeDir, 'opencode.json'), '{"ok":true}\n', 'utf8');
      writeFileSync(path.join(runtimeDir, 'tool-manifest.json'), '{"generated":true}\n', 'utf8');
      writeFileSync(path.join(configDir, 'opencode.json'), '{"source":true}\n', 'utf8');

      const snapshot = buildConvergenceSnapshot({
        flow: 'pull-reconcile',
        rootDir: root,
        runtimeConfigDir: runtimeDir,
        repoConfigDir: configDir,
        trackedConfigFiles: ['opencode.json'],
        generatedArtifacts: [path.join(runtimeDir, 'tool-manifest.json')],
        runId: 'run-123',
        commitSha: 'abc123def456',
      });

      expect(snapshot.runId).toBe('run-123');
      expect(snapshot.commitSha).toBe('abc123def456');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('evaluateConvergenceAttestation emits required reason codes for missing/mismatch/drift', () => {
    const fresh = {
      flow: 'fresh-clone',
      hashesByClass: {
        runtimeConfig: 'aaa',
        lockfile: 'bbb',
        generatedArtifacts: 'ccc',
      },
    };

    const pull = {
      flow: 'pull-reconcile',
      hashesByClass: {
        runtimeConfig: 'aaa',
        lockfile: 'mismatch',
      },
      driftSignals: ['config-conflict:opencode.json'],
    };

    const verdict = evaluateConvergenceAttestation({
      freshCloneAttestation: fresh,
      pullReconcileAttestation: pull,
    });

    expect(verdict.status).toBe('failed');
    expect(verdict.reasons.some((reason) => reason.startsWith('CONVERGENCE_ATTESTATION_MISSING:generatedArtifacts'))).toBe(true);
    expect(verdict.reasons.some((reason) => reason.startsWith('CONVERGENCE_HASH_MISMATCH:lockfile'))).toBe(true);
    expect(verdict.reasons.some((reason) => reason.startsWith('CONVERGENCE_DRIFT_DETECTED:'))).toBe(true);
  });

  test('generate-portability-report includes convergence gate and passes for equivalent attestations', { timeout: 60000 }, () => {
    const tempDir = makeTempDir('convergence-report-');
    const outputPath = path.join(tempDir, 'portability-report.json');
    const freshPath = path.join(tempDir, 'fresh-convergence.json');
    const pullPath = path.join(tempDir, 'pull-convergence.json');

    const snapshot = {
      schemaVersion: 1,
      hashesByClass: {
        runtimeConfig: 'h1',
        lockfile: 'h2',
        generatedArtifacts: 'h3',
      },
      driftSignals: [],
    };

    writeFileSync(freshPath, `${JSON.stringify({ ...snapshot, flow: 'fresh-clone' }, null, 2)}\n`, 'utf8');
    writeFileSync(pullPath, `${JSON.stringify({ ...snapshot, flow: 'pull-reconcile' }, null, 2)}\n`, 'utf8');

    try {
      const run = spawnSync(process.execPath, [GENERATE_REPORT_PATH, '--output', outputPath], {
        encoding: 'utf8',
        env: {
          ...process.env,
          OPENCODE_PORTABILITY_FRESH_CONVERGENCE_PATH: freshPath,
          OPENCODE_PORTABILITY_PULL_CONVERGENCE_PATH: pullPath,
        },
      });

      expect(run.error).toBeUndefined();
      const report = JSON.parse(readFileSync(outputPath, 'utf8'));
      expect(report.releaseVerdict.gates).toHaveProperty('convergenceAttestation');
      expect(report.releaseVerdict.gates.convergenceAttestation.status).toBe('passed');
      expect(report.convergenceAttestation.status).toBe('passed');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('restore drill validation fails on stale convergence run evidence', () => {
    const tempDir = makeTempDir('restore-drill-stale-run-');
    const evidencePath = path.join(tempDir, 'restore-evidence.json');

    try {
      writeFileSync(evidencePath, `${JSON.stringify({
        startedAt: '2026-01-01T10:00:00.000Z',
        completedAt: '2026-01-01T10:30:00.000Z',
        backupTimestamp: '2026-01-01T09:50:00.000Z',
        integrityCheck: 'pass',
        convergenceSnapshot: {
          runId: 'stale-run-id',
          commitSha: 'commit-ok',
        },
      }, null, 2)}\n`, 'utf8');

      const { failures, restoreDrillReport } = checkRestoreDrillReport({
        strictMode: true,
        env: {
          ...process.env,
          OPENCODE_PORTABILITY_RESTORE_DRILL_EVIDENCE: evidencePath,
          OPENCODE_PORTABILITY_RUN_ID: 'expected-run-id',
          OPENCODE_PORTABILITY_COMMIT_SHA: 'commit-ok',
        },
      });

      expect(restoreDrillReport.status).toBe('failed');
      expect(failures.some((entry) => entry.includes('RESTORE_DRILL_STALE_EVIDENCE'))).toBe(true);
      expect(failures.some((entry) => entry.includes('CONVERGENCE_STALE_RUN'))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('restore drill validation fails on convergence commit mismatch evidence', () => {
    const tempDir = makeTempDir('restore-drill-commit-mismatch-');
    const evidencePath = path.join(tempDir, 'restore-evidence.json');

    try {
      writeFileSync(evidencePath, `${JSON.stringify({
        startedAt: '2026-01-01T10:00:00.000Z',
        completedAt: '2026-01-01T10:30:00.000Z',
        backupTimestamp: '2026-01-01T09:50:00.000Z',
        integrityCheck: 'pass',
        convergenceSnapshot: {
          runId: 'expected-run-id',
          commitSha: 'stale-commit-sha',
        },
      }, null, 2)}\n`, 'utf8');

      const { failures, restoreDrillReport } = checkRestoreDrillReport({
        strictMode: true,
        env: {
          ...process.env,
          OPENCODE_PORTABILITY_RESTORE_DRILL_EVIDENCE: evidencePath,
          OPENCODE_PORTABILITY_RUN_ID: 'expected-run-id',
          OPENCODE_PORTABILITY_COMMIT_SHA: 'expected-commit-sha',
        },
      });

      expect(restoreDrillReport.status).toBe('failed');
      expect(failures.some((entry) => entry.includes('RESTORE_DRILL_STALE_EVIDENCE'))).toBe(true);
      expect(failures.some((entry) => entry.includes('CONVERGENCE_COMMIT_MISMATCH'))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
