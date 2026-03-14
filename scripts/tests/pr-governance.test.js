import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const SCRIPT = join(process.cwd(), 'scripts', 'pr-governance.mjs');

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }

  return result;
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createRepo() {
  const repoDir = mkdtempSync(join(tmpdir(), 'pr-governance-test-'));

  mkdirSync(join(repoDir, 'scripts'), { recursive: true });
  mkdirSync(join(repoDir, 'opencode-config'), { recursive: true });
  mkdirSync(join(repoDir, 'packages', 'demo-package', 'src'), { recursive: true });

  writeJson(join(repoDir, 'package.json'), {
    name: 'pr-governance-test',
    private: true,
  });
  writeJson(join(repoDir, 'opencode-config', 'learning-update-policy.json'), {
    governed_paths: ['packages/', 'opencode-config/'],
  });
  writeFileSync(join(repoDir, 'packages', 'demo-package', 'src', 'index.js'), 'module.exports = {}\n');
  writeFileSync(join(repoDir, 'packages', 'demo-package', 'src', 'cli.js'), 'module.exports = { run: () => "v1" };\n');

  run('git', ['init'], { cwd: repoDir });
  run('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });
  run('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });
  run('git', ['add', '.'], { cwd: repoDir });
  run('git', ['commit', '-m', 'baseline'], { cwd: repoDir });

  const base = run('git', ['rev-parse', 'HEAD'], { cwd: repoDir }).stdout.trim();
  return { repoDir, base };
}

function commitChange(repoDir, filePath, content, message) {
  writeFileSync(join(repoDir, filePath), content);
  run('git', ['add', filePath], { cwd: repoDir });
  run('git', ['commit', '-m', message], { cwd: repoDir });
}

function runGovernance(repoDir, base, body) {
  return spawnSync(process.execPath, [SCRIPT, '--base', base, '--head', 'HEAD', '--body', body], {
    cwd: repoDir,
    env: {
      ...process.env,
      OPENCODE_ROOT: repoDir,
    },
    encoding: 'utf8',
  });
}

describe('pr-governance Surface-Policy enforcement', () => {
  test('fails when a surface change omits Surface-Policy trailer', () => {
    const { repoDir, base } = createRepo();

    try {
      commitChange(
        repoDir,
        'packages/demo-package/src/cli.js',
        'module.exports = { run: () => "v2" };\n',
        'change cli surface',
      );

      const result = runGovernance(
        repoDir,
        base,
        'Learning-Update: opencode-config/learning-updates/test.json',
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('package surface changes require explicit surface justification');
      expect(result.stderr).toContain('Surface-Policy: <package-or-path>');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  test('passes when a surface change includes Surface-Policy trailer', () => {
    const { repoDir, base } = createRepo();

    try {
      commitChange(
        repoDir,
        'packages/demo-package/src/cli.js',
        'module.exports = { run: () => "v2" };\n',
        'change cli surface',
      );

      const result = runGovernance(
        repoDir,
        base,
        [
          'Learning-Update: opencode-config/learning-updates/test.json',
          'Surface-Policy: packages/demo-package/src/cli.js => CLI-first because the package exposes an operator-facing command surface',
        ].join('\n'),
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('pr-governance: PASS');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  test('does not require Surface-Policy for non-surface governed changes', () => {
    const { repoDir, base } = createRepo();

    try {
      commitChange(
        repoDir,
        'packages/demo-package/src/index.js',
        'module.exports = { version: "v2" };\n',
        'change internal package code',
      );

      const result = runGovernance(
        repoDir,
        base,
        'Learning-Update: opencode-config/learning-updates/test.json',
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('pr-governance: PASS');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});
