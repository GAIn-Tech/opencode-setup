import { describe, test, expect, beforeEach } from 'bun:test';
import { BestOfNSelector, DEFAULT_BEST_OF_N_POLICY } from '../src/best-of-n.js';
import { Critic, Plan, Result, Verifier, Verification, Executor } from '../../opencode-pev-contract/src/index.js';

describe('Best-of-N Selection', () => {
  let mockExecutor;
  let mockVerifier;
  let selector;

  beforeEach(() => {
    mockExecutor = {
      execute: async (plan, context) => {
        const attempt = context._best_of_n_attempt || 1;
        // Simulate varying quality across attempts
        const success = attempt >= 2; // First attempt fails, rest succeed
        return new Result({
          taskId: plan.taskId,
          planId: plan.taskId,
          success,
          outputs: { attempt },
          metadata: { attempt }
        });
      }
    };

    mockVerifier = {
      verify: async (result, plan) => {
        return new Verification({
          taskId: result.taskId,
          planId: result.planId,
          passed: result.success,
          methods: ['tests'],
          confidence: result.success ? 0.9 : 0.1,
          details: { attempt: result.outputs?.attempt }
        });
      }
    };

    selector = new BestOfNSelector({
      executor: mockExecutor,
      verifier: mockVerifier,
      policy: { n: 3, timeout_ms: 5000 }
    });
  });

  describe('Implements Critic interface', () => {
    test('extends Critic class', () => {
      expect(selector).toBeInstanceOf(Critic);
    });

    test('has evaluate method', () => {
      expect(typeof selector.evaluate).toBe('function');
    });
  });

  describe('evaluate', () => {
    test('returns best result from array', async () => {
      const results = [
        new Result({ taskId: 't1', planId: 'p1', success: false, outputs: {} }),
        new Result({ taskId: 't1', planId: 'p1', success: true, outputs: { quality: 'good' } }),
        new Result({ taskId: 't1', planId: 'p1', success: true, outputs: { quality: 'better' } })
      ];

      const best = await selector.evaluate(results);
      expect(best.success).toBe(true);
    });

    test('throws for empty array', async () => {
      await expect(selector.evaluate([])).rejects.toThrow('at least one result');
    });
  });

  describe('runBestOfN', () => {
    test('runs executor N times', async () => {
      const plan = new Plan({ taskId: 'task-1', steps: [{ id: 's1', type: 'edit' }] });
      const result = await selector.runBestOfN(plan, {});

      expect(result.attempts).toBe(3);
      expect(result.allResults).toHaveLength(3);
      expect(result.scores).toHaveLength(3);
    });

    test('returns best result', async () => {
      const plan = new Plan({ taskId: 'task-1', steps: [{ id: 's1', type: 'edit' }] });
      const result = await selector.runBestOfN(plan, {});

      // First attempt fails (mock), rest succeed
      expect(result.bestResult.success).toBe(true);
      expect(result.bestScore).toBeGreaterThan(0.5);
    });

    test('handles executor failures gracefully', async () => {
      const failingExecutor = {
        execute: async () => { throw new Error('Executor failed'); }
      };
      const s = new BestOfNSelector({ executor: failingExecutor, verifier: mockVerifier });

      const result = await s.runBestOfN(
        new Plan({ taskId: 'task-1', steps: [] }),
        {}
      );

      expect(result.allResults.every(r => !r.success)).toBe(true);
      expect(result.bestScore).toBeLessThanOrEqual(0.1);
    });

    test('varies context for diversity', async () => {
      const plan = new Plan({ taskId: 'task-1', steps: [] });
      const result = await selector.runBestOfN(plan, {});

      // Each attempt should have different context
      const attempts = result.allResults.map(r => r.metadata?.attempt);
      expect(attempts).toEqual([1, 2, 3]);
    });

    test('respects custom N', async () => {
      const plan = new Plan({ taskId: 'task-1', steps: [] });
      const result = await selector.runBestOfN(plan, {}, { n: 5 });

      expect(result.attempts).toBe(5);
      expect(result.allResults).toHaveLength(5);
    });
  });

  describe('shouldTrigger', () => {
    test('triggers for complex tasks', () => {
      expect(selector.shouldTrigger({ complexity: 'complex' })).toBe(true);
      expect(selector.shouldTrigger({ complexity: 'extreme' })).toBe(true);
    });

    test('triggers for high risk score', () => {
      expect(selector.shouldTrigger({ risk_score: 25 })).toBe(true);
      expect(selector.shouldTrigger({ risk_score: 10 })).toBe(false);
    });

    test('triggers for explicit request', () => {
      expect(selector.shouldTrigger({ explicit_request: true })).toBe(true);
    });

    test('does not trigger for simple tasks', () => {
      expect(selector.shouldTrigger({ complexity: 'simple' })).toBe(false);
    });
  });

  describe('Policy management', () => {
    test('getPolicy returns current policy', () => {
      const policy = selector.getPolicy();
      expect(policy.n).toBe(3);
      expect(policy.timeout_ms).toBe(5000);
    });

    test('setPolicy updates policy', () => {
      selector.setPolicy({ n: 5, trigger_risk_score: 15 });
      const policy = selector.getPolicy();
      expect(policy.n).toBe(5);
      expect(policy.trigger_risk_score).toBe(15);
    });
  });

  describe('DEFAULT_BEST_OF_N_POLICY', () => {
    test('has expected structure', () => {
      expect(DEFAULT_BEST_OF_N_POLICY.n).toBe(3);
      expect(DEFAULT_BEST_OF_N_POLICY.timeout_ms).toBe(300000);
      expect(DEFAULT_BEST_OF_N_POLICY.trigger_complexity).toContain('complex');
      expect(DEFAULT_BEST_OF_N_POLICY.trigger_complexity).toContain('extreme');
    });
  });
});
