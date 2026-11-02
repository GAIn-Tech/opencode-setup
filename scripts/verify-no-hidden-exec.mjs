#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, '..');

const IMPLICIT_LIFECYCLE_SCRIPTS = [
  'prepare',
  'preinstall',
  'install',
  'postinstall',
  'prepack',
  'postpack',
  'prepublish',
  'prepublishOnly',
  'postmerge',
  'postcheckout',
];

function stableSort(items) {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b));
}

function hasHookInstallTrigger(value) {
  if (typeof value !== 'string') return false;
  return value.includes('hooks:install') || value.includes('install-git-hooks.mjs');
}

function hasExecutableHookTriggerInSetupScript(source) {
  if (typeof source !== 'string') return false;

  const setupStepPatterns = [
    /args\s*:\s*\[[^\]]*['"]hooks:install['"][^\]]*\]/s,
    /\[[^\]]*['"]hooks:install['"][^\]]*\]/s,
    /['"]scripts\/install-git-hooks\.mjs['"]/s,
  ];

  return setupStepPatterns.some((pattern) => pattern.test(source));
}

function pushViolation(result, id, reason) {
  result.violations.push(id);
  result.reasons.push(reason);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function verifyNoHiddenExecution(options = {}) {
  const rootDir = path.resolve(options.rootDir || DEFAULT_ROOT);
  const packageJsonPath = path.join(rootDir, 'package.json');
  const setupResilientPath = path.join(rootDir, 'scripts', 'setup-resilient.mjs');

  const result = {
    compliant: true,
    violations: [],
    reasons: [],
  };

  if (!existsSync(packageJsonPath)) {
    pushViolation(
      result,
      'package.json:missing',
      'Policy input missing: package.json not found.',
    );
  }

  if (!existsSync(setupResilientPath)) {
    pushViolation(
      result,
      'scripts/setup-resilient.mjs:missing',
      'Policy input missing: scripts/setup-resilient.mjs not found.',
    );
  }

  let packageJson = null;
  if (existsSync(packageJsonPath)) {
    try {
      packageJson = readJson(packageJsonPath);
    } catch (error) {
      pushViolation(
        result,
        'package.json:invalid-json',
        `Policy input invalid: package.json parse failed (${error.message}).`,
      );
    }
  }

  if (packageJson) {
    const scripts = packageJson?.scripts;
    if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) {
      pushViolation(
        result,
        'package.json:scripts:invalid-shape',
        'Policy input invalid: package.json scripts must be an object.',
      );
    } else {
      const explicitHookInstall = scripts['hooks:install'];
      if (typeof explicitHookInstall !== 'string' || explicitHookInstall.trim().length === 0) {
        pushViolation(
          result,
          'package.json:scripts.hooks:install:missing',
          'Missing explicit opt-in command: package.json must define scripts["hooks:install"].',
        );
      }

      for (const [name, command] of Object.entries(scripts)) {
        if (name === 'hooks:install') continue;
        if (!hasHookInstallTrigger(command)) continue;

        pushViolation(
          result,
          `package.json:scripts.${name}:implicit-hook-exec`,
          `Hidden hook activation detected: package.json script "${name}" installs hooks implicitly.`,
        );
      }

      for (const scriptName of IMPLICIT_LIFECYCLE_SCRIPTS) {
        const lifecycleCommand = scripts[scriptName];
        if (!hasHookInstallTrigger(lifecycleCommand)) continue;

        pushViolation(
          result,
          `package.json:scripts.${scriptName}:implicit-hook-exec`,
          `Hidden hook activation detected: package.json script "${scriptName}" installs hooks implicitly.`,
        );
      }
    }
  }

  if (existsSync(setupResilientPath)) {
    const setupResilient = readFileSync(setupResilientPath, 'utf8');
    if (hasExecutableHookTriggerInSetupScript(setupResilient)) {
      pushViolation(
        result,
        'scripts/setup-resilient.mjs:auto-hooks-install',
        'Hidden hook activation detected: scripts/setup-resilient.mjs contains implicit hooks install trigger.',
      );
    }
  }

  result.violations = stableSort(result.violations);
  result.reasons = stableSort(result.reasons);
  result.compliant = result.violations.length === 0;
  return result;
}

function main() {
  const output = verifyNoHiddenExecution({ rootDir: DEFAULT_ROOT });
  console.log(JSON.stringify(output, null, 2));
  process.exit(output.compliant ? 0 : 1);
}

if (import.meta.main) {
  main();
}
