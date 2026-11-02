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

import {
  commandExists,
  runCommand,
  runCommandJson,
  printJson,
  fatal,
  installProcessErrorHandlers,
  toErrorMessage,
} from './lib/cli-runtime.mjs';

// Parse command line arguments
const args = process.argv.slice(2);
const libraryName = args[0];
const query = args[1] || '';

if (!libraryName) {
  fatal('Library name is required\nUsage: node context7-resolve-library-id.js <libraryName> [query]');
}

// Check if npx is available
async function checkNpx() {
  // Check if npx exists first to prevent ENOENT crash
  if (!commandExists('npx')) {
    // Fall back to npm exec check
    if (!commandExists('npm')) {
      return false;
    }
    try {
      await runCommand('npm', ['exec', '--version'], { stdio: 'pipe', shell: true });
      return true;
    } catch {
      return false;
    }
  }

  try {
    await runCommand('npx', ['--version'], { stdio: 'pipe', shell: true });
    return true;
  } catch {
    return false;
  }
}

// Run npx ctx7 library command
async function runContext7Library(libraryName, query) {
  const cmdArgs = ['ctx7', 'library', libraryName];
  if (query) {
    cmdArgs.push(query);
  }
  cmdArgs.push('--json');

  if (!commandExists('npx')) {
    if (!commandExists('npm')) {
      throw new Error('Neither npx nor npm found in PATH');
    }
    console.error('npx not found, falling back to npm exec');
    return runCommandJson('npm', ['exec', ...cmdArgs], {
      stdio: 'pipe',
      shell: true,
      logCommand: true,
      parseMode: 'strict',
    });
  }

  return runCommandJson('npx', cmdArgs, {
    stdio: 'pipe',
    shell: true,
    logCommand: true,
    parseMode: 'strict',
  });
}

// Main execution
async function main() {
  const npxAvailable = await checkNpx();
  if (!npxAvailable) {
    fatal('npx is not available. Please install Node.js/npm.');
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
    printJson(transformed);
    
  } catch (error) {
    fatal(toErrorMessage(error));
  }
}

installProcessErrorHandlers({ prefix: '[context7-resolve-library-id]' });

// Run main function
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;
