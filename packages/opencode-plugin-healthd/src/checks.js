'use strict';

const { execSync, execFile } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { safeJsonParse } = require('opencode-safe-io');

const OPENCODE_DIRNAME = '.opencode';

function resolveDataHome() {
  if (process.env.OPENCODE_DATA_HOME) return process.env.OPENCODE_DATA_HOME;
  if (process.env.XDG_DATA_HOME) return path.join(process.env.XDG_DATA_HOME, 'opencode');
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(homeDir, OPENCODE_DIRNAME);
}

// --- Configuration ---

const KNOWN_BAD_PLUGINS = [
  {
    name: 'opencode-token-monitor',
    reason: 'Causes Windows ENOENT errors; breaks plugin loader',
    severity: 'error',
  },
  {
    name: '@ccusage/opencode',
    reason: 'CLI hijack — intercepts opencode binary path',
    severity: 'error',
  },
];

const DEFAULT_MCPS = [
  'context7',
  'sequentialthinking',
  'websearch',
  'grep',
  'distill',
];

// --- Helpers ---

/**
 * Run a shell command and return stdout, or null on failure.
 * @param {string} cmd
 * @param {number} [timeoutMs=15000]
 * @returns {string|null}
 */
function execQuiet(cmd, timeoutMs = 15000) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch {
    return null;
  }
}

/**
 * Parse `npm list -g --depth=0 --json` into a package-name → version map.
 * @returns {Map<string, string[]>} name → [version, ...]
 */
function getGlobalPackages() {
  const raw = execQuiet('npm list -g --depth=0 --json');
  if (!raw) return new Map();

  try {
    const parsed = JSON.parse(raw);
    const deps = parsed.dependencies || {};
    const map = new Map();
    for (const [name, info] of Object.entries(deps)) {
      const version = (info && info.version) || 'unknown';
      if (map.has(name)) {
        map.get(name).push(version);
      } else {
        map.set(name, [version]);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

// --- Check Functions ---

/**
 * Scan globally-installed npm packages for:
 *   1. Known-bad plugins
 *   2. Duplicate package names (multiple versions)
 *
 * @returns {{ status: 'ok'|'warn'|'error', issues: Array<{type: string, severity: string, message: string}> }}
 */
function checkPlugins() {
  const issues = [];
  const packages = getGlobalPackages();

  // Check known-bad plugins
  for (const bad of KNOWN_BAD_PLUGINS) {
    if (packages.has(bad.name)) {
      issues.push({
        type: 'known-bad-plugin',
        severity: bad.severity,
        package: bad.name,
        message: `${bad.name} is installed globally — ${bad.reason}`,
      });
    }
  }

  // Check for duplicates (npm list -g --depth=0 rarely shows dupes at top level,
  // but we also scan the actual node_modules for symlink collisions)
  const globalRoot = execQuiet('npm root -g');
  if (globalRoot) {
    const rootDir = globalRoot.trim();
    try {
      const entries = fs.readdirSync(rootDir, { withFileTypes: true });
      const seen = new Map(); // base-name → full paths

      for (const entry of entries) {
        // Handle scoped packages (@scope/name)
        if (entry.name.startsWith('@') && entry.isDirectory()) {
          const scopeDir = path.join(rootDir, entry.name);
          try {
            const scopedEntries = fs.readdirSync(scopeDir);
            for (const sub of scopedEntries) {
              const fullName = `${entry.name}/${sub}`;
              if (seen.has(fullName)) {
                seen.get(fullName).count++;
              } else {
                seen.set(fullName, { count: 1 });
              }
            }
          } catch { /* ignore unreadable scope dirs */ }
        } else {
          if (seen.has(entry.name)) {
            seen.get(entry.name).count++;
          } else {
            seen.set(entry.name, { count: 1 });
          }
        }
      }

      for (const [name, info] of seen) {
        if (info.count > 1) {
          issues.push({
            type: 'duplicate-plugin',
            severity: 'warn',
            package: name,
            message: `${name} appears ${info.count} times in global node_modules`,
          });
        }
      }
    } catch { /* global root unreadable */ }
  }

  const hasError = issues.some((i) => i.severity === 'error');
  const hasWarn = issues.some((i) => i.severity === 'warn');

  return {
    status: hasError ? 'error' : hasWarn ? 'warn' : 'ok',
    issues,
  };
}

/**
 * Determine if an MCP server is a local binary (requires PATH check)
 * vs. a remote URL server (no local binary needed).
 *
 * @param {Object} serverConfig - MCP server configuration object
 * @returns {boolean} true if local binary, false if remote
 */
function isLocalBinaryServer(serverConfig) {
  if (!serverConfig || typeof serverConfig !== 'object') {
    return false;
  }

  // Remote URL servers have 'url' or 'endpoint' properties
  if (serverConfig.url || serverConfig.endpoint) {
    return false;
  }

  // Local binary servers have 'command' property
  if (serverConfig.command) {
    return true;
  }

  // Default: assume local if unclear
  return true;
}

/**
 * Verify MCP tools are reachable by checking if their commands exist.
 * On Windows we try `where <cmd>`, on POSIX `which <cmd>`.
 * Respects the 'enabled' flag in config and skips remote URL servers.
 *
 * @param {string[]} [mcpList] - MCP names to check (defaults to DEFAULT_MCPS)
 * @param {Object} [mcpConfig] - MCP server configuration from config file
 * @returns {{ status: 'ok'|'warn'|'error', issues: Array<{type: string, severity: string, message: string}> }}
 */
function checkMCPs(mcpList, mcpConfig) {
  const mcps = mcpList || DEFAULT_MCPS;
  const issues = [];
  const isWindows = os.platform() === 'win32';
  const whichCmd = isWindows ? 'where' : 'which';

  for (const mcp of mcps) {
    // Check if MCP is disabled in config
    if (mcpConfig && mcpConfig[mcp]) {
      const serverConfig = mcpConfig[mcp];
      
      // Skip disabled MCPs
      if (serverConfig.enabled === false) {
        continue;
      }

      // Skip remote URL servers (they don't need local binaries)
      if (!isLocalBinaryServer(serverConfig)) {
        continue;
      }
    }

    // Strategy 1: Check if command exists on PATH
    const found = execQuiet(`${whichCmd} ${mcp}`);

    if (!found || found.trim().length === 0) {
      // Strategy 2: Try --help / --version (some MCPs are Node scripts)
      const helpResult = execQuiet(`${mcp} --help`, 5000);
      const versionResult = helpResult ? helpResult : execQuiet(`${mcp} --version`, 5000);

      if (!versionResult) {
        issues.push({
          type: 'mcp-unavailable',
          severity: 'warn',
          mcp,
          message: `MCP "${mcp}" not found on PATH and does not respond to --help/--version`,
        });
      }
    }
  }

  // Also check for OpenCode MCP config file
  const opencodeDir = resolveDataHome();
  const mcpConfigPaths = [
    path.join(opencodeDir, 'mcp.json'),
    path.join(opencodeDir, 'config', 'mcp.json'),
  ];

  let mcpConfigFound = false;
  let loadedMcpConfig = mcpConfig || {};

  for (const configPath of mcpConfigPaths) {
    if (fs.existsSync(configPath)) {
      mcpConfigFound = true;
      try {
        const config = safeJsonParse(fs.readFileSync(configPath, 'utf8'), null, 'healthd-mcp-config');
        if (!config) throw new Error('Invalid JSON in MCP config');
        const configuredMcps = Object.keys(config.mcpServers || config.servers || {});
        
        // Count enabled MCPs (respect 'enabled' flag)
        const enabledMcps = configuredMcps.filter((name) => {
          const serverConfig = (config.mcpServers || config.servers || {})[name];
          return serverConfig && serverConfig.enabled !== false;
        });

        if (configuredMcps.length === 0) {
          issues.push({
            type: 'mcp-config-empty',
            severity: 'warn',
            message: `MCP config at ${configPath} has no servers defined`,
          });
        } else if (enabledMcps.length === 0) {
          issues.push({
            type: 'mcp-config-all-disabled',
            severity: 'warn',
            message: `MCP config at ${configPath} has ${configuredMcps.length} server(s) but all are disabled`,
          });
        }

        // Store config for later use
        loadedMcpConfig = config.mcpServers || config.servers || {};
      } catch {
        issues.push({
          type: 'mcp-config-invalid',
          severity: 'warn',
          message: `MCP config at ${configPath} is not valid JSON`,
        });
      }
      break;
    }
  }

  if (!mcpConfigFound) {
    issues.push({
      type: 'mcp-config-missing',
      severity: 'warn',
      message: 'No MCP config file found in ~/.opencode/',
    });
  }

  const hasError = issues.some((i) => i.severity === 'error');
  const hasWarn = issues.some((i) => i.severity === 'warn');

  return {
    status: hasError ? 'error' : hasWarn ? 'warn' : 'ok',
    issues,
  };
}

/**
 * Load MCP configuration from config files.
 * Searches in standard OpenCode config locations.
 *
 * @returns {Object|null} MCP server configuration or null if not found
 */
function loadMcpConfig() {
  const opencodeDir = resolveDataHome();
  const configPaths = [
    path.join(opencodeDir, 'mcp.json'),
    path.join(opencodeDir, 'config', 'mcp.json'),
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const config = safeJsonParse(fs.readFileSync(configPath, 'utf8'), null, 'healthd-load-mcp-config');
        if (config) {
          return config.mcpServers || config.servers || null;
        }
      } catch {
        // Continue to next path if parse fails
      }
    }
  }

  return null;
}

/**
 * Run all health checks and return combined results.
 *
 * @param {{ mcps?: string[] }} [options]
 * @returns {{ status: 'ok'|'warn'|'error', plugins: object, mcps: object, timestamp: string }}
 */
function runAllChecks(options = {}) {
  const pluginResult = checkPlugins();
  
  // Load MCP config to pass to checkMCPs
  const mcpConfig = loadMcpConfig();
  const mcpResult = checkMCPs(options.mcps, mcpConfig);

  // Worst-case status wins
  const statusPriority = { error: 3, warn: 2, ok: 1 };
  const worstStatus =
    statusPriority[pluginResult.status] >= statusPriority[mcpResult.status]
      ? pluginResult.status
      : mcpResult.status;

  return {
    status: worstStatus,
    plugins: pluginResult,
    mcps: mcpResult,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  checkPlugins,
  checkMCPs,
  runAllChecks,
  loadMcpConfig,
  isLocalBinaryServer,
  KNOWN_BAD_PLUGINS,
  DEFAULT_MCPS,
};
