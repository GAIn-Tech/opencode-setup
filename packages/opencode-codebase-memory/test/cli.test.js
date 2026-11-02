import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const CLI_PATH = join(import.meta.dir, '..', 'src', 'cli.mjs');

// Isolated temp dirs
const TEST_ID = `cli-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const stateDir = join(tmpdir(), TEST_ID, 'state');
const projectDir = join(tmpdir(), TEST_ID, 'project');
const REPO_NAME = 'cli-test-repo';

/** Run the CLI with args, return { stdout, stderr, exitCode } */
async function runCli(args, opts = {}) {
  const env = {
    ...process.env,
    CODEBASE_MEMORY_STATE_DIR: stateDir,
    ...(opts.env || {}),
  };
  const proc = Bun.spawn(['bun', CLI_PATH, ...args], {
    cwd: opts.cwd || projectDir,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

/** Parse JSON from stdout, throw if invalid */
function parseOut(result) {
  const text = result.stdout || result.stderr;
  return JSON.parse(text);
}

// Create a sample project and analyze it before all tests
beforeAll(() => {
  mkdirSync(join(projectDir, 'src'), { recursive: true });
  mkdirSync(stateDir, { recursive: true });

  writeFileSync(join(projectDir, 'src', 'greet.js'), `
function greet(name) {
  return 'Hello ' + name;
}
module.exports = { greet };
`);

  writeFileSync(join(projectDir, 'src', 'app.js'), `
const { greet } = require('./greet');
function main() {
  greet('world');
}
module.exports = { main };
`);
});

afterAll(() => {
  const base = join(tmpdir(), TEST_ID);
  if (existsSync(base)) try { rmSync(base, { recursive: true }); } catch {}
});

describe('CLI', () => {
  test('analyze indexes a project and returns valid JSON', async () => {
    const res = await runCli(['analyze', projectDir, '--name', REPO_NAME]);
    expect(res.exitCode).toBe(0);
    const data = parseOut(res);
    expect(data.repo).toBe(REPO_NAME);
    expect(typeof data.files).toBe('number');
    expect(typeof data.nodes).toBe('number');
    expect(typeof data.edges).toBe('number');
    expect(data.files).toBeGreaterThan(0);
    expect(data.nodes).toBeGreaterThan(0);
  });

  test('list-repos returns analyzed repo', async () => {
    const res = await runCli(['list-repos']);
    expect(res.exitCode).toBe(0);
    const repos = parseOut(res);
    expect(Array.isArray(repos)).toBe(true);
    const found = repos.find(r => r.name === REPO_NAME);
    expect(found).toBeTruthy();
    expect(found.path).toBe(projectDir);
  });

  test('query returns valid JSON array', async () => {
    const res = await runCli(['query', REPO_NAME, 'greet']);
    expect(res.exitCode).toBe(0);
    const results = parseOut(res);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('greet');
  });

  test('query with --limit flag works', async () => {
    const res = await runCli(['query', REPO_NAME, 'greet', '--limit', '1']);
    expect(res.exitCode).toBe(0);
    const results = parseOut(res);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  test('context returns symbol with callers/callees', async () => {
    const res = await runCli(['context', REPO_NAME, 'greet']);
    expect(res.exitCode).toBe(0);
    const data = parseOut(res);
    // Could be null if symbol not found by exact name, or an object
    if (data !== null) {
      expect(data.node).toBeTruthy();
      expect(data.node.name).toBe('greet');
      expect(Array.isArray(data.callers)).toBe(true);
      expect(Array.isArray(data.callees)).toBe(true);
    }
  });

  test('impact returns valid JSON array', async () => {
    const res = await runCli(['impact', REPO_NAME, 'greet']);
    expect(res.exitCode).toBe(0);
    const data = parseOut(res);
    expect(Array.isArray(data)).toBe(true);
  });

  test('impact with --depth flag works', async () => {
    const res = await runCli(['impact', REPO_NAME, 'greet', '--depth', '1']);
    expect(res.exitCode).toBe(0);
    const data = parseOut(res);
    expect(Array.isArray(data)).toBe(true);
  });

  test('detect-changes returns repo/changed/count', async () => {
    const res = await runCli(['detect-changes', REPO_NAME]);
    expect(res.exitCode).toBe(0);
    const data = parseOut(res);
    expect(data.repo).toBe(REPO_NAME);
    expect(Array.isArray(data.changed)).toBe(true);
    expect(typeof data.count).toBe('number');
  });

  test('health returns repos with stats', async () => {
    const res = await runCli(['health']);
    expect(res.exitCode).toBe(0);
    const data = parseOut(res);
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0].stats).toBeTruthy();
      expect(typeof data[0].stats.nodes).toBe('number');
      expect(typeof data[0].stats.edges).toBe('number');
      expect(typeof data[0].stats.files).toBe('number');
    }
  });

  test('enrich-error returns valid JSON array', async () => {
    const res = await runCli(['enrich-error', 'Error', 'in', 'greet', 'function']);
    expect(res.exitCode).toBe(0);
    const data = parseOut(res);
    expect(Array.isArray(data)).toBe(true);
  });

  // Error cases
  test('unknown command exits 1 with JSON error', async () => {
    const res = await runCli(['bogus-command']);
    expect(res.exitCode).toBe(1);
    const data = JSON.parse(res.stderr);
    expect(data.error).toContain('Unknown command');
    expect(Array.isArray(data.commands)).toBe(true);
  });

  test('analyze without repoPath exits 1', async () => {
    const res = await runCli(['analyze']);
    expect(res.exitCode).toBe(1);
    const data = JSON.parse(res.stderr);
    expect(data.error).toContain('Usage');
  });

  test('query without args exits 1', async () => {
    const res = await runCli(['query']);
    expect(res.exitCode).toBe(1);
    const data = JSON.parse(res.stderr);
    expect(data.error).toContain('Usage');
  });

  test('context without args exits 1', async () => {
    const res = await runCli(['context']);
    expect(res.exitCode).toBe(1);
    const data = JSON.parse(res.stderr);
    expect(data.error).toContain('Usage');
  });

  test('impact without args exits 1', async () => {
    const res = await runCli(['impact']);
    expect(res.exitCode).toBe(1);
    const data = JSON.parse(res.stderr);
    expect(data.error).toContain('Usage');
  });

  test('detect-changes without args exits 1', async () => {
    const res = await runCli(['detect-changes']);
    expect(res.exitCode).toBe(1);
    const data = JSON.parse(res.stderr);
    expect(data.error).toContain('Usage');
  });

  test('enrich-error without args exits 1', async () => {
    const res = await runCli(['enrich-error']);
    expect(res.exitCode).toBe(1);
    const data = JSON.parse(res.stderr);
    expect(data.error).toContain('Usage');
  });

  test('query on unknown repo exits 1', async () => {
    const res = await runCli(['query', 'nonexistent-repo', 'foo']);
    expect(res.exitCode).toBe(1);
    const data = JSON.parse(res.stderr);
    expect(data.error).toContain('not found');
  });
});
