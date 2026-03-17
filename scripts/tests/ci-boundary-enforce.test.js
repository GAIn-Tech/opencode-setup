import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(new URL('../ci-boundary-enforce.mjs', import.meta.url));

let tempRoot;

function writeSourceFile(rootDir, packageName, relativePath, content) {
  const filePath = path.join(rootDir, 'packages', packageName, 'src', relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function runBoundaryEnforce(rootDir) {
  return spawnSync(process.execPath, [SCRIPT_PATH, '--root', rootDir], {
    encoding: 'utf8',
  });
}

describe('ci-boundary-enforce', () => {
  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(tmpdir(), 'ci-boundary-enforce-'));
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test('fails when non-dashboard package imports model-manager internals', () => {
    writeSourceFile(
      tempRoot,
      'opencode-learning-engine',
      'index.ts',
      "import { secret } from 'opencode-model-manager/src/internal.js';\nexport const value = secret;\n",
    );

    const result = runBoundaryEnforce(tempRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('boundary-enforce: FAIL');
    expect(result.stderr).toContain('packages/opencode-learning-engine/src/index.ts');
    expect(result.stderr).toContain("forbidden import: 'opencode-model-manager/src/internal.js'");
  });

  test('passes when packages import only public model-manager exports', () => {
    writeSourceFile(
      tempRoot,
      'opencode-context-governor',
      'index.ts',
      "import { manager } from 'opencode-model-manager';\nexport const value = manager;\n",
    );
    writeSourceFile(
      tempRoot,
      'opencode-dashboard',
      'app/api/route.ts',
      "import modelManager from 'opencode-model-manager/index.js';\nexport const GET = () => modelManager;\n",
    );

    const result = runBoundaryEnforce(tempRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('boundary-enforce: PASS');
  });

  test('skips opencode-model-manager package sources', () => {
    writeSourceFile(
      tempRoot,
      'opencode-model-manager',
      'internal/leak.ts',
      "import { x } from 'opencode-model-manager/src/private.js';\nexport const value = x;\n",
    );
    writeSourceFile(
      tempRoot,
      'opencode-dashboard',
      'index.ts',
      'export const ok = true;\n',
    );

    const result = runBoundaryEnforce(tempRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('boundary-enforce: PASS');
  });
});
