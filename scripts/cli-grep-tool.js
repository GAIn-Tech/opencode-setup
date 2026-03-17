#!/usr/bin/env bun

/**
 * CLI Grep Tool - MCP-compatible replacement
 * 
 * Accepts same parameters as grep MCP tool and returns compatible JSON
 */

const fs = require('fs');
const path = require('path');

// Parse arguments from command line or stdin
function parseArgs() {
  // If arguments provided via command line
  if (process.argv.length > 2) {
    const args = process.argv.slice(2);
    const result = {};
    
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--query') {
        result.query = args[++i];
      } else if (args[i] === '--match-case') {
        result.matchCase = args[++i] === 'true';
      } else if (args[i] === '--match-whole-words') {
        result.matchWholeWords = args[++i] === 'true';
      } else if (args[i] === '--use-regexp') {
        result.useRegexp = args[++i] === 'true';
      } else if (args[i] === '--repo') {
        result.repo = args[++i];
      } else if (args[i] === '--path') {
        result.path = args[++i];
      } else if (args[i] === '--language') {
        result.language = args[++i].split(',');
      }
    }
    
    return result;
  }
  
  // Try to read from stdin
  try {
    const stdin = fs.readFileSync(0, 'utf8').trim();
    if (stdin) {
      return JSON.parse(stdin);
    }
  } catch (err) {
    // No stdin or invalid JSON
  }
  
  // Default
  return { query: '', limit: 10 };
}

function searchCode(query, options = {}) {
  const results = [];
  const limit = options.limit || 10;
  const searchDir = options.path ? path.resolve(options.path) : process.cwd();
  
  function searchRecursive(dir, depth = 0) {
    if (depth > 3) return;
    if (results.length >= limit) return;
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (results.length >= limit) break;
        
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip common directories
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') {
            continue;
          }
          searchRecursive(fullPath, depth + 1);
        } else if (entry.isFile()) {
          // Check file extension
          const ext = path.extname(entry.name).toLowerCase();
          const codeExts = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rb', '.php', '.md', '.yaml', '.yml', '.json'];
          
          if (codeExts.includes(ext)) {
            // Language filter
            if (options.language) {
              const langMap = {
                '.js': 'JavaScript', '.jsx': 'JavaScript',
                '.ts': 'TypeScript', '.tsx': 'TypeScript',
                '.py': 'Python', '.java': 'Java',
                '.go': 'Go', '.rb': 'Ruby',
                '.php': 'PHP', '.md': 'Markdown'
              };
              const fileLang = langMap[ext] || 'Unknown';
              if (!options.language.includes(fileLang)) continue;
            }
            
            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              const lines = content.split('\n');
              
              for (let i = 0; i < lines.length; i++) {
                if (results.length >= limit) break;
                
                const line = lines[i];
                let match = false;
                
                if (options.useRegexp) {
                  try {
                    const regex = new RegExp(query, options.matchCase ? '' : 'i');
                    match = regex.test(line);
                  } catch (err) {
                    // Invalid regex - fall back to string matching
                    match = options.matchCase ? 
                      line.includes(query) : 
                      line.toLowerCase().includes(query.toLowerCase());
                  }
                } else {
                  if (options.matchWholeWords) {
                    const words = line.split(/\W+/);
                    if (options.matchCase) {
                      match = words.includes(query);
                    } else {
                      match = words.some(w => w.toLowerCase() === query.toLowerCase());
                    }
                  } else {
                    match = options.matchCase ? 
                      line.includes(query) : 
                      line.toLowerCase().includes(query.toLowerCase());
                  }
                }
                
                if (match) {
                  const relativePath = path.relative(process.cwd(), fullPath);
                  const repoName = relativePath.split(path.sep)[0] || 'unknown';
                  
                  // Repository filter
                  if (options.repo && !repoName.includes(options.repo)) continue;
                  
                  results.push({
                    repository: repoName,
                    filepath: relativePath,
                    line: i + 1,
                    snippet: line.trim().substring(0, 200),
                    language: getLanguage(ext)
                  });
                  
                  if (results.length >= limit) break;
                }
              }
            } catch (err) {
              // Skip unreadable files
            }
          }
        }
      }
    } catch (err) {
      // Skip unreadable directories
    }
  }
  
  searchRecursive(searchDir);
  return results;
}

function getLanguage(ext) {
  const map = {
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.py': 'Python',
    '.java': 'Java',
    '.go': 'Go',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.md': 'Markdown',
    '.yaml': 'YAML',
    '.yml': 'YAML',
    '.json': 'JSON'
  };
  return map[ext] || 'Unknown';
}

// Main execution
const args = parseArgs();

if (!args.query) {
  console.error('Error: Query is required');
  console.error('Usage: cli-grep-tool.js --query "<pattern>" [options]');
  console.error('Or pipe JSON: echo \'{"query":"pattern"}\' | cli-grep-tool.js');
  process.exit(1);
}

console.error(`Searching: "${args.query}"`);
const results = searchCode(args.query, args);

// Output in MCP-compatible format
console.log(JSON.stringify({
  query: args.query,
  options: args,
  results: results.map(r => ({
    repository: r.repository,
    filepath: r.filepath,
    line: r.line,
    snippet: r.snippet,
    language: r.language
  }))
}, null, 2));