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
const libraryId = args[0];
const query = args[1] || '';

if (!libraryId) {
  fatal('Library ID is required\nUsage: node context7-query-docs.js <libraryId> [query]');
}

// Check if npx is available
async function checkNpx() {
  // Check if npx exists first to prevent ENOENT crash
  if (!commandExists('npx')) {
    return false;
  }

  try {
    await runCommand('npx', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Run npx ctx7 query command
async function runContext7Query(libraryId, query) {
  const cmdArgs = ['ctx7', 'query', libraryId];
  if (query) {
    cmdArgs.push(query);
  }
  cmdArgs.push('--json');
  return runCommandJson('npx', cmdArgs, {
    stdio: 'pipe',
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
    const result = await runContext7Query(libraryId, query);
    
    // Transform to MCP-compatible format
    const transformed = {
      answer: result.answer || '',
      citations: result.citations || [],
      context: result.context || '',
      codeSnippets: result.codeSnippets || []
    };
    
    // Output JSON
    printJson(transformed);
    
  } catch (error) {
    fatal(toErrorMessage(error));
  }
}

installProcessErrorHandlers({ prefix: '[context7-query-docs]' });

// Run main function
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;
