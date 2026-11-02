import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

describe('ci-warning-budget', () => {
  it('warning budget check passes', () => {
    // Skip when running inside ci-warning-budget subprocess to prevent recursion.
    // The script sets __CI_WARNING_BUDGET__=1 when spawning `bun test`.
    if (process.env.__CI_WARNING_BUDGET__ === '1') return;

    const result = spawnSync('bun', [join(ROOT, 'scripts', 'ci-warning-budget.mjs'), '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });

    if (result.status !== 0) {
      console.error('stdout:', result.stdout?.slice(-2000));
      console.error('stderr:', result.stderr?.slice(-2000));
    }

    expect(result.status).toBe(0);
  }, 120_000);
});
