#!/usr/bin/env node

function evaluatePolicySimGate(payload, env = {}) {
  const gate = payload?.policy_sim_gate || payload?.policySimGate || null;
  if (!gate || typeof gate !== 'object') return { pass: false, reason: 'missing_policy_sim_gate' };

  const artifactId = String(gate.artifact_id || gate.artifactId || '').trim();
  const pass = gate.pass === true;
  const riskHigh = gate.risk_high === true || gate.riskHigh === true;
  const acceptanceRatioRaw = gate.acceptance_ratio ?? gate.acceptanceRatio;
  const acceptanceRatio = Number.isFinite(Number(acceptanceRatioRaw)) ? Number(acceptanceRatioRaw) : NaN;
  const minAcceptanceRatio = Number.isFinite(Number(env.OPENCODE_POLICY_SIM_MIN_ACCEPTANCE_RATIO || '90'))
    ? Number(env.OPENCODE_POLICY_SIM_MIN_ACCEPTANCE_RATIO || '90')
    : 90;

  if (!artifactId) return { pass: false, reason: 'missing_policy_sim_artifact' };
  if (!pass) return { pass: false, reason: 'policy_sim_failed' };
  if (riskHigh) return { pass: false, reason: 'policy_sim_risk_high' };
  if (!Number.isFinite(acceptanceRatio)) return { pass: false, reason: 'missing_policy_sim_acceptance_ratio' };
  if (acceptanceRatio < minAcceptanceRatio) return { pass: false, reason: 'policy_sim_acceptance_ratio_below_threshold' };
  return { pass: true, reason: 'ok' };
}

function main() {
  const env = { OPENCODE_POLICY_SIM_MIN_ACCEPTANCE_RATIO: '90' };
  const cases = [
    { name: 'missing', payload: {}, expect: false },
    { name: 'failed', payload: { policy_sim_gate: { artifact_id: 'sim1', pass: false, risk_high: false, acceptance_ratio: 99 } }, expect: false },
    { name: 'risky', payload: { policy_sim_gate: { artifact_id: 'sim2', pass: true, risk_high: true, acceptance_ratio: 99 } }, expect: false },
    { name: 'low-acceptance', payload: { policy_sim_gate: { artifact_id: 'sim3', pass: true, risk_high: false, acceptance_ratio: 80 } }, expect: false },
    { name: 'ok', payload: { policy_sim_gate: { artifact_id: 'sim4', pass: true, risk_high: false, acceptance_ratio: 96 } }, expect: true },
  ];

  const results = cases.map((testCase) => {
    const out = evaluatePolicySimGate(testCase.payload, env);
    if (out.pass !== testCase.expect) {
      throw new Error(`Case '${testCase.name}' mismatch: expected=${testCase.expect} got=${out.pass} reason=${out.reason}`);
    }
    return { name: testCase.name, ...out };
  });

  console.log(JSON.stringify({ status: 'pass', results }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
