#!/usr/bin/env node
/**
 * validate-launcher-contract.mjs — Validates launcher ownership contract consistency
 * 
 * Checks:
 * 1. Every entrypoint in contract exists
 * 2. Shebang matches declared ownership
 * 3. No unlisted entrypoints with shebangs
 * 
 * Usage:
 *   node scripts/validate-launcher-contract.mjs [--write]
 * 
 * Exit codes:
 *   0 = All checks passed
 *   1 = Contract violations detected
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

// --- Load contract ---
const CONTRACT_PATH = join(REPO_ROOT, 'scripts', 'launcher-contract.json');
const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf-8'));

// --- Helpers ---

function readFirstLine(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const firstLine = content.split('\n')[0];
    return firstLine.trim();
  } catch {
    return null;
  }
}

function findScriptFiles(dir, extensions = ['.js', '.mjs', '.ts']) {
  const files = [];
  
  function walk(currentDir) {
    try {
      const entries = readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        
        // Skip non-source directories
        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
            continue;
          }
          walk(fullPath);
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }
  
  walk(dir);
  return files;
}

// --- Validation ---

function validateContract() {
  const violations = [];
  const warnings = [];
  
  // 1. Check all contract entrypoints exist
  const allEntrypoints = [
    ...contract.ownership['bun-only'].entrypoints.map(e => ({ ...e, category: 'bun-only' })),
    ...contract.ownership['node-only'].entrypoints.map(e => ({ ...e, category: 'node-only' })),
    ...contract.ownership['dual-supported'].entrypoints.map(e => ({ ...e, category: 'dual-supported' })),
  ];
  
  for (const entry of allEntrypoints) {
    const fullPath = join(REPO_ROOT, entry.path);
    if (!existsSync(fullPath)) {
      violations.push({
        type: 'missing-entrypoint',
        path: entry.path,
        category: entry.category,
        message: `Entrypoint declared in contract but file does not exist`,
      });
    }
  }
  
  // 2. Check shebang consistency for bun-only (only bun-only should have bun shebang)
  for (const entry of allEntrypoints) {
    if (entry.category === 'bun-only') {
      const fullPath = join(REPO_ROOT, entry.path);
      if (!existsSync(fullPath)) continue;
      
      const firstLine = readFirstLine(fullPath);
      if (!firstLine) continue;
      
      if (!firstLine.includes('env bun')) {
        warnings.push({
          type: 'shebang-mismatch',
          path: entry.path,
          category: entry.category,
          shebang: firstLine,
          message: `Bun-only entrypoint should have #!/usr/bin/env bun shebang`,
        });
      }
    }
  }
  
  // 3. Find bun-only shebangs that are not listed (node shebangs are default/advisory)
  const scriptDirs = [
    join(REPO_ROOT, 'scripts'),
    join(REPO_ROOT, 'packages'),
  ];
  
  const allScriptFiles = [];
  for (const dir of scriptDirs) {
    if (existsSync(dir)) {
      allScriptFiles.push(...findScriptFiles(dir));
    }
  }
  
  const listedPaths = new Set(allEntrypoints.map(e => join(REPO_ROOT, e.path)));
  
  for (const filePath of allScriptFiles) {
    if (listedPaths.has(filePath)) continue;
    
    const firstLine = readFirstLine(filePath);
    if (!firstLine) continue;
    
    // Only warn about bun shebangs that are not listed (node shebangs are default)
    if (firstLine.includes('env bun')) {
      const relPath = relative(REPO_ROOT, filePath);
      warnings.push({
        type: 'unlisted-bun-shebang',
        path: relPath,
        shebang: firstLine,
        message: `File has bun shebang but is not listed in launcher contract`,
      });
    }
  }
  
  return { violations, warnings };
}

// --- Main ---

function main() {
  const args = process.argv.slice(2);
  const writeMode = args.includes('--write');
  
  console.log('[validate-launcher-contract] Validating launcher ownership contract...\n');
  
  const { violations, warnings } = validateContract();
  
  // Report violations
  if (violations.length > 0) {
    console.log(`❌ Found ${violations.length} contract violation(s):\n`);
    for (const v of violations) {
      console.log(`  [${v.type}] ${v.path}`);
      console.log(`    ${v.message}`);
      console.log();
    }
  }
  
  // Report warnings
  if (warnings.length > 0) {
    console.log(`⚠️  Found ${warnings.length} warning(s):\n`);
    for (const w of warnings) {
      console.log(`  [${w.type}] ${w.path}`);
      console.log(`    ${w.message}`);
      console.log();
    }
  }
  
  // Summary
  if (violations.length === 0 && warnings.length === 0) {
    console.log('✅ Launcher contract is valid and consistent.');
    process.exit(0);
  }
  
  if (violations.length > 0) {
    console.log('To fix: Update scripts/launcher-contract.json or fix the entrypoint file.');
    process.exit(1);
  }
  
  // Warnings only - exit 0 but with notice
  console.log('Contract is valid but has warnings. Consider updating contract or files.');
  process.exit(0);
}

main();
