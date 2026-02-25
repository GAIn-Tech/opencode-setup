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
