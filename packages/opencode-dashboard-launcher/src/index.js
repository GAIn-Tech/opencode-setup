const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const { safeJsonParse } = require('opencode-safe-io');
const { whichSync } = require('which');

const OPENCODE_DIRNAME = '.opencode';

function resolveDataHome() {
  if (process.env.OPENCODE_DATA_HOME) return process.env.OPENCODE_DATA_HOME;
  if (process.env.XDG_DATA_HOME) return path.join(process.env.XDG_DATA_HOME, 'opencode');
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(homeDir, OPENCODE_DIRNAME);
}

/**
 * Check if a command exists before trying to spawn it
 * Prevents Bun segfaults from ENOENT
 * @param {string} command - Command or path to check
 * @returns {boolean} True if executable exists
 */
function commandExists(command) {
  // Guard against undefined/null/non-string command
  if (!command || typeof command !== "string") {
    return false;
  }
  // Check if it's a path
  if (command.includes('/') || command.includes('\\')) {
    return fs.existsSync(command);
  }
  
  // Check if it's in PATH using which
  try {
    return !!whichSync(command);
  } catch {
    return false;
  }
}

// Load config from file directly to avoid dependency issues
function loadConfig() {
  try {
    const configPath = path.join(__dirname, '..', '..', '..', '.opencode.config.json');
    if (fs.existsSync(configPath)) {
      return safeJsonParse(fs.readFileSync(configPath, 'utf8'), {}, 'dashboard-launcher-config');
    }
  } catch (err) {
    // Ignore errors, use defaults
  }
  return {};
}

function getConfigValue(path, defaultValue) {
  const config = loadConfig();
  const keys = path.split('.');
  let value = config;
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return defaultValue;
    }
  }
  return value;
}

const DATA_HOME = resolveDataHome();
const LOCK_FILE = path.join(DATA_HOME, 'dashboard.lock');
const LOG_FILE = path.join(DATA_HOME, 'dashboard.log');
const DASHBOARD_DIR = path.join(__dirname, '..', '..', 'opencode-dashboard');

/** Dashboard host - configurable via env var */
const DASHBOARD_HOST = process.env.OPENCODE_DASHBOARD_HOST || '127.0.0.1';

/** Timeout to kill browser-open process if it hangs (15s) */
const BROWSER_OPEN_TIMEOUT_MS = 15000;

/** Timeout to detect early dashboard crash on launch (30s) */
const DASHBOARD_LAUNCH_TIMEOUT_MS = 30000;

/**
 * Ensures ~/.opencode directory exists
 */
function ensureOpencodeDir() {
  const dir = DATA_HOME;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Reads the lock file to get dashboard process info
 * @returns {{pid: number, port: number, startedAt: string} | null}
 */
function readLock() {
  try {
    if (!fs.existsSync(LOCK_FILE)) return null;
    const content = fs.readFileSync(LOCK_FILE, 'utf8');
    return safeJsonParse(content, null, 'dashboard-launcher-lock');
  } catch (err) {
    return null;
  }
}

/**
 * Writes lock file with dashboard process info
 */
function writeLock(pid, port) {
  ensureOpencodeDir();
  const lock = {
    pid,
    port,
    startedAt: new Date().toISOString()
  };
  fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2));
}

/**
 * Removes lock file
 */
function removeLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (err) {
    // Ignore errors
  }
}

/**
 * Checks if a process is running
 */
function isProcessRunning(pid) {
  try {
    // Signal 0 checks existence without killing
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Checks if dashboard is already running
 * @returns {{running: boolean, pid?: number, port?: number}}
 */
function checkDashboard() {
  const lock = readLock();
  if (!lock) return { running: false };
  
  if (isProcessRunning(lock.pid)) {
    return { running: true, pid: lock.pid, port: lock.port };
  }
  
  // Process died, clean up stale lock
  removeLock();
  return { running: false };
}

/**
 * Opens dashboard in default browser
 */
function openBrowser(port) {
  const url = `http://${DASHBOARD_HOST}:${port}`;
  const autoOpen = getConfigValue('dashboard.autoOpen', true);
  
  if (!autoOpen) return;
  
  const isWindows = process.platform === 'win32';
  const command = isWindows
    ? 'cmd.exe'
    : (process.platform === 'darwin' ? 'open' : 'xdg-open');
  const args = isWindows
    ? ['/c', 'start', '', url]
    : [url];
  
  // Wait 2s for server to be ready
  setTimeout(() => {
    try {
      // Check if command exists before spawn to prevent ENOENT crash
      if (!commandExists(command)) {
        console.warn(`[DashboardLauncher] Command not found: ${command}. Skipping browser open.`);
        return;
      }
      
      const proc = spawn(command, args, {
        detached: true, 
        stdio: 'ignore',
        shell: false,
        windowsHide: isWindows,
      });
      // Kill browser-open process if it hangs beyond timeout
      const killTimer = setTimeout(() => {
        try { proc.kill(); } catch (e) { /* already exited */ }
      }, BROWSER_OPEN_TIMEOUT_MS);
      killTimer.unref();
      proc.unref();
    } catch (err) {
      console.error('Failed to open browser:', err.message);
    }
  }, 2000);
}

/**
 * Launches the dashboard as a detached background process
 * @returns {{pid: number, port: number}}
 */
function launchDashboard() {
  ensureOpencodeDir();
  
  const port = getConfigValue('dashboard.port', 3000);
  let nodeEnv = getConfigValue('dashboard.nodeEnv', 'production');
  const buildIdPath = path.join(DASHBOARD_DIR, '.next', 'BUILD_ID');
  const hasProductionBuild = fs.existsSync(buildIdPath);
  if (nodeEnv === 'production' && !hasProductionBuild) {
    nodeEnv = 'development';
  }
  
  // Use production build by default for performance
  // On Windows, use npm.cmd instead of npm
  const isWindows = process.platform === 'win32';
  const npmCmd = isWindows ? 'npm.cmd' : 'npm';
  const command = npmCmd;
  const args = nodeEnv === 'development' ? ['run', 'dev'] : ['start'];
  
  // Ensure log file exists before opening stream
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, '', { mode: 0o644 });
  }
  
  const outFd = fs.openSync(LOG_FILE, 'a');

  // Check if command exists before spawn to prevent ENOENT crash
  if (!commandExists(command)) {
    const error = `Command not found: ${command}. Cannot launch dashboard.`;
    console.error(`[DashboardLauncher] ${error}`);
    fs.closeSync(outFd);
    throw new Error(error);
  }

  const child = spawn(command, args, {
    cwd: DASHBOARD_DIR,
    detached: true,
    shell: isWindows,
    stdio: ['ignore', outFd, outFd],
    env: {
      ...process.env,
      PORT: port.toString(),
      NODE_ENV: nodeEnv
    }
  });

  fs.closeSync(outFd);

  // Detect early crash: if process exits within DASHBOARD_LAUNCH_TIMEOUT_MS, log it
  const crashTimer = setTimeout(() => {
    // Process survived the startup window - all good
  }, DASHBOARD_LAUNCH_TIMEOUT_MS);
  crashTimer.unref();
  child.on('exit', (code) => {
    clearTimeout(crashTimer);
    if (code !== null && code !== 0) {
      fs.appendFileSync(
        LOG_FILE,
        `\n[${new Date().toISOString()}] Dashboard crashed on startup (exit code: ${code}) within ${DASHBOARD_LAUNCH_TIMEOUT_MS}ms\n`
      );
      removeLock();
    }
  });

  child.unref();
  
  writeLock(child.pid, port);
  
  fs.appendFileSync(
    LOG_FILE,
    `\n[${new Date().toISOString()}] Dashboard launched - PID: ${child.pid}, Port: ${port}, NODE_ENV: ${nodeEnv}\n`
  );
  
  return { pid: child.pid, port };
}

/**
 * Ensures dashboard is running (launches if needed)
 * @param {boolean} openInBrowser - Whether to open browser
 * @returns {{launched: boolean, pid: number, port: number}}
 */
function ensureDashboard(openInBrowser = true) {
  const status = checkDashboard();
  
  if (status.running) {
    if (openInBrowser) {
      openBrowser(status.port);
    }
    return { launched: false, pid: status.pid, port: status.port };
  }
  
  const { pid, port } = launchDashboard();
  
  if (openInBrowser) {
    openBrowser(port);
  }
  
  return { launched: true, pid, port };
}

/**
 * Stops the dashboard
 */
function stopDashboard() {
  const status = checkDashboard();
  
  if (!status.running) {
    return { stopped: false, reason: 'not_running' };
  }
  
  try {
    process.kill(status.pid, 'SIGTERM');
    removeLock();
    return { stopped: true, pid: status.pid };
  } catch (err) {
    removeLock();
    return { stopped: false, reason: 'kill_failed', error: err.message };
  }
}

module.exports = {
  ensureDashboard,
  checkDashboard,
  stopDashboard,
  launchDashboard,
  // Health-check integration
  createHealthCheck,
  // MCP server interface
  startServer,
  // Configuration constants
  DASHBOARD_HOST,
  // Timeout constants (for testing)
  BROWSER_OPEN_TIMEOUT_MS,
  DASHBOARD_LAUNCH_TIMEOUT_MS
};

// MCP server interface for auto-start with OpenCode sessions
async function startServer() {
  console.log('Initializing OpenCode Dashboard Launcher...');
  
  // Ensure dashboard is running (don't open browser from MCP)
  const result = ensureDashboard(false);
  
  if (result.launched) {
    console.log(`✓ Dashboard launched on port ${result.port}`);
  } else {
    console.log(`✓ Dashboard already running on port ${result.port}`);
  }
  
  // Keep server running
  return {
    port: result.port,
    pid: result.pid
  };
}

/**
 * Creates a health check function for the dashboard
 * @param {Object} healthCheck - Optional health-check package instance
 * @returns {Function} Health check function
 */
function createHealthCheck(healthCheck) {
  return async () => {
    const status = checkDashboard();
    
    if (!status.running) {
      return {
        healthy: false,
        status: 'stopped',
        message: 'Dashboard not running'
      };
    }
    
    return {
      healthy: true,
      status: 'running',
      pid: status.pid,
      port: status.port
    };
  };
}
