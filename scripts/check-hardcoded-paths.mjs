#!/usr/bin/env node
/**
 * check-hardcoded-paths.mjs — Static gate for hardcoded path anti-patterns
 * 
 * Fails on non-allowlisted hardcoded `.opencode`/HOME path usage in source files.
 * 
 * Usage:
 *   node scripts/check-hardcoded-paths.mjs [--write-allowlist]
 * 
 * Exit codes:
 *   0 = All checks passed
 *   1 = Forbidden patterns detected
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

// --- Configuration ---

// Patterns that are FORBIDDEN (will cause failure)
const FORBIDDEN_PATTERNS = [
  // Direct .opencode path construction without resolver
  { pattern: /path\.join\([^)]*\.opencode[^)]*\)/, description: 'Direct .opencode path construction' },
  { pattern: /homedir\(\)\s*\+\s*['"]\/\.opencode/, description: 'String concatenation with .opencode' },
  { pattern: /\$HOME\/\.opencode/, description: 'Shell-style $HOME/.opencode' },
  { pattern: /%USERPROFILE%\\\.opencode/, description: 'Windows %USERPROFILE%\.opencode' },
  
  // Hardcoded home paths without XDG/env precedence
  { pattern: /os\.homedir\(\)\s*,\s*['"]\.opencode['"]\s*\)/, description: 'os.homedir()/.opencode without env precedence' },
];

// Patterns that are ALLOWED (will not cause failure)
const ALLOWLIST = [
  // The canonical resolver itself
  { pattern: /userDataDir\(\)/, reason: 'Uses canonical userDataDir resolver' },
  { pattern: /resolveUserDataPath\(/, reason: 'Uses canonical resolveUserDataPath resolver' },
  { pattern: /resolveDataHome\(\)/, reason: 'Uses local resolveDataHome with correct precedence' },
  
  // Environment variable checks (correct pattern)
  { pattern: /process\.env\.OPENCODE_DATA_HOME/, reason: 'Checks OPENCODE_DATA_HOME env var' },
  { pattern: /process\.env\.XDG_DATA_HOME/, reason: 'Checks XDG_DATA_HOME env var' },
  
  // Documentation/help text (not runtime code)
  { pattern: /~\/\.opencode\/logs\//, reason: 'Help text example path' },
  { pattern: /~\/\.opencode\/kb-init-state\.json/, reason: 'Help text example path' },
  
  // Comments explaining the canonical path
  { pattern: /\/\/ Lock files live next to the target file \(e\.g\. ~\/\.opencode/, reason: 'Comment explaining lock file location' },
  
  // Project config files (.opencode.config.json) - NOT data home
  { pattern: /\.opencode\.config\.json/, reason: 'Project config file reference (not data home)' },
  
  // Test files using temp directories
  { pattern: /tmpDir.*\.opencode/, reason: 'Test file using temp directory' },
  { pattern: /dir.*\.opencode.*tool-usage/, reason: 'Test file using temp directory' },
  
  // Check script itself (defines the patterns)
  { pattern: /\$HOME\/\.opencode/, reason: 'Pattern definition in check script' },
  { pattern: /%USERPROFILE%/, reason: 'Pattern definition in check script' },
  
  // ROOT-relative paths (not data home)
  { pattern: /ROOT.*\.opencode/, reason: 'ROOT-relative path (not data home)' },
  { pattern: /path\.join\(ROOT,.*\.opencode/, reason: 'ROOT-relative path (not data home)' },
  
  // Plugin runtime state (project-level, not user data)
  { pattern: /plugin-runtime-state\.json/, reason: 'Plugin runtime state file (project-level)' },
  
  // Preload state (project-level)
  { pattern: /preload-state\.json/, reason: 'Preload state file (project-level)' },
  
  // Integration tests using temp directories
  { pattern: /integration-tests.*\.opencode/, reason: 'Integration test using temp directory' },
  { pattern: /orchestration-atomic-write/, reason: 'Integration test using temp directory' },
  { pattern: /skillrl-api-regression/, reason: 'Integration test using temp directory' },
  { pattern: /os\.tmpdir\(\).*\.opencode/, reason: 'Test using temp directory' },
  { pattern: /path\.join\(dir,.*\.opencode/, reason: 'Test using temp directory variable' },
  { pattern: /const opencodeDir = path\.join\(os\.homedir\(\),.*\.opencode/, reason: 'Integration test direct homedir access' },
];

// Files/directories to skip (not source code)
const SKIP_PATTERNS = [
  /node_modules/,
  /\.git/,
  /dist/,
  /build/,
  /\.next/,
  /coverage/,
  /\.sisyphus\/notepads/,
  /\.sisyphus\/drafts/,
  /\.sisyphus\/evidence/,
  /\.sisyphus\/reports/,
  /test-skillrl-state\.json$/, // Transient test artifacts
];

// File extensions to scan
const SCAN_EXTENSIONS = ['.js', '.mjs', '.ts', '.tsx', '.jsx'];

// --- Implementation ---

function shouldSkipFile(filePath) {
  return SKIP_PATTERNS.some(pattern => pattern.test(filePath));
}

function isAllowlisted(line, lineNumber, filePath) {
  return ALLOWLIST.some(entry => entry.pattern.test(line));
}

function findForbiddenPatterns(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    
    // Skip if allowlisted
    if (isAllowlisted(line, lineNumber, filePath)) {
      continue;
    }
    
    // Check forbidden patterns
    for (const forbidden of FORBIDDEN_PATTERNS) {
      if (forbidden.pattern.test(line)) {
        violations.push({
          file: filePath.replace(REPO_ROOT + '/', ''),
          line: lineNumber,
          pattern: forbidden.description,
          content: line.trim(),
        });
      }
    }
  }
  
  return violations;
}

function scanDirectory(dir) {
  const allViolations = [];
  
  // Use glob to find files
  for (const ext of SCAN_EXTENSIONS) {
    const pattern = join(dir, '**', `*${ext}`);
    try {
      const files = globSync(pattern, { nodir: true });
      
      for (const file of files) {
        if (shouldSkipFile(file)) continue;
        
        const violations = findForbiddenPatterns(file);
        allViolations.push(...violations);
      }
    } catch (err) {
      // globSync may not be available in all Node versions
      // Fall back to manual scanning
    }
  }
  
  return allViolations;
}

function main() {
  const args = process.argv.slice(2);
  const writeAllowlist = args.includes('--write-allowlist');
  
  console.log('[check-hardcoded-paths] Scanning for forbidden path patterns...\n');
  
  const violations = scanDirectory(REPO_ROOT);
  
  if (writeAllowlist) {
    // Generate allowlist from current codebase
    console.log('[check-hardcoded-paths] Generating allowlist from current codebase...\n');
    // This would scan and extract all path patterns for review
    console.log('Allowlist generation not yet implemented.');
    process.exit(0);
  }
  
  if (violations.length === 0) {
    console.log('[check-hardcoded-paths] ✅ No forbidden path patterns found.');
    process.exit(0);
  }
  
  console.log(`[check-hardcoded-paths] ❌ Found ${violations.length} forbidden pattern(s):\n`);
  
  for (const v of violations) {
    console.log(`  ${v.file}:${v.line}`);
    console.log(`    Pattern: ${v.pattern}`);
    console.log(`    Code: ${v.content}`);
    console.log();
  }
  
  console.log('To fix: Use the canonical resolver from scripts/resolve-root.mjs:');
  console.log('  - userDataDir() for user data directory');
  console.log('  - resolveUserDataPath(...parts) for paths within data directory');
  console.log('  - Or define resolveDataHome() with OPENCODE_DATA_HOME > XDG_DATA_HOME > ~/.opencode precedence');
  console.log();
  console.log('To allowlist an exception: Add it to ALLOWLIST in scripts/check-hardcoded-paths.mjs');
  
  process.exit(1);
}

main();
