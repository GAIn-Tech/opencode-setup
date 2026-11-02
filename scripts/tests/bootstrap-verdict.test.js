import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const GENERATE_REPORT_PATH = path.join(import.meta.dir, '..', 'generate-portability-report.mjs');

function runGeneratePortabilityReport() {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'bootstrap-verdict-report-'));
  const outputPath = path.join(tempDir, 'portability-report.json');

  const run = spawnSync(process.execPath, [GENERATE_REPORT_PATH, '--output', outputPath], {
    encoding: 'utf8',
  });

  expect(run.error).toBeUndefined();
  const report = JSON.parse(readFileSync(outputPath, 'utf8'));
  return { run, report, tempDir };
}

describe('generate-portability-report bootstrap verdict aggregation', () => {
  test('includes bootstrapVerdict contract with gate statuses, reasons, and evidence paths', { timeout: 60000 }, () => {
    const { report, tempDir } = runGeneratePortabilityReport();

    try {
      expect(report).toHaveProperty('bootstrapVerdict');
      expect(report.bootstrapVerdict).toEqual(expect.objectContaining({
        ok: expect.any(Boolean),
        gates: expect.any(Object),
        reasons: expect.any(Array),
        timestamp: expect.any(String),
      }));

      const expectedGates = ['manifest', 'setup', 'sync', 'noHiddenExec', 'prereqs', 'ciScenarios', 'pluginReadiness'];
      for (const gateName of expectedGates) {
        expect(report.bootstrapVerdict.gates).toHaveProperty(gateName);
        expect(report.bootstrapVerdict.gates[gateName]).toEqual(expect.objectContaining({
          status: expect.stringMatching(/^(passed|failed)$/),
          reasons: expect.any(Array),
          evidencePaths: expect.any(Array),
        }));
      }

      expect(Number.isNaN(Date.parse(report.bootstrapVerdict.timestamp))).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('surfaces failed bootstrap gates in bootstrapVerdict.reasons with gate-qualified prefixes', { timeout: 60000 }, () => {
    const { report, tempDir } = runGeneratePortabilityReport();

    try {
      if (report.bootstrapVerdict.ok) {
        expect(report.bootstrapVerdict.reasons).toEqual([]);
      } else {
        expect(report.bootstrapVerdict.reasons.length).toBeGreaterThan(0);
        expect(report.bootstrapVerdict.reasons.some((reason) => reason.includes(':'))).toBe(true);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
