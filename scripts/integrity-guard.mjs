#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveRoot } from './resolve-root.mjs';

const ROOT = resolveRoot();
const BASELINE_PATH = path.join(ROOT, 'opencode-config', 'integrity-baseline.json');
const GOVERNANCE_HASHES_PATH = path.join(ROOT, 'opencode-config', '.governance-hashes.json');
const MIN_NODE_MAJOR = 18;
const MIN_BUN_MAJOR = 1;
const MIN_BUN_MINOR = 3;

const CRITICAL_PACKAGES = [
  'opencode-dashboard',
  'opencode-model-manager',
  'opencode-model-router-x',
  'opencode-learning-engine',
  'opencode-skill-rl-manager'
];

const USER_SKILLS_DIR = path.join(os.homedir(), '.config', 'opencode', 'skills');
const USER_CONFIG_DIR = path.join(os.homedir(), '.config', 'opencode');

function resolveDataDir() {
  const configuredDataDir = process.env.OPENCODE_DATA_DIR?.trim();
  if (configuredDataDir) {
    return {
      source: 'OPENCODE_DATA_DIR',
      rawValue: process.env.OPENCODE_DATA_DIR,
      resolvedPath: path.resolve(configuredDataDir)
    };
  }

  return {
    source: 'default',
    rawValue: null,
    resolvedPath: path.join(process.env.HOME || process.env.USERPROFILE || os.homedir(), '.opencode')
  };
}

function parseVersionParts(version) {
  const [major = 0, minor = 0, patch = 0] = String(version)
    .split('.')
    .map((value) => Number.parseInt(value, 10));
  return { major, minor, patch };
}

function validateRuntimeVersion() {
  if (process.versions.bun) {
    const bunVersion = process.versions.bun;
    const { major, minor } = parseVersionParts(bunVersion);
    const isCompatible = major > MIN_BUN_MAJOR || (major === MIN_BUN_MAJOR && minor >= MIN_BUN_MINOR);

    return {
      runtimeLabel: `Bun ${bunVersion}`,
      compatible: isCompatible,
      failureReason: isCompatible
        ? null
        : `Bun ${bunVersion} is not supported. Expected Bun >= ${MIN_BUN_MAJOR}.${MIN_BUN_MINOR}.0.`
    };
  }

  const nodeVersion = process.versions.node;
  const { major } = parseVersionParts(nodeVersion);
  const isCompatible = major >= MIN_NODE_MAJOR;

  return {
    runtimeLabel: `Node ${nodeVersion}`,
    compatible: isCompatible,
    failureReason: isCompatible
      ? null
      : `Node ${nodeVersion} is not supported. Expected Node >= ${MIN_NODE_MAJOR}.0.0.`
  };
}

function listDirectories(dirPath) {
  if (!existsSync(dirPath)) {
    return [];
  }
  return readdirSync(dirPath).filter((name) => {
    try {
      return statSync(path.join(dirPath, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

function listUserSkillNames(dirPath) {
  if (!existsSync(dirPath)) {
    return [];
  }

  return readdirSync(dirPath).filter((name) => {
    const fullPath = path.join(dirPath, name);
    try {
      if (!statSync(fullPath).isDirectory()) {
        return false;
      }
      return existsSync(path.join(fullPath, 'SKILL.md'));
    } catch {
      return false;
    }
  });
}

function latestSkillsBackupDir() {
  if (!existsSync(USER_CONFIG_DIR)) {
    return null;
  }

  const backups = readdirSync(USER_CONFIG_DIR)
    .filter((name) => name.startsWith('skills.backup.'))
    .sort();

  if (backups.length === 0) {
    return null;
  }
  return path.join(USER_CONFIG_DIR, backups[backups.length - 1]);
}

function backupDirWithMostSkills() {
  if (!existsSync(USER_CONFIG_DIR)) {
    return null;
  }

  const backups = readdirSync(USER_CONFIG_DIR)
    .filter((name) => name.startsWith('skills.backup.'))
    .map((name) => path.join(USER_CONFIG_DIR, name));

  if (backups.length === 0) {
    return null;
  }

  let best = backups[0];
  let bestCount = listUserSkillNames(best).length;

  for (const backupPath of backups.slice(1)) {
    const count = listUserSkillNames(backupPath).length;
    if (count > bestCount) {
      best = backupPath;
      bestCount = count;
    }
  }

  return best;
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    return {
      criticalPackages: CRITICAL_PACKAGES,
      userSkills: { minimumCount: 20, required: [] }
    };
  }

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
  return {
    criticalPackages: Array.isArray(baseline.criticalPackages)
      ? baseline.criticalPackages
      : CRITICAL_PACKAGES,
    userSkills: {
      minimumCount: Number.isFinite(baseline.userSkills?.minimumCount)
        ? baseline.userSkills.minimumCount
        : 20,
      required: Array.isArray(baseline.userSkills?.required)
        ? baseline.userSkills.required
        : []
    }
  };
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function main() {
  const failures = [];
  const warnings = [];
  const baseline = loadBaseline();
  const dataDir = resolveDataDir();
  const runtimeValidation = validateRuntimeVersion();

  printSection('Environment');
  if (dataDir.rawValue) {
    console.log(`OPENCODE_DATA_DIR: ${dataDir.rawValue}`);
  }
  console.log(`Resolved data directory: ${dataDir.resolvedPath}`);
  console.log(`Runtime: ${runtimeValidation.runtimeLabel}`);
  console.log(`Working directory: ${process.cwd()}`);

  if (!existsSync(dataDir.resolvedPath)) {
    failures.push(`Missing critical data directory: ${dataDir.resolvedPath}`);
  }

  if (!existsSync(BASELINE_PATH)) {
    failures.push('Missing critical file: opencode-config/integrity-baseline.json');
  }

  if (!existsSync(GOVERNANCE_HASHES_PATH)) {
    failures.push('Missing critical file: opencode-config/.governance-hashes.json');
  }

  if (!runtimeValidation.compatible && runtimeValidation.failureReason) {
    failures.push(runtimeValidation.failureReason);
  }

  printSection('Repository Packages');
  const packagesDir = path.join(ROOT, 'packages');
  const packageDirs = listDirectories(packagesDir);
  console.log(`Packages found: ${packageDirs.length}`);

  for (const pkg of baseline.criticalPackages) {
    if (!packageDirs.includes(pkg)) {
      failures.push(`Missing critical package directory: packages/${pkg}`);
    }
  }

  if (packageDirs.length < 20) {
    failures.push(`Unexpectedly low package count (${packageDirs.length}). Expected at least 20.`);
  }

  printSection('Config Skill Registry');
  const registryPath = path.join(ROOT, 'opencode-config', 'skills', 'registry.json');
  if (!existsSync(registryPath)) {
    failures.push('Missing skill registry: opencode-config/skills/registry.json');
  } else {
    const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
    const skillCount = Object.keys(registry.skills || {}).length;
    console.log(`Registry skills: ${skillCount}`);
    if (skillCount < 20) {
      warnings.push(`Registry has low skill count (${skillCount}). Verify this is intentional.`);
    }
  }

  printSection('User Skill Inventory (Regression Guard)');
  const currentUserSkills = listUserSkillNames(USER_SKILLS_DIR).sort();
  console.log(`Current user skills: ${currentUserSkills.length}`);

  const backupDir = latestSkillsBackupDir();
  const richestBackupDir = backupDirWithMostSkills();
  if (!backupDir) {
    warnings.push('Missing optional backup directory (~/.config/opencode/skills.backup.*); cannot compare against previous inventory.');
  } else {
    const backupSkills = listUserSkillNames(backupDir).sort();
    console.log(`Latest backup: ${path.basename(backupDir)} (${backupSkills.length} skills)`);

    const missingSkills = backupSkills.filter((skill) => !currentUserSkills.includes(skill));
    if (missingSkills.length > 0) {
      failures.push(`Detected missing user skills compared to backup: ${missingSkills.join(', ')}`);
    }

    if (richestBackupDir && richestBackupDir !== backupDir) {
      const richestBackupSkills = listUserSkillNames(richestBackupDir).sort();
      console.log(`Richest backup: ${path.basename(richestBackupDir)} (${richestBackupSkills.length} skills)`);
      const missingComparedToRichest = richestBackupSkills.filter((skill) => !currentUserSkills.includes(skill));
      if (missingComparedToRichest.length > 0) {
        failures.push(
          `Detected missing user skills compared to richest backup: ${missingComparedToRichest.join(', ')}`
        );
      }
    }
  }

  if (currentUserSkills.length > 0 && currentUserSkills.length < baseline.userSkills.minimumCount) {
    failures.push(
      `Current user skills (${currentUserSkills.length}) below baseline minimum (${baseline.userSkills.minimumCount}).`
    );
  }

  const missingRequiredSkills = baseline.userSkills.required.filter(
    (skill) => !currentUserSkills.includes(skill)
  );
  if (missingRequiredSkills.length > 0) {
    failures.push(`Missing required user skills from baseline: ${missingRequiredSkills.join(', ')}`);
  }

  if (warnings.length > 0) {
    printSection('Warnings');
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (failures.length > 0) {
    printSection('Failures');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  printSection('Integrity Guard');
  console.log('PASS: No package/skill regression detected.');
}

try {
  main();
} catch (error) {
  console.error(`[integrity-guard] Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
