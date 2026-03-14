import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateConfigCoherence } from '../validate-config-coherence.mjs';

const tempDirs = [];

const TEST_CONFIG_FILES = ['opencode.json'];
const TEST_CONFIG_DIRS = ['commands'];
const TEST_MERGE_DIRS = ['skills'];

function setupDirs() {
  const root = mkdtempSync(path.join(tmpdir(), 'validate-config-coherence-'));
  tempDirs.push(root);

  const repoConfigDir = path.join(root, 'repo-config');
  const runtimeConfigDir = path.join(root, 'runtime-config');
  mkdirSync(repoConfigDir, { recursive: true });
  mkdirSync(runtimeConfigDir, { recursive: true });

  return { repoConfigDir, runtimeConfigDir };
}

function writeBaselineRepo(repoConfigDir) {
  writeFileSync(path.join(repoConfigDir, 'opencode.json'), '{"ok":true}\n', 'utf8');

  mkdirSync(path.join(repoConfigDir, 'commands'), { recursive: true });
  writeFileSync(path.join(repoConfigDir, 'commands', 'hello.md'), '# hello\n', 'utf8');

  mkdirSync(path.join(repoConfigDir, 'skills', 'alpha'), { recursive: true });
  writeFileSync(path.join(repoConfigDir, 'skills', 'alpha', 'SKILL.md'), '# alpha\n', 'utf8');
}

function writeMatchingRuntime(runtimeConfigDir) {
  writeFileSync(path.join(runtimeConfigDir, 'opencode.json'), '{"ok":true}\n', 'utf8');

  mkdirSync(path.join(runtimeConfigDir, 'commands'), { recursive: true });
  writeFileSync(path.join(runtimeConfigDir, 'commands', 'hello.md'), '# hello\n', 'utf8');

  mkdirSync(path.join(runtimeConfigDir, 'skills', 'alpha'), { recursive: true });
  writeFileSync(path.join(runtimeConfigDir, 'skills', 'alpha', 'SKILL.md'), '# alpha\n', 'utf8');
}

function runValidation(repoConfigDir, runtimeConfigDir) {
  return validateConfigCoherence({
    repoConfigDir,
    runtimeConfigDir,
    configFiles: TEST_CONFIG_FILES,
    configDirs: TEST_CONFIG_DIRS,
    mergeDirs: TEST_MERGE_DIRS
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('validate-config-coherence', () => {
  test('detects missing runtime file as drift', () => {
    const { repoConfigDir, runtimeConfigDir } = setupDirs();
    writeBaselineRepo(repoConfigDir);
    writeMatchingRuntime(runtimeConfigDir);

    rmSync(path.join(runtimeConfigDir, 'opencode.json'));

    const result = runValidation(repoConfigDir, runtimeConfigDir);
    expect(result.ok).toBe(false);
    expect(result.drift.some((item) => item.type === 'runtime-file-missing' && item.target === 'opencode.json')).toBe(true);
  });

  test('detects content mismatch as drift', () => {
    const { repoConfigDir, runtimeConfigDir } = setupDirs();
    writeBaselineRepo(repoConfigDir);
    writeMatchingRuntime(runtimeConfigDir);

    writeFileSync(path.join(runtimeConfigDir, 'opencode.json'), '{"ok":false}\n', 'utf8');

    const result = runValidation(repoConfigDir, runtimeConfigDir);
    expect(result.ok).toBe(false);
    expect(result.drift.some((item) => item.type === 'file-mismatch' && item.target === 'opencode.json')).toBe(true);
  });

  test('passes when all tracked config files and dirs match', () => {
    const { repoConfigDir, runtimeConfigDir } = setupDirs();
    writeBaselineRepo(repoConfigDir);
    writeMatchingRuntime(runtimeConfigDir);

    mkdirSync(path.join(runtimeConfigDir, 'skills', 'user-custom'), { recursive: true });
    writeFileSync(path.join(runtimeConfigDir, 'skills', 'user-custom', 'SKILL.md'), '# custom\n', 'utf8');

    const result = runValidation(repoConfigDir, runtimeConfigDir);
    expect(result.ok).toBe(true);
    expect(result.drift).toHaveLength(0);
  });
});
