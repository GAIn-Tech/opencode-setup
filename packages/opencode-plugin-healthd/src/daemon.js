#!/usr/bin/env node
'use strict';

const os = require('os');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { Healthd } = require('./index');

const OPENCODE_DIRNAME = '.opencode';

function resolveDataHome() {
  if (process.env.OPENCODE_DATA_HOME) return process.env.OPENCODE_DATA_HOME;
  if (process.env.XDG_DATA_HOME) return path.join(process.env.XDG_DATA_HOME, 'opencode');
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(homeDir, OPENCODE_DIRNAME);
}

// --- Constants ---

const CHECK_INTERVAL_MS = 300_000; // 5 minutes
const CHECK_TIMEOUT_MS = 30_000; // 30 seconds max per check
const OPENCODE_DIR = resolveDataHome();
const LOG_FILE = path.join(OPENCODE_DIR, 'healthd.log');
const PID_FILE = path.join(OPENCODE_DIR, 'healthd.pid');
const CRASH_LOG_FILE = path.join(OPENCODE_DIR, 'healthd-crashes.json');

// --- Ensure directories ---

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// --- Log Rotation ---

const MAX_LOG_SIZE_MB = 10;
const MAX_LOG_FILES = 5;

async function rotateLogsAsync() {
  try {
    const exists = await fsPromises.access(LOG_FILE).then(() => true).catch(() => false);
    if (!exists) return;

    const stats = await fsPromises.stat(LOG_FILE);
    const sizeMB = stats.size / (1024 * 1024);

    // Only rotate if exceeds max size
    if (sizeMB < MAX_LOG_SIZE_MB) return;

    // Rotate existing logs (healthd.log.4 -> healthd.log.5, healthd.log.3 -> healthd.log.4, etc.)
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const oldFile = `${LOG_FILE}.${i}`;
      const newFile = `${LOG_FILE}.${i + 1}`;
      
      const oldExists = await fsPromises.access(oldFile).then(() => true).catch(() => false);
      if (oldExists) {
        if (i === MAX_LOG_FILES - 1) {
          await fsPromises.unlink(oldFile); // Delete oldest
        } else {
          await fsPromises.rename(oldFile, newFile);
        }
      }
    }

    // Rotate current log to .1
    await fsPromises.rename(LOG_FILE, `${LOG_FILE}.1`);
  } catch (err) {
    process.stderr.write(`[ERROR] Log rotation failed: ${err.message}\n`);
  }
}

// Keep sync version for backward compatibility
function rotateLogs() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;

    const stats = fs.statSync(LOG_FILE);
    const sizeMB = stats.size / (1024 * 1024);

    if (sizeMB < MAX_LOG_SIZE_MB) return;

    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const oldFile = `${LOG_FILE}.${i}`;
      const newFile = `${LOG_FILE}.${i + 1}`;
      
      if (fs.existsSync(oldFile)) {
        if (i === MAX_LOG_FILES - 1) {
          fs.unlinkSync(oldFile);
        } else {
          fs.renameSync(oldFile, newFile);
        }
      }
    }

    fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch (err) {
    process.stderr.write(`[ERROR] Log rotation failed: ${err.message}\n`);
  }
}

// --- Logging ---

function log(level, message, data) {
  const ts = new Date().toISOString();
  const line = data
    ? `[${ts}] [${level.toUpperCase()}] ${message} ${JSON.stringify(data)}`
    : `[${ts}] [${level.toUpperCase()}] ${message}`;

  // Console output (synchronous - fast)
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }

  // File output - fire-and-forget async to avoid blocking event loop
  fsPromises.access(LOG_FILE).then(() => {
    // Check size and rotate if needed (async)
    return fsPromises.stat(LOG_FILE).then(stats => {
      const sizeMB = stats.size / (1024 * 1024);
      if (sizeMB >= MAX_LOG_SIZE_MB) {
        return rotateLogsAsync();
      }
    });
  }).then(() => {
    return fsPromises.appendFile(LOG_FILE, line + '\n', 'utf8');
  }).catch(err => {
    // If file doesn't exist, create it
    if (err.code === 'ENOENT') {
      return fsPromises.writeFile(LOG_FILE, line + '\n', 'utf8');
    }
    process.stderr.write(`[${ts}] [ERROR] Failed to write log: ${err.message}\n`);
  });
}

// --- PID management ---

function writePid() {
  try {
    fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
  } catch (err) {
    log('error', `Failed to write PID file: ${err.message}`);
  }
}

function removePid() {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
  } catch { /* best effort */ }
}

function checkExistingDaemon() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
      if (pid && !isNaN(pid)) {
        try {
          process.kill(pid, 0); // signal 0 = check if alive
          return pid; // still running
        } catch {
          // Process gone, stale PID file
          removePid();
          return null;
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}

// --- Timeout wrapper for health checks ---

function runCheckWithTimeout(healthd, timeoutMs = CHECK_TIMEOUT_MS) {
  let completed = false;
  
  const timeoutHandle = setTimeout(() => {
    if (!completed) {
      log('warn', `Health check exceeded timeout (${timeoutMs}ms), skipping this cycle`);
    }
  }, timeoutMs);
  
  try {
    healthd.runCheck();
    completed = true;
    clearTimeout(timeoutHandle);
  } catch (err) {
    completed = true;
    clearTimeout(timeoutHandle);
    throw err;
  }
}

// --- Crash logging ---

async function logCrashAsync(err) {
  try {
    let crashes = [];
    
    // Read existing crashes if file exists
    const exists = await fsPromises.access(CRASH_LOG_FILE).then(() => true).catch(() => false);
    if (exists) {
      try {
        const content = await fsPromises.readFile(CRASH_LOG_FILE, 'utf8');
        crashes = JSON.parse(content);
        if (!Array.isArray(crashes)) crashes = [];
      } catch {
        // If file is corrupted, start fresh
        crashes = [];
      }
    }
    
    // Add new crash entry
    crashes.push({
      timestamp: new Date().toISOString(),
      error: err.message,
      stack: err.stack,
    });
    
    // Keep only last 10 crashes
    if (crashes.length > 10) {
      crashes = crashes.slice(-10);
    }
    
    // Write back to file
    await fsPromises.writeFile(CRASH_LOG_FILE, JSON.stringify(crashes, null, 2), 'utf8');
  } catch (logErr) {
    // Crash logging failure should not crash the daemon
    process.stderr.write(`[ERROR] Failed to log crash: ${logErr.message}\n`);
  }
}

// Sync version for backward compatibility
function logCrash(err) {
  try {
    let crashes = [];
    
    if (fs.existsSync(CRASH_LOG_FILE)) {
      try {
        const content = fs.readFileSync(CRASH_LOG_FILE, 'utf8');
        crashes = JSON.parse(content);
        if (!Array.isArray(crashes)) crashes = [];
      } catch {
        crashes = [];
      }
    }
    
    crashes.push({
      timestamp: new Date().toISOString(),
      error: err.message,
      stack: err.stack,
    });
    
    if (crashes.length > 10) {
      crashes = crashes.slice(-10);
    }
    
    fs.writeFileSync(CRASH_LOG_FILE, JSON.stringify(crashes, null, 2), 'utf8');
  } catch (logErr) {
    process.stderr.write(`[ERROR] Failed to log crash: ${logErr.message}\n`);
  }
}

// --- Main daemon ---

function main() {
  ensureDir(OPENCODE_DIR);

  // Check if already running
  const existingPid = checkExistingDaemon();
  if (existingPid) {
    console.error(`healthd already running (pid ${existingPid}). Exiting.`);
    process.exit(1);
  }

  // Write PID
  writePid();

  log('info', `healthd started (pid ${process.pid}, interval ${CHECK_INTERVAL_MS / 1000}s)`);

  // Create Healthd instance
  const healthd = new Healthd();

  // Wire events to log
  healthd.on('check:start', () => {
    log('info', 'Running health checks...');
  });

  healthd.on('check:complete', (result) => {
    const issueCount =
      (result.plugins ? result.plugins.issues.length : 0) +
      (result.mcps ? result.mcps.issues.length : 0);

    if (result.status === 'ok') {
      log('info', `Health check passed (${issueCount} issues)`);
    } else {
      log('warn', `Health check result: ${result.status} (${issueCount} issues)`, {
        pluginIssues: result.plugins ? result.plugins.issues : [],
        mcpIssues: result.mcps ? result.mcps.issues : [],
      });
    }
  });

  healthd.on('state:change', ({ from, to, result }) => {
    log('info', `State changed: ${from} -> ${to}`);

    if (to === 'error') {
      log('error', 'Health status degraded to ERROR', {
        plugins: result.plugins ? result.plugins.issues : [],
        mcps: result.mcps ? result.mcps.issues : [],
      });
    } else if (to === 'ok' && from !== 'ok') {
      log('info', 'Health status recovered to OK');
    }
  });

  healthd.on('check:error', (err) => {
    log('error', `Health check threw: ${err.message}`);
  });

  // Run initial check immediately
  runCheckWithTimeout(healthd);

  // Set up interval
  const intervalId = setInterval(() => {
    runCheckWithTimeout(healthd);
  }, CHECK_INTERVAL_MS);

  // Prevent interval from keeping Node alive when we want to exit
  // (unref so only signals stop us, but we actually WANT it to keep alive)
  // intervalId.unref() — intentionally NOT calling this

  // --- Graceful shutdown ---

  let shuttingDown = false;

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;

    log('info', `Received ${signal}, shutting down...`);

    clearInterval(intervalId);
    removePid();

    log('info', 'healthd stopped');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));

  // Windows: handle Ctrl+C
  if (os.platform() === 'win32') {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin });
    rl.on('SIGINT', () => shutdown('SIGINT'));
  }

  // Uncaught exception handler — log and continue
  process.on('uncaughtException', (err) => {
    log('error', `Uncaught exception: ${err.message}`, { stack: err.stack });
    logCrash(err);
    // Don't exit — daemon should be resilient
  });

  process.on('unhandledRejection', (reason) => {
    log('error', `Unhandled rejection: ${reason}`);
  });
}

// --- Entry point ---

if (require.main === module) {
  main();
}

module.exports = { main, CHECK_INTERVAL_MS, CHECK_TIMEOUT_MS, LOG_FILE, PID_FILE, CRASH_LOG_FILE, runCheckWithTimeout, logCrash, logCrashAsync, rotateLogsAsync };
