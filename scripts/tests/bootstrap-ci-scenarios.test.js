import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';

const WORKFLOW_PATH = path.join(import.meta.dir, '..', '..', '.github', 'workflows', 'bootstrap-readiness.yml');

function readWorkflowYaml() {
  expect(existsSync(WORKFLOW_PATH)).toBe(true);
  return readFileSync(WORKFLOW_PATH, 'utf8');
}

function parseWorkflow() {
  const raw = readWorkflowYaml();
  const parsed = load(raw);
  expect(parsed && typeof parsed === 'object').toBe(true);
  return parsed;
}

describe('bootstrap readiness CI workflow scenarios', () => {
  test('workflow exists and is valid YAML with required jobs', () => {
    const parsed = parseWorkflow();

    expect(parsed.name).toBe('Bootstrap Readiness');
    expect(parsed.jobs).toBeDefined();
    expect(parsed.jobs['fresh-clone']).toBeDefined();
    expect(parsed.jobs['pull-reconcile']).toBeDefined();
  });

  test('fresh-clone job uses required matrix legs and runs setup + verify', () => {
    const parsed = parseWorkflow();
    const freshClone = parsed.jobs['fresh-clone'];
    const matrix = freshClone.strategy?.matrix;
    const workflow = readWorkflowYaml();

    expect(Array.isArray(matrix?.os)).toBe(true);
    expect(matrix.os).toContain('ubuntu-latest');
    expect(matrix.os).toContain('windows-latest');
    expect(workflow).toContain('bun run setup');
    expect(workflow).toContain('node scripts/verify-setup.mjs');
  });

  test('pull-reconcile job simulates drift, requires sync success, and verifies clean state', () => {
    const workflow = readWorkflowYaml();

    expect(workflow).toContain('bun run sync > sync-report.json');
    expect(workflow).toContain('generated-artifacts:reconciled');
    expect(workflow).toContain('sync report is not ok');
    expect(workflow).toContain('node scripts/verify-setup.mjs');
  });

  test('setup timing SLO is enforced at <= 600 seconds', () => {
    const workflow = readWorkflowYaml();

    expect(workflow).toContain('duration_seconds');
    expect(workflow).toContain('> 600');
    expect(workflow).toContain('exceeded 600 seconds');
  });

  test('required readiness jobs are blocking (no continue-on-error)', () => {
    const workflow = readWorkflowYaml();
    const freshCloneStart = workflow.indexOf('fresh-clone:');
    const pullReconcileStart = workflow.indexOf('pull-reconcile:');
    const freshCloneSection = workflow.slice(freshCloneStart, pullReconcileStart);
    const pullReconcileSection = workflow.slice(pullReconcileStart);

    expect(freshCloneSection.includes('continue-on-error: true')).toBe(false);
    expect(pullReconcileSection.includes('continue-on-error: true')).toBe(false);
  });
});
