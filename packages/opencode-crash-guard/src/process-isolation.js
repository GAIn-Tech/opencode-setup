/**
 * Process Isolation
 * Runs dangerous operations in isolated processes to prevent crashes from propagating
 */

import { spawn } from 'child_process';
import path from 'path';
import os from 'os';

export class ProcessIsolation {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 5;
    this.timeoutMs = options.timeoutMs || 30000;
    this.activeProcesses = new Map();
    this.processCounter = 0;
  }

  /**
   * Run a function in an isolated process
   * @param {Function} fn - Function to run
   * @param {Object} options - Run options
   * @returns {Promise<any>} Result of the function
   */
  async run(fn, options = {}) {
    const {
      timeout = this.timeoutMs,
      memoryLimitMB = 256,
      onTimeout = 'kill'
    } = options;
    
    // Create a wrapper script
    const scriptPath = await this.createWrapperScript(fn);
    
    return new Promise((resolve, reject) => {
      const processId = ++this.processCounter;
      
      // Limit concurrent processes
      if (this.activeProcesses.size >= this.maxConcurrent) {
        reject(new Error('Too many concurrent isolated processes'));
        return;
      }
      
      // Spawn isolated process
      const child = spawn(process.execPath, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Set memory limit if available
          NODE_OPTIONS: `--max-old-space-size=${memoryLimitMB}`
        }
      });
      
      this.activeProcesses.set(processId, child);
      
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      
      // Set timeout
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        console.warn(`[ProcessIsolation] Process ${processId} timed out`);
        
        if (onTimeout === 'kill') {
          child.kill('SIGKILL');
        } else if (onTimeout === 'cancel') {
          child.kill('SIGTERM');
        }
      }, timeout);
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        clearTimeout(timeoutHandle);
        this.activeProcesses.delete(processId);
        
        // Clean up temp script
        try {
          fs.unlinkSync(scriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (timedOut) {
          reject(new Error(`Process timed out after ${timeout}ms`));
          return;
        }
        
        if (code !== 0) {
          reject(new Error(`Process exited with code ${code}: ${stderr}`));
          return;
        }
        
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          resolve(stdout); // Return raw output if not JSON
        }
      });
      
      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        this.activeProcesses.delete(processId);
        reject(error);
      });
    });
  }

  /**
   * Create a wrapper script for isolated execution
   * @param {Function} fn - Function to wrap
   * @returns {string} Path to wrapper script
   */
  async createWrapperScript(fn) {
    const fnString = fn.toString();
    const wrapper = `
      const safeStringify = (obj, depth = 10) => {
        if (obj === undefined) return 'undefined';
        if (obj === null) return 'null';
        const seen = new WeakSet();
        try {
          return JSON.stringify(obj, (key, value) => {
            if (typeof value === 'object' && value !== null) {
              if (seen.has(value)) return '[Circular]';
              seen.add(value);
            }
            return value;
          }, 2);
        } catch (e) {
          return JSON.stringify({ error: e.message });
        }
      };

      try {
        const result = (${fnString})();
        if (result && typeof result.then === 'function') {
          result
            .then(r => {
              console.log(safeStringify(r));
              process.exit(0);
            })
            .catch(e => {
              console.error(safeStringify(e));
              process.exit(1);
            });
        } else {
          console.log(safeStringify(result));
          process.exit(0);
        }
      } catch (e) {
        console.error(safeStringify(e));
        process.exit(1);
      }
    `;
    
    // Write to temp file
    const tmpDir = os.tmpdir();
    const scriptPath = path.join(tmpDir, `opencode-isolate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.js`);
    
    const fs = await import('fs');
    fs.writeFileSync(scriptPath, wrapper, 'utf-8');
    
    return scriptPath;
  }

  /**
   * Kill all active processes
   */
  killAll() {
    for (const [id, child] of this.activeProcesses) {
      console.log(`[ProcessIsolation] Killing process ${id}`);
      child.kill('SIGKILL');
    }
    this.activeProcesses.clear();
  }

  /**
   * Get status of isolated processes
   */
  getStatus() {
    return {
      active: this.activeProcesses.size,
      max: this.maxConcurrent,
      processes: Array.from(this.activeProcesses.keys())
    };
  }
}

export default ProcessIsolation;
