import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyNoHiddenExecution } from '../verify-no-hidden-exec.mjs';

function createFixture({ packageScripts, setupScript = '' }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'verify-no-hidden-exec-'));
  mkdirSync(path.join(dir, 'scripts'), { recursive: true });

  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'fixture',
        private: true,
        scripts: packageScripts,
      },
      null,
      2,
    ),
    'utf8',
  );

  writeFileSync(path.join(dir, 'scripts', 'setup-resilient.mjs'), setupScript, 'utf8');
  writeFileSync(path.join(dir, 'scripts', 'install-git-hooks.mjs'), '#!/usr/bin/env node\n', 'utf8');

  return dir;
}

describe('verify-no-hidden-exec', () => {
  test('passes when hooks are opt-in via explicit hooks:install script only', () => {
    const fixture = createFixture({
      packageScripts: {
        setup: 'node scripts/setup-resilient.mjs',
        'hooks:install': 'node scripts/install-git-hooks.mjs',
      },
      setupScript: '#!/usr/bin/env node\nconsole.log("setup");\n',
    });

    try {
      const result = verifyNoHiddenExecution({ rootDir: fixture });
      expect(result).toEqual({
        compliant: true,
        violations: [],
        reasons: [],
      });
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test('fails when setup script auto-runs hooks installation', () => {
    const fixture = createFixture({
      packageScripts: {
        setup: 'node scripts/setup-resilient.mjs',
        'hooks:install': 'node scripts/install-git-hooks.mjs',
      },
      setupScript: '#!/usr/bin/env node\nconst steps = ["hooks:install"];\n',
    });

    try {
      const result = verifyNoHiddenExecution({ rootDir: fixture });
      expect(result.compliant).toBe(false);
      expect(result.violations).toEqual(['scripts/setup-resilient.mjs:auto-hooks-install']);
      expect(result.reasons).toEqual([
        'Hidden hook activation detected: scripts/setup-resilient.mjs contains implicit hooks install trigger.',
      ]);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test('fails when npm lifecycle hooks implicitly install git hooks', () => {
    const fixture = createFixture({
      packageScripts: {
        setup: 'node scripts/setup-resilient.mjs',
        'hooks:install': 'node scripts/install-git-hooks.mjs',
        prepare: 'bun run hooks:install',
      },
      setupScript: '#!/usr/bin/env node\nconsole.log("setup");\n',
    });

    try {
      const result = verifyNoHiddenExecution({ rootDir: fixture });
      expect(result.compliant).toBe(false);
      expect(result.violations).toEqual(['package.json:scripts.prepare:implicit-hook-exec']);
      expect(result.reasons).toEqual([
        'Hidden hook activation detected: package.json script "prepare" installs hooks implicitly.',
      ]);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test('fails when explicit hooks:install command is missing', () => {
    const fixture = createFixture({
      packageScripts: {
        setup: 'node scripts/setup-resilient.mjs',
      },
      setupScript: '#!/usr/bin/env node\nconsole.log("setup");\n',
    });

    try {
      const result = verifyNoHiddenExecution({ rootDir: fixture });
      expect(result.compliant).toBe(false);
      expect(result.violations).toEqual(['package.json:scripts.hooks:install:missing']);
      expect(result.reasons).toEqual([
        'Missing explicit opt-in command: package.json must define scripts["hooks:install"].',
      ]);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
