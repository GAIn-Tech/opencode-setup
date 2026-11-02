import { describe, test, expect } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import EnhancedSandbox from '../src/enhanced-sandbox.js';

describe('EnhancedSandbox security hardening', () => {
  test('blocks dangerous executable paths for spawn', () => {
    const sandbox = new EnhancedSandbox();

    expect(() => sandbox.resolveAndValidateExecPath('cmd.exe')).toThrow();
    expect(() => sandbox.resolveAndValidateExecPath('powershell.exe')).toThrow();
    expect(() => sandbox.resolveAndValidateExecPath('/bin/sh')).toThrow();
  });

  test('accepts current runtime executable path', () => {
    const sandbox = new EnhancedSandbox();
    const validated = sandbox.resolveAndValidateExecPath(process.execPath);

    expect(path.isAbsolute(validated)).toBe(true);
    expect(fs.existsSync(validated)).toBe(true);
  });

  test('detects dangerous command patterns across Unix and Windows', () => {
    const sandbox = new EnhancedSandbox();

    expect(sandbox.isDangerousCommand('rm', ['-rf', '/'])).toBe(true);
    expect(sandbox.isDangerousCommand('del', ['/f', '/s', '/q', 'C:\\'])).toBe(true);
    expect(sandbox.isDangerousCommand('powershell', ['-EncodedCommand', 'AAA='])).toBe(true);
    expect(sandbox.isDangerousCommand('node', ['-e', 'console.log(1)'])).toBe(false);
  });

  test('sanitizes environment variables and preserves required runtime values', () => {
    const sandbox = new EnhancedSandbox();
    const sanitized = sandbox.sanitizeEnvironment(
      {
        PATH: process.env.PATH || '',
        HOME: process.env.HOME || '',
        TEMP: process.env.TEMP || os.tmpdir(),
        AWS_SECRET_ACCESS_KEY: 'secret',
        GITHUB_TOKEN: 'token',
        API_PASSWORD: 'password',
        CUSTOM_SAFE: 'keep-me',
        NODE_OPTIONS: '--inspect'
      },
      { allowedEnvVars: ['CUSTOM_SAFE'] }
    );

    const env = sandbox.createSandboxEnvironment({ allowedEnvVars: ['CUSTOM_SAFE'] });

    expect(sanitized.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(sanitized.GITHUB_TOKEN).toBeUndefined();
    expect(sanitized.API_PASSWORD).toBeUndefined();
    expect(sanitized.NODE_OPTIONS).toBeUndefined();
    expect(sanitized.CUSTOM_SAFE).toBe('keep-me');
    expect(env.ENHANCED_SANDBOX).toBe('1');
  });

  test('cleanup is idempotent and resists race-like double invocation', () => {
    const sandbox = new EnhancedSandbox();
    const sandboxId = 'sandbox-test-cleanup';
    const wrapperScript = path.join(os.tmpdir(), `opencode-enhanced-test-${Date.now()}.js`);
    const workspaceDir = path.join(os.tmpdir(), `opencode-sandbox-workspace-${Date.now()}`);

    fs.writeFileSync(wrapperScript, 'console.log("ok")', 'utf-8');
    fs.mkdirSync(workspaceDir, { recursive: true });

    sandbox.activeSandboxes.set(sandboxId, {
      child: { kill: () => true },
      wrapperScript,
      workspaceDir,
      cleanedUp: false,
      cleanupInProgress: false
    });

    sandbox.cleanupSandboxResources(sandboxId, sandbox.activeSandboxes.get(sandboxId));
    sandbox.cleanupSandboxResources(sandboxId, sandbox.activeSandboxes.get(sandboxId));

    expect(fs.existsSync(wrapperScript)).toBe(false);
    expect(fs.existsSync(workspaceDir)).toBe(false);
  });

  test('preserves legitimate sandbox execution capability', async () => {
    const sandbox = new EnhancedSandbox({ timeoutMs: 5000 });
    const result = await sandbox.createSandbox(() => ({ status: 'ok', value: 42 }));

    expect(result.status).toBe('ok');
    expect(result.value).toBe(42);
  });

  test('blocks dangerous child process commands inside wrapper', async () => {
    const sandbox = new EnhancedSandbox({ timeoutMs: 5000 });

    await expect(
      sandbox.createSandbox(() => {
        const cp = require('child_process');
        cp.execSync('powershell -EncodedCommand AAA=');
        return { status: 'unexpected' };
      })
    ).rejects.toThrow('Dangerous command blocked by EnhancedSandbox policy');
  });

  test('stringifies shared references without false circular markers', async () => {
    const sandbox = new EnhancedSandbox({ timeoutMs: 5000 });

    const result = await sandbox.createSandbox(() => {
      const shared = { value: 7 };
      return {
        first: shared,
        second: shared
      };
    });

    expect(result.first.value).toBe(7);
    expect(result.second.value).toBe(7);
  });

  test('limits serialization depth to avoid stack overflow', async () => {
    const sandbox = new EnhancedSandbox({ timeoutMs: 5000 });

    const result = await sandbox.createSandbox(() => {
      let deep = { level: 0 };
      let cursor = deep;
      for (let i = 1; i < 40; i++) {
        cursor.next = { level: i };
        cursor = cursor.next;
      }
      return deep;
    });

    expect(JSON.stringify(result)).toContain('[MaxDepth]');
  });

  test('preserves circular markers for object and array cycles', async () => {
    const sandbox = new EnhancedSandbox({ timeoutMs: 5000 });

    const result = await sandbox.createSandbox(() => {
      const parent = { name: 'parent' };
      const child = { name: 'child', parent };
      parent.child = child;

      const arr = [parent, child];
      arr.push(arr);

      return { parent, child, arr };
    });

    expect(result.parent.child.parent).toBe('[Circular]');
    expect(result.arr[2]).toBe('[Circular]');
  });

  test('safely stringifies BigInt values without breaking fallback behavior', async () => {
    const sandbox = new EnhancedSandbox({ timeoutMs: 5000 });

    const result = await sandbox.createSandbox(() => ({
      id: 9007199254740993n,
      nested: { count: 2n }
    }));

    expect(result.id).toBe('9007199254740993');
    expect(result.nested.count).toBe('2');
  });
});
