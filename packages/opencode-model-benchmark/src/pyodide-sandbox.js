/**
 * Create Pyodide sandbox for Python code execution
 * @async
 * @returns {Promise<Object|null>} Sandbox object with run() method, or null if Pyodide fails to load
 * @returns {Promise<Function>} sandbox.run - Async function to execute Python code
 * @example
 * const sandbox = await createPyodideSandbox();
 * if (sandbox) {
 *   const result = await sandbox.run('print("Hello")');
 * }
 */
export async function createPyodideSandbox() {
  try {
    const { loadPyodide } = await import('pyodide');
    const pyodide = await loadPyodide();
    return {
      run: async (code) => pyodide.runPython(code),
    };
  } catch (error) {
    return null;
  }
}
