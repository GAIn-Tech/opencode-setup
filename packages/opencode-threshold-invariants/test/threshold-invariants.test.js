/**
 * Tests for threshold invariants
 * 
 * Task 3: Define and enforce cross-loop threshold and policy invariants
 */

const { describe, test, expect } = require('bun:test');
const {
  THRESHOLDS,
  BUDGET_BANDS,
  BAND_ACTIONS,
  SEVERITY,
  BUDGET_SCALES,
  classifyBudgetBand,
  getActionForBand,
  getBudgetScale,
  classifySeverity,
  isCompressionRequired,
  isCompressionMandatory,
  shouldBlockOperations,
  getBudgetMessage,
  validateInvariants,
  getThresholdSnapshot
} = require('../src/index');

// ---------------------------------------------------------------------------
// THRESHOLD CONSTANT TESTS
// ---------------------------------------------------------------------------

describe('THRESHOLDS', () => {
  test('defines all required thresholds', () => {
    expect(THRESHOLDS.WARN).toBeDefined();
    expect(THRESHOLDS.ALERT_WARN).toBeDefined();
    expect(THRESHOLDS.ERROR).toBeDefined();
    expect(THRESHOLDS.CRITICAL).toBeDefined();
    expect(THRESHOLDS.BLOCK).toBeDefined();
    expect(THRESHOLDS.EMERGENCY).toBeDefined();
  });

  test('thresholds are in correct order', () => {
    expect(THRESHOLDS.WARN).toBeLessThan(THRESHOLDS.ERROR);
    expect(THRESHOLDS.ERROR).toBeLessThan(THRESHOLDS.CRITICAL); // ERROR < CRITICAL
    expect(THRESHOLDS.CRITICAL).toBeLessThan(THRESHOLDS.BLOCK);
    expect(THRESHOLDS.BLOCK).toBeLessThan(THRESHOLDS.EMERGENCY);
  });

  test('thresholds are valid fractions', () => {
    Object.values(THRESHOLDS).forEach(t => {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    });
  });
});

describe('BUDGET_BANDS', () => {
  test('defines all required bands', () => {
    expect(BUDGET_BANDS.HEALTHY).toBeDefined();
    expect(BUDGET_BANDS.WARN).toBeDefined();
    expect(BUDGET_BANDS.ERROR).toBeDefined();
    expect(BUDGET_BANDS.CRITICAL).toBeDefined();
    expect(BUDGET_BANDS.BLOCK).toBeDefined();
    expect(BUDGET_BANDS.EMERGENCY).toBeDefined();
  });
});

describe('BUDGET_SCALES', () => {
  test('scales are monotonically decreasing', () => {
    const scales = [
      BUDGET_SCALES[BUDGET_BANDS.HEALTHY],
      BUDGET_SCALES[BUDGET_BANDS.WARN],
      BUDGET_SCALES[BUDGET_BANDS.ERROR],
      BUDGET_SCALES[BUDGET_BANDS.CRITICAL],
      BUDGET_SCALES[BUDGET_BANDS.BLOCK],
      BUDGET_SCALES[BUDGET_BANDS.EMERGENCY]
    ];
    
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]).toBeLessThanOrEqual(scales[i - 1]);
    }
  });

  test('healthy scale is 1.0', () => {
    expect(BUDGET_SCALES[BUDGET_BANDS.HEALTHY]).toBe(1.0);
  });

  test('emergency scale is lowest', () => {
    expect(BUDGET_SCALES[BUDGET_BANDS.EMERGENCY]).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// CLASSIFICATION FUNCTION TESTS
// ---------------------------------------------------------------------------

describe('classifyBudgetBand', () => {
  test('classifies healthy band correctly', () => {
    expect(classifyBudgetBand(0.0)).toBe(BUDGET_BANDS.HEALTHY);
    expect(classifyBudgetBand(0.5)).toBe(BUDGET_BANDS.HEALTHY);
    expect(classifyBudgetBand(0.64)).toBe(BUDGET_BANDS.HEALTHY);
  });

  test('classifies warn band correctly', () => {
    expect(classifyBudgetBand(0.65)).toBe(BUDGET_BANDS.WARN);
    expect(classifyBudgetBand(0.70)).toBe(BUDGET_BANDS.WARN);
    expect(classifyBudgetBand(0.74)).toBe(BUDGET_BANDS.WARN);
  });

  test('classifies error band correctly', () => {
    expect(classifyBudgetBand(0.75)).toBe(BUDGET_BANDS.ERROR);
    expect(classifyBudgetBand(0.78)).toBe(BUDGET_BANDS.ERROR);
    expect(classifyBudgetBand(0.79)).toBe(BUDGET_BANDS.ERROR);
  });

  test('classifies critical band correctly', () => {
    expect(classifyBudgetBand(0.80)).toBe(BUDGET_BANDS.CRITICAL);
    expect(classifyBudgetBand(0.82)).toBe(BUDGET_BANDS.CRITICAL);
    expect(classifyBudgetBand(0.84)).toBe(BUDGET_BANDS.CRITICAL);
  });

  test('classifies block band correctly', () => {
    expect(classifyBudgetBand(0.85)).toBe(BUDGET_BANDS.BLOCK);
    expect(classifyBudgetBand(0.90)).toBe(BUDGET_BANDS.BLOCK);
    expect(classifyBudgetBand(0.94)).toBe(BUDGET_BANDS.BLOCK);
  });

  test('classifies emergency band correctly', () => {
    expect(classifyBudgetBand(0.95)).toBe(BUDGET_BANDS.EMERGENCY);
    expect(classifyBudgetBand(0.99)).toBe(BUDGET_BANDS.EMERGENCY);
    expect(classifyBudgetBand(1.0)).toBe(BUDGET_BANDS.EMERGENCY);
  });

  test('handles invalid input gracefully', () => {
    expect(classifyBudgetBand(-1)).toBe(BUDGET_BANDS.HEALTHY);
    expect(classifyBudgetBand(NaN)).toBe(BUDGET_BANDS.HEALTHY);
    // Infinity is clamped to 1.0, which is >= EMERGENCY threshold
    expect(classifyBudgetBand(Infinity)).toBe(BUDGET_BANDS.EMERGENCY);
  });
});

describe('getActionForBand', () => {
  test('returns correct action for each band', () => {
    expect(getActionForBand(BUDGET_BANDS.HEALTHY)).toBe('none');
    expect(getActionForBand(BUDGET_BANDS.WARN)).toBe('compress_advisory');
    expect(getActionForBand(BUDGET_BANDS.ERROR)).toBe('compress_required');
    expect(getActionForBand(BUDGET_BANDS.CRITICAL)).toBe('compress_urgent');
    expect(getActionForBand(BUDGET_BANDS.BLOCK)).toBe('block_operations');
    expect(getActionForBand(BUDGET_BANDS.EMERGENCY)).toBe('emergency_alert');
  });

  test('returns none for unknown band', () => {
    expect(getActionForBand('unknown')).toBe('none');
  });
});

describe('getBudgetScale', () => {
  test('returns correct scale for each band', () => {
    expect(getBudgetScale(BUDGET_BANDS.HEALTHY)).toBe(1.0);
    expect(getBudgetScale(BUDGET_BANDS.WARN)).toBe(0.85);
    expect(getBudgetScale(BUDGET_BANDS.ERROR)).toBe(0.75);
    expect(getBudgetScale(BUDGET_BANDS.CRITICAL)).toBe(0.5);
    expect(getBudgetScale(BUDGET_BANDS.BLOCK)).toBe(0.35);
    expect(getBudgetScale(BUDGET_BANDS.EMERGENCY)).toBe(0.2);
  });

  test('returns 1.0 for unknown band', () => {
    expect(getBudgetScale('unknown')).toBe(1.0);
  });
});

describe('classifySeverity', () => {
  test('classifies severity correctly for each band', () => {
    expect(classifySeverity(0.5)).toBe(SEVERITY.NONE);
    expect(classifySeverity(0.65)).toBe(SEVERITY.MEDIUM);
    expect(classifySeverity(0.75)).toBe(SEVERITY.HIGH);
    expect(classifySeverity(0.80)).toBe(SEVERITY.CRITICAL);
    expect(classifySeverity(0.85)).toBe(SEVERITY.CRITICAL);
    expect(classifySeverity(0.95)).toBe(SEVERITY.CRITICAL);
  });
});

// ---------------------------------------------------------------------------
// DECISION HELPER TESTS
// ---------------------------------------------------------------------------

describe('isCompressionRequired', () => {
  test('returns false for healthy budget', () => {
    expect(isCompressionRequired(0.5)).toBe(false);
    expect(isCompressionRequired(0.64)).toBe(false);
  });

  test('returns true at warn threshold', () => {
    expect(isCompressionRequired(0.65)).toBe(true);
    expect(isCompressionRequired(0.70)).toBe(true);
  });
});

describe('isCompressionMandatory', () => {
  test('returns false below critical threshold', () => {
    expect(isCompressionMandatory(0.65)).toBe(false);
    expect(isCompressionMandatory(0.79)).toBe(false);
  });

  test('returns true at critical threshold', () => {
    expect(isCompressionMandatory(0.80)).toBe(true);
    expect(isCompressionMandatory(0.85)).toBe(true);
  });
});

describe('shouldBlockOperations', () => {
  test('returns false below block threshold', () => {
    expect(shouldBlockOperations(0.80)).toBe(false);
    expect(shouldBlockOperations(0.84)).toBe(false);
  });

  test('returns true at block threshold', () => {
    expect(shouldBlockOperations(0.85)).toBe(true);
    expect(shouldBlockOperations(0.95)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MESSAGE TESTS
// ---------------------------------------------------------------------------

describe('getBudgetMessage', () => {
  test('returns appropriate message for each band', () => {
    expect(getBudgetMessage(0.5)).toContain('HEALTHY');
    expect(getBudgetMessage(0.65)).toContain('ADVISORY');
    expect(getBudgetMessage(0.75)).toContain('WARNING');
    expect(getBudgetMessage(0.80)).toContain('CRITICAL');
    expect(getBudgetMessage(0.85)).toContain('BLOCKED');
    expect(getBudgetMessage(0.95)).toContain('EMERGENCY');
  });

  test('includes percentage in message', () => {
    const msg = getBudgetMessage(0.723);
    expect(msg).toContain('72.3%');
  });
});

// ---------------------------------------------------------------------------
// VALIDATION TESTS
// ---------------------------------------------------------------------------

describe('validateInvariants', () => {
  test('validates successfully with correct invariants', () => {
    const result = validateInvariants();
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});

describe('getThresholdSnapshot', () => {
  test('returns complete snapshot', () => {
    const snapshot = getThresholdSnapshot();
    
    expect(snapshot.thresholds).toBeDefined();
    expect(snapshot.bands).toBeDefined();
    expect(snapshot.actions).toBeDefined();
    expect(snapshot.scales).toBeDefined();
    expect(snapshot.validation).toBeDefined();
    expect(snapshot.timestamp).toBeDefined();
    expect(snapshot.provenance).toBeDefined();
  });

  test('includes provenance information', () => {
    const snapshot = getThresholdSnapshot();
    
    expect(snapshot.provenance.source).toBe('opencode-threshold-invariants');
    expect(snapshot.provenance.version).toBe('1.0.0');
  });
});

// ---------------------------------------------------------------------------
// CROSS-LOOP CONSISTENCY TESTS
// ---------------------------------------------------------------------------

describe('Cross-Loop Consistency', () => {
  test('ContextBridge thresholds align with invariants', () => {
    // ContextBridge uses: warn=0.65, urgent=0.80, block=0.85
    expect(THRESHOLDS.WARN).toBe(0.65);
    expect(THRESHOLDS.CRITICAL).toBe(0.80);
    expect(THRESHOLDS.BLOCK).toBe(0.85);
  });

  test('Governor thresholds align with invariants', () => {
    // Governor uses: warn=0.75, error=0.80
    // Our invariants: ALERT_WARN=0.75 (for Governor warn), CRITICAL=0.80 (for Governor error)
    expect(THRESHOLDS.ALERT_WARN).toBe(0.75);
    expect(THRESHOLDS.CRITICAL).toBe(0.80);
  });

  test('AlertManager thresholds align with invariants', () => {
    // AlertManager uses: warn=0.75, critical=0.80, emergency=0.95
    expect(THRESHOLDS.ALERT_WARN).toBe(0.75);
    expect(THRESHOLDS.CRITICAL).toBe(0.80);
    expect(THRESHOLDS.EMERGENCY).toBe(0.95);
  });

  test('band classification produces consistent actions', () => {
    // Test that classification produces consistent results across functions
    const testCases = [
      { pct: 0.50, band: BUDGET_BANDS.HEALTHY, action: 'none', severity: SEVERITY.NONE },
      { pct: 0.65, band: BUDGET_BANDS.WARN, action: 'compress_advisory', severity: SEVERITY.MEDIUM },
      { pct: 0.75, band: BUDGET_BANDS.ERROR, action: 'compress_required', severity: SEVERITY.HIGH },
      { pct: 0.80, band: BUDGET_BANDS.CRITICAL, action: 'compress_urgent', severity: SEVERITY.CRITICAL },
      { pct: 0.85, band: BUDGET_BANDS.BLOCK, action: 'block_operations', severity: SEVERITY.CRITICAL },
      { pct: 0.95, band: BUDGET_BANDS.EMERGENCY, action: 'emergency_alert', severity: SEVERITY.CRITICAL }
    ];

    testCases.forEach(({ pct, band, action, severity }) => {
      expect(classifyBudgetBand(pct)).toBe(band);
      expect(getActionForBand(band)).toBe(action);
      expect(classifySeverity(pct)).toBe(severity);
    });
  });

  test('no oscillation at threshold boundaries', () => {
    // Test that values just below and at threshold don't oscillate
    const justBelow = 0.799;
    const atThreshold = 0.80;
    const justAbove = 0.801;

    // All should classify to same or adjacent bands
    expect(classifyBudgetBand(justBelow)).toBe(BUDGET_BANDS.ERROR);
    expect(classifyBudgetBand(atThreshold)).toBe(BUDGET_BANDS.CRITICAL);
    expect(classifyBudgetBand(justAbove)).toBe(BUDGET_BANDS.CRITICAL);
  });
});
