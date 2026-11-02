import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';

const SCRIPT = join(import.meta.dir, '..', 'mcp-smoke-harness.mjs');
const PACKAGE_JSON = join(import.meta.dir, '..', '..', 'package.json');

function runHarness(envOverrides = {}, args = []) {
  const result = spawnSync('node', [SCRIPT, ...args], {
    cwd: join(import.meta.dir, '..', '..'),
    timeout: 10000,
    env: { ...process.env, ...envOverrides },
  });

  return {
    exitCode: result.status,
    stdout: result.stdout?.toString() || '',
    stderr: result.stderr?.toString() || '',
  };
}

describe('mcp-smoke-harness', () => {
  test('package.json exposes an mcp:smoke script', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    expect(pkg.scripts['mcp:smoke']).toBe('node scripts/mcp-smoke-harness.mjs');
  });

  test('reports recent exercise coverage for live MCPs from telemetry', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'mcp-smoke-'));
    const toolUsageDir = join(tempHome, '.opencode', 'tool-usage');
    mkdirSync(toolUsageDir, { recursive: true });

    writeFileSync(join(toolUsageDir, 'invocations.json'), JSON.stringify({
      invocations: [
        { timestamp: new Date().toISOString(), tool: 'context7_query_docs' },
        { timestamp: new Date().toISOString(), tool: 'supermemory_search' },
        { timestamp: new Date().toISOString(), tool: 'websearch_search' },
      ]
    }, null, 2));

const { exitCode, stdout, stderr } = runHarness({ HOME: tempHome, USERPROFILE: tempHome }, ['--json']);
rmSync(tempHome, { recursive: true, force: true });

// Debug: log stderr if failing
if (exitCode !== 0) {
  console.error('Test: reports recent exercise coverage - stderr:', stderr);
}

expect(exitCode).toBe(0);
const payload = JSON.parse(stdout);
expect(payload.liveMcpCount).toBeGreaterThan(0);
    expect(payload.exercisedCount).toBeGreaterThan(0);
    expect(payload.entries.some((entry) => entry.name === 'context7' && entry.recentlyExercised)).toBe(true);
    expect(payload.entries.some((entry) => entry.name === 'supermemory' && entry.recentlyExercised)).toBe(true);
    expect(payload.entries.every((entry) => Object.prototype.hasOwnProperty.call(entry, 'smokeVerified'))).toBe(true);
  });

  test('package.json exposes an mcp:exercise script', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    expect(pkg.scripts['mcp:exercise']).toBe('node scripts/mcp-exercise-harness.mjs');
  });

  test('smoke verification state is surfaced separately from runtime telemetry', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'mcp-exercise-'));
    const toolUsageDir = join(tempHome, '.opencode', 'tool-usage');
    mkdirSync(toolUsageDir, { recursive: true });
    writeFileSync(join(toolUsageDir, 'mcp-exercises.json'), JSON.stringify({
      entries: [
        {
          name: 'playwright',
          verifiedAt: new Date().toISOString(),
          source: 'mcp-exercise-harness',
          runId: 'run-123',
          commitSha: 'commit-123',
        },
        {
          name: 'distill',
          verifiedAt: new Date().toISOString(),
          source: 'mcp-exercise-harness',
          runId: 'run-123',
          commitSha: 'commit-123',
        }
      ]
    }, null, 2));

    const { exitCode, stdout } = runHarness(
      {
        HOME: tempHome,
        USERPROFILE: tempHome,
        OPENCODE_PROOF_RUN_ID: 'run-123',
        OPENCODE_PROOF_COMMIT_SHA: 'commit-123',
      },
      ['--json'],
    );
    rmSync(tempHome, { recursive: true, force: true });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.entries.some((entry) => entry.name === 'playwright' && entry.smokeVerified === true)).toBe(true);
    expect(payload.entries.some((entry) => entry.name === 'distill' && entry.smokeVerified === true)).toBe(true);
    expect(payload.universalProof.missingAttestations).not.toContain('playwright');
    expect(payload.universalProof.missingAttestations).not.toContain('distill');
  });

  test('recent exercise probes count as recently exercised for local MCPs', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'mcp-exercise-recent-'));
    const toolUsageDir = join(tempHome, '.opencode', 'tool-usage');
    mkdirSync(toolUsageDir, { recursive: true });
    writeFileSync(join(toolUsageDir, 'mcp-exercises.json'), JSON.stringify({
      entries: [
        { name: 'playwright', verifiedAt: new Date().toISOString(), source: 'mcp-exercise-harness' },
      ]
    }, null, 2));

    const { exitCode, stdout } = runHarness({ HOME: tempHome, USERPROFILE: tempHome }, ['--json']);
    rmSync(tempHome, { recursive: true, force: true });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.entries.some((entry) => entry.name === 'playwright' && entry.recentlyExercised === true)).toBe(true);
  });
});
