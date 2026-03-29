import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runSetup } from '../setup-resilient.mjs';

describe('setup-resilient idempotency report', () => {
  test('emits machine-readable report shape with duration and step status', () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), 'setup-idempotency-report-'));
    const reportPath = path.join(tempRoot, 'report.json');

    try {
      let counter = 0;
      const report = runSetup({
        runPreSetup: false,
        now: () => {
          counter += 125;
          return counter;
        },
        steps: [
          { label: 'unit-step', command: 'node', args: ['-e', 'process.exit(0)'] },
        ],
        runCommand: () => ({ status: 0 }),
        reportFile: reportPath,
      });

      expect(report.ok).toBe(true);
      expect(typeof report.duration_seconds).toBe('number');
      expect(report.duration_seconds).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(report.steps)).toBe(true);
      expect(report.steps).toHaveLength(1);
      expect(report.steps[0]).toEqual(expect.objectContaining({
        label: 'unit-step',
        status: 'success',
      }));
      expect(typeof report.timestamp).toBe('string');

      const persisted = JSON.parse(readFileSync(reportPath, 'utf8'));
      expect(persisted.ok).toBe(true);
      expect(persisted.steps[0].status).toBe('success');
      expect(typeof persisted.duration_seconds).toBe('number');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('reports mutating step as skipped on converged second run', () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), 'setup-idempotency-converged-'));
    const markerPath = path.join(tempRoot, 'runtime-marker.txt');

    try {
      const steps = [
        {
          label: 'copy-config',
          command: 'node',
          args: ['-e', 'process.exit(0)'],
          probePaths: [markerPath],
        },
      ];

      const runner = () => {
        writeFileSync(markerPath, 'stable-state\n', 'utf8');
        return { status: 0 };
      };

      const first = runSetup({
        runPreSetup: false,
        steps,
        runCommand: runner,
      });
      const second = runSetup({
        runPreSetup: false,
        steps,
        runCommand: runner,
      });

      expect(first.ok).toBe(true);
      expect(first.steps[0].status).toBe('success');
      expect(second.ok).toBe(true);
      expect(second.steps[0].status).toBe('skipped');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
