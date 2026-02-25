'use strict';

const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { SessionTracker } = require('./session-tracker');
const budgets = require('./budgets.json');

const DEFAULT_PERSIST_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.opencode',
  'session-budgets.json'
);

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
   */
  constructor(opts = {}) {
    this._persistPath = opts.persistPath || DEFAULT_PERSIST_PATH;
    this._tracker = new SessionTracker();
    this._learningEngine = opts.learningEngine || null;
    this._saveDebounceMs = opts.saveDebounceMs ?? 200;
    this._saveTimer = null;

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
  }

  /**
   * Set learning engine for budget pattern learning.
   * @param {object} learningEngine - Learning engine instance
   */
  setLearningEngine(learningEngine) {
    this._learningEngine = learningEngine;
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
      allowed = true; // allow but flag urgently
      message = `CRITICAL: Would reach ${(wouldPct * 100).toFixed(1)}% of budget (${wouldUse}/${config.maxTokens}). Consider wrapping up.`;
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
    * @private
    */
   _scheduleSave() {
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
     try {
       this.saveToFile(this._persistPath);
     } catch (err) {
       console.warn(`[Governor] Budget state save after reset failed (non-fatal): ${err.message}`);
     }
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
    let raw;
    try {
      raw = fs.readFileSync(p, 'utf-8');
    } catch {
      // File missing or unreadable — no persisted state to load.
      return;
    }
    if (!raw || !raw.trim()) return;
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.warn(`[Governor] Corrupt budget file at ${p} — resetting (${err.message})`);
      return;
    }
    this._tracker.loadState(data);
  }

  /**
   * Save tracker state to a JSON file.
   * Creates parent directories if needed.
   * @param {string} [filePath] – defaults to this._persistPath
   */
  async saveToFile(filePath) {
    const p = filePath || this._persistPath;
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
      await fsPromises.mkdir(dir, { recursive: true });
    }
    const data = this._tracker.toState();
    data.savedAt = new Date().toISOString();
    const tmpPath = `${p}.tmp`;
    await fsPromises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await fsPromises.rename(tmpPath, p);
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

module.exports = { Governor, SessionTracker };
