#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveRoot } from './resolve-root.mjs';
import {
  verifyFailureBundle,
  verifySignedEvidenceBundle,
} from './lib/signed-evidence-bundle.mjs';

const TIMEOUTS_MS = Object.freeze({
  fast: 90_000,
  medium: 180_000,
  heavy: 480_000,
  overall: 1_200_000,
});

const ZERO_WAIVER_FIELDS = new Set(['waiver', 'waivers', 'exception', 'exceptions']);

function reason(code, message) {
  return { code, message: String(message || '').trim() || code };
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return [...new Set(ensureArray(values).map((value) => String(value || '').trim()).filter(Boolean))];
}

function classifyTimeoutMs(gateClass, timeoutByClass = TIMEOUTS_MS) {
  return timeoutByClass[gateClass] || timeoutByClass.fast || TIMEOUTS_MS.fast;
}

function parseCliArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    json: args.includes('--json'),
    rootDir: resolveRoot(),
    runId: String(process.env.GITHUB_RUN_ID || process.env.OPENCODE_PORTABILITY_RUN_ID || '').trim() || 'local-run',
    commitSha: String(process.env.GITHUB_SHA || process.env.OPENCODE_PORTABILITY_COMMIT_SHA || '').trim(),
    signedBundlePath: path.join(resolveRoot(), '.sisyphus', 'evidence', 'signed-evidence-bundle.json'),
    reportPath: path.join(resolveRoot(), '.sisyphus', 'reports', 'portability-report.json'),
    failureBundleDir: path.join(resolveRoot(), '.sisyphus', 'evidence', 'failure-bundles'),
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--run-id' && args[i + 1]) parsed.runId = args[++i];
    if (arg === '--commit-sha' && args[i + 1]) parsed.commitSha = args[++i];
    if (arg === '--signed-bundle' && args[i + 1]) parsed.signedBundlePath = path.resolve(parsed.rootDir, args[++i]);
    if (arg === '--report' && args[i + 1]) parsed.reportPath = path.resolve(parsed.rootDir, args[++i]);
    if (arg === '--failure-bundle-dir' && args[i + 1]) parsed.failureBundleDir = path.resolve(parsed.rootDir, args[++i]);
  }

  return parsed;
}

function runGeneratePortabilityReport({ rootDir, reportPath, timeoutMs }) {
  const scriptPath = path.join(rootDir, 'scripts', 'generate-portability-report.mjs');
  const result = spawnSync(process.execPath, [scriptPath, '--output', reportPath], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: timeoutMs,
  });

  return {
    status: result.status,
    signal: result.signal,
    timedOut: result.error?.name === 'TimeoutError',
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    error: result.error,
  };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function resolveFailureBundlePath({ failureBundleDir, gateId }) {
  return path.join(failureBundleDir, `${gateId}.json`);
}

function validateGateShape(gateResult) {
  return gateResult && typeof gateResult === 'object' && typeof gateResult.ok === 'boolean';
}

function hasZeroWaiverFields(value) {
  if (!value || typeof value !== 'object') return false;
  for (const [key, nested] of Object.entries(value)) {
    if (ZERO_WAIVER_FIELDS.has(key)) return true;
    if (nested && typeof nested === 'object' && hasZeroWaiverFields(nested)) return true;
  }
  return false;
}

async function executeGate(gateDef, timeoutByClass = TIMEOUTS_MS) {
  const started = Date.now();
  const timeoutMs = classifyTimeoutMs(gateDef.class, timeoutByClass);

  let timeoutHandle;
  const timeoutPromise = new Promise((resolve) => {
    timeoutHandle = setTimeout(() => {
      resolve({
        ok: false,
        reason: reason('GATE_TIMEOUT', `${gateDef.id} exceeded ${timeoutMs}ms timeout (${gateDef.class})`),
        evidencePaths: uniqueStrings(gateDef.evidencePaths),
        timedOut: true,
      });
    }, timeoutMs);
  });

  const checkPromise = (async () => {
    try {
      const result = await gateDef.check();
      return result;
    } catch (error) {
      return {
        ok: false,
        reason: reason('GATE_MISSING_RESULT', `${gateDef.id} execution failed: ${error.message}`),
        evidencePaths: uniqueStrings(gateDef.evidencePaths),
      };
    }
  })();

  const rawResult = await Promise.race([timeoutPromise, checkPromise]);
  clearTimeout(timeoutHandle);

  const elapsed = Date.now() - started;
  if (!validateGateShape(rawResult)) {
    return {
      id: gateDef.id,
      surface: gateDef.surface,
      severity: gateDef.severity,
      ok: false,
      check: gateDef.checkDescription,
      passCriteria: gateDef.passCriteria,
      evidencePaths: uniqueStrings(gateDef.evidencePaths),
      reason: reason('GATE_MISSING_RESULT', `${gateDef.id} did not return a valid gate result`),
      updatedAt: new Date().toISOString(),
      boundCommitSha: gateDef.boundCommitSha,
      meta: { elapsedMs: elapsed, timeoutMs },
    };
  }

  const reasonPayload = rawResult.reason?.code
    ? rawResult.reason
    : reason(rawResult.ok ? 'PASS' : 'GATE_MISSING_RESULT', rawResult.reason?.message || rawResult.reason || (rawResult.ok ? 'gate passed' : `${gateDef.id} failed`));

  return {
    id: gateDef.id,
    surface: gateDef.surface,
    severity: gateDef.severity,
    ok: rawResult.ok,
    check: gateDef.checkDescription,
    passCriteria: gateDef.passCriteria,
    evidencePaths: uniqueStrings([...(gateDef.evidencePaths || []), ...(rawResult.evidencePaths || [])]),
    reason: reasonPayload,
    updatedAt: new Date().toISOString(),
    boundCommitSha: rawResult.boundCommitSha || gateDef.boundCommitSha,
    meta: { elapsedMs: elapsed, timeoutMs },
  };
}

export async function evaluateReleasePortabilityVerdict({
  scope,
  evidence,
  gates,
  enforceFailureBundles = true,
  failureBundleDir,
  overallTimeoutMs = TIMEOUTS_MS.overall,
  timeoutByClass = TIMEOUTS_MS,
}) {
  const started = Date.now();
  const gateResults = [];
  const policyViolations = [];

  for (const gateDef of gates) {
    const elapsed = Date.now() - started;
    if (elapsed > overallTimeoutMs) {
      gateResults.push({
        id: gateDef.id,
        surface: gateDef.surface,
        severity: gateDef.severity,
        ok: false,
        check: gateDef.checkDescription,
        passCriteria: gateDef.passCriteria,
        evidencePaths: uniqueStrings(gateDef.evidencePaths),
        reason: reason('GATE_TIMEOUT', `overall pipeline exceeded ${overallTimeoutMs}ms while evaluating ${gateDef.id}`),
        updatedAt: new Date().toISOString(),
        boundCommitSha: gateDef.boundCommitSha,
      });
      continue;
    }

    const gate = await executeGate(gateDef, timeoutByClass);
    gateResults.push(gate);

    if (hasZeroWaiverFields(gate)) {
      policyViolations.push(reason('ZERO_WAIVER_FIELD_PRESENT', `waiver/exception field detected in gate ${gate.id}`));
    }
  }

  if (enforceFailureBundles) {
    for (const gate of gateResults) {
      if (gate.ok || gate.severity !== 'P0') continue;
      const bundlePath = resolveFailureBundlePath({ failureBundleDir, gateId: gate.id });
      const bundleCheck = verifyFailureBundle({ bundlePath, gateId: gate.id });
      if (!bundleCheck.ok) {
        policyViolations.push(bundleCheck.reason);
      }
      gate.evidencePaths = uniqueStrings([...gate.evidencePaths, ...bundleCheck.evidencePaths]);
    }
  }

  const allReasonObjects = [
    ...gateResults.filter((gate) => !gate.ok).map((gate) => gate.reason),
    ...policyViolations,
  ];

  const fullRegister = allReasonObjects.map((entry, index) => ({
    rank: index + 1,
    code: entry.code,
    message: entry.message,
  }));

  const top10ExecutiveSummary = fullRegister.slice(0, 10);
  const overallOk = gateResults.every((gate) => gate.ok) && policyViolations.length === 0;

  return {
    contractVersion: 'portability-p0/v1',
    scope,
    evidence,
    gates: gateResults,
    overall: {
      ok: overallOk,
      status: overallOk ? 'passed' : 'failed',
      deterministic: true,
      zeroWaiverEnforced: true,
      reasonCodes: uniqueStrings(fullRegister.map((item) => item.code)),
      top10ExecutiveSummary,
      fullRegister,
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function runReleasePortabilityVerdict(options) {
  const rootDir = options.rootDir;
  const reportEvidencePaths = [options.reportPath, path.join(rootDir, '.sisyphus', 'reports', 'portability-report.json')];
  const expectedCommitSha = options.commitSha || 'unknown-commit';

  const gateDefinitions = [
    {
      id: 'signedEvidence',
      surface: 'evidence-admissibility',
      severity: 'P0',
      class: 'fast',
      checkDescription: 'Require same-run keyless signed evidence bundle',
      passCriteria: 'Signed evidence bundle exists, keyless verified, and bound to same run+commit',
      boundCommitSha: expectedCommitSha,
      evidencePaths: [options.signedBundlePath],
      check: async () => verifySignedEvidenceBundle({
        bundlePath: options.signedBundlePath,
        expectedRunId: options.runId,
        expectedCommitSha,
      }),
    },
    {
      id: 'reportGeneration',
      surface: 'release-report-aggregation',
      severity: 'P0',
      class: 'heavy',
      checkDescription: 'Generate portability report in same run',
      passCriteria: 'generate-portability-report exits 0 before timeout and writes JSON report',
      boundCommitSha: expectedCommitSha,
      evidencePaths: reportEvidencePaths,
      check: async () => {
        const run = runGeneratePortabilityReport({
          rootDir,
          reportPath: options.reportPath,
          timeoutMs: classifyTimeoutMs('heavy'),
        });

        if (run.timedOut) {
          return {
            ok: false,
            reason: reason('GATE_TIMEOUT', 'generate-portability-report timed out'),
            evidencePaths: reportEvidencePaths,
            boundCommitSha: expectedCommitSha,
          };
        }

        if (run.status !== 0 || !existsSync(options.reportPath)) {
          return {
            ok: false,
            reason: reason('GATE_MISSING_RESULT', `generate-portability-report failed (exit ${run.status ?? 'null'})`),
            evidencePaths: reportEvidencePaths,
            boundCommitSha: expectedCommitSha,
          };
        }

        return {
          ok: true,
          reason: reason('PASS', 'portability report generated'),
          evidencePaths: reportEvidencePaths,
          boundCommitSha: expectedCommitSha,
        };
      },
    },
    {
      id: 'releaseGateResult',
      surface: 'gate-register-integrity',
      severity: 'P0',
      class: 'fast',
      checkDescription: 'Require report releaseVerdict gate register',
      passCriteria: 'report.releaseVerdict.gates exists and contains at least one gate entry',
      boundCommitSha: expectedCommitSha,
      evidencePaths: reportEvidencePaths,
      check: async () => {
        if (!existsSync(options.reportPath)) {
          return {
            ok: false,
            reason: reason('GATE_MISSING_RESULT', `report not found: ${options.reportPath}`),
            evidencePaths: reportEvidencePaths,
            boundCommitSha: expectedCommitSha,
          };
        }

        try {
          const report = readJson(options.reportPath);
          const gateEntries = Object.entries(report?.releaseVerdict?.gates || {});
          if (gateEntries.length === 0) {
            return {
              ok: false,
              reason: reason('GATE_MISSING_RESULT', 'releaseVerdict.gates is missing or empty'),
              evidencePaths: reportEvidencePaths,
              boundCommitSha: expectedCommitSha,
            };
          }
        } catch (error) {
          return {
            ok: false,
            reason: reason('GATE_MISSING_RESULT', `unable to parse report JSON: ${error.message}`),
            evidencePaths: reportEvidencePaths,
            boundCommitSha: expectedCommitSha,
          };
        }

        return {
          ok: true,
          reason: reason('PASS', 'release gate register present'),
          evidencePaths: reportEvidencePaths,
          boundCommitSha: expectedCommitSha,
        };
      },
    },
  ];

  return evaluateReleasePortabilityVerdict({
    scope: {
      target: 'TOTAL replicability',
      environments: ['dev', 'ci'],
      osMatrix: ['windows', 'linux'],
      policy: 'zero-waiver',
    },
    evidence: {
      runId: options.runId,
      commitSha: expectedCommitSha,
      signedBundlePath: options.signedBundlePath,
      reportPath: options.reportPath,
      updatedAt: new Date().toISOString(),
    },
    gates: gateDefinitions,
    failureBundleDir: options.failureBundleDir,
    enforceFailureBundles: true,
    overallTimeoutMs: TIMEOUTS_MS.overall,
  });
}

function printTextReport(verdict) {
  console.log(`contractVersion: ${verdict.contractVersion}`);
  console.log(`status: ${verdict.overall.status}`);
  console.log('\nTop-10 Executive Summary');
  for (const item of verdict.overall.top10ExecutiveSummary) {
    console.log(`- [${item.code}] ${item.message}`);
  }

  console.log('\nFull Register');
  for (const item of verdict.overall.fullRegister) {
    console.log(`${item.rank}. [${item.code}] ${item.message}`);
  }
}

async function main() {
  const options = parseCliArgs(process.argv);
  mkdirSync(path.dirname(options.reportPath), { recursive: true });
  mkdirSync(options.failureBundleDir, { recursive: true });

  const verdict = await runReleasePortabilityVerdict(options);

  if (options.json) {
    console.log(JSON.stringify(verdict, null, 2));
  } else {
    printTextReport(verdict);
  }

  process.exit(verdict.overall.ok ? 0 : 1);
}

const thisFilePath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(thisFilePath);
if (isDirectRun) {
  main();
}
