import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendAuditEntry, getMachineId, readConfigManifest, validateConfigCoherence } from '../validate-config-coherence.mjs';

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

function runValidation(repoConfigDir, runtimeConfigDir, extra = {}) {
  return validateConfigCoherence({
    repoConfigDir,
    runtimeConfigDir,
    configFiles: TEST_CONFIG_FILES,
    configDirs: TEST_CONFIG_DIRS,
    mergeDirs: TEST_MERGE_DIRS,
    ...extra
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

  test('detects content mismatch as drift (non-enriched file)', () => {
    const { repoConfigDir, runtimeConfigDir } = setupDirs();
    writeBaselineRepo(repoConfigDir);
    writeMatchingRuntime(runtimeConfigDir);

    // Use enrichedJsonFiles: {} so opencode.json is treated as a plain hash-compared file
    writeFileSync(path.join(runtimeConfigDir, 'opencode.json'), '{"ok":false}\n', 'utf8');

    const result = runValidation(repoConfigDir, runtimeConfigDir, { enrichedJsonFiles: {} });
    expect(result.ok).toBe(false);
    expect(result.drift.some((item) => item.type === 'file-mismatch' && item.target === 'opencode.json')).toBe(true);
  });

  test('enriched file passes when only enriched keys differ', () => {
    const { repoConfigDir, runtimeConfigDir } = setupDirs();
    // Repo has no mcp key
    writeFileSync(path.join(repoConfigDir, 'opencode.json'), '{"ok":true,"permissions":{"allow":["*"]}}\n', 'utf8');
    // Runtime has mcp key added by generate-mcp-config
    writeFileSync(path.join(runtimeConfigDir, 'opencode.json'), '{"ok":true,"permissions":{"allow":["*"]},"mcp":{"tavily":{"command":"npx"}}}\n', 'utf8');

    mkdirSync(path.join(repoConfigDir, 'commands'), { recursive: true });
    writeFileSync(path.join(repoConfigDir, 'commands', 'hello.md'), '# hello\n', 'utf8');
    mkdirSync(path.join(runtimeConfigDir, 'commands'), { recursive: true });
    writeFileSync(path.join(runtimeConfigDir, 'commands', 'hello.md'), '# hello\n', 'utf8');
    mkdirSync(path.join(repoConfigDir, 'skills', 'alpha'), { recursive: true });
    writeFileSync(path.join(repoConfigDir, 'skills', 'alpha', 'SKILL.md'), '# alpha\n', 'utf8');
    mkdirSync(path.join(runtimeConfigDir, 'skills', 'alpha'), { recursive: true });
    writeFileSync(path.join(runtimeConfigDir, 'skills', 'alpha', 'SKILL.md'), '# alpha\n', 'utf8');

    const enriched = { 'opencode.json': { ignoreKeys: new Set(['mcp']) } };
    const result = runValidation(repoConfigDir, runtimeConfigDir, { enrichedJsonFiles: enriched });
    expect(result.ok).toBe(true);
    expect(result.drift).toHaveLength(0);
  });

  test('enriched file detects drift in non-enriched keys', () => {
    const { repoConfigDir, runtimeConfigDir } = setupDirs();
    writeFileSync(path.join(repoConfigDir, 'opencode.json'), '{"ok":true,"permissions":{"allow":["*"]}}\n', 'utf8');
    // Runtime: permissions changed (should be caught) + mcp added (should be ignored)
    writeFileSync(path.join(runtimeConfigDir, 'opencode.json'), '{"ok":true,"permissions":{"allow":["read"]},"mcp":{"tavily":{}}}\n', 'utf8');

    mkdirSync(path.join(repoConfigDir, 'commands'), { recursive: true });
    writeFileSync(path.join(repoConfigDir, 'commands', 'hello.md'), '# hello\n', 'utf8');
    mkdirSync(path.join(runtimeConfigDir, 'commands'), { recursive: true });
    writeFileSync(path.join(runtimeConfigDir, 'commands', 'hello.md'), '# hello\n', 'utf8');
    mkdirSync(path.join(repoConfigDir, 'skills', 'alpha'), { recursive: true });
    writeFileSync(path.join(repoConfigDir, 'skills', 'alpha', 'SKILL.md'), '# alpha\n', 'utf8');
    mkdirSync(path.join(runtimeConfigDir, 'skills', 'alpha'), { recursive: true });
    writeFileSync(path.join(runtimeConfigDir, 'skills', 'alpha', 'SKILL.md'), '# alpha\n', 'utf8');

    const enriched = { 'opencode.json': { ignoreKeys: new Set(['mcp']) } };
    const result = runValidation(repoConfigDir, runtimeConfigDir, { enrichedJsonFiles: enriched });
    expect(result.ok).toBe(false);
    expect(result.drift.some((item) => item.type === 'enriched-mismatch' && item.target === 'opencode.json')).toBe(true);
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

  test('getMachineId generates and persists machine identity', () => {
    const { runtimeConfigDir } = setupDirs();
    const machineIdPath = path.join(runtimeConfigDir, '.machine-id.json');

    const first = getMachineId({ machineIdPath });
    expect(typeof first.id).toBe('string');
    expect(first.id.length).toBeGreaterThan(0);
    expect(typeof first.hostname).toBe('string');
    expect(first.hostname.length).toBeGreaterThan(0);
    expect(typeof first.platform).toBe('string');
    expect(first.platform.length).toBeGreaterThan(0);
    expect(typeof first.arch).toBe('string');
    expect(first.arch.length).toBeGreaterThan(0);
    expect(typeof first.created).toBe('string');
    expect(existsSync(machineIdPath)).toBe(true);

    const second = getMachineId({ machineIdPath });
    expect(second.id).toBe(first.id);
  });

  test('appendAuditEntry writes NDJSON entries', () => {
    const { runtimeConfigDir } = setupDirs();
    const auditPath = path.join(runtimeConfigDir, 'config-audit.ndjson');
    const result = {
      ok: true,
      drift: [],
      repoConfigDir: '/tmp/repo',
      runtimeConfigDir: '/tmp/runtime',
    };

    appendAuditEntry(result, 'test-action', { auditPath, configDir: runtimeConfigDir });

    const lines = readFileSync(auditPath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.action).toBe('test-action');
    expect(entry.ok).toBe(true);
    expect(entry.driftCount).toBe(0);
    expect(entry.repoConfigDir).toBe('/tmp/repo');
    expect(entry.runtimeConfigDir).toBe('/tmp/runtime');
    expect(typeof entry.machineId).toBe('string');
    expect(entry.machineId.length).toBeGreaterThan(0);
    expect(Array.isArray(entry.drift)).toBe(true);
  });

  test('readConfigManifest returns null when no manifest exists', () => {
    const { runtimeConfigDir } = setupDirs();
    const manifestPath = path.join(runtimeConfigDir, 'config-manifest.json');
    expect(readConfigManifest({ manifestPath })).toBeNull();
  });
});
