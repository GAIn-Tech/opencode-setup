'use strict';

/**
 * Graceful shutdown manager for OpenCode.
 * 
 * Registers cleanup handlers for:
 * - Intervals (setInterval)
 * - Timers (setTimeout)
 * - Open connections/databases
 * - Process exit handlers
 * 
 * Usage:
 *   const shutdown = require('@jackoatmon/opencode-crash-guard/shutdown');
 *   
 *   // Register an interval to be cleaned up
 *   const intervalId = setInterval(() => doWork(), 5000);
 *   shutdown.registerInterval(intervalId, 'walCheckpoint');
 *   
 *   // Register cleanup function
 *   shutdown.registerCleanup('database', async () => {
 *     await db.close();
 *   });
 *   
 *   // Initialize shutdown handlers
 *   shutdown.init();
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Singleton instance
let _instance = null;

// Registered intervals and timers
const _intervals = new Map();
const _timeouts = new Map();
const _cleanups = new Map();
let _initialized = false;

/**
 * Get singleton instance
 */
function getInstance() {
  if (!_instance) {
    _instance = new ShutdownManager();
  }
  return _instance;
}

class ShutdownManager {
  constructor() {
    this._intervals = new Map();
    this._timeouts = new Map();
    this._cleanups = new Map();
    this._shuttingDown = false;
  }

  /**
   * Register an interval for automatic cleanup
   */
  registerInterval(intervalId, name) {
    if (!intervalId) {
      console.warn('[Shutdown] Attempted to register invalid interval:', name);
      return;
    }
    this._intervals.set(name, {
      id: intervalId,
      type: 'interval',
      registeredAt: Date.now()
    });
  }

  /**
   * Register a timeout for automatic cleanup
   */
  registerTimeout(timeoutId, name) {
    if (!timeoutId) {
      console.warn('[Shutdown] Attempted to register invalid timeout:', name);
      return;
    }
    this._timeouts.set(name, {
      id: timeoutId,
      type: 'timeout',
      registeredAt: Date.now()
    });
  }

  /**
   * Register a cleanup function
   */
  registerCleanup(name, cleanupFn, priority = 0) {
    if (typeof cleanupFn !== 'function') {
      console.warn('[Shutdown] Attempted to register non-function cleanup:', name);
      return;
    }
    this._cleanups.set(name, {
      fn: cleanupFn,
      priority, // Higher priority runs first during shutdown
      registeredAt: Date.now()
    });
  }

  /**
   * Unregister an interval
   */
  unregisterInterval(name) {
    const entry = this._intervals.get(name);
    if (entry) {
      clearInterval(entry.id);
      this._intervals.delete(name);
    }
  }

  /**
   * Unregister a timeout
   */
  unregisterTimeout(name) {
    const entry = this._timeouts.get(name);
    if (entry) {
      clearTimeout(entry.id);
      this._timeouts.delete(name);
    }
  }

  /**
   * Unregister a cleanup
   */
  unregisterCleanup(name) {
    this._cleanups.delete(name);
  }

  /**
   * Get status of all registered resources
   */
  getStatus() {
    return {
      intervals: Array.from(this._intervals.keys()),
      timeouts: Array.from(this._timeouts.keys()),
      cleanups: Array.from(this._cleanups.keys()),
      shuttingDown: this._shuttingDown
    };
  }

  /**
   * Perform graceful shutdown
   */
  async shutdown(exitCode = 0) {
    if (this._shuttingDown) {
      console.warn('[Shutdown] Already shutting down...');
      return;
    }
    this._shuttingDown = true;

    console.log('[Shutdown] Starting graceful shutdown...');

    // 1. Clear all intervals first (stop new work)
    console.log('[Shutdown] Clearing', this._intervals.size, 'intervals...');
    for (const [name, entry] of this._intervals) {
      try {
        clearInterval(entry.id);
      } catch (e) {
        console.warn('[Shutdown] Failed to clear interval:', name, e.message);
      }
    }
    this._intervals.clear();

    // 2. Clear timeouts
    console.log('[Shutdown] Clearing', this._timeouts.size, 'timeouts...');
    for (const [name, entry] of this._timeouts) {
      try {
        clearTimeout(entry.id);
      } catch (e) {
        console.warn('[Shutdown] Failed to clear timeout:', name, e.message);
      }
    }
    this._timeouts.clear();

    // 3. Run cleanup functions (sorted by priority, highest first)
    const cleanupEntries = Array.from(this._cleanups.entries())
      .sort((a, b) => b[1].priority - a[1].priority);

    console.log('[Shutdown] Running', cleanupEntries.length, 'cleanup handlers...');
    for (const [name, entry] of cleanupEntries) {
      try {
        console.log('[Shutdown] Running cleanup:', name);
        const result = entry.fn();
        if (result && typeof result.then === 'function') {
          await result;
        }
      } catch (e) {
        console.error('[Shutdown] Cleanup failed:', name, e.message);
      }
    }
    this._cleanups.clear();

    console.log('[Shutdown] Graceful shutdown complete.');

    // Exit with code
    process.exit(exitCode);
  }
}

/**
 * Initialize shutdown handlers (call once at app startup)
 */
function init() {
  if (_initialized) return;
  _initialized = true;

  const instance = getInstance();

  // Handle various termination signals
  const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  
  signals.forEach(signal => {
    process.on(signal, () => {
      console.log('[Shutdown] Received', signal);
      instance.shutdown(0);
    });
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    console.error('[Shutdown] Uncaught exception:', err);
    instance.shutdown(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Shutdown] Unhandled rejection:', reason);
  });

  console.log('[Shutdown] Initialized');
}

/**
 * Register interval for cleanup
 */
function registerInterval(intervalId, name) {
  getInstance().registerInterval(intervalId, name);
}

/**
 * Register timeout for cleanup
 */
function registerTimeout(timeoutId, name) {
  getInstance().registerTimeout(timeoutId, name);
}

/**
 * Register cleanup function
 */
function registerCleanup(name, cleanupFn, priority = 0) {
  getInstance().registerCleanup(name, cleanupFn, priority);
}

/**
 * Get shutdown status
 */
function getStatus() {
  return getInstance().getStatus();
}

/**
 * Perform graceful shutdown (for manual invocation)
 */
async function shutdown(exitCode = 0) {
  await getInstance().shutdown(exitCode);
}

module.exports = {
  init,
  registerInterval,
  registerTimeout,
  registerCleanup,
  getStatus,
  shutdown,
  getInstance
};
