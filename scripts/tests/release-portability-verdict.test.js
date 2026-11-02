import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  evaluateReleasePortabilityVerdict,
} from '../release-portability-verdict.mjs';
import { writeFailureBundle } from '../lib/signed-evidence-bundle.mjs';

function makeTempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function createArtifact(filePath, content = 'ok\n') {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function createValidFailureBundle({ dir, gateId }) {
  const bundlePath = path.join(dir, `${gateId}.json`);
  const artifacts = {
    gateJson: path.join(dir, `${gateId}.gate.json`),
    stdoutLog: path.join(dir, `${gateId}.stdout.log`),
    stderrLog: path.join(dir, `${gateId}.stderr.log`),
    runtimeTrace: path.join(dir, `${gateId}.trace.log`),
    sanitizedEnvSnapshot: path.join(dir, `${gateId}.env.json`),
    commitRunManifest: path.join(dir, `${gateId}.manifest.json`),
  };

  for (const artifactPath of Object.values(artifacts)) {
    createArtifact(artifactPath, '{}\n');
  }

  writeFailureBundle({
    bundlePath,
    gatePayload: { id: gateId, ok: false },
    artifacts,
  });

  return bundlePath;
}

function baseScope() {
  return {
    target: 'TOTAL replicability',
    environments: ['dev', 'ci'],
    osMatrix: ['windows', 'linux'],
    policy: 'zero-waiver',
  };
}

describe('release-portability-verdict', () => {
  test('fails with EVIDENCE_UNSIGNED when signature is missing', async () => {
    const dir = makeTempDir('release-verdict-unsigned-');
    const failureBundleDir = path.join(dir, 'failure-bundles');

    try {
      const signedBundlePath = path.join(dir, 'signed-evidence-bundle.json');
      writeFileSync(signedBundlePath, `${JSON.stringify({ runId: 'r1', commitSha: 'abc' }, null, 2)}\n`, 'utf8');

      const verdict = await evaluateReleasePortabilityVerdict({
        scope: baseScope(),
        evidence: { runId: 'r1', commitSha: 'abc', signedBundlePath },
        failureBundleDir,
        enforceFailureBundles: false,
        gates: [{
          id: 'signedEvidence',
          surface: 'evidence-admissibility',
          severity: 'P0',
          class: 'fast',
          checkDescription: 'signed evidence required',
          passCriteria: 'signature present',
          boundCommitSha: 'abc',
          evidencePaths: [signedBundlePath],
          check: async () => ({
            ok: false,
            reason: { code: 'EVIDENCE_UNSIGNED', message: 'missing signature' },
            evidencePaths: [signedBundlePath],
            boundCommitSha: 'abc',
          }),
        }],
      });

      expect(verdict.overall.ok).toBe(false);
      expect(verdict.overall.reasonCodes).toContain('EVIDENCE_UNSIGNED');
      expect(verdict.overall.top10ExecutiveSummary.length).toBeGreaterThan(0);
      expect(verdict.overall.fullRegister.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails with EVIDENCE_STALE_COMMIT on stale commit binding', async () => {
    const dir = makeTempDir('release-verdict-stale-');

    try {
      const verdict = await evaluateReleasePortabilityVerdict({
        scope: baseScope(),
        evidence: { runId: 'r2', commitSha: 'expected' },
        failureBundleDir: path.join(dir, 'failure-bundles'),
        enforceFailureBundles: false,
        gates: [{
          id: 'signedEvidence',
          surface: 'evidence-admissibility',
          severity: 'P0',
          class: 'fast',
          checkDescription: 'same commit required',
          passCriteria: 'bundle commit equals expected commit',
          boundCommitSha: 'expected',
          evidencePaths: [],
          check: async () => ({
            ok: false,
            reason: { code: 'EVIDENCE_STALE_COMMIT', message: 'commit mismatch' },
            boundCommitSha: 'different',
          }),
        }],
      });

      expect(verdict.overall.ok).toBe(false);
      expect(verdict.overall.reasonCodes).toContain('EVIDENCE_STALE_COMMIT');
      expect(verdict.gates[0].boundCommitSha).toBe('different');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails with EVIDENCE_MISSING_BUNDLE when a failed P0 gate has no complete failure bundle', async () => {
    const dir = makeTempDir('release-verdict-bundle-missing-');
    const failureBundleDir = path.join(dir, 'failure-bundles');

    try {
      mkdirSync(failureBundleDir, { recursive: true });
      const bundlePath = path.join(failureBundleDir, 'criticalGate.json');
      writeFileSync(bundlePath, `${JSON.stringify({ artifacts: { gateJson: 'only-one.json' } }, null, 2)}\n`, 'utf8');

      const verdict = await evaluateReleasePortabilityVerdict({
        scope: baseScope(),
        evidence: { runId: 'r3', commitSha: 'c3' },
        failureBundleDir,
        enforceFailureBundles: true,
        gates: [{
          id: 'criticalGate',
          surface: 'portability-critical',
          severity: 'P0',
          class: 'fast',
          checkDescription: 'forced failure',
          passCriteria: 'must pass',
          boundCommitSha: 'c3',
          evidencePaths: [],
          check: async () => ({
            ok: false,
            reason: { code: 'TEST_FAIL', message: 'forced failure' },
          }),
        }],
      });

      expect(verdict.overall.ok).toBe(false);
      expect(verdict.overall.reasonCodes).toContain('EVIDENCE_MISSING_BUNDLE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails with GATE_TIMEOUT when gate exceeds class timeout', async () => {
    const dir = makeTempDir('release-verdict-timeout-');

    try {
      const verdict = await evaluateReleasePortabilityVerdict({
        scope: baseScope(),
        evidence: { runId: 'r4', commitSha: 'c4' },
        failureBundleDir: path.join(dir, 'failure-bundles'),
        enforceFailureBundles: false,
        timeoutByClass: {
          fast: 20,
          medium: 50,
          heavy: 100,
          overall: 200,
        },
        gates: [{
          id: 'slowGate',
          surface: 'runtime',
          severity: 'P0',
          class: 'fast',
          checkDescription: 'slow gate',
          passCriteria: 'complete under timeout',
          boundCommitSha: 'c4',
          evidencePaths: [],
          check: async () => {
            await new Promise((resolve) => setTimeout(resolve, 60));
            return { ok: true, reason: { code: 'PASS', message: 'done' } };
          },
        }],
      });

      expect(verdict.overall.ok).toBe(false);
      expect(verdict.overall.reasonCodes).toContain('GATE_TIMEOUT');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails with GATE_MISSING_RESULT when gate returns invalid payload', async () => {
    const dir = makeTempDir('release-verdict-missing-result-');

    try {
      const verdict = await evaluateReleasePortabilityVerdict({
        scope: baseScope(),
        evidence: { runId: 'r5', commitSha: 'c5' },
        failureBundleDir: path.join(dir, 'failure-bundles'),
        enforceFailureBundles: false,
        gates: [{
          id: 'invalidGate',
          surface: 'aggregation',
          severity: 'P0',
          class: 'fast',
          checkDescription: 'return result',
          passCriteria: 'must return {ok:boolean}',
          boundCommitSha: 'c5',
          evidencePaths: [],
          check: async () => ({ status: 'missing-ok' }),
        }],
      });

      expect(verdict.overall.ok).toBe(false);
      expect(verdict.overall.reasonCodes).toContain('GATE_MISSING_RESULT');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('passes with complete signed evidence and complete failure bundles when all gates pass', async () => {
    const dir = makeTempDir('release-verdict-pass-');
    const failureBundleDir = path.join(dir, 'failure-bundles');

    try {
      createValidFailureBundle({ dir: failureBundleDir, gateId: 'unusedGate' });

      const verdict = await evaluateReleasePortabilityVerdict({
        scope: baseScope(),
        evidence: { runId: 'r6', commitSha: 'c6' },
        failureBundleDir,
        enforceFailureBundles: true,
        gates: [{
          id: 'allGood',
          surface: 'release-contract',
          severity: 'P0',
          class: 'fast',
          checkDescription: 'all good',
          passCriteria: 'pass',
          boundCommitSha: 'c6',
          evidencePaths: [],
          check: async () => ({ ok: true, reason: { code: 'PASS', message: 'ok' } }),
        }],
      });

      expect(verdict.overall.ok).toBe(true);
      expect(verdict.overall.status).toBe('passed');
      expect(verdict.overall.top10ExecutiveSummary).toEqual([]);
      expect(verdict.overall.fullRegister).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
