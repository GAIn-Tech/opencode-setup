import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { evaluateRuntimeExecution, RUNTIME_CONTEXT_JSON_MARKER } from '../runtime-context-compliance.mjs';

const ROOT = join(import.meta.dir, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'runtime-context-compliance.mjs');
const PACKAGE_JSON = join(ROOT, 'package.json');

describe('runtime-context-compliance', () => {
  test('package.json exposes a runtime:compliance script', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    expect(pkg.scripts['runtime:compliance']).toBe('node scripts/runtime-context-compliance.mjs');
  });

  test('evaluateRuntimeExecution passes for expected runtime payload', () => {
    const result = evaluateRuntimeExecution({
      attachedRuntimeContext: true,
      budgetAction: 'compress_urgent',
      compressionActive: true,
      adaptiveRetries: 1,
      adaptiveBackoff: 3000,
      compressionRecommendedTools: ['distill_run_tool'],
      compressionRecommendedSkills: ['dcp', 'distill'],
    });
    expect(result.ok).toBe(true);
  });

  test('script exercises executeTaskWithEvidence runtime path', () => {
    const result = spawnSync('node', [SCRIPT, '--json'], {
      cwd: ROOT,
      timeout: 30000,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const markerIndex = result.stdout.lastIndexOf(RUNTIME_CONTEXT_JSON_MARKER);
    expect(markerIndex).toBeGreaterThanOrEqual(0);
    const payload = JSON.parse(result.stdout.slice(markerIndex + RUNTIME_CONTEXT_JSON_MARKER.length));
    expect(payload.attachedRuntimeContext).toBe(true);
    expect(payload.budgetAction).toBe('compress_urgent');
    expect(payload.compressionActive).toBe(true);
    expect(payload.compressionRecommendedTools).toContain('distill_run_tool');
    expect(payload.compressionRecommendedSkills).toContain('dcp');
    expect(payload.evaluation.ok).toBe(true);
  }, 30000);
});
