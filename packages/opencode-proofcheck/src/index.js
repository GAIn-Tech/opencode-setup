'use strict';

const {
  checkGitStatus,
  checkTests,
  checkLint,
  checkSecurity,
  checkBranchSync,
} = require('./checks');
const EventEmitter = require('events');

/**
 * Proofcheck — pluginized deployment gate.
 *
 * Runs a suite of checks to verify code is safe to commit/push.
 * Gate logic: (git clean) AND (tests pass) AND (lint pass) = safe
 *
 * @example
 *   const pc = new Proofcheck({ cwd: '/my/project' });
 *   const result = await pc.verify();
 *   if (!result.allPassed) process.exit(1);
 */
class Proofcheck extends EventEmitter {
  /**
   * @param {object} config
   * @param {string}  [config.cwd=process.cwd()]  - Project root
   * @param {boolean} [config.force=false]         - Bypass gate (user takes risk)
   * @param {string[]} [config.skip=[]]            - Check names to skip
   * @param {number}  [config.timeout=120000]      - Max ms per check
   * @param {boolean} [config.verbose=false]       - Show check details on pass
   * @param {object}  [config.checks]              - Custom check overrides/plugins
   */
  constructor(config = {}) {
    super();
    this.cwd = config.cwd || process.cwd();
    this.force = config.force || false;
    this.skip = new Set((config.skip || []).map((s) => s.toLowerCase()));
    this.timeout = config.timeout || 120_000;
    this.verbose = config.verbose || false;
    this.hooks = {};

    // Default checks — can be overridden or extended via config.checks
    this.checks = {
      gitStatus: checkGitStatus,
      tests: checkTests,
      lint: checkLint,
      security: checkSecurity,
      branchSync: checkBranchSync,
      ...(config.checks || {}),
    };

    if (config.hooks && typeof config.hooks === 'object') {
      for (const [hookName, handlers] of Object.entries(config.hooks)) {
        if (Array.isArray(handlers)) {
          for (const handler of handlers) {
            this.registerHook(hookName, handler);
          }
        } else {
          this.registerHook(hookName, handlers);
        }
      }
    }
  }

  /**
   * Register extension hook handler.
   * @param {string} hookName
   * @param {(payload: any) => void} fn
   */
  registerHook(hookName, fn) {
    if (typeof fn !== 'function') {
      throw new TypeError(`Hook "${hookName}" must be a function`);
    }
    if (!this.hooks[hookName]) {
      this.hooks[hookName] = [];
    }
    this.hooks[hookName].push(fn);
  }

  /**
   * Unregister extension hook handler.
   * @param {string} hookName
   * @param {(payload: any) => void} fn
   */
  unregisterHook(hookName, fn) {
    if (!this.hooks[hookName]) return;
    this.hooks[hookName] = this.hooks[hookName].filter((handler) => handler !== fn);
    if (this.hooks[hookName].length === 0) {
      delete this.hooks[hookName];
    }
  }

  /**
   * Emit EventEmitter event and registered hook callbacks.
   * @param {string} hookName
   * @param {any} payload
   */
  _emitHook(hookName, payload) {
    this.emit(hookName, payload);

    if (!this.hooks[hookName]) return;

    for (const fn of this.hooks[hookName]) {
      try {
        fn(payload);
      } catch (err) {
        this.emit('hook:error', { hook: hookName, payload, error: err });
      }
    }
  }

  /**
   * Register a custom check plugin.
   * @param {string} name - Check name
   * @param {function} fn - Check function: (opts) => {passed, message, details?}
   */
  addCheck(name, fn) {
    if (typeof fn !== 'function') {
      throw new TypeError(`Check "${name}" must be a function`);
    }
    this.checks[name] = fn;
    this._emitHook('onGateRegistered', { gate: name, fn });
  }

  /**
   * Register gate alias for addCheck().
   * @param {string} name
   * @param {function} fn
   */
  registerGate(name, fn) {
    this.addCheck(name, fn);
  }

  /**
   * Remove a check.
   * @param {string} name - Check name
   */
  removeCheck(name) {
    delete this.checks[name];
    this._emitHook('onGateRemoved', { gate: name });
  }

  /**
   * Run all registered checks.
   * @returns {Promise<{allPassed: boolean, forced: boolean, results: Object<string, {passed: boolean, message: string, details?: string}>}>}
   */
  async verify() {
    const results = {};
    const opts = { cwd: this.cwd, timeout: this.timeout };
    this._emitHook('verifyStarted', { cwd: this.cwd, check_count: Object.keys(this.checks).length });

    for (const [name, checkFn] of Object.entries(this.checks)) {
      if (this.skip.has(name.toLowerCase())) {
        results[name] = { passed: true, message: `Skipped (--skip ${name})`, skipped: true };
        this._emitHook('onEvidenceCaptured', { gate: name, result: results[name] });
        continue;
      }

      try {
        const result = checkFn(opts);
        results[name] = result;
        this._emitHook('onEvidenceCaptured', { gate: name, result });
      } catch (err) {
        results[name] = {
          passed: false,
          message: `Check crashed: ${err.message}`,
          details: err.stack,
        };
        this._emitHook('onEvidenceCaptured', { gate: name, result: results[name] });
      }
    }

    const allPassed = Object.values(results).every((r) => r.passed);
    this._emitHook('verifyCompleted', { allPassed, results });

    return {
      allPassed: this.force ? true : allPassed,
      forced: this.force && !allPassed,
      results,
    };
  }

  /**
   * Comprehensive gate check before commit/push.
   * Runs critical checks: git status clean + tests pass + lint pass.
   *
   * @param {string} [branch] - Branch name for context (informational)
   * @returns {Promise<{safe: boolean, forced: boolean, branch: string|null, results: object, summary: string}>}
   */
  async gateDeployment(branch = null) {
    const result = await this.verify();

    const failed = Object.entries(result.results)
      .filter(([, r]) => !r.passed)
      .map(([name, r]) => `  [FAIL] ${name}: ${r.message}`);

    const passed = Object.entries(result.results)
      .filter(([, r]) => r.passed)
      .map(([name, r]) => `  [PASS] ${name}: ${r.message}`);

    const lines = [...passed, ...failed];
    const divider = '─'.repeat(50);

    let summary = `\n${divider}\n  PROOFCHECK GATE${branch ? ` (${branch})` : ''}\n${divider}\n`;
    summary += lines.join('\n');
    summary += `\n${divider}\n`;

    if (result.forced) {
      summary += '  RESULT: FORCED PASS (--force) — user takes risk\n';
    } else if (result.allPassed) {
      summary += '  RESULT: ALL CLEAR — safe to commit/push\n';
    } else {
      summary += `  RESULT: BLOCKED — ${failed.length} check(s) failed\n`;
      summary += '  Tip: fix issues above, or use --force to bypass\n';
    }
    summary += divider;

    return {
      safe: result.allPassed,
      forced: result.forced,
      branch,
      results: result.results,
      summary,
    };
  }

  /**
   * Quick pass/fail for scripting. Returns exit code: 0 = pass, 1 = fail.
   * @returns {Promise<number>}
   */
  async exitCode() {
    const result = await this.verify();
    return result.allPassed ? 0 : 1;
  }
}

module.exports = { Proofcheck };
