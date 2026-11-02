#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function evaluatePolicyPromotionGate(payload, env = {}) {
  const gate = payload?.eval_gate || payload?.evalGate || null;
  if (!gate || typeof gate !== 'object') {
    return { pass: false, reason: 'missing_eval_gate' };
  }

  const artifactId = String(gate.artifact_id || gate.artifactId || '').trim();
  const passed = gate.passed === true;
  const scoreDeltaRaw = gate.score_delta ?? gate.scoreDelta;
  const scoreDelta = Number.isFinite(Number(scoreDeltaRaw)) ? Number(scoreDeltaRaw) : NaN;
  const minDelta = Number.isFinite(Number(env.OPENCODE_POLICY_EVAL_MIN_DELTA || '0'))
    ? Number(env.OPENCODE_POLICY_EVAL_MIN_DELTA || '0')
    : 0;

  if (!artifactId) return { pass: false, reason: 'missing_eval_artifact' };
  if (!passed) return { pass: false, reason: 'eval_report_not_passed' };
  if (!Number.isFinite(scoreDelta)) return { pass: false, reason: 'missing_eval_delta' };
  if (scoreDelta < minDelta) return { pass: false, reason: 'eval_delta_below_threshold' };

  return { pass: true, reason: 'ok' };
}

function main() {
  const env = { OPENCODE_POLICY_EVAL_MIN_DELTA: '0.02' };
  const cases = [
    { name: 'missing gate', payload: {}, expect: false },
    { name: 'failed eval', payload: { eval_gate: { artifact_id: 'a1', passed: false, score_delta: 0.2 } }, expect: false },
    { name: 'low delta', payload: { eval_gate: { artifact_id: 'a2', passed: true, score_delta: 0.01 } }, expect: false },
    { name: 'valid gate', payload: { eval_gate: { artifact_id: 'a3', passed: true, score_delta: 0.05 } }, expect: true },
  ];

  const results = cases.map((testCase) => {
    const out = evaluatePolicyPromotionGate(testCase.payload, env);
    if (out.pass !== testCase.expect) {
      throw new Error(`Case '${testCase.name}' mismatch: expected ${testCase.expect}, got ${out.pass} (${out.reason})`);
    }
    return { name: testCase.name, pass: out.pass, reason: out.reason };
  });

  const artifactPath = path.join(os.tmpdir(), `fg07-eval-gate-${Date.now()}.json`);
  fs.writeFileSync(artifactPath, JSON.stringify({ status: 'pass', results }, null, 2), 'utf8');

  console.log(
    JSON.stringify(
      {
        status: 'pass',
        artifact: artifactPath,
        results,
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
