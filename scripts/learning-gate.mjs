#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { resolveRoot } from './resolve-root.mjs';

const ROOT = resolveRoot();
const POLICY_PATH = path.join(ROOT, 'opencode-config', 'learning-update-policy.json');
const UPDATES_DIR = path.join(ROOT, 'opencode-config', 'learning-updates');

function parseArgs(argv) {
  const args = { staged: false, base: null };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--staged') {
      args.staged = true;
    } else if (token === '--base') {
      args.base = argv[i + 1] ?? null;
      i += 1;
    }
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizePath(input) {
  return input.replace(/\\/g, '/').replace(/^\.\//, '');
}

function getChangedFiles({ staged, base }) {
  if (!staged && !base) {
    const trackedOut = execSync('git diff --name-only', { cwd: ROOT, encoding: 'utf8' }).trim();
    const untrackedOut = execSync('git ls-files --others --exclude-standard', {
      cwd: ROOT,
      encoding: 'utf8'
    }).trim();
    const combined = [trackedOut, untrackedOut].filter(Boolean).join('\n');
    if (!combined) {
      return [];
    }
    return combined.split('\n').map((line) => line.trim()).filter(Boolean);
  }

  const cmd = staged
    ? 'git diff --cached --name-only'
    : `git diff --name-only ${base}...HEAD`;

  const output = execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
  if (!output) {
    return [];
  }
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function matchPath(file, patterns) {
  const normalizedFile = normalizePath(file);
  return patterns.some((prefix) => normalizedFile.startsWith(normalizePath(prefix)));
}

function isLearningUpdateFile(file) {
  const normalizedFile = normalizePath(file);
  return normalizedFile.startsWith('opencode-config/learning-updates/') && normalizedFile.endsWith('.json');
}

function validateLearningUpdate(update, file, policy, governedChanges) {
  const requiredTop = policy.required_update_fields || [];
  for (const field of requiredTop) {
    if (!(field in update)) {
      throw new Error(`${file}: missing required field '${field}'`);
    }
  }

  if (!Array.isArray(update.affected_paths) || update.affected_paths.length === 0 || !update.affected_paths.every((p) => typeof p === 'string')) {
    throw new Error(`${file}: 'affected_paths' must be a non-empty array`);
  }

  const normalizedGoverned = governedChanges.map(normalizePath);
  const normalizedAffected = update.affected_paths.map(normalizePath);
  const affectedGovernedOverlap = normalizedAffected.some((affected) =>
    normalizedGoverned.some((changed) => changed === affected || changed.startsWith(affected) || affected.startsWith(changed))
  );
  if (!affectedGovernedOverlap) {
    throw new Error(`${file}: affected_paths must overlap at least one governed changed file`);
  }

  const requiredValidation = policy.required_validation_fields || [];
  for (const field of requiredValidation) {
    if (!(field in update.validation)) {
      throw new Error(`${file}: validation missing '${field}'`);
    }
  }

  const allowedStatus = new Set(policy.allowed_validation_status || ['pass', 'fail', 'not-run']);
  for (const field of requiredValidation) {
    const value = update.validation[field];
    if (!allowedStatus.has(value)) {
      throw new Error(`${file}: validation.${field} must be one of pass|fail|not-run`);
    }
  }

  const allowedRisk = new Set(policy.allowed_risk_levels || ['low', 'medium', 'high']);
  if (!allowedRisk.has(update.risk_level)) {
    throw new Error(`${file}: risk_level must be one of low|medium|high`);
  }

  const riskRequirements = policy.require_pass_for_risk || {};
  const mustPassFields = riskRequirements[update.risk_level] || [];
  for (const field of mustPassFields) {
    if (update.validation[field] !== 'pass') {
      throw new Error(`${file}: risk_level '${update.risk_level}' requires validation.${field} to be 'pass'`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv);
  const policy = readJson(POLICY_PATH);
  const changedFiles = getChangedFiles(args);

  if (changedFiles.length === 0) {
    console.log('learning-gate: no changed files, skipping');
    return;
  }

  const governedChanges = changedFiles.filter((file) => matchPath(file, policy.governed_paths));
  if (governedChanges.length === 0) {
    console.log('learning-gate: no governed changes detected');
    return;
  }

  const learningUpdateFiles = changedFiles.filter(isLearningUpdateFile);
  if (learningUpdateFiles.length === 0) {
    throw new Error(
      'learning-gate: governed files changed but no learning update record added under opencode-config/learning-updates/'
    );
  }

  if (!fs.existsSync(UPDATES_DIR)) {
    throw new Error('learning-gate: learning-updates directory is missing');
  }

  for (const relFile of learningUpdateFiles) {
    const absPath = path.join(ROOT, relFile);
    if (!fs.existsSync(absPath)) {
      throw new Error(`learning-gate: update file not found: ${relFile}`);
    }
    const payload = readJson(absPath);
    validateLearningUpdate(payload, relFile, policy, governedChanges);
  }

  console.log('learning-gate: PASS');
  console.log(`- governed changes: ${governedChanges.length}`);
  console.log(`- learning updates: ${learningUpdateFiles.length}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
