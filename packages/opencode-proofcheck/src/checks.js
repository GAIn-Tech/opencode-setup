'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Execute a shell command and capture result.
 * @param {string} cmd - Command to run
 * @param {object} opts - Options: cwd, timeout
 * @returns {{exitCode: number, stdout: string, stderr: string}}
 */
function exec(cmd, opts = {}) {
  const { cwd = process.cwd(), timeout = 60_000 } = opts;
  try {
    const stdout = execSync(cmd, {
      cwd,
      timeout,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout: stdout.trim(), stderr: '' };
  } catch (err) {
    return {
      exitCode: err.status ?? 1,
      stdout: (err.stdout ?? '').toString().trim(),
      stderr: (err.stderr ?? '').toString().trim(),
    };
  }
}

/**
 * Detect project type from filesystem markers.
 * @param {string} cwd - Project root
 * @returns {{hasNode: boolean, hasPython: boolean, packageJson: object|null}}
 */
function detectProject(cwd) {
  const pkgPath = path.join(cwd, 'package.json');
  let packageJson = null;
  let hasNode = false;
  let hasPython = false;

  if (fs.existsSync(pkgPath)) {
    try {
      packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      hasNode = true;
    } catch { /* malformed package.json */ }
  }

  hasPython = (
    fs.existsSync(path.join(cwd, 'setup.py')) ||
    fs.existsSync(path.join(cwd, 'pyproject.toml')) ||
    fs.existsSync(path.join(cwd, 'requirements.txt')) ||
    fs.existsSync(path.join(cwd, 'Pipfile'))
  );

  return { hasNode, hasPython, packageJson };
}

// ─── Individual Gate Checks ──────────────────────────────────────────────────

/**
 * Check if working tree is clean (no uncommitted changes).
 * @param {object} opts - {cwd}
 * @returns {{passed: boolean, message: string, details?: string}}
 */
function checkGitStatus(opts = {}) {
  const { cwd = process.cwd() } = opts;

  // Verify we're in a git repo
  const gitCheck = exec('git rev-parse --is-inside-work-tree', { cwd });
  if (gitCheck.exitCode !== 0) {
    return { passed: false, message: 'Not a git repository' };
  }

  const result = exec('git status --porcelain', { cwd });
  if (result.exitCode !== 0) {
    return { passed: false, message: 'Failed to check git status', details: result.stderr };
  }

  const dirty = result.stdout;
  if (dirty.length === 0) {
    return { passed: true, message: 'Working tree clean' };
  }

  const changedFiles = dirty.split('\n').filter(Boolean);
  return {
    passed: false,
    message: `Working tree dirty: ${changedFiles.length} uncommitted change(s)`,
    details: dirty,
  };
}

/**
 * Run project tests. Auto-detects npm test or pytest.
 * @param {object} opts - {cwd, timeout}
 * @returns {{passed: boolean, message: string, details?: string}}
 */
function checkTests(opts = {}) {
  const { cwd = process.cwd(), timeout = 120_000 } = opts;
  const project = detectProject(cwd);

  // Node project: npm test
  if (project.hasNode && project.packageJson?.scripts?.test) {
    const testScript = project.packageJson.scripts.test;
    // Skip if test script is the default placeholder
    if (testScript.includes('no test specified')) {
      return { passed: true, message: 'Tests skipped (no test script configured)' };
    }
    const result = exec('npm test --silent', { cwd, timeout });
    return {
      passed: result.exitCode === 0,
      message: result.exitCode === 0 ? 'Tests passed (npm test)' : 'Tests failed (npm test)',
      details: result.exitCode !== 0 ? (result.stderr || result.stdout).slice(0, 2000) : undefined,
    };
  }

  // Python project: pytest
  if (project.hasPython) {
    // Try pytest first, fall back to python -m pytest
    let result = exec('pytest --tb=short -q', { cwd, timeout });
    if (result.exitCode === 127 || result.stderr.includes('not found')) {
      result = exec('python -m pytest --tb=short -q', { cwd, timeout });
    }
    if (result.exitCode === 127 || result.stderr.includes('not found')) {
      return { passed: true, message: 'Tests skipped (pytest not found)' };
    }
    return {
      passed: result.exitCode === 0,
      message: result.exitCode === 0 ? 'Tests passed (pytest)' : 'Tests failed (pytest)',
      details: result.exitCode !== 0 ? (result.stderr || result.stdout).slice(0, 2000) : undefined,
    };
  }

  return { passed: true, message: 'Tests skipped (no test runner detected)' };
}

/**
 * Run linter. Checks for npm run lint in package.json scripts.
 * @param {object} opts - {cwd, timeout}
 * @returns {{passed: boolean, message: string, details?: string}}
 */
function checkLint(opts = {}) {
  const { cwd = process.cwd(), timeout = 60_000 } = opts;
  const project = detectProject(cwd);

  if (project.hasNode && project.packageJson?.scripts?.lint) {
    const result = exec('npm run lint --silent', { cwd, timeout });
    return {
      passed: result.exitCode === 0,
      message: result.exitCode === 0 ? 'Lint passed' : 'Lint failed',
      details: result.exitCode !== 0 ? (result.stderr || result.stdout).slice(0, 2000) : undefined,
    };
  }

  // Python: try ruff or flake8
  if (project.hasPython) {
    let result = exec('ruff check .', { cwd, timeout });
    if (result.exitCode !== 127 && !result.stderr.includes('not found')) {
      return {
        passed: result.exitCode === 0,
        message: result.exitCode === 0 ? 'Lint passed (ruff)' : 'Lint failed (ruff)',
        details: result.exitCode !== 0 ? (result.stderr || result.stdout).slice(0, 2000) : undefined,
      };
    }
    result = exec('flake8 .', { cwd, timeout });
    if (result.exitCode !== 127 && !result.stderr.includes('not found')) {
      return {
        passed: result.exitCode === 0,
        message: result.exitCode === 0 ? 'Lint passed (flake8)' : 'Lint failed (flake8)',
        details: result.exitCode !== 0 ? (result.stderr || result.stdout).slice(0, 2000) : undefined,
      };
    }
  }

  return { passed: true, message: 'Lint skipped (no linter configured)' };
}

/**
 * Run security scanner if available (npm audit / safety).
 * @param {object} opts - {cwd, timeout}
 * @returns {{passed: boolean, message: string, details?: string}}
 */
function checkSecurity(opts = {}) {
  const { cwd = process.cwd(), timeout = 60_000 } = opts;
  const project = detectProject(cwd);

  if (project.hasNode) {
    // npm audit --audit-level=high  (only fail on high/critical)
    const lockExists = (
      fs.existsSync(path.join(cwd, 'package-lock.json')) ||
      fs.existsSync(path.join(cwd, 'npm-shrinkwrap.json'))
    );
    if (!lockExists) {
      return { passed: true, message: 'Security skipped (no lockfile for npm audit)' };
    }
    const result = exec('npm audit --audit-level=high --json', { cwd, timeout });
    if (result.exitCode === 0) {
      return { passed: true, message: 'Security audit passed (npm audit)' };
    }
    // Parse vulnerability count from JSON output
    let vulnSummary = 'Vulnerabilities detected';
    try {
      const audit = JSON.parse(result.stdout);
      const meta = audit.metadata?.vulnerabilities;
      if (meta) {
        vulnSummary = `high: ${meta.high ?? 0}, critical: ${meta.critical ?? 0}`;
      }
    } catch { /* non-JSON output */ }
    return {
      passed: false,
      message: `Security audit failed (${vulnSummary})`,
      details: result.stdout.slice(0, 2000),
    };
  }

  if (project.hasPython) {
    // Try pip-audit or safety
    let result = exec('pip-audit --strict', { cwd, timeout });
    if (result.exitCode !== 127 && !result.stderr.includes('not found')) {
      return {
        passed: result.exitCode === 0,
        message: result.exitCode === 0 ? 'Security audit passed (pip-audit)' : 'Security audit failed (pip-audit)',
        details: result.exitCode !== 0 ? (result.stderr || result.stdout).slice(0, 2000) : undefined,
      };
    }
  }

  return { passed: true, message: 'Security skipped (no scanner available)' };
}

/**
 * Check if current branch is up-to-date with remote.
 * @param {object} opts - {cwd}
 * @returns {{passed: boolean, message: string, details?: string}}
 */
function checkBranchSync(opts = {}) {
  const { cwd = process.cwd() } = opts;

  const fetchResult = exec('git fetch --dry-run 2>&1', { cwd });
  const statusResult = exec('git status -sb', { cwd });

  if (statusResult.exitCode !== 0) {
    return { passed: false, message: 'Failed to check branch sync' };
  }

  const status = statusResult.stdout;
  if (status.includes('[behind')) {
    return {
      passed: false,
      message: 'Branch is behind remote — pull before pushing',
      details: status.split('\n')[0],
    };
  }

  return { passed: true, message: 'Branch in sync with remote' };
}

module.exports = {
  exec,
  detectProject,
  checkGitStatus,
  checkTests,
  checkLint,
  checkSecurity,
  checkBranchSync,
};
