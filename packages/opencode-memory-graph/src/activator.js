'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Default state file location: ~/.opencode/graph-memory-state.json
 */
const DEFAULT_STATE_PATH = path.join(os.homedir(), '.opencode', 'graph-memory-state.json');

/**
 * GraphActivator — controls whether graph-memory collection is active.
 *
 * OFF by default. When activated, auto-triggers backfill from historical
 * session logs and enables persistence to goraphdb for future buildGraph() calls.
 *
 * State is persisted to ~/.opencode/graph-memory-state.json so activation
 * survives process restarts.
 */
class GraphActivator {
  /**
   * @param {object} [opts]
   * @param {string} [opts.statePath]     Override state file location.
   * @param {object} [opts.backfillEngine] BackfillEngine instance for retroactive import.
   * @param {object} [opts.bridge]         GoraphdbBridge instance (optional).
   */
  constructor(opts = {}) {
    this._statePath = opts.statePath || DEFAULT_STATE_PATH;
    this._backfillEngine = opts.backfillEngine || null;
    this._bridge = opts.bridge || null;
    this._state = this._loadState();
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Activate graph-memory collection for current and future sessions.
   * Automatically triggers backfill from historical OpenCode logs if a
   * BackfillEngine is configured.
   *
   * @param {object} [opts]
   * @param {string} [opts.logsDir]  Override logs directory for backfill.
   * @param {boolean} [opts.skipBackfill]  Skip automatic backfill on activation.
   * @returns {Promise<{ activated: boolean, backfill: object|null }>}
   */
  async activate(opts = {}) {
    const logsDir = opts.logsDir || path.join(os.homedir(), '.opencode', 'messages');
    const skipBackfill = opts.skipBackfill || false;

    this._state.active = true;
    this._state.activated_at = new Date().toISOString();

    let backfillResult = null;

    if (!skipBackfill && this._backfillEngine) {
      try {
        backfillResult = await this._backfillEngine.backfillFromLogs(logsDir);
        this._state.last_backfill = new Date().toISOString();
        this._state.sessions_tracked = backfillResult.sessions_processed || 0;
      } catch (err) {
        backfillResult = { error: err.message, sessions_processed: 0, errors_found: 0, edges_created: 0 };
      }
    }

    this._saveState();
    return { activated: true, backfill: backfillResult };
  }

  /**
   * Deactivate graph-memory collection.
   * Existing data persists in goraphdb — only stops future collection.
   *
   * @returns {{ deactivated: boolean }}
   */
  deactivate() {
    this._state.active = false;
    this._state.deactivated_at = new Date().toISOString();
    this._saveState();
    return { deactivated: true };
  }

  /**
   * Check whether graph-memory collection is currently active.
   * @returns {boolean}
   */
  isActive() {
    return this._state.active === true;
  }

  /**
   * Get full activation status with metadata.
   * @returns {{ active: boolean, sessions_tracked: number, last_backfill: string|null }}
   */
  status() {
    return {
      active: this._state.active === true,
      sessions_tracked: this._state.sessions_tracked || 0,
      last_backfill: this._state.last_backfill || null,
    };
  }

  /**
   * Get the raw persisted state object.
   * @returns {object}
   */
  getState() {
    return { ...this._state };
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  /**
   * Load state from disk. Returns default (inactive) state if file missing.
   * @private
   * @returns {object}
   */
  _loadState() {
    try {
      if (fs.existsSync(this._statePath)) {
        const raw = fs.readFileSync(this._statePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (_err) {
      // Corrupted state file — reset to default
    }
    return { active: false, sessions_tracked: 0, last_backfill: null };
  }

  /**
   * Persist state to disk. Creates parent directory if needed.
   * @private
   */
  _saveState() {
    try {
      const dir = path.dirname(this._statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tempPath = `${this._statePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this._state, null, 2), 'utf-8');
      fs.renameSync(tempPath, this._statePath);
    } catch (_err) {
      // Silently fail — state is still in memory for current process
    }
  }
}

module.exports = { GraphActivator, DEFAULT_STATE_PATH };
