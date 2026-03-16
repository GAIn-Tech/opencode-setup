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

// Parse command line arguments
const args = process.argv.slice(2);
const libraryName = args[0];
const query = args[1] || '';

if (!libraryName) {
  console.error('Error: Library name is required');
  console.error('Usage: node context7-resolve-library-id.js <libraryName> [query]');
  process.exit(1);
}

// Check if npx is available
async function checkNpx() {
  return new Promise((resolve) => {
    // Try npx first, fall back to npm exec
    const check = spawn('npx', ['--version'], { stdio: 'pipe', shell: true });
    check.on('close', (code) => resolve(code === 0));
    check.on('error', () => {
      // Fall back to npm exec
      const npmCheck = spawn('npm', ['exec', '--version'], { stdio: 'pipe', shell: true });
      npmCheck.on('close', (code) => resolve(code === 0));
      npmCheck.on('error', () => resolve(false));
    });
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
      console.error(`Failed to spawn npx, trying npm exec: ${error.message}`);
      // Fall back to npm exec
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