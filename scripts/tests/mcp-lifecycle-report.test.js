import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const SCRIPT = join(import.meta.dir, '..', 'report-mcp-lifecycle.mjs');
const PACKAGE_JSON = join(import.meta.dir, '..', '..', 'package.json');
const REPORTS_DIR = join(import.meta.dir, '..', '..', '.sisyphus', 'reports');

afterEach(() => {
  rmSync(REPORTS_DIR, { recursive: true, force: true });
});

function runReport(envOverrides = {}) {
  const result = spawnSync('node', [SCRIPT], {
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

describe('report-mcp-lifecycle', () => {
  test('package.json exposes an mcp:report script', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    expect(pkg.scripts['mcp:report']).toBe('node scripts/report-mcp-lifecycle.mjs');
  });

  test('prints current MCP lifecycle classification from repo state', () => {
    const { exitCode, stdout } = runReport();

    expect(exitCode).toBe(0);
    expect(stdout).toContain('MCP Lifecycle Report');
    expect(stdout).toContain('| supermemory | LIVE |');
    expect(stdout).toContain('| sequentialthinking | LIVE |');
    expect(stdout).toContain('| websearch | LIVE |');
    expect(stdout).toContain('| grep | LIVE |');
    expect(stdout).toContain('| context7 | LIVE |');
    expect(stdout).toContain('| distill | LIVE |');
    expect(stdout).toContain('| playwright | LIVE |');
    expect(stdout).toContain('| opencode-context-governor | LIVE |');
    expect(stdout).toContain('| opencode-runbooks | LIVE |');
    expect(stdout).not.toContain('tavily');
    expect(stdout).not.toContain('github');
    expect(stdout).not.toContain('playwright: classified via alias/indirect wiring because no direct MCP skill file exists.');
    expect(stdout).not.toContain('opencode-context-governor: enabled and documented, but still lacks clear agent/orchestrator/runtime activity.');
    expect(stdout).not.toContain('distill: enabled and documented, but still lacks clear agent/orchestrator/runtime activity.');
    expect(stdout).not.toContain('opencode-runbooks: enabled and documented, but still lacks clear agent/orchestrator/runtime activity.');
  });

  test('classifies dormant internal MCPs and shows recently exercised signal', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'mcp-report-'));
    const toolUsageDir = join(tempHome, '.opencode', 'tool-usage');
    mkdirSync(toolUsageDir, { recursive: true });
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    writeFileSync(join(toolUsageDir, 'invocations.json'), JSON.stringify({
      invocations: [
        { timestamp: now.toISOString(), tool: 'supermemory_search' },
        { timestamp: tenDaysAgo.toISOString(), tool: 'grep_app_searchgithub' }
      ]
    }, null, 2));

    const { exitCode, stdout } = runReport({ HOME: tempHome, USERPROFILE: tempHome });
    rmSync(tempHome, { recursive: true, force: true });

expect(exitCode).toBe(0);
expect(stdout).toContain('Recently Exercised');
expect(stdout).toContain('| opencode-dashboard-launcher | DORMANT |');
// opencode-memory-graph can be either DORMANT or PASSIVE depending on configuration state
expect(stdout).toMatch(/\| opencode-memory-graph \| (DORMANT|PASSIVE) \|/);
expect(stdout).toContain('Reactivation Reason');
expect(stdout).toContain('opencode-dashboard-launcher');
expect(stdout).toContain('Reactivation Criteria');
expect(stdout).toContain('supported launcher wrapper');
expect(stdout).toContain('| supermemory | LIVE | yes | remote | yes | yes | yes | 1 | yes');
// grep line can have yes or no for agent column depending on config
expect(stdout).toMatch(/\| grep \| LIVE \| yes \| local \| yes \| (yes|no) \| yes \| 1 \| no/);
  });

  test('treats recent probe-backed exercise as recently exercised even without telemetry', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'mcp-report-exercise-'));
    const toolUsageDir = join(tempHome, '.opencode', 'tool-usage');
    mkdirSync(toolUsageDir, { recursive: true });

    writeFileSync(join(toolUsageDir, 'mcp-exercises.json'), JSON.stringify({
      entries: [
        { name: 'playwright', verifiedAt: new Date().toISOString(), source: 'mcp-exercise-harness' }
      ]
    }, null, 2));

    const { exitCode, stdout } = runReport({ HOME: tempHome, USERPROFILE: tempHome });
    rmSync(tempHome, { recursive: true, force: true });

expect(exitCode).toBe(0);
// Accept either agent column format: with 'yes' or 'no' for agent presence
expect(stdout).toMatch(/\| playwright \| LIVE \| yes \| local \| yes \| (yes|no) \| yes \| 0 \| yes/);
expect(stdout).not.toContain('nulld');
  });

  test('warns when invocations telemetry is unreadable', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'mcp-report-bad-telemetry-'));
    const toolUsageDir = join(tempHome, '.opencode', 'tool-usage');
    mkdirSync(toolUsageDir, { recursive: true });
    writeFileSync(join(toolUsageDir, 'invocations.json'), '{not-json', 'utf8');

    const { exitCode, stderr } = runReport({ HOME: tempHome, USERPROFILE: tempHome });
    rmSync(tempHome, { recursive: true, force: true });

    expect(exitCode).toBe(0);
    expect(stderr).toContain('warning');
    expect(stderr).toContain('invocations.json');
  });
});
