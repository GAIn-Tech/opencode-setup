#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const checks = [
  { id: 'FG-01', cmd: 'node', args: ['scripts/perf/fg01-stats-durability.mjs'] },
  { id: 'FG-02', cmd: 'node', args: ['scripts/perf/fg02-hotpath-io.mjs'] },
  { id: 'FG-03', cmd: 'node', args: ['scripts/perf/fg03-feedback-lag.mjs'] },
  { id: 'FG-04', cmd: 'node', args: ['scripts/security/fg04-ingestion-integrity.mjs'] },
  { id: 'FG-05', cmd: 'node', args: ['scripts/fault/fg05-strategy-failure-isolation.mjs'] },
  { id: 'FG-06', cmd: 'node', args: ['scripts/perf/fg06-tail-latency-slo.mjs'] },
  { id: 'FG-07', cmd: 'node', args: ['scripts/evals/fg07-promotion-gate.mjs'] },
  { id: 'FG-08', cmd: 'node', args: ['scripts/perf/fg08-poll-coordination.mjs'] },
  { id: 'FG-09', cmd: 'node', args: ['scripts/replay/fg09-replay-parity.mjs'] },
  { id: 'FG-10', cmd: 'node', args: ['scripts/ops/fg10-review-queue-slo.mjs'] },
  { id: 'FG-11', cmd: 'node', args: ['scripts/evals/fg11-retrieval-quality.mjs'] },
  { id: 'FG-12', cmd: 'node', args: ['scripts/governance/fg12-sim-gate.mjs'] },
  { id: 'Schema-Migration', cmd: 'node', args: ['scripts/governance/fg-schema-migration.mjs'] },
  { id: 'Gov-Schema', cmd: 'node', args: ['scripts/validate-control-plane-schema.mjs'] },
  { id: 'Gov-Fallback', cmd: 'node', args: ['scripts/validate-fallback-consistency.mjs'] },
  { id: 'Gov-Plugin', cmd: 'node', args: ['scripts/validate-plugin-compatibility.mjs'] },
  { id: 'Security-Free', cmd: 'node', args: ['scripts/security/security-audit-free.mjs', '--allow-missing-tools', '--advisory'] },
];

function run(check) {
  const started = Date.now();
  const res = spawnSync(check.cmd, check.args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 300000,
  });
  const durationMs = Date.now() - started;
  return {
    id: check.id,
    command: `${check.cmd} ${check.args.join(' ')}`,
    status: res.status === 0 ? 'pass' : 'fail',
    exitCode: res.status,
    durationMs,
    stdout: (res.stdout || '').slice(-4000),
    stderr: (res.stderr || '').slice(-4000),
  };
}

const results = checks.map(run);
const failed = results.filter((r) => r.status !== 'pass');
const report = {
  generated_at: new Date().toISOString(),
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
};

const outDir = path.join(ROOT, 'reports', 'frontier');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'frontier-verify-all.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

console.log(JSON.stringify({ status: failed.length === 0 ? 'pass' : 'fail', outPath, failed: failed.map((f) => f.id) }, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
