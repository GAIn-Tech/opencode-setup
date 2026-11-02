import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_SOURCE = join(__dirname, '..', '..', '.githooks', 'post-commit');

function run(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}\n${result.stderr || result.stdout}`);
  }
  return result;
}

function setupRepo() {
  const repoDir = mkdtempSync(join(tmpdir(), 'post-commit-hook-test-'));
  mkdirSync(join(repoDir, '.githooks'), { recursive: true });
  mkdirSync(join(repoDir, 'scripts'), { recursive: true });
  mkdirSync(join(repoDir, 'opencode-config', 'learning-updates'), { recursive: true });

  if (!existsSync(HOOK_SOURCE)) {
    throw new Error(`Missing hook file: ${HOOK_SOURCE}`);
  }

  const hookBody = readFileSync(HOOK_SOURCE, 'utf8');
  const hookTarget = join(repoDir, '.githooks', 'post-commit');
  writeFileSync(hookTarget, hookBody, 'utf8');

  if (process.platform !== 'win32') {
    chmodSync(hookTarget, 0o755);
  }

  writeFileSync(
    join(repoDir, 'scripts', 'synthesize-meta-kb.mjs'),
    [
      "import { appendFileSync } from 'node:fs';",
      "appendFileSync('synthesis.log', 'ran\\n');",
    ].join('\n'),
    'utf8'
  );

  writeFileSync(join(repoDir, 'package.json'), '{"name":"hook-test"}\n', 'utf8');

  run(repoDir, 'git', ['init']);
  run(repoDir, 'git', ['config', 'user.name', 'Test User']);
  run(repoDir, 'git', ['config', 'user.email', 'test@example.com']);
  run(repoDir, 'git', ['config', 'core.hooksPath', '.githooks']);

  return repoDir;
}

describe('post-commit synthesis hook', () => {
  test('runs synthesis for commits with non-meta-kb-auto learning updates', () => {
    const repoDir = setupRepo();
    try {
      writeFileSync(
        join(repoDir, 'opencode-config', 'learning-updates', 'manual-update.json'),
        JSON.stringify({ id: 'u1', source: 'manual' }, null, 2),
        'utf8'
      );

      run(repoDir, 'git', ['add', '.']);
      run(repoDir, 'git', ['commit', '-m', 'test manual update']);

      const logPath = join(repoDir, 'synthesis.log');
      expect(existsSync(logPath)).toBe(true);
      expect(readFileSync(logPath, 'utf8')).toContain('ran');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  test('skips synthesis when commit learning update source is meta-kb-auto', () => {
    const repoDir = setupRepo();
    try {
      writeFileSync(
        join(repoDir, 'opencode-config', 'learning-updates', 'meta-auto-update.json'),
        JSON.stringify({ id: 'u2', source: 'meta-kb-auto' }, null, 2),
        'utf8'
      );

      run(repoDir, 'git', ['add', '.']);
      run(repoDir, 'git', ['commit', '-m', 'test meta-kb auto update']);

      expect(existsSync(join(repoDir, 'synthesis.log'))).toBe(false);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});
