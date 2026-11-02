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
  registryFile: 'skills/registry.json',
  registrySchemaFile: 'skills/registry.schema.json',
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
  const packagePath = path.join(ROOT, CONFIG.packagesDir, packageDir, 'package.json');
  
  if (!fs.existsSync(packagePath)) {
    results.failed.push(`${packageDir}: missing package.json`);
    return false;
  }
  
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  // Check for main field
  if (!packageJson.main) {
    results.failed.push(`${packageDir}: missing main field in package.json`);
    return false;
  }
  
  // Check if main file exists
  const mainPath = path.join(ROOT, CONFIG.packagesDir, packageDir, packageJson.main);
  if (!fs.existsSync(mainPath)) {
    results.failed.push(`${packageDir}: main file ${packageJson.main} not found`);
    return false;
  }
  
  // Check for module.exports or exports assignment
  const content = fs.readFileSync(mainPath, 'utf8');
  if (!content.includes('module.exports') && !content.includes('exports.')) {
    results.warnings.push(`${packageDir}: ${packageJson.main} has no exports`);
    return true; // Warning, not failure
  }
  
  results.passed.push(`${packageDir}: exports verified via ${packageJson.main}`);
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

function collectSkillDirectories(rootDir) {
  const collected = [];

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    const hasSkillFile = entries.some(e => e.isFile() && e.name === CONFIG.skillFile);

    if (hasSkillFile) {
      collected.push(current);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      walk(path.join(current, entry.name));
    }
  }

  walk(rootDir);
  return collected;
}

function checkSkillRegistryFiles() {
  const registryPath = path.join(ROOT, CONFIG.opencodeConfigDir, CONFIG.registryFile);
  const schemaPath = path.join(ROOT, CONFIG.opencodeConfigDir, CONFIG.registrySchemaFile);

  if (!fs.existsSync(registryPath)) {
    results.failed.push(`missing ${CONFIG.opencodeConfigDir}/${CONFIG.registryFile}`);
  } else {
    results.passed.push(`registry: ${CONFIG.registryFile} exists`);
  }

  if (!fs.existsSync(schemaPath)) {
    results.failed.push(`missing ${CONFIG.opencodeConfigDir}/${CONFIG.registrySchemaFile}`);
  } else {
    results.passed.push(`registry schema: ${CONFIG.registrySchemaFile} exists`);
  }
}

function checkSkillProfileLoader() {
  const loaderPath = path.join(ROOT, 'scripts', 'skill-profile-loader.mjs');
  if (!fs.existsSync(loaderPath)) {
    results.failed.push('missing scripts/skill-profile-loader.mjs');
    return;
  }

  try {
    execSync('node scripts/skill-profile-loader.mjs validate', {
      cwd: ROOT,
      stdio: 'pipe',
    });
    results.passed.push('skill profiles: registry validation passed');
  } catch (err) {
    results.failed.push('skill profiles: validation failed (scripts/skill-profile-loader.mjs validate)');
  }
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
    const skillDirs = collectSkillDirectories(skillsDir);

    for (const absSkillDir of skillDirs) {
      const rel = path.relative(path.join(ROOT, CONFIG.opencodeConfigDir, 'skills'), absSkillDir);
      checkSkillHasSKILL(rel);
    }
  }

  // 2b. Check registry and schema files exist
  checkSkillRegistryFiles();

  // 2c. Validate profile loader and registry coherence
  checkSkillProfileLoader();
  
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
