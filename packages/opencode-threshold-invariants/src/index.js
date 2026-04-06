/**
 * Threshold Invariants - Shared cross-loop threshold and policy invariants
 * 
 * Task 3: Define and enforce cross-loop threshold and policy invariants
 * 
 * This module provides a SINGLE SOURCE OF TRUTH for budget thresholds used by:
 * - ContextBridge (compression/blocking decisions)
 * - Governor (warn/error states)
 * - AlertManager (alert thresholds)
 * - OrchestrationPolicy (budget bands)
 * - ModelRouter (budget-aware routing)
 * 
 * CRITICAL: All threshold consumers MUST import from this module.
 * NO hardcoded threshold values in consuming packages.
 */

// ---------------------------------------------------------------------------
// CANONICAL THRESHOLD CONSTANTS
// ---------------------------------------------------------------------------

/**
 * Budget percentage thresholds (as fractions 0-1)
 * 
 * These are the SINGLE SOURCE OF TRUTH for all budget-related thresholds.
 * 
 * Threshold Hierarchy:
 * - HEALTHY: < WARN (budget is fine)
 * - WARN: >= 0.65 (proactive compression recommended)
 * - ERROR: >= 0.75 (compression required, warning alert)
 * - CRITICAL: >= 0.80 (compression mandatory, critical alert)
 * - BLOCK: >= 0.85 (operations blocked to prevent overflow)
 * - EMERGENCY: >= 0.95 (emergency alert, immediate action required)
 */
const THRESHOLDS = Object.freeze({
  // Proactive compression threshold (ContextBridge "compress" action)
  WARN: 0.65,
  
  // Warning alert threshold (AlertManager WARNING, Governor "warn" status)
  ALERT_WARN: 0.75,
  
  // Error state threshold (Governor "error" status, band boundary for ERROR)
  ERROR: 0.75,
  
  // Critical alert threshold (AlertManager CRITICAL, ContextBridge "compress_urgent")
  CRITICAL: 0.80,
  
  // Block threshold (ContextBridge "block" action)
  BLOCK: 0.85,
  
  // Emergency threshold (AlertManager emergency alert)
  EMERGENCY: 0.95
});

/**
 * Budget bands for orchestration policy
 * 
 * These bands map to consistent actions across all control loops.
 */
const BUDGET_BANDS = Object.freeze({
  HEALTHY: 'healthy',      // < WARN (0.65)
  WARN: 'warn',            // >= 0.65, < 0.75
  ERROR: 'error',          // >= 0.75, < 0.80
  CRITICAL: 'critical',    // >= 0.80, < 0.85
  BLOCK: 'block',          // >= 0.85, < 0.95
  EMERGENCY: 'emergency'   // >= 0.95
});

/**
 * Actions associated with each budget band
 */
const BAND_ACTIONS = Object.freeze({
  [BUDGET_BANDS.HEALTHY]: 'none',
  [BUDGET_BANDS.WARN]: 'compress_advisory',
  [BUDGET_BANDS.ERROR]: 'compress_required',
  [BUDGET_BANDS.CRITICAL]: 'compress_urgent',
  [BUDGET_BANDS.BLOCK]: 'block_operations',
  [BUDGET_BANDS.EMERGENCY]: 'emergency_alert'
});

/**
 * Severity levels for alerts and states
 */
const SEVERITY = Object.freeze({
  NONE: 'none',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
});

/**
 * Budget scale factors for adaptive scaling
 * (Used by OrchestrationPolicy)
 */
const BUDGET_SCALES = Object.freeze({
  [BUDGET_BANDS.HEALTHY]: 1.0,
  [BUDGET_BANDS.WARN]: 0.85,
  [BUDGET_BANDS.ERROR]: 0.75,
  [BUDGET_BANDS.CRITICAL]: 0.5,
  [BUDGET_BANDS.BLOCK]: 0.35,
  [BUDGET_BANDS.EMERGENCY]: 0.2
});

// ---------------------------------------------------------------------------
// CLASSIFICATION FUNCTIONS
// ---------------------------------------------------------------------------

/**
 * Classify a budget percentage into a band.
 * 
 * @param {number} pct - Budget percentage as fraction (0-1)
 * @returns {string} Band from BUDGET_BANDS
 */
function classifyBudgetBand(pct) {
  // Handle invalid inputs
  if (!Number.isFinite(pct)) {
    // Infinity represents budget overflow → treat as EMERGENCY
    // NaN is truly invalid → default to HEALTHY (safe)
    if (pct === Infinity) {
      return BUDGET_BANDS.EMERGENCY;
    }
    // NaN or -Infinity
    return BUDGET_BANDS.HEALTHY;
  }

  if (pct < 0) {
    return BUDGET_BANDS.HEALTHY;
  }

  // Clamp to valid range
  const clampedPct = Math.min(pct, 1);
  
  if (clampedPct >= THRESHOLDS.EMERGENCY) return BUDGET_BANDS.EMERGENCY;
  if (clampedPct >= THRESHOLDS.BLOCK) return BUDGET_BANDS.BLOCK;
  if (clampedPct >= THRESHOLDS.CRITICAL) return BUDGET_BANDS.CRITICAL;
  if (clampedPct >= THRESHOLDS.ERROR) return BUDGET_BANDS.ERROR;
  if (clampedPct >= THRESHOLDS.WARN) return BUDGET_BANDS.WARN;
  
  return BUDGET_BANDS.HEALTHY;
}

/**
 * Get the action for a budget band.
 * 
 * @param {string} band - Band from BUDGET_BANDS
 * @returns {string} Action from BAND_ACTIONS
 */
function getActionForBand(band) {
  return BAND_ACTIONS[band] || 'none';
}

/**
 * Get the budget scale factor for a band.
 * 
 * @param {string} band - Band from BUDGET_BANDS
 * @returns {number} Scale factor (0-1)
 */
function getBudgetScale(band) {
  return BUDGET_SCALES[band] || 1.0;
}

/**
 * Get the severity for a budget percentage.
 * 
 * @param {number} pct - Budget percentage as fraction (0-1)
 * @returns {string} Severity from SEVERITY
 */
function classifySeverity(pct) {
  const band = classifyBudgetBand(pct);
  
  switch (band) {
    case BUDGET_BANDS.EMERGENCY:
    case BUDGET_BANDS.BLOCK:
    case BUDGET_BANDS.CRITICAL:
      return SEVERITY.CRITICAL;
    case BUDGET_BANDS.ERROR:
      return SEVERITY.HIGH;
    case BUDGET_BANDS.WARN:
      return SEVERITY.MEDIUM;
    default:
      return SEVERITY.NONE;
  }
}

/**
 * Check if compression is required for a budget percentage.
 * 
 * @param {number} pct - Budget percentage as fraction (0-1)
 * @returns {boolean} True if compression is required
 */
function isCompressionRequired(pct) {
  return pct >= THRESHOLDS.WARN;
}

/**
 * Check if compression is mandatory (urgent) for a budget percentage.
 * 
 * @param {number} pct - Budget percentage as fraction (0-1)
 * @returns {boolean} True if compression is mandatory
 */
function isCompressionMandatory(pct) {
  return pct >= THRESHOLDS.CRITICAL;
}

/**
 * Check if operations should be blocked for a budget percentage.
 * 
 * @param {number} pct - Budget percentage as fraction (0-1)
 * @returns {boolean} True if operations should be blocked
 */
function shouldBlockOperations(pct) {
  return pct >= THRESHOLDS.BLOCK;
}

/**
 * Get a human-readable message for a budget state.
 * 
 * @param {number} pct - Budget percentage as fraction (0-1)
 * @returns {string} Human-readable message
 */
function getBudgetMessage(pct) {
  const band = classifyBudgetBand(pct);
  const pctDisplay = (pct * 100).toFixed(1);
  
  switch (band) {
    case BUDGET_BANDS.EMERGENCY:
      return `EMERGENCY: Budget at ${pctDisplay}% — immediate action required`;
    case BUDGET_BANDS.BLOCK:
      return `BLOCKED: Budget at ${pctDisplay}% — operations blocked to prevent overflow`;
    case BUDGET_BANDS.CRITICAL:
      return `CRITICAL: Budget at ${pctDisplay}% — compression mandatory`;
    case BUDGET_BANDS.ERROR:
      return `WARNING: Budget at ${pctDisplay}% — compression required`;
    case BUDGET_BANDS.WARN:
      return `ADVISORY: Budget at ${pctDisplay}% — proactive compression recommended`;
    default:
      return `HEALTHY: Budget at ${pctDisplay}%`;
  }
}

// ---------------------------------------------------------------------------
// INVARIANT VALIDATION
// ---------------------------------------------------------------------------

/**
 * Validate that threshold values are internally consistent.
 * 
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateInvariants() {
  const errors = [];
  
  // Threshold ordering must be correct
  if (THRESHOLDS.WARN >= THRESHOLDS.ERROR) {
    errors.push('WARN threshold must be less than ERROR threshold');
  }
  // ERROR and ALERT_WARN should be the same (0.75)
  if (THRESHOLDS.ERROR !== THRESHOLDS.ALERT_WARN) {
    errors.push('ERROR and ALERT_WARN thresholds should be equal for consistency');
  }
  if (THRESHOLDS.CRITICAL <= THRESHOLDS.ERROR) {
    errors.push('CRITICAL threshold must be greater than ERROR threshold');
  }
  if (THRESHOLDS.BLOCK <= THRESHOLDS.CRITICAL) {
    errors.push('BLOCK threshold must be greater than CRITICAL threshold');
  }
  if (THRESHOLDS.EMERGENCY <= THRESHOLDS.BLOCK) {
    errors.push('EMERGENCY threshold must be greater than BLOCK threshold');
  }
  
  // Budget scales must be monotonically decreasing
  const scales = Object.values(BUDGET_SCALES);
  for (let i = 1; i < scales.length; i++) {
    if (scales[i] > scales[i - 1]) {
      errors.push('Budget scales must be monotonically decreasing');
      break;
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get a snapshot of all threshold values for debugging/logging.
 * 
 * @returns {object} Snapshot of all thresholds and bands
 */
function getThresholdSnapshot() {
  return {
    thresholds: { ...THRESHOLDS },
    bands: { ...BUDGET_BANDS },
    actions: { ...BAND_ACTIONS },
    scales: { ...BUDGET_SCALES },
    validation: validateInvariants(),
    timestamp: new Date().toISOString(),
    provenance: {
      source: 'opencode-threshold-invariants',
      version: '1.0.0'
    }
  };
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  // Constants
  THRESHOLDS,
  BUDGET_BANDS,
  BAND_ACTIONS,
  SEVERITY,
  BUDGET_SCALES,
  
  // Classification functions
  classifyBudgetBand,
  getActionForBand,
  getBudgetScale,
  classifySeverity,
  
  // Decision helpers
  isCompressionRequired,
  isCompressionMandatory,
  shouldBlockOperations,
  
  // Messaging
  getBudgetMessage,
  
  // Validation
  validateInvariants,
  getThresholdSnapshot
};
