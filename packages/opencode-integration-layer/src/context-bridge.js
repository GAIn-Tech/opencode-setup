'use strict';

/**
 * ContextBridge — advisory bridge between context-governor and distill compression.
 *
 * Evaluates the current session's token budget and returns an advisory signal
 * indicating whether context compression should be triggered.
 *
 * This class does NOT perform compression itself — it returns signals that the
 * caller (or UI layer) can act on. Distill/DCP remain optional; this bridge
 * is purely informational.
 *
 * Thresholds (from Governor):
 *   >=80% → compress_urgent (CRITICAL — wrap up or compress immediately)
 *   >=65% → compress      (WARNING — proactive compression recommended)
 *   <65%  → none          (budget is healthy)
 *
 * @example
 *   const bridge = new ContextBridge({ governor, logger });
 *   const signal = bridge.evaluateAndCompress('ses_abc', 'anthropic/claude-opus-4-6');
 *   // { action: 'compress', reason: 'Budget at 72% — proactive compression recommended', pct: 0.72 }
 */
class ContextBridge {
  /**
   * @param {object} opts
   * @param {object} [opts.governor]  – Governor instance (from opencode-context-governor)
   * @param {object} [opts.logger]    – structured logger ({ info, warn, error })
   * @param {number} [opts.urgentThreshold=0.80] – % at which action becomes 'compress_urgent'
   * @param {number} [opts.warnThreshold=0.65]   – % at which action becomes 'compress'
   */
  constructor(opts = {}) {
    this._governor = opts.governor || null;
    this._logger = opts.logger || {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
    this._urgentThreshold = opts.urgentThreshold ?? 0.80;
    this._warnThreshold = opts.warnThreshold ?? 0.65;
  }

  /**
   * Evaluate the current session/model budget and return a compression advisory.
   *
   * @param {string} sessionId
   * @param {string} model
   * @returns {{ action: 'compress_urgent'|'compress'|'none', reason: string, pct: number }}
   */
  evaluateAndCompress(sessionId, model) {
    if (!this._governor) {
      return { action: 'none', reason: 'Governor not available — no budget data', pct: 0 };
    }

    try {
      const budget = this._governor.getRemainingBudget(sessionId, model);
      if (!budget || typeof budget.pct !== 'number') {
        return { action: 'none', reason: 'No budget data for session/model', pct: 0 };
      }

      const pct = budget.pct; // 0..1 fraction used

      if (pct >= this._urgentThreshold) {
        const reason = `Budget at ${(pct * 100).toFixed(1)}% — CRITICAL: compress immediately or wrap up`;
        this._logger.error('[ContextBridge] compress_urgent', { sessionId, model, pct });
        return { action: 'compress_urgent', reason, pct };
      }

      if (pct >= this._warnThreshold) {
        const reason = `Budget at ${(pct * 100).toFixed(1)}% — proactive compression recommended`;
        this._logger.warn('[ContextBridge] compress advisory', { sessionId, model, pct });
        return { action: 'compress', reason, pct };
      }

      return { action: 'none', reason: `Budget healthy at ${(pct * 100).toFixed(1)}%`, pct };
    } catch (err) {
      this._logger.warn('[ContextBridge] evaluateAndCompress failed (fail-open)', { error: err.message });
      return { action: 'none', reason: `Evaluation error: ${err.message}`, pct: 0 };
    }
  }
}

module.exports = { ContextBridge };
