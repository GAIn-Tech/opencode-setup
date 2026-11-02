#!/usr/bin/env node

/**
 * generate-portability-report.mjs
 *
 * Generates a machine-readable portability report artifact that aggregates
 * all portability verification results into a single JSON document.
 *
 * Usage:
 *   node scripts/generate-portability-report.mjs [--output <path>]
 *
 * Output: JSON report with OS/runtime/launcher/probe coverage/skip/fallback counts
 */

import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveRoot } from './resolve-root.mjs';
import { evaluateConvergenceAttestation } from './sync-reconcile.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = resolveRoot();

// Parse arguments
const args = process.argv.slice(2);
let outputPath = path.join(root, '.sisyphus', 'reports', 'portability-report.json');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output' && i + 1 < args.length) {
    outputPath = args[++i];
  }
}

function runCommand(command, cmdArgs) {
  const result = spawnSync(command, cmdArgs, {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 120000,
  });
  return {
    exitCode: result.status ?? -1,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function parseJsonOutput(result) {
  if (!result || !result.stdout) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function gateResult(status, reasons, evidencePaths) {
  return {
    status,
    reasons,
    evidencePaths,
  };
}

const CONVERGENCE_CONTRACT = Object.freeze({
  freshClone: Object.freeze({
    envKey: 'OPENCODE_PORTABILITY_FRESH_CONVERGENCE_PATH',
    defaultPath: path.join(root, '.sisyphus', 'evidence', 'fresh-clone-convergence.json'),
  }),
  pullReconcile: Object.freeze({
    envKey: 'OPENCODE_PORTABILITY_PULL_CONVERGENCE_PATH',
    defaultPath: path.join(root, '.sisyphus', 'evidence', 'pull-reconcile-convergence.json'),
  }),
});

function resolveConvergenceAttestationPath(contractEntry) {
  const configuredPath = String(process.env[contractEntry.envKey] || '').trim();
  return configuredPath ? path.resolve(configuredPath) : contractEntry.defaultPath;
}

function readConvergenceAttestation(filePath, flowName) {
  if (!existsSync(filePath)) {
    return {
      attestation: null,
      reasons: [`CONVERGENCE_ATTESTATION_MISSING:${flowName}: artifact missing at ${filePath}`],
    };
  }

  try {
    return {
      attestation: JSON.parse(readFileSync(filePath, 'utf8')),
      reasons: [],
    };
  } catch (error) {
    return {
      attestation: null,
      reasons: [`CONVERGENCE_ATTESTATION_MISSING:${flowName}: invalid JSON (${error.message})`],
    };
  }
}

export function evaluateConvergenceAttestationGate() {
  const freshClonePath = resolveConvergenceAttestationPath(CONVERGENCE_CONTRACT.freshClone);
  const pullReconcilePath = resolveConvergenceAttestationPath(CONVERGENCE_CONTRACT.pullReconcile);

  const freshClone = readConvergenceAttestation(freshClonePath, 'fresh-clone');
  const pullReconcile = readConvergenceAttestation(pullReconcilePath, 'pull-reconcile');
  const preflightReasons = [...freshClone.reasons, ...pullReconcile.reasons];

  const evaluation = evaluateConvergenceAttestation({
    freshCloneAttestation: freshClone.attestation,
    pullReconcileAttestation: pullReconcile.attestation,
  });

  const reasons = [...new Set([...preflightReasons, ...(evaluation.reasons || [])])];

  return {
    status: reasons.length === 0 ? 'passed' : 'failed',
    reasons,
    evidencePaths: [freshClonePath, pullReconcilePath],
    freshClonePath,
    pullReconcilePath,
    governedArtifactClasses: evaluation.governedArtifactClasses,
    equivalenceByClass: evaluation.equivalenceByClass,
  };
}

const ZERO_WAIVER_BLOCKED_STATUSES = new Set(['exception-approved']);
const ZERO_WAIVER_BLOCKED_FIELDS = new Set([
  'waiver',
  'waivers',
  'exception',
  'exceptions',
  'approvalId',
  'approvedBy',
  'expiresAt',
  'ticket',
]);

function collectZeroWaiverFieldViolations(value, pathSegments = []) {
  const violations = [];
  if (!value || typeof value !== 'object') return violations;

  for (const [key, nested] of Object.entries(value)) {
    const nextPath = [...pathSegments, key];
    if (ZERO_WAIVER_BLOCKED_FIELDS.has(key)) {
      violations.push(`ZERO_WAIVER_FIELD_PRESENT:${nextPath.join('.')}`);
    }
    if (nested && typeof nested === 'object') {
      violations.push(...collectZeroWaiverFieldViolations(nested, nextPath));
    }
  }

  return violations;
}

function lintReleaseVerdictZeroWaiver(releaseVerdict) {
  if (!releaseVerdict || typeof releaseVerdict !== 'object') {
    return ['ZERO_WAIVER_INVALID_PAYLOAD:releaseVerdict'];
  }

  const violations = [];
  const topLevelStatus = String(releaseVerdict.status || '').trim();
  if (ZERO_WAIVER_BLOCKED_STATUSES.has(topLevelStatus)) {
    violations.push(`ZERO_WAIVER_EXCEPTION_STATUS:releaseVerdict:${topLevelStatus}`);
  }

  const gates = releaseVerdict.gates;
  if (gates && typeof gates === 'object') {
    for (const [gateName, gate] of Object.entries(gates)) {
      const gateStatus = String(gate?.status || '').trim();
      if (ZERO_WAIVER_BLOCKED_STATUSES.has(gateStatus)) {
        violations.push(`ZERO_WAIVER_EXCEPTION_STATUS:${gateName}:${gateStatus}`);
      }
      if (gate && typeof gate === 'object') {
        violations.push(...collectZeroWaiverFieldViolations(gate, [gateName]));
      }
    }
  }

  return [...new Set(violations)];
}

function evaluateJsonScriptGate({ scriptPath, args = [], passPredicate, fallbackReason, evidencePaths }) {
  const cmd = runCommand('node', [scriptPath, ...args]);
  const payload = parseJsonOutput(cmd);

  if (cmd.exitCode === 0 && payload && passPredicate(payload)) {
    return gateResult('passed', [], evidencePaths);
  }

  const reasons = [];
  if (payload && Array.isArray(payload.reasons) && payload.reasons.length > 0) {
    reasons.push(...payload.reasons.map((reason) => String(reason)));
  }

  if (reasons.length === 0) {
    reasons.push(
      fallbackReason
      || `${scriptPath} failed (exit ${cmd.exitCode})${cmd.stderr ? `: ${cmd.stderr}` : ''}`,
    );
  }

  return gateResult('failed', reasons, evidencePaths);
}

function evaluateSetupGate() {
  const evidencePaths = [
    'scripts/setup-resilient.mjs',
    'scripts/verify-setup.mjs',
    'scripts/tests/setup-idempotency.test.js',
    'package.json',
  ];
  const reasons = [];

  if (!existsSync(path.join(root, 'scripts', 'setup-resilient.mjs'))) {
    reasons.push('missing setup entrypoint: scripts/setup-resilient.mjs');
  }

  if (!existsSync(path.join(root, 'scripts', 'verify-setup.mjs'))) {
    reasons.push('missing setup verification script: scripts/verify-setup.mjs');
  }

  if (!existsSync(path.join(root, 'scripts', 'tests', 'setup-idempotency.test.js'))) {
    reasons.push('missing setup idempotency regression test: scripts/tests/setup-idempotency.test.js');
  }

  const packageJsonPath = path.join(root, 'package.json');
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const setupScript = packageJson?.scripts?.setup;
    if (typeof setupScript !== 'string' || !setupScript.includes('scripts/setup-resilient.mjs')) {
      reasons.push('package.json scripts.setup must execute scripts/setup-resilient.mjs');
    }
  } catch (error) {
    reasons.push(`unable to read package.json for setup contract: ${error.message}`);
  }

  return gateResult(reasons.length === 0 ? 'passed' : 'failed', reasons, evidencePaths);
}

function evaluateSyncGate() {
  const evidencePaths = [
    'scripts/sync-reconcile.mjs',
    'scripts/tests/sync-reconcile.test.js',
    'package.json',
  ];
  const reasons = [];

  if (!existsSync(path.join(root, 'scripts', 'sync-reconcile.mjs'))) {
    reasons.push('missing sync reconcile entrypoint: scripts/sync-reconcile.mjs');
  }

  if (!existsSync(path.join(root, 'scripts', 'tests', 'sync-reconcile.test.js'))) {
    reasons.push('missing sync reconcile regression test: scripts/tests/sync-reconcile.test.js');
  }

  const packageJsonPath = path.join(root, 'package.json');
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const syncScript = packageJson?.scripts?.sync;
    if (typeof syncScript !== 'string' || !syncScript.includes('scripts/sync-reconcile.mjs')) {
      reasons.push('package.json scripts.sync must execute scripts/sync-reconcile.mjs');
    }
  } catch (error) {
    reasons.push(`unable to read package.json for sync contract: ${error.message}`);
  }

  return gateResult(reasons.length === 0 ? 'passed' : 'failed', reasons, evidencePaths);
}

function evaluateCiScenariosGate() {
  const workflowPath = path.join(root, '.github', 'workflows', 'bootstrap-readiness.yml');
  const evidencePaths = [
    '.github/workflows/bootstrap-readiness.yml',
    'scripts/tests/bootstrap-ci-scenarios.test.js',
  ];
  const reasons = [];

  if (!existsSync(workflowPath)) {
    reasons.push('missing bootstrap CI workflow: .github/workflows/bootstrap-readiness.yml');
    return gateResult('failed', reasons, evidencePaths);
  }

  const workflow = readFileSync(workflowPath, 'utf8');
  const requiredSnippets = [
    'fresh-clone:',
    'pull-reconcile:',
    'bun run setup',
    'bun run sync > sync-report.json',
    'sync report is not ok',
    'node scripts/verify-setup.mjs',
  ];

  for (const snippet of requiredSnippets) {
    if (!workflow.includes(snippet)) {
      reasons.push(`missing bootstrap CI scenario contract snippet: ${snippet}`);
    }
  }

  return gateResult(reasons.length === 0 ? 'passed' : 'failed', reasons, evidencePaths);
}

function buildBootstrapVerdict() {
  const gates = {
    manifest: evaluateJsonScriptGate({
      scriptPath: 'scripts/verify-bootstrap-manifest.mjs',
      passPredicate: (payload) => payload?.valid === true,
      fallbackReason: 'bootstrap manifest verification failed',
      evidencePaths: ['scripts/bootstrap-manifest.json', 'scripts/verify-bootstrap-manifest.mjs'],
    }),
    setup: evaluateSetupGate(),
    sync: evaluateSyncGate(),
    noHiddenExec: evaluateJsonScriptGate({
      scriptPath: 'scripts/verify-no-hidden-exec.mjs',
      passPredicate: (payload) => payload?.compliant === true,
      fallbackReason: 'hidden execution policy verification failed',
      evidencePaths: ['scripts/verify-no-hidden-exec.mjs', 'package.json', 'scripts/setup-resilient.mjs'],
    }),
    prereqs: evaluateJsonScriptGate({
      scriptPath: 'scripts/verify-bootstrap-prereqs.mjs',
      args: ['--strict', '--json'],
      passPredicate: (payload) => payload?.ok === true,
      fallbackReason: 'bootstrap prerequisites verification failed',
      evidencePaths: ['scripts/verify-bootstrap-prereqs.mjs', '.bun-version'],
    }),
    ciScenarios: evaluateCiScenariosGate(),
    pluginReadiness: evaluateJsonScriptGate({
      scriptPath: 'scripts/verify-plugin-readiness.mjs',
      passPredicate: (payload) => payload?.ok === true,
      fallbackReason: 'plugin readiness verification failed',
      evidencePaths: ['scripts/verify-plugin-readiness.mjs', 'scripts/bootstrap-manifest.json', 'opencode-config/opencode.json'],
    }),
  };

  const reasons = [];
  for (const [gateName, gate] of Object.entries(gates)) {
    if (gate.status !== 'failed') continue;
    for (const reason of gate.reasons) {
      reasons.push(`${gateName}: ${reason}`);
    }
  }

  return {
    ok: reasons.length === 0,
    gates,
    reasons,
    timestamp: new Date().toISOString(),
  };
}

function mergeReleaseVerdictWithBootstrap(
  releaseVerdict,
  bootstrapVerdict,
  zeroWaiverViolations = [],
  convergenceGate = null,
) {
  const base = releaseVerdict || {
    status: 'failed',
    reasons: ['release verdict unavailable from verify-portability output'],
    gates: {},
  };

  const gate = {
    status: bootstrapVerdict.ok ? 'passed' : 'failed',
    reasons: bootstrapVerdict.ok ? [] : [...bootstrapVerdict.reasons],
    evidencePaths: Object.values(bootstrapVerdict.gates)
      .flatMap((entry) => entry.evidencePaths || [])
      .filter((value, index, all) => all.indexOf(value) === index)
      .sort((a, b) => a.localeCompare(b)),
  };

  const mergedGates = {
    ...(base.gates || {}),
    bootstrapGuarantee: gate,
    ...(convergenceGate
      ? {
        convergenceAttestation: {
          status: convergenceGate.status,
          reasons: [...convergenceGate.reasons],
          evidencePaths: [...convergenceGate.evidencePaths],
        },
      }
      : {}),
  };

  const mergedReasons = [
    ...(Array.isArray(base.reasons) ? base.reasons : []),
    ...(bootstrapVerdict.ok ? [] : bootstrapVerdict.reasons.map((reason) => `bootstrap-guarantee: ${reason}`)),
    ...zeroWaiverViolations.map((violation) => `zero-waiver-contract: ${violation}`),
    ...(convergenceGate?.status === 'failed'
      ? convergenceGate.reasons.map((reason) => `convergence-attestation: ${reason}`)
      : []),
  ];

  if (zeroWaiverViolations.length > 0) {
    mergedGates.zeroWaiverContract = {
      status: 'failed',
      reasons: [...zeroWaiverViolations],
      evidencePaths: [
        'scripts/verify-portability.mjs',
        'scripts/generate-portability-report.mjs',
      ],
    };
  }

  const hasFailures = Object.values(mergedGates).some((item) => item?.status === 'failed');

  return {
    ...base,
    status: hasFailures ? 'failed' : 'passed',
    reasons: mergedReasons.length > 0 ? mergedReasons : ['all release gates passed'],
    gates: mergedGates,
  };
}

function main() {
  console.log('Generating portability report...\n');

  // Run portability verification with JSON output
  const portabilityResult = runCommand('node', ['scripts/verify-portability.mjs', '--strict', '--probe-mcp', '--json']);
  
  let portabilityData = null;
  if (portabilityResult.exitCode === 0 || portabilityResult.stdout) {
    try {
      portabilityData = JSON.parse(portabilityResult.stdout);
    } catch (e) {
      console.error('Failed to parse portability verification output:', e.message);
    }
  }

  // Run fault-injection tests
  const faultResult = runCommand('node', ['scripts/fault-injection-tests.mjs']);

  const bootstrapVerdict = buildBootstrapVerdict();
  const convergenceAttestation = evaluateConvergenceAttestationGate();
  const zeroWaiverViolations = lintReleaseVerdictZeroWaiver(portabilityData?.releaseVerdict);

  const mergedReleaseVerdict = mergeReleaseVerdictWithBootstrap(
    portabilityData?.releaseVerdict,
    bootstrapVerdict,
    zeroWaiverViolations,
    convergenceAttestation,
  );

  // Gather system information
  const systemInfo = {
    os: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    bunVersion: getBunVersion(),
    shell: process.env.SHELL || process.env.COMSPEC || 'unknown',
    timestamp: new Date().toISOString(),
  };

  // Build the report
  const report = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    system: systemInfo,
    summary: {
      overallOk: portabilityData?.ok === true
        && mergedReleaseVerdict.status !== 'failed'
        && faultResult.exitCode === 0
        && bootstrapVerdict.ok === true
        && convergenceAttestation.status === 'passed',
      portabilityOk: portabilityData?.ok === true,
      releaseVerdictOk: mergedReleaseVerdict.status === 'passed',
      faultTestsOk: faultResult.exitCode === 0,
      bootstrapVerdictOk: bootstrapVerdict.ok === true,
      convergenceAttestationOk: convergenceAttestation.status === 'passed',
    },
    portability: portabilityData || {
      ok: false,
      error: 'Failed to run portability verification',
      exitCode: portabilityResult.exitCode,
      stderr: portabilityResult.stderr,
    },
    faultInjection: {
      exitCode: faultResult.exitCode,
      passed: faultResult.exitCode === 0,
    },
    contracts: {
      pathContract: 'canonical-resolver',
      launcherContract: 'scripts/launcher-contract.json',
      skipBudget: 'scripts/skip-budget-allowlist.json',
      stalenessBudget: 'scripts/mirror-staleness-allowlist.json',
      lockIntegrity: 'scripts/lock-integrity-allowlist.json',
      convergenceAttestation: {
        freshClonePath: resolveConvergenceAttestationPath(CONVERGENCE_CONTRACT.freshClone),
        pullReconcilePath: resolveConvergenceAttestationPath(CONVERGENCE_CONTRACT.pullReconcile),
      },
    },
    gates: {
      staticPathCheck: existsSync(path.join(root, 'scripts', 'check-hardcoded-paths.mjs')),
      launcherValidation: existsSync(path.join(root, 'scripts', 'validate-launcher-contract.mjs')),
      probeCoverage: portabilityData?.probeReport?.exercised > 0,
      rollbackDryRun: portabilityData?.rollbackReport?.dryRunPassed === true,
      lockIntegrity: portabilityData?.integrityReport?.cacheIntegrityOk === true,
    },
    bootstrapVerdict,
    convergenceAttestation,
    releaseVerdict: mergedReleaseVerdict,
    gateStatusReasons: mergedReleaseVerdict?.gates || {
      unavailable: {
        status: 'failed',
        reasons: ['missing releaseVerdict.gates in verify-portability output'],
      },
    },
  };

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Write the report
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`Portability report written to: ${outputPath}`);
  console.log(`\nSummary:`);
  console.log(`  Overall: ${report.summary.overallOk ? 'PASS' : 'FAIL'}`);
  console.log(`  Portability: ${report.summary.portabilityOk ? 'PASS' : 'FAIL'}`);
  console.log(`  Fault Tests: ${report.summary.faultTestsOk ? 'PASS' : 'FAIL'}`);

  process.exit(report.summary.overallOk ? 0 : 1);
}

function getBunVersion() {
  try {
    const result = spawnSync('bun', ['--version'], {
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 5000,
    });
    return result.status === 0 ? result.stdout.trim() : 'unknown';
  } catch {
    return 'not-installed';
  }
}

if (import.meta.main) {
  main();
}
