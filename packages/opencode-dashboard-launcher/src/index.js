const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

// Load config from file directly to avoid dependency issues
function loadConfig() {
  try {
    const configPath = path.join(__dirname, '..', '..', '..', '.opencode.config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
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

const LOCK_FILE = path.join(os.homedir(), '.opencode', 'dashboard.lock');
const LOG_FILE = path.join(os.homedir(), '.opencode', 'dashboard.log');
const DASHBOARD_DIR = path.join(__dirname, '..', '..', 'opencode-dashboard');

/**
 * Ensures ~/.opencode directory exists
 */
function ensureOpencodeDir() {
  const dir = path.join(os.homedir(), '.opencode');
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
    return JSON.parse(content);
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
  const url = `http://127.0.0.1:${port}`;
  const autoOpen = getConfigValue('dashboard.autoOpen', true);
  
  if (!autoOpen) return;
  
  const command = process.platform === 'win32' ? 'start' :
                  process.platform === 'darwin' ? 'open' : 'xdg-open';
  
  // Wait 2s for server to be ready
  setTimeout(() => {
    try {
      spawn(command, [url], { 
        detached: true, 
        stdio: 'ignore',
        shell: true 
      }).unref();
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
  startServer
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
