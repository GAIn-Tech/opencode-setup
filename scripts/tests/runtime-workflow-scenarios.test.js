const { describe, expect, test, beforeAll } = require('bun:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'runtime-workflow-scenarios.mjs');
const PACKAGE_JSON = join(ROOT, 'package.json');

let evaluateWorkflowScenarios;
let RUNTIME_WORKFLOW_JSON_MARKER;

function baseOperationalScenarios() {
  return {
    healthyCodeEdit: {
      attachedRuntimeContext: true,
      budgetAction: 'none',
      compressionActive: false,
      adaptiveRetries: 3,
      adaptiveBackoff: 1000,
      executionMode: 'mocked',
      executionOk: true,
    },
    compressedResearch: {
      attachedRuntimeContext: true,
      budgetAction: 'compress_urgent',
      compressionActive: true,
      adaptiveRetries: 1,
      adaptiveBackoff: 3000,
      compressionRecommendedTools: ['distill_run_tool'],
      compressionRecommendedSkills: ['dcp', 'distill', 'context-governor'],
      executionMode: 'mocked',
      executionOk: true,
    },
    serviceTouchpoints: {
      dashboard: { running: true, port: 3000 },
      health: { status: 'warn' },
      healthSnapshot: { status: 'warn', checkCount: 4 },
    },
    workflowPersistence: {
      execute: { runId: 'workflow-run-1', status: 'completed' },
      resume: { runId: 'workflow-run-1', status: 'resumed' },
      state: { runId: 'workflow-run-1', step: 2 },
    },
  };
}

beforeAll(async () => {
  const mod = await import(pathToFileURL(join(ROOT, 'scripts', 'runtime-workflow-scenarios.mjs')).href);
  evaluateWorkflowScenarios = mod.evaluateWorkflowScenarios;
  RUNTIME_WORKFLOW_JSON_MARKER = mod.RUNTIME_WORKFLOW_JSON_MARKER;
});

describe('runtime-workflow-scenarios', () => {
  test('package.json exposes runtime:workflow-scenarios script', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    expect(pkg.scripts['runtime:workflow-scenarios']).toBe('node scripts/runtime-workflow-scenarios.mjs');
  });

  test('evaluateWorkflowScenarios passes for required real-execution policy', () => {
    const result = evaluateWorkflowScenarios({
      scenarios: {
        ...baseOperationalScenarios(),
        setup: { executionMode: 'real', executionOk: true },
        sync: { executionMode: 'real', executionOk: true },
        verify: { executionMode: 'real', executionOk: true },
        report: { executionMode: 'real', executionOk: true },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.reasonCode).toBe('OK');
  });

  test('fails when non-mocked ratio is below threshold', () => {
    const result = evaluateWorkflowScenarios({
      scenarios: {
        ...baseOperationalScenarios(),
        setup: { executionMode: 'real', executionOk: true },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.reasonCode).toBe('SCENARIO_MOCKED_RATIO_BELOW_THRESHOLD');
  });

  test('fails when a critical scenario is missing or not real', () => {
    const result = evaluateWorkflowScenarios({
      scenarios: {
        ...baseOperationalScenarios(),
        setup: { executionMode: 'real', executionOk: true },
        sync: { executionMode: 'real', executionOk: true },
        verify: { executionMode: 'mocked', executionOk: true },
        report: { executionMode: 'real', executionOk: true },
        ancillaryReal: { executionMode: 'real', executionOk: true },
        ancillaryRealTwo: { executionMode: 'real', executionOk: true },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.reasonCode).toBe('SCENARIO_CRITICAL_REAL_MISSING');
  });

  test('fails when a critical real scenario execution fails', () => {
    const result = evaluateWorkflowScenarios({
      scenarios: {
        ...baseOperationalScenarios(),
        setup: { executionMode: 'real', executionOk: true },
        sync: { executionMode: 'real', executionOk: true },
        verify: { executionMode: 'real', executionOk: false },
        report: { executionMode: 'real', executionOk: true },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.reasonCode).toBe('SCENARIO_REAL_EXECUTION_FAILED');
  });

test('script exercises workflow scenarios through runtime and policy gate passes', () => {
  const result = spawnSync('node', [SCRIPT, '--json'], {
    cwd: ROOT,
    timeout: 30000,
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  // The script outputs JSON marker to stdout
  const markerIndex = result.stdout.lastIndexOf(RUNTIME_WORKFLOW_JSON_MARKER);
  expect(markerIndex).toBeGreaterThanOrEqual(0);
  const jsonStr = result.stdout.slice(markerIndex + RUNTIME_WORKFLOW_JSON_MARKER.length).trim();
  const payload = JSON.parse(jsonStr);

  expect(payload.scenarios.healthyCodeEdit.budgetAction).toBe('none');
  expect(payload.scenarios.compressedResearch.budgetAction).toBe('compress_urgent');
  expect(payload.scenarios.compressedResearch.compressionRecommendedTools).toContain('distill_run_tool');
  expect(payload.scenarios.setup.executionMode).toBe('real');
  expect(payload.scenarios.sync.executionMode).toBe('real');
  expect(payload.scenarios.verify.executionMode).toBe('real');
  expect(payload.scenarios.report.executionMode).toBe('real');
  expect(payload.evaluation.ok).toBe(true);
  expect(payload.evaluation.reasonCode).toBe('OK');
}, 30000);
});
