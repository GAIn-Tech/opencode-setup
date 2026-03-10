import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');
const RUNNER = join(ROOT, 'scripts', 'run-package-smokes.mjs');
const PACKAGE_JSON = join(ROOT, 'package.json');

describe('package smoke runner', () => {
  test('package.json exposes packages:smoke script', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    expect(pkg.scripts['packages:smoke']).toBe('node scripts/run-package-smokes.mjs');
  });

  test('dry-run reports critical packages with smoke scripts', () => {
    const result = spawnSync('node', [RUNNER, '--dry-run', '--json'], {
      cwd: ROOT,
      timeout: 10000,
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.toString());
    const packageNames = payload.packages.map((entry) => entry.name);

    expect(packageNames).toContain('opencode-model-manager');
    expect(packageNames).toContain('opencode-integration-layer');
    expect(packageNames).toContain('opencode-context-governor');
    expect(packageNames).toContain('opencode-dashboard');
  });
});
