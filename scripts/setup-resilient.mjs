#!/usr/bin/env node

import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Pre-setup: load .env into process environment and persist to OS
// ---------------------------------------------------------------------------
function loadEnvFile() {
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

  // On Windows, persist to user environment so opencode picks them up at runtime
  if (process.platform === 'win32') {
    console.log('[setup-resilient]   Persisting to Windows user environment...');
    for (const name of vars) {
      try {
        // Use setx for simplicity and to avoid PowerShell quoting issues
        execFileSync('setx', [name, process.env[name]], { stdio: 'pipe' });
      } catch {
        console.warn(`[setup-resilient]   WARNING: Could not persist ${name}`);
      }
    }
    console.log(`[setup-resilient]   Persisted ${vars.length} variable(s).`);
  }
}

// ---------------------------------------------------------------------------
// Pre-setup: ensure SHELL is set on Windows (opencode needs bash, not cmd.exe)
// ---------------------------------------------------------------------------
function ensureShellOnWindows() {
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
function ensurePSExecutionPolicy() {
  if (process.platform !== 'win32') return;

  try {
    const policy = execFileSync('powershell', [
      '-NoProfile', '-Command', 'Get-ExecutionPolicy -Scope CurrentUser',
    ], { stdio: 'pipe', encoding: 'utf-8' }).trim();

    if (policy === 'Restricted' || policy === 'Undefined') {
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

  // Check Node.js (needed for npx-based MCPs)
  try {
    const nodeResult = spawnSync('node', ['--version'], { stdio: 'pipe' });
    if (nodeResult.status !== 0) {
      missing.push('Node.js (for npx - required for sequentialthinking, websearch, distill MCPs)');
    }
  } catch {
    missing.push('Node.js (for npx - required for sequentialthinking, websearch, distill MCPs)');
  }

  // Check uv (needed for uvx-based MCPs)
  try {
    const uvResult = spawnSync('uvx', ['--version'], { stdio: 'pipe' });
    if (uvResult.status !== 0) {
      // Try alternate locations on Windows
      const altUv = process.platform === 'win32' 
        ? spawnSync('C:\\Users\\' + (process.env.USERNAME || 'user') + '\\.local\\bin\\uvx.exe', ['--version'], { stdio: 'pipe' })
        : null;
      if (!altUv || altUv.status !== 0) {
        missing.push('uv (for uvx - required for grep MCP; install via: pip install uv)');
      }
    }
  } catch {
    missing.push('uv (for uvx - required for grep MCP; install via: pip install uv)');
  }

  // Check WSL2 on Windows (needed for Docker Desktop)
  if (process.platform === 'win32') {
    try {
      const wslResult = spawnSync('wsl', ['--list', '--verbose'], { stdio: 'pipe', encoding: 'utf-8' });
      if (wslResult.status !== 0 || !wslResult.stdout.includes('Ubuntu')) {
        warnings.push('WSL2 (Ubuntu) - required for Docker Desktop; run: wsl --install');
      }
    } catch {
      warnings.push('WSL2 (Ubuntu) - required for Docker Desktop; run: wsl --install');
    }
  }

  // Report
  if (missing.length > 0) {
    console.log('\n[setup-resilient] ⚠️  Missing prerequisites (MCPs may not work):');
    for (const m of missing) {
      console.log(`   - ${m}`);
    }
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

const steps = [
  { label: 'preflight-versions', command: 'node', args: ['scripts/preflight-versions.mjs'] },
  { label: 'bun-install', command: 'bun', args: ['install'] },
  { label: 'link-all', command: 'bun', args: ['run', 'link-all'] },
  { label: 'hooks-install', command: 'bun', args: ['run', 'hooks:install'] },
  { label: 'copy-config', command: 'bun', args: ['run', 'copy-config'] },
  { label: 'generate-mcp-config', command: 'bun', args: ['run', 'generate'] },
  { label: 'verify-setup', command: 'node', args: ['scripts/verify-setup.mjs'] },
  { label: 'validate-plugin-compatibility', command: 'node', args: ['scripts/validate-plugin-compatibility.mjs'] },
  { label: 'verify-portability-strict', command: 'node', args: ['scripts/verify-portability.mjs', '--strict'] },
];

function runStep(step) {
  console.log(`\n[setup-resilient] Running ${step.label}: ${step.command} ${step.args.join(' ')}`);
  const result = spawnSync(step.command, step.args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      OPENCODE_VERIFY_ENV_PROFILE: process.env.OPENCODE_VERIFY_ENV_PROFILE || 'none',
      OPENCODE_ENV_CONTRACT_STRICT: process.env.OPENCODE_ENV_CONTRACT_STRICT || '',
    },
  });

  if (result.error) {
    throw new Error(`[setup-resilient] ${step.label} failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`[setup-resilient] ${step.label} failed with exit code ${result.status}`);
  }
}

function main() {
  loadEnvFile();
  ensureShellOnWindows();
  ensurePSExecutionPolicy();
  checkPrerequisites();

  for (const step of steps) {
    runStep(step);
  }
  console.log('\n[setup-resilient] PASS: strict portability setup completed.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
