import { describe, expect, test } from 'bun:test';
import { createPyodideSandbox } from '../src/pyodide-sandbox.js';

describe('createPyodideSandbox', () => {
  test('prefers runPythonAsync when available', async () => {
    let executedCode = null;
    const sandbox = await createPyodideSandbox({
      loadPyodide: async () => ({
        runPythonAsync: async (code) => {
          executedCode = code;
          return 'ok';
        }
      })
    });

    expect(sandbox).not.toBeNull();
    await sandbox.run('print("hello")');
    expect(executedCode).toBe('print("hello")');
  });

  test('uses runPython when runPythonAsync is unavailable', async () => {
    let executedCode = null;
    const sandbox = await createPyodideSandbox({
      loadPyodide: async () => ({
        runPython: (code) => {
          executedCode = code;
          return 'ok';
        }
      })
    });

    expect(sandbox).not.toBeNull();
    await sandbox.evaluate('def x():\n    return 1', 'assert x() == 1');
    expect(executedCode).toContain('def x()');
    expect(executedCode).toContain('assert x() == 1');
  });

  test('returns null when Pyodide loader fails', async () => {
    const sandbox = await createPyodideSandbox({
      loadPyodide: async () => {
        throw new Error('Pyodide unavailable');
      }
    });

    expect(sandbox).toBeNull();
  });
});
