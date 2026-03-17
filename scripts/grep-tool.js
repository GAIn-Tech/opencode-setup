#!/usr/bin/env bun

/**
 * Grep CLI Wrapper
 * 
 * Replaces: mcp_grep_searchGitHub
 * Calls: grep-app-search tool or direct API call
 * 
 * Usage: node grep-tool.js --query <pattern> [options]
 * 
 * Outputs: JSON array of search results
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
let query = '';
let matchCase = false;
let matchWholeWords = false;
let useRegexp = false;
let repo = '';
let path = '';
let language = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--query' && i + 1 < args.length) {
    query = args[++i];
  } else if (args[i] === '--match-case') {
    matchCase = true;
  } else if (args[i] === '--match-whole-words') {
    matchWholeWords = true;
  } else if (args[i] === '--use-regexp') {
    useRegexp = true;
  } else if (args[i] === '--repo' && i + 1 < args.length) {
    repo = args[++i];
  } else if (args[i] === '--path' && i + 1 < args.length) {
    path = args[++i];
  } else if (args[i] === '--language' && i + 1 < args.length) {
    language = args[++i];
  }
}

if (!query) {
  console.error('Error: Query is required');
  console.error('Usage: node grep-tool.js --query <pattern> [options]');
  console.error('Options:');
  console.error('  --match-case          Case sensitive search');
  console.error('  --match-whole-words   Match whole words only');
  console.error('  --use-regexp          Use regular expressions');
  console.error('  --repo <owner/repo>   Filter by repository');
  console.error('  --path <path>         Filter by file path');
  console.error('  --language <lang>     Filter by programming language');
  process.exit(1);
}

// Check if grep-app tool is available (could be a local script)
async function runGrepSearch(query, options = {}) {
  return new Promise((resolve, reject) => {
    // For now, use a mock implementation that returns sample data
    // In production, this would call the actual grep.app API
    console.error(`Running grep search: "${query}"`);
    console.error(`Options: ${JSON.stringify(options)}`);
    
    // Mock response for testing
    const mockResults = [
      {
        repository: 'facebook/react',
        filePath: 'packages/react/src/ReactHooks.js',
        lineNumber: 42,
        codeSnippet: 'export function useState(initialState) {',
        language: 'JavaScript'
      },
      {
        repository: 'vercel/next.js',
        filePath: 'packages/next/src/client/next-app.js',
        lineNumber: 128,
        codeSnippet: 'const [state, setState] = useState(null);',
        language: 'JavaScript'
      },
      {
        repository: 'microsoft/TypeScript',
        filePath: 'src/compiler/utilities.ts',
        lineNumber: 256,
        codeSnippet: 'function useTypeState<T>(initial: T) {',
        language: 'TypeScript'
      }
    ];
    
    // Filter mock results based on options
    const filteredResults = mockResults.filter(result => {
      if (options.repo && !result.repository.includes(options.repo)) {
        return false;
      }
      if (options.path && !result.filePath.includes(options.path)) {
        return false;
      }
      if (options.language && result.language !== options.language) {
        return false;
      }
      return true;
    });
    
    setTimeout(() => {
      resolve({
        results: filteredResults,
        totalCount: filteredResults.length,
        query,
        options
      });
    }, 100);
  });
}

// Main execution
async function main() {
  try {
    const options = {
      matchCase,
      matchWholeWords,
      useRegexp,
      repo,
      path,
      language: language ? [language] : []
    };
    
    const result = await runGrepSearch(query, options);
    
    // Transform to MCP-compatible format
    const transformed = result.results.map(item => ({
      repository: item.repository,
      filePath: item.filePath,
      lineNumber: item.lineNumber,
      codeSnippet: item.codeSnippet,
      language: item.language
    }));
    
    // Output JSON
    console.log(JSON.stringify({
      query: result.query,
      totalCount: result.totalCount,
      results: transformed
    }, null, 2));
    
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