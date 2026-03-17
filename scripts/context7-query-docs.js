#!/usr/bin/env bun

/**
 * Context7 CLI Wrapper: Query Documentation
 * 
 * Replaces: mcp_context7_query-docs
 * Calls: npx ctx7 query <libraryId> <query> --json
 * 
 * Usage: node context7-query-docs.js <libraryId> [query]
 * 
 * Outputs: JSON response with documentation and code examples
 */

import { spawn } from 'child_process';
import { whichSync } from 'which';

// Parse command line arguments
const args = process.argv.slice(2);
const libraryId = args[0];
const query = args[1] || '';

if (!libraryId) {
  console.error('Error: Library ID is required');
  console.error('Usage: node context7-query-docs.js <libraryId> [query]');
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
    return false;
  }
  
  return new Promise((resolve) => {
    const check = spawn('npx', ['--version'], { stdio: 'pipe' });
    check.on('close', (code) => resolve(code === 0));
    check.on('error', () => resolve(false));
  });
}

// Run npx ctx7 query command
async function runContext7Query(libraryId, query) {
  return new Promise((resolve, reject) => {
    const cmdArgs = ['ctx7', 'query', libraryId];
    if (query) {
      cmdArgs.push(query);
    }
    cmdArgs.push('--json');
    
    console.error(`Running: npx ${cmdArgs.join(' ')}`);
    
    const child = spawn('npx', cmdArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
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
      reject(new Error(`npx execution failed: ${error.message}`));
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
    const result = await runContext7Query(libraryId, query);
    
    // Transform to MCP-compatible format
    const transformed = {
      answer: result.answer || '',
      citations: result.citations || [],
      context: result.context || '',
      codeSnippets: result.codeSnippets || []
    };
    
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