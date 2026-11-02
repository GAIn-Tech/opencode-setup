function composeEvaluationScript(completion, testCode) {
  return `${completion || ''}\n\n${testCode || ''}`;
}

/**
 * Create Pyodide sandbox for Python code execution
 * @async
 * @param {Object} [options]
 * @param {Function} [options.loadPyodide] Optional injection for testing
 * @returns {Promise<Object|null>} Sandbox API or null when Pyodide is unavailable
 */
export async function createPyodideSandbox(options = {}) {
  try {
    const loader =
      options.loadPyodide ||
      (await import('pyodide')).loadPyodide;
    const pyodide = await loader();

    const run = async (code) => {
      if (typeof pyodide.runPythonAsync === 'function') {
        return pyodide.runPythonAsync(code);
      }

      return pyodide.runPython(code);
    };

    return {
      run,
      evaluate: async (completion, testCode) => {
        const script = composeEvaluationScript(completion, testCode);
        await run(script);
        return true;
      }
    };
  } catch (error) {
    return null;
  }
}
