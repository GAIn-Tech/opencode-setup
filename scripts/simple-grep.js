#!/usr/bin/env bun

/**
 * Simple Grep CLI Tool - Minimal replacement for grep MCP
 * 
 * Searches current directory for code patterns
 */

const query = process.argv[2] || '';
const limit = parseInt(process.argv[3]) || 5;

if (!query) {
  console.error('Usage: simple-grep.js <pattern> [limit]');
  console.error('Example: simple-grep.js "useState" 10');
  process.exit(1);
}

// Simple search in current directory
const results = [];
const fs = require('fs');
const path = require('path');

function searchDir(dir, depth = 0) {
  if (depth > 3) return; // Limit recursion depth
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
        searchDir(fullPath, depth + 1);
      } else if (entry.isFile()) {
        // Check if it's a code file
        const ext = path.extname(entry.name).toLowerCase();
        const codeExts = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rb', '.php'];
        
        if (codeExts.includes(ext)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            
            for (let i = 0; i < lines.length; i++) {
              if (results.length >= limit) break;
              if (lines[i].includes(query)) {
                const relativePath = path.relative(process.cwd(), fullPath);
                results.push({
                  file: relativePath,
                  line: i + 1,
                  snippet: lines[i].trim().substring(0, 100),
                  language: ext.substring(1)
                });
                break; // One match per file for simplicity
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

console.error(`Searching for: "${query}" (limit: ${limit})`);
searchDir(process.cwd());

console.log(JSON.stringify({ results }, null, 2));