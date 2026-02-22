#!/usr/bin/env node
/**
 * resolve-root.mjs — Portable root directory resolution for opencode-setup
 * 
 * Resolution order:
 *   1. OPENCODE_ROOT env var (explicit override)
 *   2. Git repository root (works from any subdirectory)
 *   3. Walk up from this script's directory looking for package.json with workspaces
 *   4. Current working directory (last resort)
 * 
 * Usage:
 *   import { resolveRoot, resolvePath } from './resolve-root.mjs';
 *   const root = resolveRoot();
 *   const mcpConfig = resolvePath('mcp-servers/opencode-mcp-config.json');
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let _cachedRoot = null;

/**
 * Resolve the opencode-setup monorepo root directory.
 * Throws with actionable message if root cannot be determined.
 */
export function resolveRoot() {
  if (_cachedRoot) return _cachedRoot;

  // 1. Explicit env var (highest priority — allows CI/Docker overrides)
  if (process.env.OPENCODE_ROOT) {
    const envRoot = resolve(process.env.OPENCODE_ROOT);
    if (existsSync(join(envRoot, 'package.json'))) {
      _cachedRoot = envRoot;
      return _cachedRoot;
    }
    console.warn(
      `[resolve-root] OPENCODE_ROOT="${process.env.OPENCODE_ROOT}" set but no package.json found there. Falling back.`
    );
  }

  // 2. Git repo root (works from any subdirectory within the repo)
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (gitRoot && existsSync(join(gitRoot, 'package.json'))) {
      _cachedRoot = resolve(gitRoot);
      return _cachedRoot;
    }
  } catch {
    // Not in a git repo (CI containers, downloaded archives) — continue
  }

  // 3. Walk up from script directory looking for monorepo root
  //    (identified by package.json with "workspaces" field)
  let dir = __dirname;
  const root = (process.platform === 'win32') ? dir.split('\\')[0] + '\\' : '/';
  while (dir !== root) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.workspaces) {
          _cachedRoot = dir;
          return _cachedRoot;
        }
      } catch {
        // Malformed package.json — continue walking
      }
    }
    dir = dirname(dir);
  }

  // 4. Last resort: current working directory
  const cwdPkg = join(process.cwd(), 'package.json');
  if (existsSync(cwdPkg)) {
    console.warn(
      '[resolve-root] Could not find monorepo root via env/git/walk-up. Using cwd as fallback.'
    );
    _cachedRoot = process.cwd();
    return _cachedRoot;
  }

  // Nothing worked — fail with actionable message
  throw new Error(
    `[resolve-root] Cannot determine opencode-setup root directory.\n` +
    `Tried:\n` +
    `  1. OPENCODE_ROOT env var: ${process.env.OPENCODE_ROOT || '(not set)'}\n` +
    `  2. git rev-parse --show-toplevel: (failed or not in git repo)\n` +
    `  3. Walk up from ${__dirname}: (no package.json with workspaces found)\n` +
    `  4. Current directory ${process.cwd()}: (no package.json found)\n\n` +
    `Fix: Set OPENCODE_ROOT=/path/to/opencode-setup or run from within the repo.`
  );
}

/**
 * Resolve a path relative to the monorepo root.
 * @param {string} relativePath - Path relative to repo root (e.g., 'packages/opencode-foo/src')
 * @returns {string} Absolute resolved path
 */
export function resolvePath(...relativeParts) {
  return join(resolveRoot(), ...relativeParts);
}

/**
 * Get the packages directory.
 */
export function packagesDir() {
  return resolvePath('packages');
}

/**
 * Get the scripts directory.
 */
export function scriptsDir() {
  return resolvePath('scripts');
}

/**
 * Get the config directory (repo-local templates).
 */
export function configDir() {
  return resolvePath('opencode-config');
}

/**
 * Get the user's opencode config directory (~/.config/opencode).
 * Respects XDG_CONFIG_HOME on Linux, APPDATA on Windows.
 */
export function userConfigDir() {
  if (process.env.OPENCODE_CONFIG_HOME) {
    return resolve(process.env.OPENCODE_CONFIG_HOME);
  }
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(process.env.USERPROFILE || homedir(), 'AppData', 'Roaming'), 'opencode');
  }
  // XDG_CONFIG_HOME or default ~/.config/opencode
  return join(process.env.XDG_CONFIG_HOME || join(process.env.HOME || homedir(), '.config'), 'opencode');
}

/**
 * Get the user's opencode data directory (~/.opencode).
 * Respects XDG_DATA_HOME on Linux.
 */
export function userDataDir() {
  if (process.env.OPENCODE_DATA_HOME) {
    return resolve(process.env.OPENCODE_DATA_HOME);
  }
  return join(process.env.HOME || process.env.USERPROFILE || homedir(), '.opencode');
}

/**
 * Load the .env file from the repo root if it exists.
 * Returns an object of key-value pairs (does NOT modify process.env).
 */
export function loadDotenv() {
  const envPath = resolvePath('.env');
  if (!existsSync(envPath)) return {};
  
  const entries = {};
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

// When run directly, print the resolved root
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  try {
    const root = resolveRoot();
    console.log(root);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
