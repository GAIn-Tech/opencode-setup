#!/usr/bin/env node
'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { Healthd } = require('./index');

// --- Constants ---

const CHECK_INTERVAL_MS = 300_000; // 5 minutes
const OPENCODE_DIR = path.join(os.homedir(), '.opencode');
const LOG_FILE = path.join(OPENCODE_DIR, 'healthd.log');
const PID_FILE = path.join(OPENCODE_DIR, 'healthd.pid');

// --- Ensure directories ---

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// --- Logging ---

function log(level, message, data) {
  const ts = new Date().toISOString();
  const line = data
    ? `[${ts}] [${level.toUpperCase()}] ${message} ${JSON.stringify(data)}`
    : `[${ts}] [${level.toUpperCase()}] ${message}`;

  // Console output
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }

  // File output (append)
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(`[${ts}] [ERROR] Failed to write log: ${err.message}\n`);
  }
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
  healthd.runCheck();

  // Set up interval
  const intervalId = setInterval(() => {
    healthd.runCheck();
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

module.exports = { main, CHECK_INTERVAL_MS, LOG_FILE, PID_FILE };
