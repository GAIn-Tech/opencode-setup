#!/usr/bin/env bun

/**
 * Context7 CLI Wrapper: Resolve Library ID
 * 
 * Replaces: mcp_context7_resolve-library-id
 * Calls: npx ctx7 library <libraryName> <query> --json
 * 
 * Usage: node context7-resolve-library-id.js <libraryName> [query]
 * 
 * Outputs: JSON array of library matches
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { whichSync } from 'which';

// Parse command line arguments
const args = process.argv.slice(2);
const libraryName = args[0];
const query = args[1] || '';

if (!libraryName) {
  console.error('Error: Library name is required');
  console.error('Usage: node context7-resolve-library-id.js <libraryName> [query]');
  process.exit(1);
}

/**
 * Check if a command exists before trying to spawn it
 * Prevents Bun segfaults from ENOENT
 * @param {string} command - Command or path to check
 * @returns {boolean} True if executable exists
 */
function commandExists(command) {
  // Guard against undefined/null/non-string command
  if (!command || typeof command !== "string") {
    return false;
  }
  // Check if it's a path
  if (command.includes('/') || command.includes('\\')) {
    return false; // We don't check file paths in this script
  }
  
  // Check if it's in PATH using which
  try {
    return !!whichSync(command);
  } catch {
    return false;
  }
}

// Check if npx is available
async function checkNpx() {
  // Check if npx exists first to prevent ENOENT crash
  if (!commandExists('npx')) {
    // Fall back to npm exec check
    if (!commandExists('npm')) {
      return false;
    }
    return new Promise((resolve) => {
      const npmCheck = spawn('npm', ['exec', '--version'], { stdio: 'pipe', shell: true });
      npmCheck.on('close', (code) => resolve(code === 0));
      npmCheck.on('error', () => resolve(false));
    });
  }
  
  return new Promise((resolve) => {
    const check = spawn('npx', ['--version'], { stdio: 'pipe', shell: true });
    check.on('close', (code) => resolve(code === 0));
    check.on('error', () => resolve(false));
  });
}

// Run npx ctx7 library command
async function runContext7Library(libraryName, query) {
  return new Promise((resolve, reject) => {
    const cmdArgs = ['ctx7', 'library', libraryName];
    if (query) {
      cmdArgs.push(query);
    }
    cmdArgs.push('--json');
    
    console.error(`Running: npx ${cmdArgs.join(' ')}`);
    
    // Check if npx exists first to prevent ENOENT crash
    if (!commandExists('npx')) {
      // Try npm exec as fallback
      if (!commandExists('npm')) {
        reject(new Error('Neither npx nor npm found in PATH'));
        return;
      }
      console.error('npx not found, falling back to npm exec');
      const npmCmdArgs = ['exec', ...cmdArgs];
      const npmChild = spawn('npm', npmCmdArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });
      
      let npmStdout = '';
      let npmStderr = '';
      
      npmChild.stdout.on('data', (data) => {
        npmStdout += data.toString();
      });
      
      npmChild.stderr.on('data', (data) => {
        npmStderr += data.toString();
      });
      
      npmChild.on('close', (code) => {
        if (code !== 0) {
          console.error(`npm exec ctx7 exited with code ${code}: ${npmStderr}`);
          reject(new Error(`ctx7 failed: ${npmStderr}`));
          return;
        }
        
        try {
          const result = JSON.parse(npmStdout);
          resolve(result);
        } catch (error) {
          console.error(`Failed to parse JSON: ${error.message}`);
          console.error(`Raw output: ${npmStdout}`);
          reject(new Error(`Invalid JSON from ctx7: ${error.message}`));
        }
      });
      
      npmChild.on('error', (npmError) => {
        console.error(`Failed to spawn npm exec: ${npmError.message}`);
        reject(new Error(`npm exec failed: ${npmError.message}`));
      });
      return;
    }
    
    // Try npx first, fall back to npm exec
    const child = spawn('npx', cmdArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`ctx7 exited with code ${code}: ${stderr}`);
        reject(new Error(`ctx7 failed: ${stderr}`));
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (error) {
        console.error(`Failed to parse JSON: ${error.message}`);
        console.error(`Raw output: ${stdout}`);
        reject(new Error(`Invalid JSON from ctx7: ${error.message}`));
      }
    });
    
    child.on('error', (error) => {
      console.error(`Failed to spawn npx: ${error.message}`);
      reject(new Error(`npx spawn failed: ${error.message}`));
    });
  });
}

// Main execution
async function main() {
  const npxAvailable = await checkNpx();
  if (!npxAvailable) {
    console.error('Error: npx is not available. Please install Node.js/npm.');
    process.exit(1);
  }
  
  try {
    const result = await runContext7Library(libraryName, query);
    
    // Transform to MCP-compatible format
    const transformed = result.map(lib => ({
      libraryId: lib.id,
      name: lib.title,
      description: lib.description,
      codeSnippets: lib.totalSnippets,
      sourceReputation: lib.trustScore >= 7 ? 'High' : 
                        lib.trustScore >= 4 ? 'Medium' : 
                        lib.trustScore ? 'Low' : 'Unknown',
      benchmarkScore: lib.benchmarkScore,
      versions: lib.versions || []
    }));
    
    // Output JSON
    console.log(JSON.stringify(transformed, null, 2));
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(`Uncaught error: ${error.message}`);
  process.exit(1);
});

// Run main function
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;