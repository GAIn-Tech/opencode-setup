#!/usr/bin/env bun

/**
 * CLI Grep Tool - Replacement for grep MCP
 * 
 * Provides external code search functionality similar to grep.app API
 * but runs locally without external dependencies.
 */

import { readFileSync, readdirSync } from 'fs';
import { basename, relative, join } from 'path';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    query: '',
    language: null,
    repo: null,
    path: null,
    limit: 10,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--language' || arg === '-l') {
      result.language = args[++i];
    } else if (arg === '--repo' || arg === '-r') {
      result.repo = args[++i];
    } else if (arg === '--path' || arg === '-p') {
      result.path = args[++i];
    } else if (arg === '--limit' || arg === '-n') {
      result.limit = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-') && !result.query) {
      result.query = arg;
    }
  }

  return result;
}

function showHelp() {
  console.log(`
CLI Grep Tool - Search code patterns in repositories

Usage:
  cli-grep.js <query> [options]

Options:
  --language, -l <lang>     Filter by programming language
  --repo, -r <owner/repo>   Filter by repository
  --path, -p <path>         Filter by file path
  --limit, -n <number>      Maximum results (default: 10)
  --help, -h                Show this help

Examples:
  cli-grep.js "useState\\("
  cli-grep.js "function\\\\s+\\\\w+" --language JavaScript --limit 5
  cli-grep.js "console\\.log" --path "src/" --limit 20

This tool searches through local repositories in the ~/work directory.
`);
}

// Simple file content search
async function searchFiles(query, options) {
  const results = [];
  const searchRoot = process.env.HOME ? `${process.env.HOME}/work` : process.cwd();
  
  try {
    // Get all files recursively
    function findFiles(dir, pattern) {
      let files = [];
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            // Skip common directories
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') {
              continue;
            }
            files = files.concat(findFiles(fullPath, pattern));
          } else if (entry.isFile()) {
            const ext = entry.name.split('.').pop().toLowerCase();
            const allowedExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rb', 'php'];
            if (allowedExts.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (err) {
        // Skip unreadable directories
      }
      return files;
    }
    
    const files = findFiles(searchRoot);

    let count = 0;
    
    for (const file of files) {
      if (count >= options.limit) break;
      
      // Skip common directories
      if (file.includes('node_modules') || file.includes('.git') || file.includes('dist') || file.includes('build')) continue;
      
      // Apply filters
      if (options.path && !file.includes(options.path)) continue;
      
      try {
        const content = readFileSync(file, 'utf8');
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          // Simple string matching - could be enhanced with regex
          if (lines[i].includes(query.replace(/\\\(/g, '('))) {
            const relativePath = relative(searchRoot, file);
            const parts = relativePath.split(/[\\/]/);
            const repoName = parts[0] || 'unknown';
            
            // Apply repo filter
            if (options.repo && !repoName.includes(options.repo)) continue;
            
            results.push({
              repository: `${repoName}`,
              filepath: relativePath,
              line: i + 1,
              snippet: lines[i].trim(),
              language: getLanguageFromExtension(file)
            });
            
            count++;
            if (count >= options.limit) break;
          }
        }
      } catch (err) {
        // Skip unreadable files
      }
    }
  } catch (err) {
    console.error('Search error:', err.message);
  }
  
  return results;
}

function getLanguageFromExtension(file) {
  const ext = file.split('.').pop().toLowerCase();
  const map = {
    js: 'JavaScript',
    jsx: 'JavaScript',
    ts: 'TypeScript',
    tsx: 'TypeScript',
    py: 'Python',
    java: 'Java',
    go: 'Go',
    rb: 'Ruby',
    php: 'PHP'
  };
  return map[ext] || 'Unknown';
}

function formatResults(results) {
  if (results.length === 0) {
    return JSON.stringify({ results: [] }, null, 2);
  }
  
  const formatted = results.map(r => ({
    repository: r.repository,
    filepath: r.filepath,
    line: r.line,
    snippet: r.snippet,
    language: r.language
  }));
  
  return JSON.stringify({ results: formatted }, null, 2);
}

async function main() {
  const args = parseArgs();
  
  if (args.help || !args.query) {
    showHelp();
    return;
  }
  
  console.error(`Searching for: "${args.query}"${args.language ? ` in ${args.language}` : ''}`);
  
  const results = await searchFiles(args.query, args);
  const output = formatResults(results);
  
  console.log(output);
}

if (import.meta.main) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

// Export for programmatic use
export { searchFiles, parseArgs };