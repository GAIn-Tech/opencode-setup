import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import {
  evaluateWorkflowScenarios,
  RUNTIME_WORKFLOW_JSON_MARKER,
} from '../runtime-workflow-scenarios.mjs';

const ROOT = join(import.meta.dir, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'runtime-workflow-scenarios.mjs');
const PACKAGE_JSON = join(ROOT, 'package.json');

describe('runtime-workflow-scenarios', () => {
  test('package.json exposes runtime:workflow-scenarios script', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    expect(pkg.scripts['runtime:workflow-scenarios']).toBe('node scripts/runtime-workflow-scenarios.mjs');
  });

test('evaluateWorkflowScenarios passes for expected payload', () => {
  const result = evaluateWorkflowScenarios({
    scenarios: {
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
      setup: {
        name: 'setup',
        executionMode: 'real',
        executionOk: true,
      },
      sync: {
        name: 'sync',
        executionMode: 'real',
        executionOk: true,
      },
      verify: {
        name: 'verify',
        executionMode: 'real',
        executionOk: true,
      },
      report: {
        name: 'report',
        executionMode: 'real',
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
    },
  });
  expect(result.ok).toBe(true);
});

  test('script exercises workflow scenarios through runtime', () => {
    const result = spawnSync('node', [SCRIPT, '--json'], {
      cwd: ROOT,
      timeout: 30000,
      encoding: 'utf8',
    });

expect(result.status).toBe(0);
const markerIndex = result.stdout.lastIndexOf(RUNTIME_WORKFLOW_JSON_MARKER);
expect(markerIndex).toBeGreaterThanOrEqual(0);
const jsonStr = result.stdout.slice(markerIndex + RUNTIME_WORKFLOW_JSON_MARKER.length).trim();
const payload = JSON.parse(jsonStr);

    expect(payload.scenarios.healthyCodeEdit.budgetAction).toBe('none');
    expect(payload.scenarios.compressedResearch.budgetAction).toBe('compress_urgent');
    expect(payload.scenarios.compressedResearch.compressionRecommendedTools).toContain('distill_run_tool');
    expect(payload.scenarios.serviceTouchpoints.dashboard.running).toBe(true);
    expect(payload.scenarios.workflowPersistence.resume.status).toBe('resumed');
    expect(payload.evaluation.ok).toBe(true);
  }, 30000);
});
