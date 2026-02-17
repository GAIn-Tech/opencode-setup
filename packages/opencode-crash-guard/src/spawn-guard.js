/**
 * Spawn Guard
 * Prevents Bun crashes from ENOENT when spawning missing executables
 * This is a known bug in Bun v1.3.x where ENOENT triggers segmentation fault
 */

import { existsSync, whichSync } from 'which';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Check if an executable exists before trying to spawn it
 * Prevents Bun segfaults from ENOENT
 * @param {string} command - Command or path to check
 * @returns {boolean} True if executable exists
 */
export function commandExists(command) {
  // Guard against undefined/null/non-string command
  if (!command || typeof command !== "string") {
    return false;
  }
  // Check if it's a path
  if (command.includes('/') || command.includes('\\')) {
    return existsSync(command);
  }
  
  // Check if it's in PATH using which
  try {
    return !!whichSync(command);
  } catch {
    return false;
  }
}

/**
 * Spawn a process with ENOENT protection
 * Falls back gracefully instead of crashing
 * @param {string} command - Command to run
 * @param {string[]} args - Arguments
 * @param {Object} options - Spawn options
 * @returns {Promise<{success: boolean, result?: any, error?: string}>}
 */
export async function safeSpawn(command, args = [], options = {}) {
  const { 
    timeout = 30000,
    fallbackOnError = true,
    ...spawnOptions 
  } = options;
  
  // Check if command exists FIRST to prevent ENOENT crash
  if (!commandExists(command)) {
    const error = `Command not found: ${command}. Skipping to prevent crash.`;
    console.warn(`[SpawnGuard] ⚠️ ${error}`);
    
    if (fallbackOnError) {
      return { success: false, error, skipped: true };
    }
    throw new Error(error);
  }
  
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      const proc = spawnOptions.detached 
        ? undefined 
        : spawn(command, args, spawnOptions);
      
      if (proc) {
        proc.kill('SIGKILL');
      }
      
      resolve({ 
        success: false, 
        error: `Command timed out after ${timeout}ms: ${command}`,
        timedOut: true 
      });
    }, timeout);
    
    try {
      const proc = spawn(command, args, spawnOptions);
      
      let stdout = '';
      let stderr = '';
      
      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }
      
      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }
      
      proc.on('error', (error) => {
        clearTimeout(timeoutId);
        
        // If it's ENOENT, we already checked - but double-check
        if (error.code === 'ENOENT') {
          const errMsg = `Executable not found: ${command}`;
          console.error(`[SpawnGuard] 🔴 ${errMsg}`);
          
          resolve({ 
            success: false, 
            error: errMsg,
            code: 'ENOENT' 
          });
          return;
        }
        
        resolve({ 
          success: false, 
          error: error.message,
          code: error.code 
        });
      });
      
      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        
        resolve({
          success: code === 0,
          exitCode: code,
          stdout,
          stderr
        });
      });
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Check if it's the ENOENT crash
      if (error.message?.includes('ENOENT') || error.code === 'ENOENT') {
        console.error(`[SpawnGuard] 🔴 ENOENT prevented crash for: ${command}`);
        resolve({ 
          success: false, 
          error: `Command not found: ${command}`,
          code: 'ENOENT',
          prevented: true 
        });
        return;
      }
      
      resolve({ 
        success: false, 
        error: error.message 
      });
    }
  });
}

/**
 * Check multiple executables and return which ones exist
 * @param {string[]} commands - List of commands to check
 * @returns {Object} Object with command names as keys and boolean as values
 */
export function whichMany(commands) {
  const results = {};
  for (const cmd of commands) {
    results[cmd] = commandExists(cmd);
  }
  return results;
}

/**
 * Get system info for debugging spawn issues
 * @returns {Object} System information
 */
export function getSystemInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    bunVersion: process.versions.bun || 'unknown',
    PATH: process.env.PATH?.split(path.delimiter).slice(0, 5).join('...')
  };
}

export default {
  commandExists,
  safeSpawn,
  whichMany,
  getSystemInfo
};
