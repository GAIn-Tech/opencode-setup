'use strict';

const { EventEmitter } = require('events');
const { checkPlugins, checkMCPs, runAllChecks, KNOWN_BAD_PLUGINS, DEFAULT_MCPS } = require('./checks');

/**
 * Healthd — Health checker for OpenCode plugins and MCPs.
 *
 * Extends EventEmitter. Use as a library or let daemon.js run it on an interval.
 *
 * Events:
 *   'check:start'      — emitted before each check cycle
 *   'check:complete'    — emitted after check, payload: { status, plugins, mcps, timestamp }
 *   'check:error'       — emitted if check throws, payload: Error
 *   'state:change'      — emitted when status transitions, payload: { from, to, result }
 */
class Healthd extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {string[]} [options.mcps] - MCP names to check (defaults to DEFAULT_MCPS)
   */
  constructor(options = {}) {
    super();
    this._mcps = options.mcps || undefined; // undefined → use defaults in checks.js
    this._lastStatus = null;
    this._lastResult = null;
    this._checkCount = 0;
  }

  /**
   * Current health status (null if no check has run yet).
   * @returns {'ok'|'warn'|'error'|null}
   */
  get status() {
    return this._lastStatus;
  }

  /**
   * Last check result object.
   * @returns {object|null}
   */
  get lastResult() {
    return this._lastResult;
  }

  /**
   * Total number of checks performed.
   * @returns {number}
   */
  get checkCount() {
    return this._checkCount;
  }

  /**
   * Run a single health check cycle.
   * Emits 'check:start', then 'check:complete' or 'check:error'.
   * Emits 'state:change' if status transitions.
   *
   * @returns {{ status: string, plugins: object, mcps: object, timestamp: string }}
   */
  runCheck() {
    this.emit('check:start');

    let result;
    try {
      result = runAllChecks({ mcps: this._mcps });
    } catch (err) {
      this.emit('check:error', err);
      return null;
    }

    this._checkCount++;
    const prevStatus = this._lastStatus;
    this._lastStatus = result.status;
    this._lastResult = result;

    this.emit('check:complete', result);

    // Emit state change if status transitioned
    if (prevStatus !== null && prevStatus !== result.status) {
      this.emit('state:change', {
        from: prevStatus,
        to: result.status,
        result,
      });
    }

    return result;
  }

  /**
   * Run only plugin checks.
   * @returns {{ status: string, issues: Array }}
   */
  checkPlugins() {
    return checkPlugins();
  }

  /**
   * Run only MCP checks.
   * @param {string[]} [mcpList]
   * @returns {{ status: string, issues: Array }}
   */
  checkMCPs(mcpList) {
    return checkMCPs(mcpList || this._mcps);
  }
}

module.exports = { Healthd, KNOWN_BAD_PLUGINS, DEFAULT_MCPS };
