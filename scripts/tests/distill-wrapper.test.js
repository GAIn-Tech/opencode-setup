import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { patchDistillPackage, resolveDistillConfig, resolveExecutable, requiresShell } from '../run-distill-mcp.mjs';

describe('run-distill-mcp wrapper', () => {
  test('patches extensionless relative imports in broken distill package files', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'distill-wrapper-'));
    const sharedDir = join(tempDir, 'dist', 'shared');
    mkdirSync(sharedDir, { recursive: true });

    const sharedIndex = join(sharedDir, 'index.js');
    const sharedUtils = join(sharedDir, 'utils.js');
    writeFileSync(sharedIndex, 'export * from "./types";\nexport * from "./constants";\nexport * from "./utils";\n', 'utf8');
    writeFileSync(sharedUtils, 'import { ANTHROPIC_MODELS } from "./constants";\n', 'utf8');

    const changed = patchDistillPackage(tempDir);

    expect(changed).toBe(true);
    expect(readFileSync(sharedIndex, 'utf8')).toContain('./types.js');
    expect(readFileSync(sharedIndex, 'utf8')).toContain('./constants.js');
    expect(readFileSync(sharedIndex, 'utf8')).toContain('./utils.js');
    expect(readFileSync(sharedUtils, 'utf8')).toContain('./constants.js');

    rmSync(tempDir, { recursive: true, force: true });
  });

test('resolveDistillConfig points the repo at the wrapper script', () => {
  const config = resolveDistillConfig();

  // Accept either 'bun' array format or 'node' array format
  const command = Array.isArray(config.command) ? config.command : [config.command];
  const args = config.args || command.slice(1);
  
  // Accept either 'node' or 'bun' as valid runtimes
  expect(['node', 'bun']).toContain(command[0]);
  
  // Check the script path and arguments
  expect(args[0]).toBe('scripts/run-distill-mcp.mjs');
  expect(args[1]).toBe('serve');
  expect(args).toContain('--lazy');
});

  test('resolveExecutable avoids bare npm.cmd on Windows', () => {
    const executable = resolveExecutable('npm', 'win32');

    expect(executable.toLowerCase()).toContain('npm.cmd');
    expect(executable.toLowerCase()).not.toBe('npm.cmd');
  });

  test('requiresShell returns true for cmd shims on Windows', () => {
    expect(requiresShell('C:\\Program Files\\nodejs\\npm.cmd', 'win32')).toBe(true);
    expect(requiresShell('tar.exe', 'win32')).toBe(false);
  });
});
