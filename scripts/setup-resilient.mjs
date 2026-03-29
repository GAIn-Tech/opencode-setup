#!/usr/bin/env node

import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path, { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { userConfigDir, userDataDir } from './resolve-root.mjs';
import { CONFIG_FILES, CONFIG_DIRS } from './copy-config.mjs';
import { listSupplementalConfigArtifacts } from './generate-mcp-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

function parseCliOptions(argv = process.argv.slice(2)) {
  const args = Array.from(argv);
  const offlineMode = args.includes('--offline') || String(process.env.OPENCODE_OFFLINE || '') === '1';
  const allowGlobalWrites = args.includes('--allow-global-writes')
    || String(process.env.OPENCODE_SETUP_ALLOW_GLOBAL_WRITES || '') === '1';
  const reportFileFlag = args.indexOf('--report-file');
  const reportFile = reportFileFlag >= 0 ? args[reportFileFlag + 1] : '';

  if (reportFileFlag >= 0 && !reportFile) {
    throw new Error('[setup-resilient] --report-file requires a path argument');
  }

  return {
    offlineMode,
    allowGlobalWrites,
    reportFile,
  };
}

// ---------------------------------------------------------------------------
// Pre-setup: load .env into process environment and persist to OS
// ---------------------------------------------------------------------------
function loadEnvFile({ allowGlobalWrites }) {
  const envPath = join(repoRoot, '.env');
  if (!existsSync(envPath)) {
    console.log('[setup-resilient] No .env file found — skipping env load.');
    return;
  }

  console.log('[setup-resilient] Loading .env into process environment...');
  const content = readFileSync(envPath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = content.split('\n');
  const vars = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const name = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!value) continue;
    process.env[name] = value;
    vars.push(name);
  }
  console.log(`[setup-resilient]   Loaded ${vars.length} variable(s) into process env.`);

  // Only persist to user-global environment when explicitly enabled.
  if (process.platform === 'win32' && allowGlobalWrites) {
    console.log('[setup-resilient]   Persisting to Windows user environment...');
    const toPowerShellSingleQuoted = (value) => String(value).replace(/'/g, "''");
    for (const name of vars) {
      try {
        const safeName = toPowerShellSingleQuoted(name);
        const safeValue = toPowerShellSingleQuoted(process.env[name]);
        execFileSync('powershell', [
          '-NoProfile',
          '-Command',
          `[System.Environment]::SetEnvironmentVariable('${safeName}', '${safeValue}', 'User')`,
        ], { stdio: 'pipe' });
      } catch {
        console.warn(`[setup-resilient]   WARNING: Could not persist ${name}`);
      }
    }
    console.log(`[setup-resilient]   Persisted ${vars.length} variable(s).`);
  } else if (process.platform === 'win32' && vars.length > 0) {
    console.log('[setup-resilient]   Skipping Windows user-environment writes (set --allow-global-writes to enable).');
  }
}

// ---------------------------------------------------------------------------
// Pre-setup: ensure SHELL is set on Windows (opencode needs bash, not cmd.exe)
// ---------------------------------------------------------------------------
function ensureShellOnWindows({ allowGlobalWrites }) {
  if (process.platform !== 'win32') return;
  if (process.env.SHELL) return;

  const candidates = [
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe',
  ];
  const bashPath = candidates.find(p => existsSync(p));
  if (!bashPath) {
    console.warn('[setup-resilient] WARNING: Could not find git-bash. SHELL env var not set.');
    console.warn('[setup-resilient]   opencode may use cmd.exe, which breaks bash commands.');
    return;
  }

  console.log(`[setup-resilient] Setting SHELL=${bashPath}`);
  process.env.SHELL = bashPath;
  if (!allowGlobalWrites) {
    console.log('[setup-resilient]   Skipping SHELL user-env persistence (set --allow-global-writes to enable).');
    return;
  }

  try {
    execFileSync('powershell', [
      '-NoProfile', '-Command',
      `[System.Environment]::SetEnvironmentVariable('SHELL', '${bashPath}', 'User')`,
    ], { stdio: 'pipe' });
    console.log('[setup-resilient]   Persisted SHELL to Windows user environment.');
  } catch {
    console.warn('[setup-resilient]   WARNING: Could not persist SHELL env var.');
  }
}

// ---------------------------------------------------------------------------
// Pre-setup: ensure PowerShell execution policy allows scripts
// ---------------------------------------------------------------------------
function ensurePSExecutionPolicy({ allowGlobalWrites }) {
  if (process.platform !== 'win32') return;

  try {
    const policy = execFileSync('powershell', [
      '-NoProfile', '-Command', 'Get-ExecutionPolicy -Scope CurrentUser',
    ], { stdio: 'pipe', encoding: 'utf-8' }).trim();

    if (policy === 'Restricted' || policy === 'Undefined') {
      if (!allowGlobalWrites) {
        console.log(`[setup-resilient] PowerShell execution policy is "${policy}" — skipping mutation (set --allow-global-writes to enable).`);
        return;
      }
      console.log(`[setup-resilient] PowerShell execution policy is "${policy}" — setting to RemoteSigned...`);
      execFileSync('powershell', [
        '-NoProfile', '-Command',
        "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force",
      ], { stdio: 'pipe' });
      console.log('[setup-resilient]   Done.');
    }
  } catch {
    console.warn('[setup-resilient] WARNING: Could not check/set PowerShell execution policy.');
  }
}

// ---------------------------------------------------------------------------
// Pre-setup: check and warn about required prerequisites for MCP/local dev
// ---------------------------------------------------------------------------
function checkPrerequisites() {
  const missing = [];
  const warnings = [];
  const pathUpdates = [];

  const hasCommand = (command, args = ['--version']) => {
    try {
      const result = spawnSync(command, args, { stdio: 'pipe' });
      return result.status === 0;
    } catch {
      return false;
    }
  };

  const prependPath = (segment) => {
    if (!segment) return;
    const current = process.env.PATH || '';
    const sep = process.platform === 'win32' ? ';' : ':';
    const parts = current.split(sep).filter(Boolean);
    if (parts.includes(segment)) return;
    process.env.PATH = `${segment}${sep}${current}`;
    pathUpdates.push(segment);
  };

  const ensureUvx = () => {
    if (hasCommand('uvx')) return true;

    // Common user install locations when PATH differs between jailed/root shells.
    const uvxCandidates = process.platform === 'win32'
      ? [
          path.join(os.homedir(), '.local', 'bin', 'uvx.exe'),
          path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python311', 'Scripts'),
          path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python312', 'Scripts'),
          path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python313', 'Scripts'),
        ]
      : [path.join(os.homedir(), '.local', 'bin')];

    const discoverPythonUserScripts = () => {
      const probes = process.platform === 'win32'
        ? [['py', ['-m', 'site', '--user-base']], ['python', ['-m', 'site', '--user-base']]]
        : [['python3', ['-m', 'site', '--user-base']], ['python', ['-m', 'site', '--user-base']]];

      for (const [cmd, args] of probes) {
        try {
          const result = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8' });
          if (result.status !== 0) continue;
          const base = String(result.stdout || '').trim().split(/\r?\n/)[0];
          if (!base) continue;
          const scriptsDir = process.platform === 'win32'
            ? path.join(base, 'Scripts')
            : path.join(base, 'bin');
          if (existsSync(scriptsDir)) {
            prependPath(scriptsDir);
          }
        } catch {
          // best effort only
        }
      }
    };

    for (const candidate of uvxCandidates) {
      if (!existsSync(candidate)) continue;
      if (candidate.endsWith('uvx.exe')) {
        const dir = path.dirname(candidate);
        prependPath(dir);
      } else {
        prependPath(candidate);
      }
      if (hasCommand('uvx')) return true;
    }

    // Attempt best-effort install if Python tooling exists.
    const installAttempts = process.platform === 'win32'
      ? [
          ['py', ['-m', 'pip', 'install', '--user', 'uv']],
          ['python', ['-m', 'pip', 'install', '--user', 'uv']],
        ]
      : [
          ['python3', ['-m', 'pip', 'install', '--user', 'uv']],
          ['python', ['-m', 'pip', 'install', '--user', 'uv']],
        ];

    for (const [cmd, args] of installAttempts) {
      try {
        const result = spawnSync(cmd, args, { stdio: 'pipe' });
        if (result.status === 0) {
          // Re-add common location after install.
          prependPath(path.join(os.homedir(), '.local', 'bin'));
          prependPath(path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python311', 'Scripts'));
          prependPath(path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python312', 'Scripts'));
          prependPath(path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python313', 'Scripts'));
          discoverPythonUserScripts();
          if (hasCommand('uvx')) {
            console.log('[setup-resilient]   Installed uv/uvx via pip for MCP portability.');
            return true;
          }
        }
      } catch {
        // Continue fallback attempts.
      }
    }

    return false;
  };

  if (!hasCommand('bun')) {
    missing.push('Bun runtime (required for setup and local MCP servers)');
  }

  // Check Node.js (required by several setup/validation scripts)
  if (!hasCommand('node')) {
    missing.push('Node.js (required for setup/verification scripts)');
  }

  // Check uvx (required for grep MCP). Attempt self-heal first.
  if (!ensureUvx()) {
    missing.push('uv/uvx (required for grep MCP; install via: pip install --user uv)');
  }

  // Check WSL2 on Windows (needed for Docker Desktop)
  if (process.platform === 'win32') {
    try {
      const wslResult = spawnSync('wsl', ['--list', '--verbose'], { stdio: 'pipe', encoding: 'utf-8' });
      const listedDistros = String(wslResult.stdout || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.toLowerCase().includes('name') && !line.startsWith('-'));
      if (wslResult.status !== 0 || listedDistros.length === 0) {
        warnings.push('WSL2 distro not detected - required for Docker Desktop; run: wsl --install');
      }
    } catch {
      warnings.push('WSL2 distro not detected - required for Docker Desktop; run: wsl --install');
    }
  }

  // Report
  if (missing.length > 0) {
    console.log('\n[setup-resilient] ⚠️  Missing prerequisites (MCPs may not work):');
    for (const m of missing) {
      console.log(`   - ${m}`);
    }
  }
  if (pathUpdates.length > 0) {
    console.log(`\n[setup-resilient]   PATH updated for this run: ${pathUpdates.join(', ')}`);
  }
  if (warnings.length > 0) {
    console.log('\n[setup-resilient] ⚠️  Optional prerequisites (recommended):');
    for (const w of warnings) {
      console.log(`   - ${w}`);
    }
  }
  if (missing.length === 0 && warnings.length === 0) {
    console.log('\n[setup-resilient] ✓ All prerequisites detected');
  }
}

function hashPath(targetPath, hash) {
  if (!existsSync(targetPath)) {
    hash.update(`missing:${targetPath}\n`);
    return;
  }

  const stat = statSync(targetPath);
  if (stat.isDirectory()) {
    hash.update(`dir:${targetPath}\n`);
    const children = readdirSync(targetPath).sort();
    for (const child of children) {
      hashPath(path.join(targetPath, child), hash);
    }
    return;
  }

  hash.update(`file:${targetPath}:${stat.size}\n`);
  hash.update(readFileSync(targetPath));
}

export function fingerprintPaths(paths = []) {
  const normalized = Array.from(new Set(paths.filter(Boolean))).sort();
  const hash = createHash('sha256');
  for (const targetPath of normalized) {
    hashPath(targetPath, hash);
  }
  return hash.digest('hex');
}

function getCopyConfigProbePaths() {
  const runtimeConfigDir = userConfigDir();
  const runtimeDataDir = userDataDir();
  return [
    ...CONFIG_FILES.map((name) => path.join(runtimeConfigDir, name)),
    ...CONFIG_DIRS.map((name) => path.join(runtimeConfigDir, name)),
    path.join(runtimeConfigDir, 'config-manifest.json'),
    path.join(runtimeDataDir, 'config.yaml'),
  ];
}

function getGenerateProbePaths() {
  const runtimeConfigDir = userConfigDir();
  const supplementalTargets = listSupplementalConfigArtifacts(repoRoot).map((artifact) => path.join(runtimeConfigDir, artifact.targetName));
  return [
    path.join(runtimeConfigDir, 'opencode.json'),
    path.join(runtimeConfigDir, 'tool-manifest.json'),
    ...supplementalTargets,
  ];
}

export function buildSteps(offline) {
  return [
    { label: 'preflight-versions', command: 'node', args: ['scripts/preflight-versions.mjs'] },
    { label: 'bootstrap-cache-guard', command: 'node', args: ['scripts/bootstrap-cache-guard.mjs', ...(offline ? ['--offline'] : [])] },
    { label: 'bun-install', command: 'bun', args: offline ? ['install', '--frozen-lockfile', '--offline'] : ['install'] },
    { label: 'link-all', command: 'bun', args: ['run', 'link-all'] },
    { label: 'copy-config', command: 'bun', args: ['run', 'copy-config'], probePaths: getCopyConfigProbePaths() },
    { label: 'generate-mcp-config', command: 'bun', args: ['run', 'generate'], probePaths: getGenerateProbePaths() },
    { label: 'verify-mcp-mirrors', command: 'node', args: ['scripts/mcp-mirror-coherence.mjs'] },
    { label: 'supply-chain-guard', command: 'node', args: ['scripts/supply-chain-guard.mjs'] },
    { label: 'validate-config-schema', command: 'node', args: ['scripts/validate-config.mjs'] },
    { label: 'verify-setup', command: 'node', args: ['scripts/verify-setup.mjs'] },
    { label: 'check-skill-consistency', command: 'node', args: ['scripts/check-skill-consistency.mjs'] },
    { label: 'validate-plugin-compatibility', command: 'node', args: ['scripts/validate-plugin-compatibility.mjs'] },
    { label: 'verify-portability-strict', command: 'node', args: ['scripts/verify-portability.mjs', '--strict', '--probe-mcp'] },
  ];
}

function defaultRunCommand(step, { offlineMode }) {
  console.log(`\n[setup-resilient] Running ${step.label}: ${step.command} ${step.args.join(' ')}`);
  return spawnSync(step.command, step.args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      OPENCODE_VERIFY_ENV_PROFILE: process.env.OPENCODE_VERIFY_ENV_PROFILE || 'none',
      OPENCODE_ENV_CONTRACT_STRICT: process.env.OPENCODE_ENV_CONTRACT_STRICT || '',
      OPENCODE_OFFLINE: offlineMode ? '1' : String(process.env.OPENCODE_OFFLINE || ''),
    },
  });
}

function runStep(step, { offlineMode, now, runCommand }) {
  const startedMs = now();
  let beforeFingerprint = null;
  if (Array.isArray(step.probePaths) && step.probePaths.length > 0) {
    beforeFingerprint = fingerprintPaths(step.probePaths);
  }

  const result = runCommand(step, { offlineMode });

  if (result.error) {
    return {
      label: step.label,
      status: 'failed',
      duration_seconds: Number(((now() - startedMs) / 1000).toFixed(3)),
      message: String(result.error.message || result.error),
    };
  }

  if (result.status !== 0) {
    return {
      label: step.label,
      status: 'failed',
      duration_seconds: Number(((now() - startedMs) / 1000).toFixed(3)),
      message: `exit code ${result.status}`,
    };
  }

  let status = 'success';
  if (beforeFingerprint !== null) {
    const afterFingerprint = fingerprintPaths(step.probePaths);
    if (beforeFingerprint === afterFingerprint) {
      status = 'skipped';
    }
  }

  return {
    label: step.label,
    status,
    duration_seconds: Number(((now() - startedMs) / 1000).toFixed(3)),
  };
}

function emitReport(report, reportFile = '') {
  const machineLine = JSON.stringify(report);
  console.log(`[setup-resilient] REPORT ${machineLine}`);
  if (reportFile) {
    writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[setup-resilient] Wrote report: ${reportFile}`);
  }
}

export function runSetup(options = {}) {
  const {
    offlineMode = false,
    allowGlobalWrites = false,
    runPreSetup = true,
    now = () => Date.now(),
    runCommand = defaultRunCommand,
    steps = buildSteps(offlineMode),
    reportFile = '',
  } = options;

  const startedMs = now();
  const report = {
    ok: true,
    duration_seconds: 0,
    steps: [],
    timestamp: new Date(startedMs).toISOString(),
  };

  if (runPreSetup) {
    loadEnvFile({ allowGlobalWrites });
    ensureShellOnWindows({ allowGlobalWrites });
    ensurePSExecutionPolicy({ allowGlobalWrites });
  }

  checkPrerequisites();

  for (const step of steps) {
    const stepResult = runStep(step, { offlineMode, now, runCommand });
    report.steps.push(stepResult);
    if (stepResult.status === 'failed') {
      report.ok = false;
      report.duration_seconds = Number(((now() - startedMs) / 1000).toFixed(3));
      emitReport(report, reportFile);
      throw new Error(`[setup-resilient] ${step.label} failed: ${stepResult.message || 'unknown error'}`);
    }
  }

  report.duration_seconds = Number(((now() - startedMs) / 1000).toFixed(3));
  emitReport(report, reportFile);
  console.log(`\n[setup-resilient] PASS: strict portability setup completed${offlineMode ? ' (offline mode)' : ''}.`);
  console.log('[setup-resilient] Hooks are opt-in. Run "bun run hooks:install" to enable git hooks.');
  return report;
}

function main() {
  const cliOptions = parseCliOptions();
  return runSetup(cliOptions);
}

const thisFilePath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(thisFilePath);
if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
