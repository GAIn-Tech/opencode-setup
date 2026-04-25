'use strict';

const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { SessionTracker } = require('./session-tracker');
const budgets = require('./budgets.json');

const DEFAULT_PERSIST_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.opencode',
  'session-budgets.json'
);

// Debug instrumentation: trace all file I/O on session-budgets.json
const _DEBUG_IO = process.env.OPENCODE_GOVERNOR_DEBUG_IO === '1';
function _traceIO(op, detail) {
  if (!_DEBUG_IO) return;
  const ts = Date.now().toString(36);
  const pid = process.pid;
  console.log(`[Governor:IO] ${ts} pid=${pid} op=${op} ${detail}`);
}

/**
 * Governor — active token budget controller for OpenCode sessions.
 *
 * Wraps SessionTracker with budget-checking logic and file persistence.
 *
 * @example
 *   const { Governor } = require('opencode-context-governor');
 *   const gov = new Governor();
 *
 *   if (gov.checkBudget('ses_abc', 'anthropic/claude-opus-4-6', 5000)) {
 *     gov.consumeTokens('ses_abc', 'anthropic/claude-opus-4-6', 5000);
 *   }
 */
class Governor {
  /**
   * @param {object} [opts]
   * @param {string} [opts.persistPath] – path to save/load state (default: ~/.opencode/session-budgets.json)
   * @param {boolean} [opts.autoLoad] – load persisted state on construction (default: true)
   * @param {object} [opts.learningEngine] – learning engine instance for budget pattern learning
   * @param {'advisory'|'enforce-critical'} [opts.mode] – enforcement mode (default: 'advisory')
   *   - 'advisory': checkBudget() always returns allowed=true (except exceeded) — current behavior
   *   - 'enforce-critical': checkBudget() returns allowed=false when status is 'error' or 'exceeded'
   */
  constructor(opts = {}) {
    this._persistPath = opts.persistPath || DEFAULT_PERSIST_PATH;
    this._tracker = new SessionTracker();
    this._learningEngine = opts.learningEngine || null;
    this._saveDebounceMs = opts.saveDebounceMs ?? 200;
    this._saveTimer = null;
    this._mode = opts.mode || process.env.OPENCODE_BUDGET_MODE || 'enforce-critical';

    // Write serialization: prevents concurrent saveToFile() calls from racing
    this._saveInProgress = false;
    this._saveDirty = false; // set true when a save is requested while one is in progress

    // Callback for error threshold (80%) - enables automatic context compression
    this._onErrorThresholdCallbacks = [];
    if (typeof opts.onErrorThreshold === 'function') {
      this._onErrorThresholdCallbacks.push(opts.onErrorThreshold);
    }

    if (opts.autoLoad !== false) {
      try {
        this.loadFromFile(this._persistPath);
      } catch (err) {
        // No persisted state yet, or unreadable — that's fine.
        if (err.code !== 'ENOENT') {
          console.warn(`[Governor] Could not load persisted budget state: ${err.message}`);
        }
      }
    }

    // T13: Periodic stale session cleanup (every 1 hour, unref'd so it won't keep process alive)
    this._cleanupInterval = setInterval(() => {
      const removed = this._tracker.cleanupStaleSessions();
      if (removed > 0) {
        console.log(`[Governor] Cleaned up ${removed} stale session(s)`);
      }
    }, 60 * 60 * 1000); // 1 hour
    if (this._cleanupInterval.unref) {
      this._cleanupInterval.unref();
    }
  }

  /**
   * Get current enforcement mode.
   * @returns {'advisory'|'enforce-critical'}
   */
  getMode() {
    return this._mode;
  }

  /**
   * Set enforcement mode.
   * @param {'advisory'|'enforce-critical'} mode
   */
  setMode(mode) {
    if (mode !== 'advisory' && mode !== 'enforce-critical') {
      throw new Error(`Invalid budget mode: ${mode}. Must be 'advisory' or 'enforce-critical'.`);
    }
    this._mode = mode;
  }

  /**
   * Set learning engine for budget pattern learning.
   * @param {object} learningEngine - Learning engine instance
   */
  setLearningEngine(learningEngine) {
    this._learningEngine = learningEngine;
  }

  /**
   * Register callback for error threshold (80%) events.
   * Enables automatic context compression when budget is critical.
   * @param {Function} callback - Called with { sessionId, model, wouldPct, wouldUse, maxTokens }
   */
  onErrorThreshold(callback) {
    if (typeof callback === 'function') {
      this._onErrorThresholdCallbacks.push(callback);
    }
  }

  /**
   * Trigger all error threshold callbacks.
   * @private
   */
  _triggerErrorThreshold(sessionId, model, wouldPct, wouldUse, maxTokens) {
    for (const cb of this._onErrorThresholdCallbacks) {
      try {
        cb({ sessionId, model, wouldPct, wouldUse, maxTokens });
      } catch (e) {
        console.warn('[Governor] Error threshold callback failed:', e.message);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Core API
  // ---------------------------------------------------------------------------

  /**
   * Check whether a proposed token consumption fits within the budget.
   * Does NOT consume tokens — purely advisory.
   *
   * @param {string} sessionId
   * @param {string} model
   * @param {number} proposedTokens
   * @returns {{ allowed: boolean, status: 'ok'|'warn'|'error'|'exceeded', remaining: number, message: string }}
   */
  checkBudget(sessionId, model, proposedTokens) {
    const budget = this._tracker.getRemainingBudget(sessionId, model);
    const wouldUse = budget.used + proposedTokens;
    const config = this._getModelConfig(model);
    const wouldPct = wouldUse / config.maxTokens;

    let status = 'ok';
    let allowed = true;
    let message = '';

    if (wouldUse > config.maxTokens) {
      status = 'exceeded';
      allowed = false;
      message = `Budget exceeded: ${wouldUse}/${config.maxTokens} tokens (${(wouldPct * 100).toFixed(1)}%). Request denied.`;
} else if (wouldPct >= config.errorThreshold) {
    status = 'error';
    // In enforce-critical mode, block at error threshold
    allowed = this._mode !== 'enforce-critical';
    message = `CRITICAL: Would reach ${(wouldPct * 100).toFixed(1)}% of budget (${wouldUse}/${config.maxTokens}).${this._mode === 'enforce-critical' ? ' Request denied.' : ' Consider wrapping up.'}`;
    // Trigger error threshold callbacks for automatic context compression
    this._triggerErrorThreshold(sessionId, model, wouldPct, wouldUse, config.maxTokens);
  } else if (wouldPct >= config.warnThreshold) {
      status = 'warn';
      allowed = true;
      message = `WARNING: Would reach ${(wouldPct * 100).toFixed(1)}% of budget (${wouldUse}/${config.maxTokens}).`;
    } else {
      message = `OK: ${wouldUse}/${config.maxTokens} tokens (${(wouldPct * 100).toFixed(1)}%).`;
    }

    const urgencyMap = { ok: 0, warn: 1, error: 2, exceeded: 3 };
    return {
      allowed,
      status,
      urgency: urgencyMap[status] ?? 0,
      remaining: Math.max(0, config.maxTokens - wouldUse),
      message,
    };
  }

  /**
   * Record actual token consumption.
   *
   * @param {string} sessionId
   * @param {string} model
   * @param {number} count
   * @returns {{ used: number, remaining: number, pct: number, status: string }}
   */
   consumeTokens(sessionId, model, count) {
      const result = this._tracker.consumeTokens(sessionId, model, count);

      // Auto-persist after each consumption (debounced)
      this._scheduleSave();

      return result;
    }

  /**
   * Schedule a debounced save. Multiple calls within the debounce window
   * are coalesced into a single disk write.
   *
   * If a save is already in progress, marks _saveDirty so the current
   * save will trigger another round after it completes.
   * @private
   */
  _scheduleSave() {
    if (this._saveInProgress) {
      // A save is already running — mark dirty so it re-saves after completion
      this._saveDirty = true;
      _traceIO('scheduleSave', 'saveInProgress=true → marked dirty');
      return;
    }
    if (this._saveTimer) return; // already scheduled
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.saveToFile(this._persistPath).catch(err => {
        console.warn(`[Governor] Budget state save failed (non-fatal): ${err.message}`);
      });
    }, this._saveDebounceMs);
    if (this._saveTimer.unref) this._saveTimer.unref();
  }

   /**
    * Get remaining budget for a session+model.
   *
   * @param {string} sessionId
   * @param {string} model
   * @returns {{ remaining: number, used: number, max: number, pct: number, status: string }}
   */
  getRemainingBudget(sessionId, model) {
    return this._tracker.getRemainingBudget(sessionId, model);
  }

  /**
   * Get a summary of all sessions being tracked.
   * @returns {Object}
   */
  getAllSessions() {
    return this._tracker.getAllSessions();
  }

  /**
   * Reset a session (optionally for a specific model only).
   * @param {string} sessionId
   * @param {string} [model]
   */
  resetSession(sessionId, model) {
    this._tracker.resetSession(sessionId, model);
    // Use debounced save instead of direct saveToFile to prevent
    // concurrent write race (was: sync call to async saveToFile with no await)
    this._scheduleSave();
  }

  /**
   * Graceful shutdown - clears intervals and saves state.
   * Call this when shutting down the Governor to prevent memory leaks.
   */
  async shutdown() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    // Force save before shutdown — await it to ensure state is persisted
    try {
      await this.saveToFile(this._persistPath);
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /**
   * Load tracker state from a JSON file.
   * @param {string} [filePath] – defaults to this._persistPath
   */
  loadFromFile(filePath) {
    const p = filePath || this._persistPath;
    _traceIO('loadFromFile:start', `path=${p}`);
    let raw;
    try {
      raw = fs.readFileSync(p, 'utf-8');
    } catch {
      // File missing or unreadable — no persisted state to load.
      _traceIO('loadFromFile:missing', `path=${p}`);
      return;
    }
    if (!raw || !raw.trim()) {
      _traceIO('loadFromFile:empty', `path=${p} size=${raw.length}`);
      return;
    }
    let data;
    try {
      data = JSON.parse(raw);
      _traceIO('loadFromFile:ok', `path=${p} size=${raw.length} sessions=${Object.keys(data.sessions || {}).length}`);
    } catch (err) {
      // Corrupt file — rename it to preserve for debugging, then start fresh
      _traceIO('loadFromFile:corrupt', `path=${p} size=${raw.length} error=${err.message} rawStart=${JSON.stringify(raw.slice(0, 80))}`);
      const corruptPath = `${p}.corrupt.${Date.now()}`;
      try {
        fs.renameSync(p, corruptPath);
        console.warn(`[Governor] Corrupt budget file renamed to ${corruptPath}`);
      } catch {
        try { fs.unlinkSync(p); } catch {}
        console.warn(`[Governor] Could not rename corrupt file, deleted it`);
      }
      return;
    }
    this._tracker.loadState(data);
  }

  /**
   * Save tracker state to a JSON file.
   * Creates parent directories if needed.
   * Implements atomic write with integrity verification (AGENTS.md anti-pattern fix).
   *
   * WRITE SERIALIZATION: Only one saveToFile() may run at a time.
   * If called while a save is in progress, marks _saveDirty and returns.
   * The in-progress save will trigger another save after it completes.
   *
   * @param {string} [filePath] – defaults to this._persistPath
   */
  async saveToFile(filePath) {
    const p = filePath || this._persistPath;
    const saveId = crypto.randomBytes(4).toString('hex');

    // Write serialization: if a save is already running, mark dirty and return
    if (this._saveInProgress) {
      this._saveDirty = true;
      _traceIO('saveToFile:deferred', `saveId=${saveId} path=${p} (another save in progress, marked dirty)`);
      return;
    }
    this._saveInProgress = true;

    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) {
        await fsPromises.mkdir(dir, { recursive: true });
      }
      const data = this._tracker.toState();
      data.savedAt = new Date().toISOString();

      // Unique temp file per save — prevents path collision if concurrent calls slip through
      const tmpPath = `${p}.tmp-${saveId}`;
      const bakPath = `${p}.bak`;
      const jsonStr = JSON.stringify(data, null, 2);

      _traceIO('saveToFile:write:start', `saveId=${saveId} path=${p} tmpPath=${tmpPath} jsonLen=${jsonStr.length}`);

      // Atomic write: write to temp, rename over target
      await fsPromises.writeFile(tmpPath, jsonStr, 'utf-8');

      // AGENTS.md: "Atomic Write Verification" - verify integrity after write
      let verified = false;
      try {
        const verifiedData = JSON.parse(await fsPromises.readFile(tmpPath, 'utf-8'));
        if (verifiedData && verifiedData.savedAt === data.savedAt) {
          verified = true;
          _traceIO('saveToFile:verify:ok', `saveId=${saveId} tmpPath=${tmpPath}`);
        } else {
          _traceIO('saveToFile:verify:mismatch', `saveId=${saveId} savedAt=${data.savedAt} found=${verifiedData?.savedAt}`);
        }
      } catch (verifyErr) {
        _traceIO('saveToFile:verify:fail', `saveId=${saveId} error=${verifyErr.message}`);
        verified = false;
      }

      if (!verified) {
        // Temp file corrupt, try backup
        try {
          const bakData = JSON.parse(await fsPromises.readFile(bakPath, 'utf-8'));
          await fsPromises.writeFile(tmpPath, JSON.stringify(bakData, null, 2), 'utf-8');
          console.warn('[Governor] Temp file failed verification, restored from backup');
        } catch {
          // No valid backup either - write fresh minimal state
          const minimal = { sessions: {}, savedAt: new Date().toISOString(), _recovery: true };
          await fsPromises.writeFile(tmpPath, JSON.stringify(minimal, null, 2), 'utf-8');
          console.warn('[Governor] No valid backup, wrote recovery state');
        }
      }

      // Backup current file before overwriting
      try {
        const currentContent = await fsPromises.readFile(p, 'utf-8');
        await fsPromises.writeFile(bakPath, currentContent, 'utf-8');
      } catch {
        // No existing file or can't read - that's ok
      }

      await fsPromises.rename(tmpPath, p);
      _traceIO('saveToFile:rename:ok', `saveId=${saveId} path=${p}`);
    } catch (err) {
      _traceIO('saveToFile:error', `saveId=${saveId} path=${p} error=${err.message}`);
      // Clean up temp file if it exists
      try {
        const tmpGlob = `${p}.tmp-${saveId}`;
        await fsPromises.unlink(tmpGlob).catch(() => {});
      } catch {}
      throw err;
    } finally {
      this._saveInProgress = false;

      // If state changed during our save, schedule another one
      if (this._saveDirty) {
        this._saveDirty = false;
        _traceIO('saveToFile:dirty-resave', `saveId=${saveId} path=${p} (state changed during save, re-scheduling)`);
        this._scheduleSave();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Model config access
  // ---------------------------------------------------------------------------

  /**
   * Get model configuration (limits + thresholds).
   * @param {string} model
   * @returns {{ maxTokens: number, warnThreshold: number, errorThreshold: number }}
   */
  _getModelConfig(model) {
    const entry = budgets.models[model];
    if (entry) {
      return {
        maxTokens: entry.maxTokens,
        warnThreshold: entry.warnThreshold,
        errorThreshold: entry.errorThreshold,
      };
    }
    return { ...budgets.defaults };
  }

  /**
   * List all known model budgets.
   * @returns {Object}
   */
  static getModelBudgets() {
    return { ...budgets.models };
  }
}

module.exports = { Governor, SessionTracker, BUDGET_MODES: Object.freeze({ ADVISORY: 'advisory', ENFORCE_CRITICAL: 'enforce-critical' }) };
