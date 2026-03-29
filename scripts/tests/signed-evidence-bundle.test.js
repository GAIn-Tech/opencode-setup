import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifySignedEvidenceBundle } from '../lib/signed-evidence-bundle.mjs';

function makeTempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function writeSignedBundle({
  filePath,
  runId,
  commitSha,
  signer,
  payload,
  artifactDigest,
}) {
  const bundle = {
    runId,
    commitSha,
    signature: {
      verified: false,
      keyless: true,
      signer,
      payload,
      artifactDigest,
      sigstoreBundle: {
        mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json',
        verificationMaterial: {},
        content: {},
      },
    },
  };

  writeFileSync(filePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
}

async function withVerifierMode(mode, run) {
  const previous = process.env.OPENCODE_SIGNING_VERIFIER;
  if (mode === undefined) {
    delete process.env.OPENCODE_SIGNING_VERIFIER;
  } else {
    process.env.OPENCODE_SIGNING_VERIFIER = mode;
  }

  try {
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env.OPENCODE_SIGNING_VERIFIER;
    } else {
      process.env.OPENCODE_SIGNING_VERIFIER = previous;
    }
  }
}

describe('verifySignedEvidenceBundle', () => {
  test('passes with cryptographically-verified sigstore signature', async () => {
    const dir = makeTempDir('signed-evidence-pass-');
    const bundlePath = path.join(dir, 'signed-evidence-bundle.json');
    const signer = 'https://github.com/GAIn-Tech/opencode-setup/.github/workflows/release.yml@refs/heads/main';
    const payload = JSON.stringify({ artifact: 'portability-report', commitSha: 'abc123' });

    try {
      writeSignedBundle({
        filePath: bundlePath,
        runId: 'run-1',
        commitSha: 'abc123',
        signer,
        payload,
        artifactDigest: `sha256:${sha256Hex(payload)}`,
      });

      const result = await withVerifierMode('sigstore', async () => verifySignedEvidenceBundle({
        bundlePath,
        expectedRunId: 'run-1',
        expectedCommitSha: 'abc123',
        sigstoreVerifier: {
          verify: async ({ expectedSigner }) => ({
            identity: {
              subjectAlternativeName: expectedSigner,
            },
          }),
        },
      }));

      expect(result.ok).toBe(true);
      expect(result.reason).toBeNull();
      expect(result.runId).toBe('run-1');
      expect(result.commitSha).toBe('abc123');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails closed when signature verifier is explicitly disabled', async () => {
    const dir = makeTempDir('signed-evidence-disabled-');
    const bundlePath = path.join(dir, 'signed-evidence-bundle.json');
    const payload = JSON.stringify({ artifact: 'portability-report', commitSha: 'abc123' });

    try {
      writeSignedBundle({
        filePath: bundlePath,
        runId: 'run-2',
        commitSha: 'abc123',
        signer: 'https://github.com/GAIn-Tech/opencode-setup/.github/workflows/release.yml@refs/heads/main',
        payload,
        artifactDigest: `sha256:${sha256Hex(payload)}`,
      });

      const result = await withVerifierMode('disabled', async () => verifySignedEvidenceBundle({
        bundlePath,
        expectedRunId: 'run-2',
        expectedCommitSha: 'abc123',
      }));

      expect(result.ok).toBe(false);
      expect(result.reason.code).toBe('SIGNATURE_VERIFICATION_UNAVAILABLE');
      expect(result.reason.message).toContain('OPENCODE_SIGNING_VERIFIER=disabled');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails when signature digest does not match artifact payload digest', async () => {
    const dir = makeTempDir('signed-evidence-digest-');
    const bundlePath = path.join(dir, 'signed-evidence-bundle.json');
    const payload = JSON.stringify({ artifact: 'portability-report', commitSha: 'abc123' });
    let verifyCalls = 0;

    try {
      writeSignedBundle({
        filePath: bundlePath,
        runId: 'run-3',
        commitSha: 'abc123',
        signer: 'https://github.com/GAIn-Tech/opencode-setup/.github/workflows/release.yml@refs/heads/main',
        payload,
        artifactDigest: `sha256:${sha256Hex('different-payload')}`,
      });

      const result = await withVerifierMode('sigstore', async () => verifySignedEvidenceBundle({
        bundlePath,
        expectedRunId: 'run-3',
        expectedCommitSha: 'abc123',
        sigstoreVerifier: {
          verify: async () => {
            verifyCalls += 1;
            return { identity: { subjectAlternativeName: 'ignored' } };
          },
        },
      }));

      expect(result.ok).toBe(false);
      expect(result.reason.code).toBe('SIGNATURE_DIGEST_INVALID');
      expect(verifyCalls).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails when verified signer identity does not match expected signer', async () => {
    const dir = makeTempDir('signed-evidence-identity-');
    const bundlePath = path.join(dir, 'signed-evidence-bundle.json');
    const expectedSigner = 'https://github.com/GAIn-Tech/opencode-setup/.github/workflows/release.yml@refs/heads/main';
    const payload = JSON.stringify({ artifact: 'portability-report', commitSha: 'abc123' });

    try {
      writeSignedBundle({
        filePath: bundlePath,
        runId: 'run-4',
        commitSha: 'abc123',
        signer: expectedSigner,
        payload,
        artifactDigest: `sha256:${sha256Hex(payload)}`,
      });

      const result = await withVerifierMode('sigstore', async () => verifySignedEvidenceBundle({
        bundlePath,
        expectedRunId: 'run-4',
        expectedCommitSha: 'abc123',
        sigstoreVerifier: {
          verify: async () => ({
            identity: {
              subjectAlternativeName: 'https://github.com/another/repo/.github/workflows/ci.yml@refs/heads/main',
            },
          }),
        },
      }));

      expect(result.ok).toBe(false);
      expect(result.reason.code).toBe('SIGNATURE_IDENTITY_MISMATCH');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
