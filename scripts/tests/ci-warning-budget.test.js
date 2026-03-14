import { describe, expect, it } from 'bun:test';
import {
  analyzeWarningOutput,
  compileWarningCategories,
  evaluateWarningBudget
} from '../ci-warning-budget.mjs';

const baselineCategories = compileWarningCategories([
  {
    id: 'integration-layer-degraded',
    pattern: 'running in degraded mode|IntegrationLayer.*degraded|failed to load',
    maxCount: 10,
    intentional: true,
    reason: 'bootstrap.js tryLoad() fail-open pattern for optional dependencies'
  },
  {
    id: 'orchestration-advisor-stubs',
    pattern: 'OrchestrationAdvisor.*stub|stub.*orchestration',
    maxCount: 5,
    intentional: true,
    reason: 'Stub methods in orchestration advisor for unimplemented features'
  },
  {
    id: 'dashboard-token-missing',
    pattern: 'OPENCODE_DASHBOARD_TOKEN|dashboard.*token.*missing|write token',
    maxCount: 5,
    intentional: true,
    reason: 'Expected when no dashboard write token configured'
  },
  {
    id: 'skills-api-parse',
    pattern: 'Skills API.*parse|parse.*skill.*error|Failed to parse',
    maxCount: 5,
    intentional: true,
    reason: 'Intentional test case for error handling'
  },
  {
    id: 'skillrl-corrupted',
    pattern: 'SkillRL.*corrupted|corrupted.*update|reject.*corrupted',
    maxCount: 5,
    intentional: true,
    reason: 'Intentional test case for corrupted update rejection'
  }
]);

describe('ci-warning-budget', () => {
  it('matches known warning categories from baseline patterns', () => {
    const output = [
      '[warn] IntegrationLayer running in degraded mode after failed to load optional module',
      'OrchestrationAdvisor using stub for missing capability',
      'dashboard write token missing: OPENCODE_DASHBOARD_TOKEN',
      'Skills API parse error: Failed to parse skills response',
      'SkillRL reject corrupted update payload'
    ].join('\n');

    const analysis = analyzeWarningOutput(output, baselineCategories);

    expect(analysis.categoryCounts['integration-layer-degraded']).toBe(1);
    expect(analysis.categoryCounts['orchestration-advisor-stubs']).toBe(1);
    expect(analysis.categoryCounts['dashboard-token-missing']).toBe(1);
    expect(analysis.categoryCounts['skills-api-parse']).toBe(1);
    expect(analysis.categoryCounts['skillrl-corrupted']).toBe(1);
    expect(analysis.unknownWarnings).toEqual([]);
  });

  it('flags unknown warning lines when no category matches', () => {
    const output = [
      '[warning] Experimental feature toggled without baseline entry',
      '[warning] Experimental feature toggled without baseline entry'
    ].join('\n');

    const analysis = analyzeWarningOutput(output, baselineCategories);

    expect(analysis.unknownWarnings).toHaveLength(1);
    expect(analysis.unknownWarnings[0]).toEqual({
      line: '[warning] Experimental feature toggled without baseline entry',
      count: 2
    });
  });

  it('fails budget evaluation when a category exceeds maxCount', () => {
    const noisyCategories = compileWarningCategories([
      {
        id: 'skills-api-parse',
        pattern: 'Skills API.*parse|parse.*skill.*error|Failed to parse',
        maxCount: 1,
        intentional: true,
        reason: 'Intentional test case for error handling'
      }
    ]);

    const output = [
      'Skills API parse error: Failed to parse payload A',
      'Skills API parse error: Failed to parse payload B'
    ].join('\n');

    const analysis = analyzeWarningOutput(output, noisyCategories);
    const verdict = evaluateWarningBudget(analysis, noisyCategories);

    expect(verdict.pass).toBe(false);
    expect(verdict.exceeded).toEqual([
      {
        id: 'skills-api-parse',
        count: 2,
        maxCount: 1,
        pattern: 'Skills API.*parse|parse.*skill.*error|Failed to parse'
      }
    ]);
  });
});
