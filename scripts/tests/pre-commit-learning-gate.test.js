import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const PRE_COMMIT_SNIPPET = `if git diff --quiet -- opencode-config/meta-knowledge-index.json opencode-config/.governance-hashes.json; then\n  exit 0\nfi\n\ngit add opencode-config/meta-knowledge-index.json opencode-config/.governance-hashes.json\n`;

describe('pre-commit learning-gate restaging', () => {
  test('re-stages governance files when learning-gate mutates them', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'pre-commit-hook-test-'));

    try {
      mkdirSync(join(repoDir, 'opencode-config'), { recursive: true });
      writeFileSync(join(repoDir, 'opencode-config', 'meta-knowledge-index.json'), '{"generated_at":"old"}\n');
      writeFileSync(join(repoDir, 'opencode-config', '.governance-hashes.json'), '{"generated_at":"old"}\n');

      spawnSync('git', ['init'], { cwd: repoDir });
      spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });
      spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });
      spawnSync('git', ['add', '.'], { cwd: repoDir });

      writeFileSync(join(repoDir, 'opencode-config', 'meta-knowledge-index.json'), '{"generated_at":"new"}\n');
      writeFileSync(join(repoDir, 'opencode-config', '.governance-hashes.json'), '{"generated_at":"new"}\n');

      const result = spawnSync('git', ['add', 'opencode-config/meta-knowledge-index.json', 'opencode-config/.governance-hashes.json'], {
        cwd: repoDir,
      });
      expect(result.status).toBe(0);

      const addResult = spawnSync('bash', ['-lc', PRE_COMMIT_SNIPPET], { cwd: repoDir });
      expect(addResult.status).toBe(0);

      const cachedDiff = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: repoDir, encoding: 'utf8' });
      expect(cachedDiff.status).toBe(0);
      expect(cachedDiff.stdout).toContain('opencode-config/meta-knowledge-index.json');
      expect(cachedDiff.stdout).toContain('opencode-config/.governance-hashes.json');

      const workingTreeDiff = spawnSync('git', ['diff', '--name-only'], { cwd: repoDir, encoding: 'utf8' });
      expect(workingTreeDiff.status).toBe(0);
      expect(workingTreeDiff.stdout.trim()).toBe('');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});
