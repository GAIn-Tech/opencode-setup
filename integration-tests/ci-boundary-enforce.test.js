import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const API_DIR = path.join(ROOT, 'packages', 'opencode-dashboard', 'src', 'app', 'api');
const TEMP_FILE = path.join(API_DIR, '__boundary-ci-test__.ts');

afterEach(() => {
  if (fs.existsSync(TEMP_FILE)) {
    fs.unlinkSync(TEMP_FILE);
  }
});

function runBoundaryScript() {
  const proc = Bun.spawnSync(['node', 'scripts/ci-boundary-enforce.mjs'], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe'
  });

  return {
    exitCode: proc.exitCode,
    stdout: new TextDecoder().decode(proc.stdout),
    stderr: new TextDecoder().decode(proc.stderr)
  };
}

describe('ci-boundary-enforce', () => {
  test('passes when dashboard API has no forbidden internal imports', () => {
    const result = runBoundaryScript();

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('boundary-enforce: PASS');
  });

  test('fails when dashboard API imports model-manager internals', () => {
    const content = [
      "import { StateMachine } from '../../../../../opencode-model-manager/src/lifecycle/state-machine.js';",
      '',
      'export function marker() {',
      '  return StateMachine;',
      '}'
    ].join('\n');

    fs.writeFileSync(TEMP_FILE, content);

    const result = runBoundaryScript();

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('__boundary-ci-test__.ts');
    expect(result.stderr).toContain('opencode-model-manager/src/lifecycle/state-machine.js');
    expect(result.stderr).toContain("Use package entrypoint import: 'opencode-model-manager'");
  });
});
