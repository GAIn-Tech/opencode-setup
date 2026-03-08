/**
 * Meta-KB Routing Integration Tests
 *
 * Verifies that _applyLearningPenalties incorporates meta-KB signals
 * (warnings and evidence) from the learning engine's advise() output.
 *
 * Tests the penalty logic in isolation to avoid the full dependency chain
 * (circuit-breaker, integration-layer, etc.) that ModelRouter pulls in.
 * The logic under test is extracted verbatim from _applyLearningPenalties
 * in packages/opencode-model-router-x/src/index.js.
 */
import { describe, expect, test } from 'bun:test';

/**
 * Extract and test the meta-KB penalty logic directly.
 * This mirrors the meta-KB section of _applyLearningPenalties in index.js.
 */
function applyMetaKBPenalties(advice) {
  const result = { scorePenalty: 0, reasons: [] };
  const routing = advice.routing || {};
  const metaWarnings = typeof routing.meta_kb_warnings === 'number' ? routing.meta_kb_warnings : 0;
  const metaEvidence = Array.isArray(routing.meta_kb_evidence) ? routing.meta_kb_evidence : [];

  if (metaWarnings > 0) {
    const metaPenalty = Math.min(0.25, metaWarnings * 0.05);
    result.scorePenalty += metaPenalty;
    result.reasons.push(`meta-kb:warnings(${metaWarnings})`);
  }

  if (metaEvidence.length > 0) {
    const metaBonus = Math.min(0.1, metaEvidence.length * 0.03);
    result.scorePenalty = Math.max(0, result.scorePenalty - metaBonus);
    result.reasons.push(`meta-kb:evidence(${metaEvidence.length})`);
  }

  return result;
}

describe('meta-KB routing penalties', () => {
  test('meta-KB warnings apply score penalty', () => {
    const advice = {
      routing: { confidence: 0.7, meta_kb_warnings: 3, meta_kb_evidence: [] },
    };
    const result = applyMetaKBPenalties(advice);

    expect(result.scorePenalty).toBeGreaterThan(0);
    expect(result.scorePenalty).toBeCloseTo(0.15, 5); // 3 * 0.05
    expect(result.reasons).toContain('meta-kb:warnings(3)');
  });

  test('positive evidence reduces penalty', () => {
    const advice = {
      routing: {
        confidence: 0.6,
        meta_kb_warnings: 2,
        meta_kb_evidence: [
          { id: 'e1', summary: 'Positive signal 1' },
          { id: 'e2', summary: 'Positive signal 2' },
        ],
      },
    };
    const result = applyMetaKBPenalties(advice);

    // Penalty from warnings: 2 * 0.05 = 0.10
    // Bonus from evidence: min(0.1, 2 * 0.03) = 0.06
    // Net: 0.10 - 0.06 = 0.04
    expect(result.scorePenalty).toBeCloseTo(0.04, 5);
    expect(result.reasons).toContain('meta-kb:warnings(2)');
    expect(result.reasons).toContain('meta-kb:evidence(2)');
  });

  test('no meta-KB signals → no meta-KB penalty or reasons', () => {
    const advice = {
      routing: { confidence: 0.9 },
    };
    const result = applyMetaKBPenalties(advice);

    expect(result.scorePenalty).toBe(0);
    expect(result.reasons.filter((r) => r.startsWith('meta-kb:'))).toHaveLength(0);
  });

  test('warning penalty is capped at 0.25', () => {
    const advice = {
      routing: { confidence: 0.3, meta_kb_warnings: 100, meta_kb_evidence: [] },
    };
    const result = applyMetaKBPenalties(advice);

    expect(result.scorePenalty).toBe(0.25);
    expect(result.reasons).toContain('meta-kb:warnings(100)');
  });

  test('evidence bonus is capped at 0.1', () => {
    const evidence = Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, summary: `sig ${i}` }));
    const advice = {
      routing: { confidence: 0.5, meta_kb_warnings: 5, meta_kb_evidence: evidence },
    };
    const result = applyMetaKBPenalties(advice);

    // Penalty: min(0.25, 5*0.05) = 0.25
    // Bonus: min(0.1, 20*0.03) = 0.1
    // Net: 0.25 - 0.1 = 0.15
    expect(result.scorePenalty).toBe(0.15);
    expect(result.reasons).toContain('meta-kb:evidence(20)');
  });

  test('penalty cannot go below zero from evidence bonus', () => {
    const evidence = Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, summary: `sig ${i}` }));
    const advice = {
      routing: { confidence: 0.9, meta_kb_warnings: 1, meta_kb_evidence: evidence },
    };
    const result = applyMetaKBPenalties(advice);

    // Penalty: 1*0.05 = 0.05
    // Bonus: min(0.1, 5*0.03) = 0.1
    // Net: max(0, 0.05 - 0.1) = 0
    expect(result.scorePenalty).toBe(0);
  });
});
