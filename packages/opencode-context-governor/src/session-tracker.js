'use strict';

const budgets = require('./budgets.json');

/**
 * Tracks token consumption per session per model.
 * Emits warnings at configurable thresholds.
 */
class SessionTracker {
  constructor() {
    /** @type {Map<string, Map<string, number>>} sessionId -> (model -> tokensUsed) */
    this._sessions = new Map();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Return the budget config for a model, falling back to defaults.
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
   * Ensure a session+model entry exists and return current usage.
   * @param {string} sessionId
   * @param {string} model
   * @returns {number} current token count
   */
  _ensureEntry(sessionId, model) {
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, new Map());
    }
    const modelMap = this._sessions.get(sessionId);
    if (!modelMap.has(model)) {
      modelMap.set(model, 0);
    }
    return modelMap.get(model);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Record token consumption for a session+model.
   *
   * @param {string} sessionId
   * @param {string} model
   * @param {number} count  – tokens consumed (must be > 0)
   * @returns {{ used: number, remaining: number, pct: number, status: 'ok'|'warn'|'error'|'exceeded' }}
   */
  consumeTokens(sessionId, model, count) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('sessionId must be a non-empty string');
    }
    if (!model || typeof model !== 'string') {
      throw new Error('model must be a non-empty string');
    }
    if (typeof count !== 'number' || count <= 0) {
      throw new Error('count must be a positive number');
    }

    const config = this._getModelConfig(model);
    const current = this._ensureEntry(sessionId, model);
    const updated = current + count;

    this._sessions.get(sessionId).set(model, updated);

    const pct = updated / config.maxTokens;
    const remaining = Math.max(0, config.maxTokens - updated);

    let status = 'ok';
    if (updated >= config.maxTokens) {
      status = 'exceeded';
    } else if (pct >= config.errorThreshold) {
      status = 'error';
    } else if (pct >= config.warnThreshold) {
      status = 'warn';
    }

    return { used: updated, remaining, pct: Math.round(pct * 10000) / 10000, status };
  }

  /**
   * Get remaining token budget for a session+model.
   *
   * @param {string} sessionId
   * @param {string} model
   * @returns {{ remaining: number, used: number, max: number, pct: number, status: 'ok'|'warn'|'error'|'exceeded' }}
   */
  getRemainingBudget(sessionId, model) {
    const config = this._getModelConfig(model);
    const used = this._ensureEntry(sessionId, model);
    const remaining = Math.max(0, config.maxTokens - used);
    const pct = used / config.maxTokens;

    let status = 'ok';
    if (used >= config.maxTokens) {
      status = 'exceeded';
    } else if (pct >= config.errorThreshold) {
      status = 'error';
    } else if (pct >= config.warnThreshold) {
      status = 'warn';
    }

    return { remaining, used, max: config.maxTokens, pct: Math.round(pct * 10000) / 10000, status };
  }

  /**
   * Get a summary of all tracked sessions.
   * @returns {Object<string, Object<string, { used: number, remaining: number, pct: number, status: string }>>}
   */
  getAllSessions() {
    const result = {};
    for (const [sessionId, modelMap] of this._sessions) {
      result[sessionId] = {};
      for (const [model] of modelMap) {
        result[sessionId][model] = this.getRemainingBudget(sessionId, model);
      }
    }
    return result;
  }

  /**
   * Reset token count for a specific session+model (or entire session).
   * @param {string} sessionId
   * @param {string} [model]  – if omitted, resets ALL models for this session
   */
  resetSession(sessionId, model) {
    if (!this._sessions.has(sessionId)) return;
    if (model) {
      const modelMap = this._sessions.get(sessionId);
      modelMap.delete(model);
      if (modelMap.size === 0) this._sessions.delete(sessionId);
    } else {
      this._sessions.delete(sessionId);
    }
  }

  /**
   * Hydrate tracker state from a plain object (loaded from disk).
   * @param {Object} data  – shape: { sessions: { [sid]: { [model]: number } } }
   */
  loadState(data) {
    this._sessions.clear();
    if (!data || !data.sessions) return;
    for (const [sid, models] of Object.entries(data.sessions)) {
      const map = new Map();
      for (const [model, used] of Object.entries(models)) {
        map.set(model, used);
      }
      this._sessions.set(sid, map);
    }
  }

  /**
   * Serialize tracker state to a plain object (for persistence).
   * @returns {{ sessions: Object<string, Object<string, number>> }}
   */
  toState() {
    const sessions = {};
    for (const [sid, modelMap] of this._sessions) {
      sessions[sid] = {};
      for (const [model, used] of modelMap) {
        sessions[sid][model] = used;
      }
    }
    return { sessions };
  }
}

module.exports = { SessionTracker };
