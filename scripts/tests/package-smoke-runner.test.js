import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');
const RUNNER = join(ROOT, 'scripts', 'run-package-smokes.mjs');
const PACKAGE_JSON = join(ROOT, 'package.json');

function runRunner(args = [], rootOverride = ROOT) {
  return spawnSync('node', [RUNNER, ...args], {
    cwd: ROOT,
    timeout: 10000,
    env: {
      ...process.env,
      OPENCODE_ROOT: rootOverride,
    },
  });
}

function createRunnerFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'package-smoke-runner-'));

  mkdirSync(join(dir, 'packages', 'pkg-smoke-pass'), { recursive: true });
  mkdirSync(join(dir, 'plugins', 'plugin-smoke-pass'), { recursive: true });
  mkdirSync(join(dir, 'plugins', 'plugin-smoke-missing'), { recursive: true });

  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture-root', private: true, workspaces: ['packages/*'] }, null, 2),
    'utf8',
  );

  writeFileSync(
    join(dir, 'packages', 'pkg-smoke-pass', 'package.json'),
    JSON.stringify(
      {
        name: 'pkg-smoke-pass',
        private: true,
        scripts: {
          'test:smoke': 'bun -e "process.exit(0)"',
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  writeFileSync(
    join(dir, 'plugins', 'plugin-smoke-pass', 'package.json'),
    JSON.stringify(
      {
        name: 'plugin-smoke-pass',
        private: true,
        scripts: {
          'test:smoke': 'bun -e "process.exit(0)"',
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  writeFileSync(
    join(dir, 'plugins', 'plugin-smoke-missing', 'package.json'),
    JSON.stringify({ name: 'plugin-smoke-missing', private: true }, null, 2),
    'utf8',
  );

  return dir;
}

describe('package smoke runner', () => {
  test('package.json exposes packages:smoke script', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    expect(pkg.scripts['packages:smoke']).toBe('node scripts/run-package-smokes.mjs');
  });

  test('dry-run reports critical packages with smoke scripts', () => {
    const result = runRunner(['--dry-run', '--json']);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.toString());
    const packageNames = payload.packages.map((entry) => entry.name);

    expect(packageNames).toContain('opencode-model-manager');
    expect(packageNames).toContain('opencode-integration-layer');
    expect(packageNames).toContain('opencode-context-governor');
    expect(packageNames).toContain('opencode-dashboard');
    expect(packageNames).toContain('opencode-plugin-preload-skills');
    expect(packageNames).toContain('opencode-model-router-x');
    expect(Array.isArray(payload.plugins)).toBe(true);
  });

  test('dry-run includes plugin runtime checks and skips missing plugin smoke scripts with reason code', () => {
    const fixtureRoot = createRunnerFixture();

    try {
      const result = runRunner(['--dry-run', '--json'], fixtureRoot);
      expect(result.status).toBe(0);

      const payload = JSON.parse(result.stdout.toString());
      const pluginByName = new Map(payload.plugins.map((entry) => [entry.name, entry]));

      expect(payload.packageCount).toBe(1);
      expect(payload.pluginCount).toBe(2);
      expect(pluginByName.get('plugin-smoke-pass')).toMatchObject({
        ok: true,
        dryRun: true,
        command: 'bun -e "process.exit(0)"',
      });
      expect(pluginByName.get('plugin-smoke-missing')).toMatchObject({
        ok: true,
        skipped: true,
        reasonCode: 'PLUGIN_SMOKE_MISSING',
      });
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test('non-dry-run returns PLUGIN_SMOKE_FAILED reason code when plugin smoke command fails', () => {
    const fixtureRoot = createRunnerFixture();

    try {
      writeFileSync(
        join(fixtureRoot, 'plugins', 'plugin-smoke-pass', 'package.json'),
        JSON.stringify(
          {
            name: 'plugin-smoke-pass',
            private: true,
            scripts: {
              'test:smoke': 'bun -e "process.exit(1)"',
            },
          },
          null,
          2,
        ),
        'utf8',
      );

      const result = runRunner(['--json'], fixtureRoot);
      expect(result.status).toBe(1);

      const payload = JSON.parse(result.stdout.toString());
      const failedPlugin = payload.plugins.find((entry) => entry.name === 'plugin-smoke-pass');

      expect(failedPlugin.ok).toBe(false);
      expect(failedPlugin.reasonCode).toBe('PLUGIN_SMOKE_FAILED');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
