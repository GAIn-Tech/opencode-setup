import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const SCRIPT = join(import.meta.dir, '..', 'report-mcp-lifecycle.mjs');
const PACKAGE_JSON = join(import.meta.dir, '..', '..', 'package.json');

function runReport() {
  const result = spawnSync('node', [SCRIPT], {
    cwd: join(import.meta.dir, '..', '..'),
    timeout: 10000,
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
    expect(stdout).not.toContain('tavily');
    expect(stdout).not.toContain('github');
  });
});
