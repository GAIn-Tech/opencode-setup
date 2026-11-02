'use strict';

/**
 * ContextBridge — mandatory enforcement bridge between context-governor and distill compression.
 *
 * Evaluates the current session's token budget and returns enforcement actions
 * with mandatory veto mechanisms when context budget exceeds thresholds.
 *
 * VISION-inspired fail-closed pattern: Advisory → Mandatory conversion with enforcement.
 *
 * Thresholds (from Governor):
 *   >=80% → compress_urgent (CRITICAL — enforcement mandatory, operations blocked)
 *   >=65% → compress      (WARNING — proactive compression required)
 *   <65%  → none          (budget is healthy)
 *
 * @example
 *   const bridge = new ContextBridge({ governor, logger, securityVeto });
 *   const enforcement = bridge.evaluateAndEnforce('ses_abc', 'anthropic/claude-opus-4-6');
 *   // { action: 'compress', reason: 'Budget at 72% — proactive compression required', pct: 0.72, veto: null }
 *   // OR { action: 'block', reason: 'Budget at 85% — operations blocked', pct: 0.85, veto: {...} }
 */
class ContextBridge {
  /**
   * @param {object} opts
   * @param {object} [opts.governor]  – Governor instance (from opencode-context-governor)
   * @param {object} [opts.logger]    – structured logger ({ info, warn, error })
   * @param {object} [opts.securityVeto] – SecurityVeto instance (from opencode-validator)
   * @param {number} [opts.urgentThreshold=0.80] – % at which action becomes 'compress_urgent'
   * @param {number} [opts.warnThreshold=0.65]   – % at which action becomes 'compress'
   * @param {number} [opts.blockThreshold=0.85]  – % at which operations are blocked
   * @param {boolean} [opts.enforcementEnabled=true] – Enable mandatory enforcement
   */
  constructor(opts = {}) {
    this._governor = opts.governor || null;
    this._securityVeto = opts.securityVeto || null;
    this._logger = opts.logger || {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
    this._urgentThreshold = opts.urgentThreshold ?? 0.80;
    this._warnThreshold = opts.warnThreshold ?? 0.65;
    this._blockThreshold = opts.blockThreshold ?? 0.85;
    this._enforcementEnabled = opts.enforcementEnabled !== false;
    
    // Compression callback - called when action is 'compress' or 'compress_urgent'
    this._onCompress = typeof opts.onCompress === 'function' ? opts.onCompress : null;
    
    this._auditTrail = [];
    this._maxAuditTrail = this._normalizePositiveInteger(opts.maxAuditTrail, 10000);
    this._trimTo = Math.min(this._maxAuditTrail, this._normalizePositiveInteger(opts.trimTo, Math.max(1, Math.floor(this._maxAuditTrail * 0.9))));

    this._operationMetadata = new WeakMap();
    this._operationRefs = new Map();
    this._maxOperationRefs = this._normalizePositiveInteger(opts.maxOperationRefs, 512);
    
    // Veto policies for context budget enforcement
    this._vetoPolicies = [
      {
        id: 'context-budget-exhausted',
        description: 'Context budget exhausted - operations blocked to prevent overflow',
        threshold: this._blockThreshold,
        action: 'BLOCK',
        severity: 'CRITICAL',
        gracePeriodMs: 24 * 60 * 60 * 1000, // 24 hours grace period
      },
      {
        id: 'context-budget-critical',
        description: 'Context budget critical - compression required',
        threshold: this._urgentThreshold,
        action: 'COMPRESS_URGENT',
        severity: 'HIGH',
        gracePeriodMs: 2 * 60 * 60 * 1000, // 2 hours grace period
      }
    ];
  }

  /**
   * Evaluate the current session/model budget and return enforcement actions.
   * VISION fail-closed pattern: Advisory → Mandatory with veto mechanisms.
   *
   * @param {string} sessionId
   * @param {string} model
   * @param {Object} [context] Additional context for veto evaluation
   * @returns {{ action: 'block'|'compress_urgent'|'compress'|'none', reason: string, pct: number, veto: object|null }}
   */
  evaluateAndEnforce(sessionId, model, context = {}) {
    const validationError = this._validateSessionAndModel(sessionId, model);
    if (validationError) {
      return {
        action: 'block',
        reason: validationError,
        pct: 0,
        veto: { error: validationError, failClosed: true, code: 'INVALID_INPUT' },
      };
    }

    if (!this._governor) {
      return { action: 'none', reason: 'Governor not available — no budget data', pct: 0, veto: null };
    }

    try {
      const budget = this._governor.getRemainingBudget(sessionId, model);
      if (!budget || typeof budget.pct !== 'number') {
        return { action: 'none', reason: 'No budget data for session/model', pct: 0, veto: null };
      }

      const pct = budget.pct; // 0..1 fraction used
      if (!Number.isFinite(pct) || pct < 0 || pct > 1) {
        const reason = `Invalid budget percentage: ${String(pct)} (expected 0..1)`;
        this._logger.warn('[ContextBridge] invalid budget percentage (fail-closed)', {
          sessionId,
          model,
          pct,
        });
        return { action: 'block', reason, pct: 0, veto: { error: reason, failClosed: true, code: 'INVALID_BUDGET_PCT' } };
      }

      const normalizedContext = this._normalizeContext(context);
      const operation = {
        type: 'context_management',
        details: {
          sessionId,
          model,
          budgetUsed: pct,
          remainingBudget: 1 - pct,
          timestamp: Date.now(),
        },
        context: {
          ...normalizedContext,
          source: 'context-bridge'
        }
      };
      this._trackOperation(operation);

      // Check for mandatory block conditions (VISION fail-closed)
      if (this._enforcementEnabled && pct >= this._blockThreshold) {
        const vetoResult = this._applyBudgetVeto('context-budget-exhausted', operation, pct);
        const reason = `Budget at ${(pct * 100).toFixed(1)}% — OPERATIONS BLOCKED to prevent context overflow`;
        this._logger.error('[ContextBridge] budget exhausted - BLOCKED', { sessionId, model, pct, vetoResult });
        return { action: 'block', reason, pct, veto: vetoResult };
      }

// Check for mandatory compression conditions
  if (this._enforcementEnabled && pct >= this._urgentThreshold) {
    const vetoResult = this._applyBudgetVeto('context-budget-critical', operation, pct);
    const reason = `Budget at ${(pct * 100).toFixed(1)}% — COMPRESSION MANDATORY within grace period`;
    this._logger.error('[ContextBridge] budget critical - compress_urgent', { sessionId, model, pct, vetoResult });
    // Trigger compression callback
    if (this._onCompress) {
      this._onCompress({ action: 'compress_urgent', sessionId, model, pct, reason });
    }
    return { action: 'compress_urgent', reason, pct, veto: vetoResult };
  }

  // Proactive compression advisory (convertible to mandatory with enforcement flag)
  if (pct >= this._warnThreshold) {
    const reason = `Budget at ${(pct * 100).toFixed(1)}% — proactive compression ${this._enforcementEnabled ? 'required' : 'recommended'}`;
    const severity = this._enforcementEnabled ? 'warn' : 'info';
    this._logger[severity]('[ContextBridge] compression advisory', { sessionId, model, pct });
    // Trigger compression callback
    if (this._onCompress) {
      this._onCompress({ action: 'compress', sessionId, model, pct, reason });
    }
    return { action: 'compress', reason, pct, veto: null };
  }

      return { action: 'none', reason: `Budget healthy at ${(pct * 100).toFixed(1)}%`, pct, veto: null };
    } catch (err) {
      this._logger.warn('[ContextBridge] evaluateAndEnforce failed (fail-closed)', { error: err.message });
      // Fail-closed: if we can't evaluate, assume worst-case and block
      return { action: 'block', reason: `Evaluation error: ${err.message}`, pct: 0, veto: { error: err.message, failClosed: true } };
    }
  }

  /**
   * Apply budget veto based on policy (VISION fail-closed pattern)
   * @private
   */
  _applyBudgetVeto(policyId, operation, budgetPct) {
    const policy = this._vetoPolicies.find(p => p.id === policyId);
    if (!policy) {
      return null;
    }

    const vetoId = `${policyId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const operationId = this._generateOperationId(operation);
    const vetoResult = {
      vetoId,
      policyId: policy.id,
      description: policy.description,
      action: policy.action,
      severity: policy.severity,
      threshold: policy.threshold,
      actualPct: budgetPct,
      timestamp: Date.now(),
      operationId,
      gracePeriodMs: policy.gracePeriodMs,
      overrideAvailable: policy.gracePeriodMs > 0,
    };
    this._registerOperationRef(vetoId, operation);

    // Record in audit trail
    this._appendAuditEntry({
      type: 'VETO_APPLIED',
      vetoId,
      policyId: policy.id,
      budgetPct,
      timestamp: Date.now(),
      sessionId: operation.details.sessionId,
      model: operation.details.model,
    });

    // If SecurityVeto is available, delegate enforcement
    if (this._securityVeto) {
      try {
        const safeDetails = this._sanitizeForAudit(operation.details);
        const securityVetoResult = this._securityVeto.evaluate({
          type: 'context_budget_violation',
          details: {
            ...safeDetails,
            vetoId,
            policyId: policy.id,
          }
        });
        
        // Merge veto results
        vetoResult.securityVeto = securityVetoResult;
      } catch (err) {
        this._logger.warn('[ContextBridge] SecurityVeto delegation failed', { error: err.message });
      }
    }

    return vetoResult;
  }

  /**
   * Generate operation ID for tracking
   * @private
   */
  _generateOperationId(operation) {
    const sanitized = this._sanitizeForAudit({
      type: operation?.type,
      details: operation?.details,
      context: operation?.context,
    });
    const hashInput = `${JSON.stringify(sanitized)}-${Date.now()}`;
    return crypto.createHash('sha256').update(hashInput).digest('hex').substr(0, 16);
  }

  /**
   * Backward compatibility: advisory-only method (deprecated)
   * @deprecated Use evaluateAndEnforce() for mandatory enforcement
   */
  evaluateAndCompress(sessionId, model) {
    const enforcement = this.evaluateAndEnforce(sessionId, model);
    // Strip veto from advisory API for backward compatibility
    const { veto, ...advisory } = enforcement;
    return advisory;
  }

  /**
   * Override a veto decision (with audit trail)
   * @param {string} vetoId
   * @param {string} reason
   * @param {string} authorizedBy
   * @returns {boolean}
   */
  overrideVeto(vetoId, reason, authorizedBy = 'system') {
    if (typeof vetoId !== 'string' || vetoId.length === 0) {
      return false;
    }

    const vetoIndex = this._auditTrail.findIndex(entry => 
      entry.type === 'VETO_APPLIED' && entry.vetoId === vetoId
    );
    
    if (vetoIndex === -1) {
      return false;
    }

    const override = {
      type: 'VETO_OVERRIDDEN',
      vetoId,
      originalVeto: this._sanitizeForAudit(this._auditTrail[vetoIndex]),
      timestamp: Date.now(),
      reason: String(reason || 'manual override'),
      authorizedBy: typeof authorizedBy === 'string' && authorizedBy.length > 0 ? authorizedBy : 'system',
    };

    this._appendAuditEntry(override);
    this._logger.info('[ContextBridge] veto overridden', { vetoId, authorizedBy, reason });
    
    return true;
  }

  /**
   * Get audit trail for monitoring/reporting
   * @param {number} [limit=100] Maximum number of audit entries to return
   * @returns {Array}
   */
  getAuditTrail(limit = 100) {
    const safeLimit = this._normalizePositiveInteger(limit, 100);
    return this._auditTrail.slice(-Math.min(safeLimit, this._auditTrail.length));
  }

  /**
   * Get enforcement statistics
   * @returns {{vetoCount: number, blockCount: number, compressUrgentCount: number, overrideCount: number}}
   */
  getStats() {
    const stats = {
      vetoCount: this._auditTrail.filter(e => e.type === 'VETO_APPLIED').length,
      blockCount: this._auditTrail.filter(e => e.type === 'VETO_APPLIED' && e.budgetPct >= this._blockThreshold).length,
      compressUrgentCount: this._auditTrail.filter(e => e.type === 'VETO_APPLIED' && e.budgetPct >= this._urgentThreshold && e.budgetPct < this._blockThreshold).length,
      overrideCount: this._auditTrail.filter(e => e.type === 'VETO_OVERRIDDEN').length,
    };
    return stats;
  }

  _validateSessionAndModel(sessionId, model) {
    if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      return 'Invalid sessionId: expected non-empty string';
    }
    if (typeof model !== 'string' || model.trim().length === 0) {
      return 'Invalid model: expected non-empty string';
    }
    return null;
  }

  _normalizeContext(context) {
    if (!context || typeof context !== 'object') {
      return {};
    }
    return context;
  }

  _containsCircularReference(value) {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const seen = new WeakSet();
    const stack = [value];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || typeof current !== 'object') {
        continue;
      }
      if (seen.has(current)) {
        return true;
      }
      seen.add(current);
      const keys = Array.isArray(current) ? current.keys() : Object.keys(current);
      for (const key of keys) {
        const candidate = Array.isArray(current) ? current[key] : current[key];
        if (candidate && typeof candidate === 'object') {
          stack.push(candidate);
        }
      }
    }

    return false;
  }

  _sanitizeForAudit(value) {
    const seen = new WeakSet();

    const visit = (input, depth) => {
      if (depth > 6) {
        return '[MaxDepth]';
      }
      if (input === null || input === undefined) {
        return input;
      }
      if (typeof input === 'bigint') {
        return input.toString();
      }
      if (typeof input !== 'object') {
        return input;
      }
      if (seen.has(input)) {
        return '[Circular]';
      }
      seen.add(input);

      if (Array.isArray(input)) {
        const limit = Math.min(input.length, 100);
        const output = [];
        for (let i = 0; i < limit; i++) {
          output.push(visit(input[i], depth + 1));
        }
        if (input.length > limit) {
          output.push(`[Truncated:${input.length - limit}]`);
        }
        return output;
      }

      const output = {};
      const keys = Object.keys(input);
      const limit = Math.min(keys.length, 50);
      for (let i = 0; i < limit; i++) {
        const key = keys[i];
        output[key] = visit(input[key], depth + 1);
      }
      if (keys.length > limit) {
        output.__truncatedKeys = keys.length - limit;
      }
      return output;
    };

    return visit(value, 0);
  }

  _trackOperation(operation) {
    const containsCircular = this._containsCircularReference(operation);
    this._operationMetadata.set(operation, {
      containsCircular,
      createdAt: Date.now(),
    });
    if (containsCircular) {
      this._logger.warn('[ContextBridge] circular reference detected in operation context', {
        sessionId: operation?.details?.sessionId,
        model: operation?.details?.model,
      });
      operation.context = this._sanitizeForAudit(operation.context);
    }
  }

  _registerOperationRef(vetoId, operation) {
    const operationRef = typeof WeakRef === 'function' ? new WeakRef(operation) : null;
    this._operationRefs.set(vetoId, {
      ref: operationRef,
      createdAt: Date.now(),
    });
    this._trimOperationRefs();
  }

  _trimOperationRefs() {
    if (this._operationRefs.size <= this._maxOperationRefs) {
      return;
    }

    const overflow = this._operationRefs.size - this._maxOperationRefs;
    const keys = this._operationRefs.keys();
    for (let i = 0; i < overflow; i++) {
      const next = keys.next();
      if (next.done) {
        break;
      }
      this._operationRefs.delete(next.value);
    }
  }

  _appendAuditEntry(entry) {
    this._auditTrail.push(this._sanitizeForAudit(entry));
    this._trimAuditTrail();
  }

  _trimAuditTrail() {
    if (this._auditTrail.length <= this._maxAuditTrail) {
      return;
    }
    this._auditTrail = this._auditTrail.slice(-this._trimTo);
  }

  _normalizePositiveInteger(value, fallback) {
    if (!Number.isInteger(value) || value <= 0) {
      return fallback;
    }
    return value;
  }
}

// Add crypto import
const crypto = require('crypto');

module.exports = { ContextBridge };
