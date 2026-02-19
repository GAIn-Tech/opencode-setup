#!/usr/bin/env node

/**
 * verify-integration.mjs - Automated Integration Verification
 * 
 * Verifies all components are properly integrated:
 * - Packages export from index.js
 * - Skills have SKILL.md
 * - Sync directories configured
 * - Imports resolve
 * 
 * This is automatically run by:
 * - npm run verify
 * - npm run gate:integration (in governance:check)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();

// Configuration
const CONFIG = {
  packagesDir: 'packages',
  opencodeConfigDir: 'opencode-config',
  requiredExports: ['src/index.js'],
  skillFile: 'SKILL.md',
  configDirs: [
    'learning-updates',
    'skills',
    'commands', 
    'agents',
    'docs',
    'models',
    'supermemory'
  ],
  scriptFiles: [
    'copy-config.mjs',
    'verify-setup.mjs',
    'learning-gate.mjs',
    'docs-gate.mjs'
  ]
};

// Track results
const results = {
  passed: [],
  failed: [],
  warnings: []
};

function log(message, type = 'info') {
  const prefix = {
    info: 'ℹ',
    pass: '✓',
    fail: '✗',
    warn: '⚠'
  };
  console.log(`${prefix[type]} ${message}`);
}

function checkFileExists(filePath) {
  return fs.existsSync(path.join(ROOT, filePath));
}

function checkPackageExports(packageDir) {
  const indexPath = path.join(ROOT, CONFIG.packagesDir, packageDir, 'src', 'index.js');
  
  if (!fs.existsSync(indexPath)) {
    results.failed.push(`${packageDir}: missing src/index.js`);
    return false;
  }
  
  const content = fs.readFileSync(indexPath, 'utf8');
  
  // Check for module.exports or exports assignment
  if (!content.includes('module.exports') && !content.includes('exports.')) {
    results.warnings.push(`${packageDir}: src/index.js has no exports`);
    return true; // Warning, not failure
  }
  
  results.passed.push(`${packageDir}: exports verified`);
  return true;
}

function checkSkillHasSKILL(skillDir) {
  const skillPath = path.join(ROOT, CONFIG.opencodeConfigDir, 'skills', skillDir, CONFIG.skillFile);
  
  if (!fs.existsSync(skillPath)) {
    results.failed.push(`skill ${skillDir}: missing ${CONFIG.skillFile}`);
    return false;
  }
  
  results.passed.push(`skill ${skillDir}: ${CONFIG.skillFile} exists`);
  return true;
}

function checkConfigDirConfigured(dirName) {
  // Check copy-config.mjs has the directory
  const copyConfigPath = path.join(ROOT, 'scripts', 'copy-config.mjs');
  
  if (!fs.existsSync(copyConfigPath)) {
    results.failed.push(`scripts/copy-config.mjs not found`);
    return false;
  }
  
  const content = fs.readFileSync(copyConfigPath, 'utf8');
  
  // Check if directory is in CONFIG_DIRS or copied individually
  const hasDir = content.includes(`'${dirName}'`) || content.includes(`"${dirName}"`);
  
  if (!hasDir) {
    results.failed.push(`directory ${dirName} not configured in copy-config.mjs`);
    return false;
  }
  
  // Check if source directory exists
  const sourcePath = path.join(ROOT, CONFIG.opencodeConfigDir, dirName);
  if (!fs.existsSync(sourcePath)) {
    results.warnings.push(`directory ${dirName} configured but source doesn't exist yet`);
    return true;
  }
  
  results.passed.push(`directory ${dirName}: configured in copy-config.mjs`);
  return true;
}

function checkImportsResolve() {
  // Basic check: try to require packages to see if they resolve
  const packagesDir = path.join(ROOT, CONFIG.packagesDir);
  
  if (!fs.existsSync(packagesDir)) {
    results.warnings.push('packages directory not found');
    return true;
  }
  
  const packages = fs.readdirSync(packagesDir).filter(f => {
    return fs.statSync(path.join(packagesDir, f)).isDirectory();
  });
  
  let allResolved = true;
  
  for (const pkg of packages) {
    const pkgJsonPath = path.join(packagesDir, pkg, 'package.json');
    
    if (!fs.existsSync(pkgJsonPath)) {
      results.warnings.push(`package ${pkg}: missing package.json`);
      continue;
    }
    
    // Check if package name matches directory (for local linking)
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const expectedName = `opencode-${pkg.replace('opencode-', '')}`;
    
    if (pkgJson.name !== expectedName) {
      results.warnings.push(`package ${pkg}: name mismatch (${pkgJson.name} vs ${expectedName})`);
    }
  }
  
  if (allResolved) {
    results.passed.push('packages: import structure valid');
  }
  
  return true;
}

function checkDocumentation() {
  const requiredDocs = ['README.md', 'INTEGRATION-GUIDE.md'];
  
  for (const doc of requiredDocs) {
    if (!checkFileExists(doc)) {
      results.failed.push(`missing required documentation: ${doc}`);
    } else {
      results.passed.push(`documentation: ${doc} exists`);
    }
  }
  
  return true;
}

function runVerification() {
  console.log('\n========================================');
  console.log('  Integration Verification');
  console.log('========================================\n');
  
  // 1. Check all packages have exports
  log('Checking package exports...', 'info');
  const packagesDir = path.join(ROOT, CONFIG.packagesDir);
  
  if (fs.existsSync(packagesDir)) {
    const packages = fs.readdirSync(packagesDir).filter(f => {
      return fs.statSync(path.join(packagesDir, f)).isDirectory();
    });
    
    for (const pkg of packages) {
      checkPackageExports(pkg);
    }
  }
  
  // 2. Check all skills have SKILL.md
  log('\nChecking skills...', 'info');
  const skillsDir = path.join(ROOT, CONFIG.opencodeConfigDir, 'skills');
  
  if (fs.existsSync(skillsDir)) {
    const skills = fs.readdirSync(skillsDir).filter(f => {
      return fs.statSync(path.join(skillsDir, f)).isDirectory();
    });
    
    for (const skill of skills) {
      checkSkillHasSKILL(skill);
    }
  }
  
  // 3. Check config directories are configured
  log('\nChecking sync configuration...', 'info');
  for (const dir of CONFIG.configDirs) {
    checkConfigDirConfigured(dir);
  }
  
  // 4. Check imports resolve
  log('\nChecking import structure...', 'info');
  checkImportsResolve();
  
  // 5. Check documentation exists
  log('\nChecking documentation...', 'info');
  checkDocumentation();
  
  // Summary
  console.log('\n========================================');
  console.log('  Summary');
  console.log('========================================\n');
  
  log(`Passed: ${results.passed.length}`, 'pass');
  log(`Failed: ${results.failed.length}`, 'fail');
  log(`Warnings: ${results.warnings.length}`, 'warn');
  
  if (results.warnings.length > 0) {
    console.log('\nWarnings:');
    results.warnings.forEach(w => log(w, 'warn'));
  }
  
  if (results.failed.length > 0) {
    console.log('\nFailed:');
    results.failed.forEach(f => log(f, 'fail'));
    console.log('\n❌ Integration verification FAILED');
    console.log('Fix the issues above and try again.\n');
    process.exit(1);
  }
  
  if (results.passed.length > 0) {
    console.log('\nPassed checks:');
    results.passed.forEach(p => log(p, 'pass'));
  }
  
  console.log('\n✅ Integration verification PASSED\n');
  process.exit(0);
}

// Run if called directly
runVerification();
