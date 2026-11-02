import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { evaluateRuntimeProof } from '../protocol-compliance-pass.mjs';

const PACKAGE_JSON = join(import.meta.dir, '..', '..', 'package.json');

describe('protocol-compliance-pass', () => {
  test('package.json exposes protocol:compliance script', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    expect(pkg.scripts['protocol:compliance']).toBe('node scripts/protocol-compliance-pass.mjs');
  });

  test('package.json exposes runtime:compliance script', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    expect(pkg.scripts['runtime:compliance']).toBe('node scripts/runtime-context-compliance.mjs');
  });

  test('package.json exposes runtime:workflow-scenarios script', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    expect(pkg.scripts['runtime:workflow-scenarios']).toBe('node scripts/runtime-workflow-scenarios.mjs');
  });

  test('package.json exposes skills:coverage script', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    expect(pkg.scripts['skills:coverage']).toBe(
      'node scripts/check-skill-coverage.mjs --report .sisyphus/reports/skill-coverage-gap-report.json'
    );
  });

  test('governance:check includes skills:coverage gate', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    expect(pkg.scripts['governance:check']).toContain('bun run skills:coverage');
  });

  test('evaluateRuntimeProof passes when all selected tools are visible', () => {
    const result = evaluateRuntimeProof({
      allSelectedToolsVisible: true,
      missingSelectedTools: [],
    });
    expect(result.ok).toBe(true);
    expect(result.reason).toBe('ok');
  });

  test('evaluateRuntimeProof fails when selected tools are missing', () => {
    const result = evaluateRuntimeProof({
      allSelectedToolsVisible: false,
      missingSelectedTools: ['distill_run_tool', 'context7_query_docs'],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('distill_run_tool');
    expect(result.reason).toContain('context7_query_docs');
  });
});
