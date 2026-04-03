import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const FAILURE_BUNDLE_REQUIRED_ARTIFACTS = Object.freeze([
  'gateJson',
  'stdoutLog',
  'stderrLog',
  'runtimeTrace',
  'sanitizedEnvSnapshot',
  'commitRunManifest',
]);

function toReason(code, message) {
  return { code, message: String(message || '').trim() || code };
}

function readJsonSafe(filePath) {
  if (!existsSync(filePath)) {
    return { ok: false, reason: toReason('EVIDENCE_MISSING_BUNDLE', `evidence file not found: ${filePath}`), value: null };
  }

  try {
    return { ok: true, reason: null, value: JSON.parse(readFileSync(filePath, 'utf8')) };
  } catch (error) {
    return {
      ok: false,
      reason: toReason('EVIDENCE_MISSING_BUNDLE', `invalid evidence JSON at ${filePath}: ${error.message}`),
      value: null,
    };
  }
}

const SIGSTORE_VERIFIER_MODE = 'sigstore';
const DISABLED_VERIFIER_MODE = 'disabled';
const SIGNATURE_PAYLOAD_TYPE = 'application/vnd.in-toto+json';

let sigstoreRuntimePromise;

function normalizeSigningVerifierMode(value) {
  const mode = String(value || SIGSTORE_VERIFIER_MODE).trim().toLowerCase();
  return mode || SIGSTORE_VERIFIER_MODE;
}

function stripSha256Prefix(value) {
  const digest = String(value || '').trim().toLowerCase();
  if (!digest) return '';
  return digest.startsWith('sha256:') ? digest.slice('sha256:'.length) : digest;
}

function normalizeDigest(value) {
  const digest = stripSha256Prefix(value);
  if (!/^[a-f0-9]{64}$/.test(digest)) return '';
  return digest;
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

function toPayloadBuffer(bundle, signature) {
  const payloadBase64 = String(signature?.payloadBase64 || '').trim();
  if (payloadBase64) {
    try {
      return Buffer.from(payloadBase64, 'base64');
    } catch {
      return null;
    }
  }

  if (signature?.payload !== undefined) {
    const payloadValue = typeof signature.payload === 'string'
      ? signature.payload
      : stableJson(signature.payload);
    return Buffer.from(payloadValue, 'utf8');
  }

  if (bundle?.payload !== undefined) {
    const payloadValue = typeof bundle.payload === 'string'
      ? bundle.payload
      : stableJson(bundle.payload);
    return Buffer.from(payloadValue, 'utf8');
  }

  const unsignedBundle = bundle && typeof bundle === 'object'
    ? { ...bundle, signature: undefined }
    : bundle;
  return Buffer.from(stableJson(unsignedBundle), 'utf8');
}

function sha256Hex(payload) {
  return createHash('sha256').update(payload).digest('hex');
}

function resolveExpectedDigest(bundle, signature) {
  const candidateDigests = [
    signature?.artifactDigest,
    signature?.digest,
    bundle?.artifactDigest,
    bundle?.artifact?.digest,
    bundle?.digest,
  ];

  for (const candidate of candidateDigests) {
    const normalized = normalizeDigest(candidate);
    if (normalized) return normalized;
  }

  return '';
}

function resolveSigstoreBundle(signature) {
  if (signature?.sigstoreBundle && typeof signature.sigstoreBundle === 'object') {
    return signature.sigstoreBundle;
  }

  if (signature?.bundle && typeof signature.bundle === 'object') {
    return signature.bundle;
  }

  return null;
}

function extractVerifiedIdentity(verifiedSigner) {
  const identity = verifiedSigner?.identity?.subjectAlternativeName;
  return String(identity || '').trim();
}

function toUnavailableReason(bundlePath, detail) {
  return toReason(
    'SIGNATURE_VERIFICATION_UNAVAILABLE',
    `${bundlePath}: signature verification unavailable (${detail})`,
  );
}

function toVerificationPolicy({ expectedSigner, expectedIssuer }) {
  const policy = {};
  if (expectedSigner) {
    policy.subjectAlternativeName = expectedSigner;
  }

  if (expectedIssuer) {
    policy.extensions = { issuer: expectedIssuer };
  }

  return Object.keys(policy).length > 0 ? policy : undefined;
}

async function loadSigstoreRuntime() {
  if (!sigstoreRuntimePromise) {
    sigstoreRuntimePromise = (async () => {
      const [verifyModule, bundleModule, tufModule] = await Promise.all([
        import('@sigstore/verify'),
        import('@sigstore/bundle'),
        import('@sigstore/tuf'),
      ]);

      const trustedRoot = await tufModule.getTrustedRoot({});
      const trustMaterial = verifyModule.toTrustMaterial(trustedRoot);
      const verifier = new verifyModule.Verifier(trustMaterial);

      return {
        verifier,
        toSignedEntity: verifyModule.toSignedEntity,
        bundleFromJSON: bundleModule.bundleFromJSON,
      };
    })();
  }

  return sigstoreRuntimePromise;
}

async function verifyWithSigstore({ sigstoreBundle, payload, expectedSigner, expectedIssuer }) {
  const runtime = await loadSigstoreRuntime();
  const signedEntity = runtime.toSignedEntity(runtime.bundleFromJSON(sigstoreBundle), payload);
  return runtime.verifier.verify(
    signedEntity,
    toVerificationPolicy({ expectedSigner, expectedIssuer }),
  );
}

export async function verifySignedEvidenceBundle({
  bundlePath,
  expectedRunId,
  expectedCommitSha,
  signingVerifier = process.env.OPENCODE_SIGNING_VERIFIER,
  sigstoreVerifier,
}) {
  const parsed = readJsonSafe(bundlePath);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: parsed.reason,
      evidencePaths: [bundlePath],
      bundle: null,
    };
  }

  const bundle = parsed.value;
  const signature = bundle?.signature;
  const hasValidSignatureEnvelope = Boolean(
    signature
    && typeof signature === 'object'
    && signature.keyless === true
  );

  if (!hasValidSignatureEnvelope) {
    return {
      ok: false,
      reason: toReason('EVIDENCE_UNSIGNED', `missing or invalid keyless signature in ${bundlePath}`),
      evidencePaths: [bundlePath],
      bundle,
    };
  }

  const mode = normalizeSigningVerifierMode(signingVerifier);
  if (mode === DISABLED_VERIFIER_MODE) {
    return {
      ok: false,
      reason: toUnavailableReason(bundlePath, 'OPENCODE_SIGNING_VERIFIER=disabled'),
      evidencePaths: [bundlePath],
      bundle,
    };
  }

  if (mode !== SIGSTORE_VERIFIER_MODE) {
    return {
      ok: false,
      reason: toUnavailableReason(bundlePath, `unsupported verifier mode: ${mode}`),
      evidencePaths: [bundlePath],
      bundle,
    };
  }

  const expectedSigner = String(signature?.signer || '').trim();
  if (!expectedSigner) {
    return {
      ok: false,
      reason: toReason('SIGNATURE_IDENTITY_MISMATCH', `${bundlePath}: missing expected signer identity`),
      evidencePaths: [bundlePath],
      bundle,
    };
  }

  const payload = toPayloadBuffer(bundle, signature);
  if (!payload || payload.length === 0) {
    return {
      ok: false,
      reason: toReason('SIGNATURE_CRYPTO_MISMATCH', `${bundlePath}: signature payload is missing or invalid`),
      evidencePaths: [bundlePath],
      bundle,
    };
  }

  const expectedDigest = resolveExpectedDigest(bundle, signature);
  if (!expectedDigest) {
    return {
      ok: false,
      reason: toReason('SIGNATURE_DIGEST_INVALID', `${bundlePath}: missing or invalid artifact digest`),
      evidencePaths: [bundlePath],
      bundle,
    };
  }

  const payloadDigest = sha256Hex(payload);
  if (payloadDigest !== expectedDigest) {
    return {
      ok: false,
      reason: toReason('SIGNATURE_DIGEST_INVALID', `${bundlePath}: artifact digest mismatch`),
      evidencePaths: [bundlePath],
      bundle,
    };
  }

  const embeddedSigstoreBundle = resolveSigstoreBundle(signature);
  if (!embeddedSigstoreBundle) {
    return {
      ok: false,
      reason: toReason('SIGNATURE_CRYPTO_MISMATCH', `${bundlePath}: missing sigstore bundle payload`),
      evidencePaths: [bundlePath],
      bundle,
    };
  }

  const verifier = sigstoreVerifier || {
    verify: ({ sigstoreBundle, payload: signedPayload, expectedSigner: signer, expectedIssuer }) => verifyWithSigstore({
      sigstoreBundle,
      payload: signedPayload,
      expectedSigner: signer,
      expectedIssuer,
    }),
  };

  let verifiedSigner;
  try {
    verifiedSigner = await verifier.verify({
      sigstoreBundle: embeddedSigstoreBundle,
      payload,
      expectedSigner,
      expectedIssuer: String(signature?.issuer || '').trim() || undefined,
      payloadType: SIGNATURE_PAYLOAD_TYPE,
    });
  } catch (error) {
    const message = String(error?.message || error || '').trim();
    const unavailable = error?.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find module|Failed to resolve module/i.test(message);
    return {
      ok: false,
      reason: unavailable
        ? toUnavailableReason(bundlePath, message || 'sigstore verifier dependencies missing')
        : toReason('SIGNATURE_CRYPTO_MISMATCH', `${bundlePath}: sigstore verification failed (${message || 'unknown error'})`),
      evidencePaths: [bundlePath],
      bundle,
    };
  }

  const verifiedIdentity = extractVerifiedIdentity(verifiedSigner);
  if (!verifiedIdentity || verifiedIdentity !== expectedSigner) {
    return {
      ok: false,
      reason: toReason(
        'SIGNATURE_IDENTITY_MISMATCH',
        `${bundlePath}: signer identity mismatch (expected ${expectedSigner}, got ${verifiedIdentity || 'missing'})`,
      ),
      evidencePaths: [bundlePath],
      bundle,
    };
  }

  const runId = String(bundle?.runId || '').trim();
  const commitSha = String(bundle?.commitSha || '').trim();
  const staleCommit = Boolean(expectedCommitSha && commitSha !== expectedCommitSha);
  const staleRun = Boolean(expectedRunId && runId !== expectedRunId);

  if (staleCommit || staleRun) {
    const staleParts = [];
    if (staleRun) staleParts.push(`runId mismatch (expected ${expectedRunId}, got ${runId || 'missing'})`);
    if (staleCommit) staleParts.push(`commit mismatch (expected ${expectedCommitSha}, got ${commitSha || 'missing'})`);
    return {
      ok: false,
      reason: toReason('EVIDENCE_STALE_COMMIT', staleParts.join('; ')),
      evidencePaths: [bundlePath],
      bundle,
    };
  }

  return {
    ok: true,
    reason: null,
    evidencePaths: [bundlePath],
    bundle,
    runId,
    commitSha,
  };
}

export function verifyFailureBundle({ bundlePath, gateId }) {
  const parsed = readJsonSafe(bundlePath);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: parsed.reason,
      evidencePaths: [bundlePath],
    };
  }

  const bundle = parsed.value;
  const artifacts = bundle?.artifacts;
  if (!artifacts || typeof artifacts !== 'object') {
    return {
      ok: false,
      reason: toReason('EVIDENCE_MISSING_BUNDLE', `failure bundle missing artifacts map: ${bundlePath}`),
      evidencePaths: [bundlePath],
    };
  }

  const missing = [];
  const missingFiles = [];
  const artifactPaths = [];

  for (const artifactKey of FAILURE_BUNDLE_REQUIRED_ARTIFACTS) {
    const rawArtifactPath = String(artifacts[artifactKey] || '').trim();
    if (!rawArtifactPath) {
      missing.push(artifactKey);
      continue;
    }

    const resolvedArtifactPath = path.isAbsolute(rawArtifactPath)
      ? rawArtifactPath
      : path.resolve(path.dirname(bundlePath), rawArtifactPath);
    artifactPaths.push(resolvedArtifactPath);

    if (!existsSync(resolvedArtifactPath)) {
      missingFiles.push(`${artifactKey}=${resolvedArtifactPath}`);
    }
  }

  if (missing.length > 0 || missingFiles.length > 0) {
    const parts = [];
    if (missing.length > 0) parts.push(`missing artifact keys: ${missing.join(', ')}`);
    if (missingFiles.length > 0) parts.push(`missing artifact files: ${missingFiles.join(', ')}`);
    return {
      ok: false,
      reason: toReason('EVIDENCE_MISSING_BUNDLE', `${gateId}: ${parts.join('; ')}`),
      evidencePaths: [bundlePath, ...artifactPaths],
    };
  }

  return {
    ok: true,
    reason: null,
    evidencePaths: [bundlePath, ...artifactPaths],
  };
}

export function writeFailureBundle({ bundlePath, gatePayload, artifacts }) {
  const dir = path.dirname(bundlePath);
  mkdirSync(dir, { recursive: true });

  const payload = {
    schemaVersion: 1,
    gate: gatePayload,
    artifacts,
    updatedAt: new Date().toISOString(),
  };

  writeFileSync(bundlePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}
