import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  checkDeterminismFailures,
  checkHermeticityFailures,
  checkSupportFloorReport,
  checkUniversalProofAttestationFailures,
  checkPluginCommandFailures,
  checkRequiredEnvFailures,
  extractEnvPlaceholders,
  getEnabledLocalMcpCommands,
  lintReleaseVerdictZeroWaiver,
  normalizePluginName,
} from '../verify-portability.mjs';

const VERIFY_PORTABILITY_PATH = path.join(import.meta.dir, '..', 'verify-portability.mjs');
const PORTABILITY_MATRIX_WORKFLOW_PATH = path.join(import.meta.dir, '..', '..', '.github', 'workflows', 'portability-matrix.yml');
const RESTORE_EVIDENCE_PATH = path.join(import.meta.dir, '..', '..', '.sisyphus', 'evidence', 'task-5-restore-pass.json');

function runStrictJsonWithGateBaseline(extraEnv = {}) {
  return spawnSync('node', [VERIFY_PORTABILITY_PATH, '--strict', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      OPENCODE_PORTABILITY_PLATFORM: 'linux',
      OPENCODE_PORTABILITY_RELEASE: '6.8.0',
      OPENCODE_PORTABILITY_ARCH: 'x64',
      OPENCODE_PORTABILITY_BUN_VERSION: '1.3.10',
      OPENCODE_PORTABILITY_RESTORE_DRILL_EVIDENCE: RESTORE_EVIDENCE_PATH,
      LC_ALL: 'C',
      LANG: 'C.UTF-8',
      TZ: 'UTC',
      OPENCODE_CONFIG_HOME: path.join(import.meta.dir, '.tmp-config'),
      OPENCODE_DATA_HOME: path.join(import.meta.dir, '.tmp-data'),
      XDG_CACHE_HOME: path.join(import.meta.dir, '.tmp-cache'),
      TMPDIR: path.join(import.meta.dir, '.tmp-temp'),
      TEMP: path.join(import.meta.dir, '.tmp-temp'),
      TMP: path.join(import.meta.dir, '.tmp-temp'),
      OPENCODE_PORTABILITY_FS_CASE_SENSITIVITY: 'sensitive',
      OPENCODE_PORTABILITY_ENCODING: 'UTF-8',
      ...extraEnv,
    },
  });
}

function runStrictJsonWithRestoreEvidence(evidencePath, extraEnv = {}) {
  return spawnSync('node', [VERIFY_PORTABILITY_PATH, '--strict', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      OPENCODE_PORTABILITY_PLATFORM: 'linux',
      OPENCODE_PORTABILITY_RELEASE: '6.8.0',
      OPENCODE_PORTABILITY_ARCH: 'x64',
      OPENCODE_PORTABILITY_BUN_VERSION: '1.3.10',
      OPENCODE_PORTABILITY_RESTORE_DRILL_EVIDENCE: evidencePath,
      ...extraEnv,
    },
  });
}

function writeProofArtifact(dir, fileName, payload) {
  const filePath = path.join(dir, fileName);
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}

function makeUniversalProofPayload({ runId, commitSha, requiredCount = 1, attestedCount = 1, missingAttestations = [] }) {
  return {
    proofRunId: runId,
    proofCommitSha: commitSha,
    universalProof: {
      mode: 'deterministic-attestation',
      runId,
      commitSha,
      requiredCount,
      attestedCount,
      missingAttestations,
      status: missingAttestations.length === 0 && attestedCount >= requiredCount ? 'passed' : 'failed',
    },
  };
}

describe('verify-portability helpers', () => {
  test('extractEnvPlaceholders finds nested {env:VAR} tokens', () => {
    const value = {
      provider: {
        google: {
          options: {
            apiKey: '{env:GOOGLE_API_KEYS}',
          },
        },
      },
      mcp: {
        supermemory: {
          headers: {
            Authorization: 'Bearer {env:SUPERMEMORY_API_KEY}',
          },
        },
      },
    };

    const vars = extractEnvPlaceholders(value);
    expect(vars.has('GOOGLE_API_KEYS')).toBe(true);
    expect(vars.has('SUPERMEMORY_API_KEY')).toBe(true);
    expect(vars.size).toBe(2);
  });

  test('getEnabledLocalMcpCommands returns only enabled local servers', () => {
    const mcp = {
      context7: { type: 'remote', url: 'https://mcp.context7.com/mcp', enabled: true },
      distill: { type: 'local', command: ['npx', '-y', 'distill-mcp@0.8.1'], enabled: true },
      tavily: { type: 'local', command: ['npx', '-y', 'tavily-mcp@0.2.16'], enabled: false },
      grep: { type: 'local', command: ['uvx', 'grep-mcp'], enabled: true },
    };

    const commands = getEnabledLocalMcpCommands(mcp);
    expect(commands).toEqual([
      { name: 'distill', command: 'npx' },
      { name: 'grep', command: 'uvx' },
    ]);
  });

  test('normalizePluginName strips npm version suffix', () => {
    expect(normalizePluginName('opencode-supermemory@2.0.1')).toBe('opencode-supermemory');
    expect(normalizePluginName('@scope/plugin@1.2.3')).toBe('@scope/plugin');
    expect(normalizePluginName('@scope/plugin')).toBe('@scope/plugin');
  });

  test('strict mode does not fail when no env placeholders exist', () => {
    const result = checkRequiredEnvFailures({ provider: {}, mcp: {} }, true);
    expect(result.failures).toEqual([]);
  });

  test('plugin command requirements are skipped for unrelated plugins', () => {
    const result = checkPluginCommandFailures({ plugin: ['opencode-supermemory@2.0.1'] });
    expect(result.failures).toEqual([]);
  });

  test('opencode-beads requires bd command when configured', () => {
    const result = checkPluginCommandFailures(
      { plugin: ['opencode-beads@0.6.0'] },
      () => null,
    );
    expect(result.failures).toEqual(["Missing required command 'bd' for configured plugin 'opencode-beads'"]);
  });

  test('support floor reports supported contract when platform/runtime match', () => {
    const report = checkSupportFloorReport({
      platform: 'linux',
      release: '6.8.0',
      arch: 'x64',
      bunVersion: '1.3.10',
      requiredBunVersion: '1.3.10',
    });

    expect(report).toEqual({
      supported: true,
      reason: 'supported',
      detected: {
        platform: 'linux',
        release: '6.8.0',
        arch: 'x64',
        bunVersion: '1.3.10',
        requiredBunVersion: '1.3.10',
      },
    });
  });

  test('support floor rejects simulated unsupported platform/runtime contract', () => {
    const report = checkSupportFloorReport({
      platform: 'aix',
      release: '7.3',
      arch: 'ppc64',
      bunVersion: '0.9.0',
      requiredBunVersion: '1.3.10',
    });

    expect(report.supported).toBe(false);
    expect(report.reason).toContain('unsupported platform');
    expect(report.detected).toEqual({
      platform: 'aix',
      release: '7.3',
      arch: 'ppc64',
      bunVersion: '0.9.0',
      requiredBunVersion: '1.3.10',
    });
  });

  test('strict json exits non-zero with explicit support-floor reason for unsupported env', () => {
    const run = spawnSync('node', [VERIFY_PORTABILITY_PATH, '--strict', '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        OPENCODE_PORTABILITY_PLATFORM: 'aix',
        OPENCODE_PORTABILITY_RELEASE: '7.3',
        OPENCODE_PORTABILITY_ARCH: 'ppc64',
        OPENCODE_PORTABILITY_BUN_VERSION: '0.9.0',
      },
    });

    expect(run.status).toBe(1);

    const payload = JSON.parse(run.stdout);
    expect(payload.supportFloorReport.supported).toBe(false);
    expect(payload.supportFloorReport.reason).toContain('unsupported platform');
    expect(payload.failures).toContain('Support floor gate failed: unsupported platform: aix');
  });

  test('strict json output includes supplyChainReport contract', () => {
    const run = spawnSync('node', [VERIFY_PORTABILITY_PATH, '--strict', '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        OPENCODE_PORTABILITY_PLATFORM: 'linux',
        OPENCODE_PORTABILITY_RELEASE: '6.8.0',
        OPENCODE_PORTABILITY_ARCH: 'x64',
        OPENCODE_PORTABILITY_BUN_VERSION: '1.3.10',
      },
    });

    const payload = JSON.parse(run.stdout);
    expect(payload).toHaveProperty('supplyChainReport');
    expect(typeof payload.supplyChainReport.status).toBe('string');
    expect(typeof payload.supplyChainReport.reason).toBe('string');
  });

  test('strict json exits non-zero for simulated provenance mismatch', () => {
    const run = spawnSync('node', [VERIFY_PORTABILITY_PATH, '--strict', '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        OPENCODE_PORTABILITY_PLATFORM: 'linux',
        OPENCODE_PORTABILITY_RELEASE: '6.8.0',
        OPENCODE_PORTABILITY_ARCH: 'x64',
        OPENCODE_PORTABILITY_BUN_VERSION: '1.3.10',
        OPENCODE_PORTABILITY_SUPPLY_TRUST_SOURCE: 'trusted',
        OPENCODE_PORTABILITY_SUPPLY_PROVENANCE: 'mismatch',
        OPENCODE_PORTABILITY_SUPPLY_SIGNATURE: 'valid',
        OPENCODE_PORTABILITY_SUPPLY_INTEGRITY: 'ok',
      },
    });

    expect(run.status).toBe(1);

    const payload = JSON.parse(run.stdout);
    expect(payload.supplyChainReport.status).toBe('failed');
    expect(payload.supplyChainReport.reason).toContain('provenance mismatch');
    expect(payload.failures).toContain('Supply chain gate failed: provenance mismatch');
  });

  test('strict json exits non-zero for untrusted source without approved exception', () => {
    const run = spawnSync('node', [VERIFY_PORTABILITY_PATH, '--strict', '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        OPENCODE_PORTABILITY_PLATFORM: 'linux',
        OPENCODE_PORTABILITY_RELEASE: '6.8.0',
        OPENCODE_PORTABILITY_ARCH: 'x64',
        OPENCODE_PORTABILITY_BUN_VERSION: '1.3.10',
        OPENCODE_PORTABILITY_SUPPLY_TRUST_SOURCE: 'untrusted',
        OPENCODE_PORTABILITY_SUPPLY_PROVENANCE: 'verified',
        OPENCODE_PORTABILITY_SUPPLY_SIGNATURE: 'valid',
        OPENCODE_PORTABILITY_SUPPLY_INTEGRITY: 'ok',
      },
    });

    expect(run.status).toBe(1);

    const payload = JSON.parse(run.stdout);
    expect(payload.supplyChainReport.status).toBe('failed');
    expect(payload.supplyChainReport.reason).toContain('untrusted source');
    expect(payload.failures).toContain('Supply chain gate failed: untrusted source');
  });

  test('strict mode still emits exception metadata but release verdict fails zero-waiver policy', () => {
    const approvedException = {
      approvalId: 'CAB-4242',
      approvedBy: 'security-team',
      reason: 'temporary provenance outage',
      expiresAt: '2099-01-01T00:00:00.000Z',
      ticket: 'SEC-4242',
    };

    const run = spawnSync('node', [VERIFY_PORTABILITY_PATH, '--strict', '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        OPENCODE_PORTABILITY_PLATFORM: 'linux',
        OPENCODE_PORTABILITY_RELEASE: '6.8.0',
        OPENCODE_PORTABILITY_ARCH: 'x64',
        OPENCODE_PORTABILITY_BUN_VERSION: '1.3.10',
        OPENCODE_PORTABILITY_SUPPLY_TRUST_SOURCE: 'untrusted',
        OPENCODE_PORTABILITY_SUPPLY_PROVENANCE: 'verified',
        OPENCODE_PORTABILITY_SUPPLY_SIGNATURE: 'valid',
        OPENCODE_PORTABILITY_SUPPLY_INTEGRITY: 'ok',
        OPENCODE_PORTABILITY_SUPPLY_EXCEPTION: JSON.stringify(approvedException),
      },
    });

    expect(run.status).toBe(1);
    const payload = JSON.parse(run.stdout);
    expect(payload.supplyChainReport.status).toBe('exception-approved');
    expect(payload.supplyChainReport.reason).toContain('approved exception');
    expect(payload.releaseVerdict.status).toBe('failed');
    expect(payload.releaseVerdict.reasons.some((reason) => reason.includes('ZERO_WAIVER_EXCEPTION_STATUS'))).toBe(true);
    expect(payload.supplyChainReport.exception).toEqual({
      approvalId: 'CAB-4242',
      approvedBy: 'security-team',
      reason: 'temporary provenance outage',
      expiresAt: '2099-01-01T00:00:00.000Z',
      ticket: 'SEC-4242',
      auditRecord: expect.objectContaining({
        decision: 'exception-approved',
        actor: 'security-team',
        approvalId: 'CAB-4242',
      }),
    });
  });

  test('contract lint rejects exception-approved gate status at parse/eval time', () => {
    const violations = lintReleaseVerdictZeroWaiver({
      status: 'passed',
      reasons: ['all release gates passed'],
      gates: {
        supplyChain: {
          status: 'exception-approved',
          reasons: ['approved exception for untrusted source'],
        },
      },
    });

    expect(violations).toContain('ZERO_WAIVER_EXCEPTION_STATUS:supplyChain:exception-approved');
  });

  test('contract lint rejects waiver metadata fields at parse/eval time', () => {
    const violations = lintReleaseVerdictZeroWaiver({
      status: 'passed',
      reasons: ['all release gates passed'],
      gates: {
        supplyChain: {
          status: 'passed',
          reasons: ['trusted release inputs verified'],
          approvalId: 'CAB-4242',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
      },
    });

    expect(violations).toContain('ZERO_WAIVER_FIELD_PRESENT:supplyChain.approvalId');
    expect(violations).toContain('ZERO_WAIVER_FIELD_PRESENT:supplyChain.expiresAt');
  });

  test('strict mode fails universal proof gate when any required attestation is missing', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'proof-missing-'));
    const runId = 'run-missing-1';
    const commitSha = 'abc123-missing';
    const mcpProofPath = writeProofArtifact(
      tempDir,
      'mcp-proof.json',
      makeUniversalProofPayload({ runId, commitSha, requiredCount: 2, attestedCount: 2 }),
    );
    const runtimeProofPath = writeProofArtifact(
      tempDir,
      'runtime-proof.json',
      makeUniversalProofPayload({
        runId,
        commitSha,
        requiredCount: 2,
        attestedCount: 1,
        missingAttestations: ['context7_query_docs'],
      }),
    );

    const run = runStrictJsonWithGateBaseline({
      OPENCODE_PORTABILITY_MCP_SMOKE_PROOF_PATH: mcpProofPath,
      OPENCODE_PORTABILITY_RUNTIME_SURFACE_PROOF_PATH: runtimeProofPath,
      OPENCODE_PORTABILITY_PROOF_RUN_ID: runId,
      OPENCODE_PORTABILITY_PROOF_COMMIT_SHA: commitSha,
    });

    rmSync(tempDir, { recursive: true, force: true });
    const payload = JSON.parse(run.stdout);
    expect(payload.universalProofReport.status).toBe('failed');
    expect(payload.releaseVerdict.gates.proofAttestation.status).toBe('failed');
    expect(payload.failures.some((failure) => failure.includes('PROOF_MISSING_ATTESTATION'))).toBe(true);
  });

  test('strict mode fails universal proof gate on stale run/commit attestations', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'proof-stale-'));
    const expectedRunId = 'run-stale-expected';
    const expectedCommitSha = 'abc123-expected';
    const staleRunId = 'run-stale-actual';
    const staleCommitSha = 'abc123-actual';
    const mcpProofPath = writeProofArtifact(
      tempDir,
      'mcp-proof.json',
      makeUniversalProofPayload({ runId: staleRunId, commitSha: staleCommitSha, requiredCount: 1, attestedCount: 1 }),
    );
    const runtimeProofPath = writeProofArtifact(
      tempDir,
      'runtime-proof.json',
      makeUniversalProofPayload({ runId: staleRunId, commitSha: staleCommitSha, requiredCount: 1, attestedCount: 1 }),
    );

    const run = runStrictJsonWithGateBaseline({
      OPENCODE_PORTABILITY_MCP_SMOKE_PROOF_PATH: mcpProofPath,
      OPENCODE_PORTABILITY_RUNTIME_SURFACE_PROOF_PATH: runtimeProofPath,
      OPENCODE_PORTABILITY_PROOF_RUN_ID: expectedRunId,
      OPENCODE_PORTABILITY_PROOF_COMMIT_SHA: expectedCommitSha,
    });

    rmSync(tempDir, { recursive: true, force: true });
    const payload = JSON.parse(run.stdout);
    expect(payload.universalProofReport.status).toBe('failed');
    expect(payload.failures.some((failure) => failure.includes('PROOF_STALE_RUN'))).toBe(true);
  });

  test('threshold-based proof overrides are rejected with machine-readable reason code', () => {
    const result = checkUniversalProofAttestationFailures({
      strictMode: true,
      env: {
        ...process.env,
        OPENCODE_PORTABILITY_ALLOW_THRESHOLD_PROOF: '1',
      },
    });

    expect(result.universalProofReport.status).toBe('failed');
    expect(result.universalProofReport.violations.some((violation) => violation.includes('PROOF_THRESHOLD_FORBIDDEN'))).toBe(true);
    expect(result.failures.some((failure) => failure.includes('PROOF_THRESHOLD_FORBIDDEN'))).toBe(true);
  });

  test('strict json output includes observabilityIntegrityReport contract', () => {
    const run = spawnSync('node', [VERIFY_PORTABILITY_PATH, '--strict', '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        OPENCODE_PORTABILITY_PLATFORM: 'linux',
        OPENCODE_PORTABILITY_RELEASE: '6.8.0',
        OPENCODE_PORTABILITY_ARCH: 'x64',
        OPENCODE_PORTABILITY_BUN_VERSION: '1.3.10',
        LC_ALL: 'C',
        TZ: 'UTC',
        OPENCODE_CONFIG_HOME: path.join(import.meta.dir, '.tmp-config'),
        OPENCODE_DATA_HOME: path.join(import.meta.dir, '.tmp-data'),
        XDG_CACHE_HOME: path.join(import.meta.dir, '.tmp-cache'),
        TMPDIR: path.join(import.meta.dir, '.tmp-temp'),
        TEMP: path.join(import.meta.dir, '.tmp-temp'),
        TMP: path.join(import.meta.dir, '.tmp-temp'),
      },
    });

    const payload = JSON.parse(run.stdout);
    expect(payload).toHaveProperty('observabilityIntegrityReport');
    expect(typeof payload.observabilityIntegrityReport.status).toBe('string');
    expect(Array.isArray(payload.observabilityIntegrityReport.violations)).toBe(true);
  });

  test('strict json exits non-zero when observability integrity violation is simulated', () => {
    const run = spawnSync('node', [VERIFY_PORTABILITY_PATH, '--strict', '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        OPENCODE_PORTABILITY_PLATFORM: 'linux',
        OPENCODE_PORTABILITY_RELEASE: '6.8.0',
        OPENCODE_PORTABILITY_ARCH: 'x64',
        OPENCODE_PORTABILITY_BUN_VERSION: '1.3.10',
        LC_ALL: 'C',
        TZ: 'UTC',
        OPENCODE_CONFIG_HOME: path.join(import.meta.dir, '.tmp-config'),
        OPENCODE_DATA_HOME: path.join(import.meta.dir, '.tmp-data'),
        XDG_CACHE_HOME: path.join(import.meta.dir, '.tmp-cache'),
        TMPDIR: path.join(import.meta.dir, '.tmp-temp'),
        TEMP: path.join(import.meta.dir, '.tmp-temp'),
        TMP: path.join(import.meta.dir, '.tmp-temp'),
        OPENCODE_PORTABILITY_OBSERVABILITY_LOG_CHAIN: 'tampered',
      },
    });

    expect(run.status).toBe(1);

    const payload = JSON.parse(run.stdout);
    expect(payload.observabilityIntegrityReport.status).toBe('fail');
    expect(payload.observabilityIntegrityReport.violations.length).toBeGreaterThan(0);
    expect(payload.failures).toContain('Observability integrity gate failed: log integrity hash chain verification failed');
  });

  test('hermeticity gate detects missing deterministic env baselines', () => {
    const result = checkHermeticityFailures({
      strictMode: true,
      env: {
        LC_ALL: 'en_US.UTF-8',
        TZ: 'America/New_York',
        OPENCODE_CONFIG_HOME: '/tmp/opencode-config',
        OPENCODE_DATA_HOME: '/tmp/opencode-data',
        XDG_CACHE_HOME: '',
        TMPDIR: '',
        TEMP: '',
        TMP: '',
      },
    });

    expect(result.hermeticityReport.status).toBe('fail');
    expect(result.hermeticityReport.violations.length).toBeGreaterThan(0);
    expect(result.hermeticityReport.violations.join('\n')).toContain('LC_ALL must be C');
    expect(result.hermeticityReport.violations.join('\n')).toContain('TZ must be UTC');
  });

  test('hermeticity gate fails when roots resolve inside HOME (global leak)', () => {
    const result = checkHermeticityFailures({
      strictMode: true,
      env: {
        HOME: '/home/tester',
        LC_ALL: 'C',
        TZ: 'UTC',
        OPENCODE_CONFIG_HOME: '/home/tester/.config/opencode',
        OPENCODE_DATA_HOME: '/home/tester/.opencode',
        XDG_CACHE_HOME: '/home/tester/.cache/opencode',
        TMPDIR: '/tmp/opencode',
        TEMP: '/tmp/opencode',
        TMP: '/tmp/opencode',
      },
    });

    expect(result.hermeticityReport.status).toBe('fail');
    expect(result.hermeticityReport.violations.join('\n')).toContain('must not point inside HOME/USERPROFILE');
  });

  test('strict json includes hermeticityReport and fails with fault-injected global leak', () => {
    const run = spawnSync('node', [VERIFY_PORTABILITY_PATH, '--strict', '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        OPENCODE_PORTABILITY_PLATFORM: 'linux',
        OPENCODE_PORTABILITY_RELEASE: '6.8.0',
        OPENCODE_PORTABILITY_ARCH: 'x64',
        OPENCODE_PORTABILITY_BUN_VERSION: '1.3.10',
        LC_ALL: 'C',
        TZ: 'UTC',
        OPENCODE_CONFIG_HOME: path.join(import.meta.dir, '.tmp-config'),
        OPENCODE_DATA_HOME: path.join(import.meta.dir, '.tmp-data'),
        XDG_CACHE_HOME: path.join(import.meta.dir, '.tmp-cache'),
        TMPDIR: path.join(import.meta.dir, '.tmp-temp'),
        TEMP: path.join(import.meta.dir, '.tmp-temp'),
        TMP: path.join(import.meta.dir, '.tmp-temp'),
        OPENCODE_PORTABILITY_FAULT_GLOBAL_LEAK: '1',
      },
    });

    expect(run.status).toBe(1);

    const payload = JSON.parse(run.stdout);
    expect(payload.hermeticityReport).toBeDefined();
    expect(payload.hermeticityReport.status).toBe('fail');
    expect(payload.hermeticityReport.violations.length).toBeGreaterThan(0);
  });

  test('strict json output includes privilegeGovernanceReport contract', () => {
    const run = spawnSync('node', [VERIFY_PORTABILITY_PATH, '--strict', '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        OPENCODE_PORTABILITY_PLATFORM: 'linux',
        OPENCODE_PORTABILITY_RELEASE: '6.8.0',
        OPENCODE_PORTABILITY_ARCH: 'x64',
        OPENCODE_PORTABILITY_BUN_VERSION: '1.3.10',
      },
    });

    const payload = JSON.parse(run.stdout);
    expect(payload).toHaveProperty('privilegeGovernanceReport');
    expect(typeof payload.privilegeGovernanceReport.status).toBe('string');
    expect(Array.isArray(payload.privilegeGovernanceReport.violations)).toBe(true);
  });

  test('strict json exits non-zero when privilege/break-glass governance violations are simulated', () => {
    const run = spawnSync('node', [VERIFY_PORTABILITY_PATH, '--strict', '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        OPENCODE_PORTABILITY_PLATFORM: 'linux',
        OPENCODE_PORTABILITY_RELEASE: '6.8.0',
        OPENCODE_PORTABILITY_ARCH: 'x64',
        OPENCODE_PORTABILITY_BUN_VERSION: '1.3.10',
        OPENCODE_PORTABILITY_PRIVILEGE_ESCALATION: 'unauthorized',
        OPENCODE_PORTABILITY_BREAK_GLASS_ACCESS: 'active',
        OPENCODE_PORTABILITY_BREAK_GLASS_AUDIT_TRAIL: 'missing',
        OPENCODE_PORTABILITY_PRIVILEGED_OPERATION_APPROVAL: 'missing',
        OPENCODE_PORTABILITY_PRIVILEGED_ACCESS_EXPIRES_AT: '2000-01-01T00:00:00.000Z',
      },
    });

    expect(run.status).toBe(1);

    const payload = JSON.parse(run.stdout);
    expect(payload.privilegeGovernanceReport.status).toBe('failed');
    expect(payload.privilegeGovernanceReport.violations).toContain('privilege escalation requires explicit governance approval');
    expect(payload.privilegeGovernanceReport.violations).toContain('break-glass access requires immutable audit trail metadata');
    expect(payload.privilegeGovernanceReport.violations).toContain('privileged operations require explicit approval before execution');
    expect(payload.privilegeGovernanceReport.violations).toContain('privileged access approval expired: 2000-01-01T00:00:00.000Z');
    expect(payload.failures).toContain('Privilege governance gate failed: privilege escalation requires explicit governance approval');
  });

  test('determinism gate detects filesystem/time/locale/encoding violations', () => {
    const result = checkDeterminismFailures({
      strictMode: true,
      env: {
        TZ: 'America/New_York',
        LC_ALL: 'en_US.UTF-8',
        LANG: 'fr_FR.ISO-8859-1',
        OPENCODE_PORTABILITY_FS_CASE_SENSITIVITY: 'unknown',
        OPENCODE_PORTABILITY_ENCODING: 'latin1',
      },
    });

    expect(result.determinismReport.status).toBe('fail');
    expect(result.determinismReport.violations.length).toBeGreaterThan(0);
    const violations = result.determinismReport.violations.join('\n');
    expect(violations).toContain('filesystem case sensitivity policy must be explicit');
    expect(violations).toContain('TZ must be UTC in strict mode');
    expect(violations).toContain('LC_ALL must be C in strict mode');
    expect(violations).toContain('character encoding must be UTF-8');
  });

  test('strict json includes determinismReport and fails with fault-injected determinism leak', () => {
    const run = spawnSync('node', [VERIFY_PORTABILITY_PATH, '--strict', '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        OPENCODE_PORTABILITY_PLATFORM: 'linux',
        OPENCODE_PORTABILITY_RELEASE: '6.8.0',
        OPENCODE_PORTABILITY_ARCH: 'x64',
        OPENCODE_PORTABILITY_BUN_VERSION: '1.3.10',
        LC_ALL: 'C',
        LANG: 'C.UTF-8',
        TZ: 'UTC',
        OPENCODE_CONFIG_HOME: path.join(import.meta.dir, '.tmp-config'),
        OPENCODE_DATA_HOME: path.join(import.meta.dir, '.tmp-data'),
        XDG_CACHE_HOME: path.join(import.meta.dir, '.tmp-cache'),
        TMPDIR: path.join(import.meta.dir, '.tmp-temp'),
        TEMP: path.join(import.meta.dir, '.tmp-temp'),
        TMP: path.join(import.meta.dir, '.tmp-temp'),
        OPENCODE_PORTABILITY_FS_CASE_SENSITIVITY: 'sensitive',
        OPENCODE_PORTABILITY_ENCODING: 'UTF-8',
        OPENCODE_PORTABILITY_FAULT_DETERMINISM: '1',
      },
    });

    expect(run.status).toBe(1);
    const payload = JSON.parse(run.stdout);
    expect(payload.determinismReport).toBeDefined();
    expect(payload.determinismReport.status).toBe('fail');
    expect(payload.determinismReport.violations.length).toBeGreaterThan(0);
  });

  test('strict json exits non-zero when restore-drill evidence is missing', () => {
    const run = runStrictJsonWithRestoreEvidence(path.join(import.meta.dir, '.tmp-does-not-exist', 'restore-drill.json'));

    expect(run.status).toBe(1);
    const payload = JSON.parse(run.stdout);
    expect(payload).toHaveProperty('restoreDrillReport');
    expect(payload.restoreDrillReport.status).toBe('failed');
    expect(payload.failures).toContain('Restore drill gate failed: evidence file not found');
  });

  test('strict json exits non-zero when restore-drill evidence breaches RTO/RPO', () => {
    const fixtureDir = mkdtempSync(path.join(os.tmpdir(), 'restore-drill-fixture-'));
    const evidencePath = path.join(fixtureDir, 'restore-drill.json');

    writeFileSync(evidencePath, JSON.stringify({
      startedAt: '2026-03-31T00:00:00.000Z',
      completedAt: '2026-03-31T01:30:00.000Z',
      backupTimestamp: '2026-03-30T23:30:00.000Z',
      integrityCheck: 'pass',
    }, null, 2));

    try {
      const run = runStrictJsonWithRestoreEvidence(evidencePath);
      expect(run.status).toBe(1);
      const payload = JSON.parse(run.stdout);
      expect(payload).toHaveProperty('restoreDrillReport');
      expect(payload.restoreDrillReport.status).toBe('failed');
      expect(payload.restoreDrillReport.rto.actualMinutes).toBe(90);
      expect(payload.restoreDrillReport.rpo.actualMinutes).toBe(30);
      expect(payload.failures).toContain('Restore drill gate failed: RTO breach (90m > 60m)');
      expect(payload.failures).toContain('Restore drill gate failed: RPO breach (30m > 15m)');
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test('strict json output includes releaseVerdict with gate statuses and reasons', () => {
    const run = spawnSync('node', [VERIFY_PORTABILITY_PATH, '--strict', '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        OPENCODE_PORTABILITY_PLATFORM: 'linux',
        OPENCODE_PORTABILITY_RELEASE: '6.8.0',
        OPENCODE_PORTABILITY_ARCH: 'x64',
        OPENCODE_PORTABILITY_BUN_VERSION: '1.3.10',
      },
    });

    const payload = JSON.parse(run.stdout);
    expect(payload).toHaveProperty('releaseVerdict');
    expect(typeof payload.releaseVerdict.status).toBe('string');
    expect(Array.isArray(payload.releaseVerdict.reasons)).toBe(true);
    expect(payload.releaseVerdict).toHaveProperty('gates');
    expect(payload.releaseVerdict.gates).toHaveProperty('supportFloor');
    expect(payload.releaseVerdict.gates).toHaveProperty('supplyChain');
    expect(payload.releaseVerdict.gates).toHaveProperty('restoreDrill');
  });

  test('release verdict fails when any gate fails', () => {
    const run = spawnSync('node', [VERIFY_PORTABILITY_PATH, '--strict', '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        OPENCODE_PORTABILITY_PLATFORM: 'linux',
        OPENCODE_PORTABILITY_RELEASE: '6.8.0',
        OPENCODE_PORTABILITY_ARCH: 'x64',
        OPENCODE_PORTABILITY_BUN_VERSION: '1.3.10',
        OPENCODE_PORTABILITY_SUPPLY_PROVENANCE: 'mismatch',
      },
    });

    expect(run.status).toBe(1);
    const payload = JSON.parse(run.stdout);
    expect(payload.releaseVerdict.status).toBe('failed');
    expect(payload.releaseVerdict.reasons.some((reason) => reason.includes('supply-chain'))).toBe(true);
  });

  test('strict json output includes adrGovernanceReport contract', () => {
    const run = runStrictJsonWithGateBaseline();

    const payload = JSON.parse(run.stdout);
    expect(payload).toHaveProperty('adrGovernanceReport');
    expect(typeof payload.adrGovernanceReport.status).toBe('string');
    expect(Array.isArray(payload.adrGovernanceReport.violations)).toBe(true);
    expect(typeof payload.adrGovernanceReport.adrDirectory).toBe('string');
  });

  test('strict json exits non-zero when ADR governance policy documents are missing', () => {
    const fixtureDir = mkdtempSync(path.join(os.tmpdir(), 'adr-governance-missing-'));

    try {
      const run = runStrictJsonWithGateBaseline({
        OPENCODE_PORTABILITY_ADR_DIR: fixtureDir,
      });

      expect(run.status).toBe(1);
      const payload = JSON.parse(run.stdout);
      expect(payload.adrGovernanceReport.status).toBe('failed');
      expect(payload.adrGovernanceReport.violations).toContain('missing required ADR document: control-ownership-governance.md');
      expect(payload.adrGovernanceReport.violations).toContain('missing required ADR document: exception-governance-policy.md');
      expect(payload.failures).toContain('ADR governance gate failed: missing required ADR document: control-ownership-governance.md');
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test('strict json exits non-zero when ADR governance policy is invalid', () => {
    const fixtureDir = mkdtempSync(path.join(os.tmpdir(), 'adr-governance-invalid-'));
    const controlOwnershipPath = path.join(fixtureDir, 'control-ownership-governance.md');
    const exceptionGovernancePath = path.join(fixtureDir, 'exception-governance-policy.md');

    writeFileSync(controlOwnershipPath, [
      '# ADR: Control Ownership and Exception Governance',
      '',
      '## Control Ownership',
      '- Ownership model placeholder',
      '',
      '## Governance Policies',
      '- Governance policies placeholder',
    ].join('\n'));

    writeFileSync(exceptionGovernancePath, [
      '# ADR: Exception Governance Policy',
      '',
      '## Governance Policy',
      '- Missing required exception path contract section',
    ].join('\n'));

    try {
      const run = runStrictJsonWithGateBaseline({
        OPENCODE_PORTABILITY_ADR_DIR: fixtureDir,
      });

      expect(run.status).toBe(1);
      const payload = JSON.parse(run.stdout);
      expect(payload.adrGovernanceReport.status).toBe('failed');
      expect(payload.adrGovernanceReport.violations).toContain('control-ownership-governance.md missing section: ## Exception Paths');
      expect(payload.adrGovernanceReport.violations).toContain('exception-governance-policy.md missing section: ## Exception Path Contract');
      expect(payload.failures).toContain('ADR governance gate failed: control-ownership-governance.md missing section: ## Exception Paths');
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test('CI portability matrix integrates strict both-tier blocking in matrix legs', () => {
    const workflow = readFileSync(PORTABILITY_MATRIX_WORKFLOW_PATH, 'utf8');

    expect(workflow).toContain('strict-tier: current');
    expect(workflow).toContain('strict-tier: previous-stable');
    expect(workflow).toContain('name: ${{ matrix.os }} / ${{ matrix.shell }} / ${{ matrix.strict-tier }}');
  });

  test('CI portability matrix executes strict verifier with deterministic gate baseline', () => {
    const workflow = readFileSync(PORTABILITY_MATRIX_WORKFLOW_PATH, 'utf8');

    expect(workflow).toContain('node scripts/verify-portability.mjs --strict --json');
    expect(workflow).toContain('LC_ALL: C');
    expect(workflow).toContain('TZ: UTC');
    expect(workflow).toContain('LANG: C.UTF-8');
    expect(workflow).toContain('OPENCODE_PORTABILITY_FS_CASE_SENSITIVITY: sensitive');
    expect(workflow).toContain('OPENCODE_PORTABILITY_ENCODING: UTF-8');
    expect(workflow).toContain('OPENCODE_PORTABILITY_RESTORE_DRILL_EVIDENCE: .sisyphus/evidence/task-5-restore-pass.json');
  });

  test('CI portability matrix keeps strict gate execution blocking', () => {
    const workflow = readFileSync(PORTABILITY_MATRIX_WORKFLOW_PATH, 'utf8');
    const strictStepStart = workflow.indexOf('name: Setup + portability verification');
    const strictStepEnd = workflow.indexOf('name: Runtime proofs');
    const strictStepSection = workflow.slice(strictStepStart, strictStepEnd);

    expect(strictStepSection).toContain('node scripts/verify-portability.mjs --strict --json');
    expect(strictStepSection.includes('continue-on-error: true')).toBe(false);
  });
});
