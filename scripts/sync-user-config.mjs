#!/usr/bin/env node

/**
 * OpenCode User Config Sync Script
 * 
 * Synchronizes configuration files from opencode-config/ to ~/.config/opencode/
 * This ensures environment portability across machines.
 * 
 * Usage:
 *   node scripts/sync-user-config.mjs          # Dry run (show what would sync)
 *   node scripts/sync-user-config.mjs --write # Actually sync files
 *   node scripts/sync-user-config.mjs --check  # Check sync status
 * 
 * Files synced:
 *   - opencode.json (main config)
 *   - antigravity.json (Google account rotation - template only)
 *   - oh-my-opencode.json (agent overrides)
 *   - compound-engineering.json (skills/commands)
 *   - rate-limit-fallback.json (fallback config)
 *   - tool-tiers.json (tool tier definitions)
 *   - tool-manifest.json (tool manifest)
 *   - supermemory.json (supermemory config - template only)
 *   - central-config.json (schema-validated config)
 *   - config.yaml (global rules)
 * 
 * Directories synced:
 *   - opencode-config/agents/ → ~/.config/opencode/agents/
 *   - opencode-config/skills/ → ~/.config/opencode/skills/
 *   - opencode-config/docs/ → ~/.config/opencode/docs/
 *   - opencode-config/learning-updates/ → ~/.config/opencode/learning-updates/
 *   - opencode-config/models/ → ~/.config/opencode/models/
 *   - opencode-config/superemory/ → ~/.config/opencode/superemory/
 * 
 * MACHINE-SPECIFIC (never sync these):
 *   - antigravity-accounts.json (OAuth tokens)
 *   - tool-usage/ (runtime telemetry)
 *   - session data
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { resolveRoot, userConfigDir, userDataDir } from './resolve-root.mjs';

const isWindows = process.platform === 'win32';
const dryRun = !process.argv.includes('--write');
const checkMode = process.argv.includes('--check');

const root = resolveRoot();
const userConfig = userConfigDir();
const userData = userDataDir();

const opencodeConfigDir = path.join(root, 'opencode-config');

// Files to sync (source relative to opencode-config/)
const filesToSync = [
  'opencode.json',
  'oh-my-opencode.json',
  'compound-engineering.json',
  'rate-limit-fallback.json',
  'tool-tiers.json',
  'tool-manifest.json',
  'central-config.json',
  'learning-update-policy.json',
  'warning-baseline.json',
  'integrity-baseline.json',
  'deployment-state.json',
  'antigravity.json',           // Template - user must add real API keys
  'supermemory.json',           // Template - user must add real API keys
];

// Directories to sync
const dirsToSync = [
  'agents',
  'skills',
  'docs',
  'learning-updates',
  'models',
];

// Files that are MACHINE-SPECIFIC and should NOT be synced
const machineSpecificFiles = [
  'antigravity-accounts.json',
];

// Machine-specific directories
const machineSpecificDirs = [
  'tool-usage',
  'sessions',
];

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    return true;
  }
  return false;
}

function copyFileIfChanged(source, target) {
  if (!existsSync(source)) {
    console.log(`[SKIP] Source not found: ${source}`);
    return false;
  }
  
  ensureDir(path.dirname(target));
  
  const sourceContent = readFileSync(source);
  const targetExists = existsSync(target);
  
  if (!targetExists) {
    if (!dryRun) {
      writeFileSync(target, sourceContent);
      console.log(`[CREATE] ${target}`);
    } else {
      console.log(`[CREATE] ${target} (dry run)`);
    }
    return true;
  }
  
  const targetContent = readFileSync(target);
  
  if (sourceContent.equals(targetContent)) {
    console.log(`[SAME] ${target}`);
    return false;
  }
  
  if (!dryRun) {
    writeFileSync(target, sourceContent);
    console.log(`[UPDATE] ${target}`);
  } else {
    console.log(`[UPDATE] ${target} (dry run)`);
  }
  return true;
}

function syncDirectory(sourceDir, targetDir, options = {}) {
  const { skipPattern = null, includeFiles = null } = options;
  let count = 0;
  
  if (!existsSync(sourceDir)) {
    console.log(`[SKIP] Source dir not found: ${sourceDir}`);
    return count;
  }
  
  ensureDir(targetDir);
  
  function walkDir(dir, relative = '') {
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(relative, entry.name);
      
      if (skipPattern && skipPattern.test(relPath)) {
        continue;
      }
      
      if (entry.isDirectory()) {
        count += walkDir(fullPath, relPath);
      } else if (entry.isFile()) {
        if (includeFiles && !includeFiles.includes(entry.name)) {
          continue;
        }
        const targetPath = path.join(targetDir, relPath);
        if (copyFileIfChanged(fullPath, targetPath)) {
          count++;
        }
      }
    }
    
    return count;
  }
  
  walkDir(sourceDir);
  return count;
}

function checkMachineSpecificFiles() {
  const issues = [];
  
  for (const file of machineSpecificFiles) {
    const path = join(userConfig, file);
    if (existsSync(path)) {
      issues.push(`Machine-specific file exists: ${path}`);
    }
  }
  
  return issues;
}

function join(...parts) {
  return path.join(...parts);
}

function main() {
  console.log('=== OpenCode User Config Sync ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : checkMode ? 'CHECK' : 'WRITE'}`);
  console.log(`Repo root: ${root}`);
  console.log(`User config: ${userConfig}`);
  console.log(`User data: ${userData}`);
  console.log('');
  
  if (checkMode) {
    console.log('=== Sync Status Check ===');
    const issues = [];
    let totalSynced = 0;
    let totalExpected = 0;
    
    // Check files
    for (const file of filesToSync) {
      totalExpected++;
      const source = join(opencodeConfigDir, file);
      const target = join(userConfig, file);
      
      if (!existsSync(source)) {
        issues.push(`Missing source file: ${file}`);
        continue;
      }
      
      if (!existsSync(target)) {
        issues.push(`Not synced: ${file}`);
        continue;
      }
      
      const sourceContent = readFileSync(source);
      const targetContent = readFileSync(target);
      
      if (sourceContent.equals(targetContent)) {
        totalSynced++;
      } else {
        issues.push(`Out of sync: ${file} (run with --write to update)`);
      }
    }
    
    // Check machine-specific
    issues.push(...checkMachineSpecificFiles());
    
    console.log(`\nSync status: ${totalSynced}/${totalExpected} files in sync`);
    
    if (issues.length > 0) {
      console.log('\nIssues found:');
      for (const issue of issues) {
        console.log(`  - ${issue}`);
      }
      process.exit(1);
    } else {
      console.log('\nAll files in sync. Environment is portable.');
      process.exit(0);
    }
  }
  
  // Sync mode
  console.log('=== Syncing Files ===');
  let fileCount = 0;
  
  for (const file of filesToSync) {
    const source = join(opencodeConfigDir, file);
    const target = join(userConfig, file);
    if (copyFileIfChanged(source, target)) {
      fileCount++;
    }
  }
  
  console.log(`\n=== Syncing Directories ===`);
  let dirCount = 0;
  
  for (const dir of dirsToSync) {
    const source = join(opencodeConfigDir, dir);
    const target = join(userConfig, dir);
    console.log(`\nSyncing ${dir}/...`);
    const count = syncDirectory(source, target);
    console.log(`  ${count} files`);
    dirCount += count;
  }
  
  // Sync global rules
  const globalRulesSource = join(root, 'opencode-config', 'config.yaml');
  const globalRulesTarget = join(userData, 'config.yaml');
  console.log('\n=== Syncing Global Config ===');
  copyFileIfChanged(globalRulesSource, globalRulesTarget);
  
  console.log(`\n=== Summary ===`);
  console.log(`Files synced: ${fileCount}`);
  console.log(`Directory files synced: ${dirCount}`);
  console.log(`Total: ${fileCount + dirCount} items`);
  
  if (dryRun) {
    console.log('\n(Dry run - no changes made. Run with --write to apply.)');
  } else {
    console.log('\nSync complete!');
    console.log('\nNext steps:');
    console.log('  1. Review any template files that need API keys:');
    console.log('     - antigravity.json');
    console.log('     - supermemory.json');
    console.log('  2. Run: node scripts/verify-portability.mjs');
    console.log('  3. Restart OpenCode to load new config');
  }
}

main();
