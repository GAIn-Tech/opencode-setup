import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { syncReconcile } from '../sync-reconcile.mjs';

const tempDirs = [];

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sync-reconcile-'));
  tempDirs.push(root);

  const repoConfigDir = path.join(root, 'opencode-config');
  const runtimeConfigDir = path.join(root, 'runtime-config');
  mkdirSync(repoConfigDir, { recursive: true });
  mkdirSync(runtimeConfigDir, { recursive: true });

  const trackedFile = 'compound-engineering.json';
  const trackedSourcePath = path.join(repoConfigDir, trackedFile);
  const trackedRuntimePath = path.join(runtimeConfigDir, trackedFile);

  const baseline = '{"version":"baseline"}\n';
  writeFileSync(trackedSourcePath, baseline, 'utf8');
  writeFileSync(trackedRuntimePath, baseline, 'utf8');

  writeFileSync(path.join(root, 'package.json'), '{"name":"fixture","version":"1.0.0"}\n', 'utf8');
  writeFileSync(path.join(root, 'bun.lock'), '# lock\n', 'utf8');

  const stateDir = path.join(root, '.sisyphus', 'state');
  mkdirSync(stateDir, { recursive: true });

  const manifestPath = path.join(runtimeConfigDir, 'config-manifest.json');
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ version: 1, machineId: 'test-machine', files: { [trackedFile]: sha256(baseline) } }, null, 2)}\n`,
    'utf8',
  );

  const generatedFile = path.join(runtimeConfigDir, 'tool-manifest.json');
  writeFileSync(generatedFile, '{"ok":true}\n', 'utf8');

  return {
    root,
    repoConfigDir,
    runtimeConfigDir,
    trackedFile,
    trackedSourcePath,
    trackedRuntimePath,
    manifestPath,
    generatedFile,
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('sync-reconcile', () => {
  test('fails with protected conflict when repo and user-local file both changed', () => {
    const fx = createFixture();

    writeFileSync(fx.trackedSourcePath, '{"version":"repo-changed"}\n', 'utf8');
    writeFileSync(fx.trackedRuntimePath, '{"version":"user-local-change"}\n', 'utf8');

    const commands = [];
    const result = syncReconcile({
      rootDir: fx.root,
      repoConfigDir: fx.repoConfigDir,
      runtimeConfigDir: fx.runtimeConfigDir,
      trackedConfigFiles: [fx.trackedFile],
      generatedArtifacts: [fx.generatedFile],
      runCommand(command, args) {
        commands.push(`${command} ${args.join(' ')}`);
        return { status: 0, stdout: '', stderr: '' };
      },
    });

  expect(result.ok).toBe(false);
  expect(result.blocked).toEqual([`config-conflict:${fx.trackedFile}`]);
  expect(result.reasons.some((reason) => reason.includes(fx.trackedFile))).toBe(true);
  expect(readFileSync(fx.trackedRuntimePath, 'utf8')).toBe('{"version":"user-local-change"}\n');
  // Commands may include git rev-parse HEAD from run-binding (P05 fix)
  const nonGitCommands = commands.filter(c => !c.startsWith('git '));
  expect(nonGitCommands).toEqual([]);
  });

  test('reconciles safe config drift when runtime still matches previous manifest hash', () => {
    const fx = createFixture();

    writeFileSync(fx.trackedSourcePath, '{"version":"repo-updated"}\n', 'utf8');

    const result = syncReconcile({
      rootDir: fx.root,
      repoConfigDir: fx.repoConfigDir,
      runtimeConfigDir: fx.runtimeConfigDir,
      trackedConfigFiles: [fx.trackedFile],
      generatedArtifacts: [fx.generatedFile],
      runCommand() {
        return { status: 0, stdout: '', stderr: '' };
      },
    });

    expect(result.ok).toBe(true);
    expect(result.blocked).toHaveLength(0);
    expect(result.reconciled).toContain(`config-updated:${fx.trackedFile}`);
    expect(readFileSync(fx.trackedRuntimePath, 'utf8')).toBe('{"version":"repo-updated"}\n');

    const nextManifest = JSON.parse(readFileSync(fx.manifestPath, 'utf8'));
    expect(nextManifest.files[fx.trackedFile]).toBe(sha256('{"version":"repo-updated"}\n'));
  });

  test('reconciles dependency and generated drift by running explicit commands', () => {
    const fx = createFixture();
    rmSync(fx.generatedFile, { force: true });
    rmSync(path.join(fx.root, 'bun.lock'), { force: true });

    const commands = [];
    const result = syncReconcile({
      rootDir: fx.root,
      repoConfigDir: fx.repoConfigDir,
      runtimeConfigDir: fx.runtimeConfigDir,
      trackedConfigFiles: [fx.trackedFile],
      generatedArtifacts: [fx.generatedFile],
      runCommand(command, args) {
        commands.push(`${command} ${args.join(' ')}`);
        if (command === 'bun' && args[0] === 'install') {
          writeFileSync(path.join(fx.root, 'bun.lock'), '# regenerated lock\n', 'utf8');
        }
        if (command === 'bun' && args[0] === 'run' && args[1] === 'generate') {
          writeFileSync(fx.generatedFile, '{"generated":true}\n', 'utf8');
        }
        return { status: 0, stdout: '', stderr: '' };
      },
    });

  expect(result.ok).toBe(true);
  // Commands may include git rev-parse HEAD from run-binding (P05 fix)
  const nonGitCommands = commands.filter(c => !c.startsWith('git '));
  expect(nonGitCommands).toEqual(['bun install', 'bun run generate']);
  expect(result.reconciled).toContain('deps-lockfile:reconciled');
  expect(result.reconciled).toContain('generated-artifacts:reconciled');
  expect(existsSync(path.join(fx.root, 'bun.lock'))).toBe(true);
  expect(existsSync(fx.generatedFile)).toBe(true);
  });

  test('returns report contract with deterministic top-level keys', () => {
    const fx = createFixture();
    const result = syncReconcile({
      rootDir: fx.root,
      repoConfigDir: fx.repoConfigDir,
      runtimeConfigDir: fx.runtimeConfigDir,
      trackedConfigFiles: [fx.trackedFile],
      generatedArtifacts: [fx.generatedFile],
      runCommand() {
        return { status: 0, stdout: '', stderr: '' };
      },
    });

    expect(typeof result.ok).toBe('boolean');
    expect(Array.isArray(result.reconciled)).toBe(true);
    expect(Array.isArray(result.blocked)).toBe(true);
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(typeof result.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });

  test('treats stale lockfile as drift when package.json is newer', () => {
    const fx = createFixture();
    const packageJsonPath = path.join(fx.root, 'package.json');
    const lockPath = path.join(fx.root, 'bun.lock');

    const now = Date.now();
    utimesSync(lockPath, now / 1000 - 90, now / 1000 - 90);
    utimesSync(packageJsonPath, now / 1000, now / 1000);

    const commands = [];
    const result = syncReconcile({
      rootDir: fx.root,
      repoConfigDir: fx.repoConfigDir,
      runtimeConfigDir: fx.runtimeConfigDir,
      trackedConfigFiles: [fx.trackedFile],
      generatedArtifacts: [fx.generatedFile],
      runCommand(command, args) {
        commands.push(`${command} ${args.join(' ')}`);
        return { status: 0, stdout: '', stderr: '' };
      },
    });

    expect(result.ok).toBe(true);
    expect(commands).toContain('bun install');
    expect(result.reconciled).toContain('deps-lockfile:reconciled');
  });
});
