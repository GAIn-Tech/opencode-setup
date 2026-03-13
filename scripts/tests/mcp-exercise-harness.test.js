import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';

const ROOT = join(import.meta.dir, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'mcp-exercise-harness.mjs');

describe('mcp-exercise-harness', () => {
  test('records every local MCP with a real runnable probe as verified', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'mcp-exercise-harness-'));
    const result = spawnSync('node', [SCRIPT, '--json'], {
      cwd: ROOT,
      timeout: 30000,
      env: {
        ...process.env,
        HOME: tempHome,
        USERPROFILE: tempHome,
        OPENCODE_MCP_PROBE_HOME: process.env.USERPROFILE || process.env.HOME,
      },
    });

    expect(result.status).toBe(0);

    const payload = JSON.parse(result.stdout.toString());
    const verifiedNames = payload.exercised.map((entry) => entry.name);
    const skippedNames = payload.skipped.map((entry) => entry.name);

    expect(verifiedNames).toContain('playwright');
    expect(verifiedNames).toContain('sequentialthinking');
    expect(verifiedNames).toContain('websearch');
    expect(verifiedNames).toContain('grep');
    expect(verifiedNames).toContain('opencode-context-governor');
    expect(verifiedNames).toContain('opencode-runbooks');
    expect(verifiedNames).toContain('distill');
    expect(skippedNames).toEqual([]);

    const persisted = JSON.parse(readFileSync(join(tempHome, '.opencode', 'tool-usage', 'mcp-exercises.json'), 'utf8'));
    expect(persisted.entries.map((entry) => entry.name)).toEqual(verifiedNames);

    rmSync(tempHome, { recursive: true, force: true });
  }, 30000);
});
