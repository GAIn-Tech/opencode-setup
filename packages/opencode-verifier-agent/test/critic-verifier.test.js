import { describe, test, expect, beforeEach } from 'bun:test';
import { CriticVerifier } from '../src/critic-verifier.js';
import { Verifier, Verification, Plan, Result } from '../../opencode-pev-contract/src/index.js';

describe('Critic Verifier', () => {
  let verifier;

  beforeEach(() => {
    verifier = new CriticVerifier();
  });

  describe('Implements Verifier interface', () => {
    test('extends Verifier class', () => {
      expect(verifier).toBeInstanceOf(Verifier);
    });

    test('has verify method', () => {
      expect(typeof verifier.verify).toBe('function');
    });
  });

  describe('verify with default LLM judge', () => {
    test('returns Verification for successful result', async () => {
      const result = new Result({
        taskId: 'task-1',
        planId: 'plan-1',
        success: true,
        outputs: { filesModified: 2 },
        metadata: { tokensUsed: 5000 }
      });
      const plan = new Plan({ taskId: 'task-1', steps: [{ id: 's1', type: 'edit' }] });

      const verification = await verifier.verify(result, plan);

      expect(verification).toBeInstanceOf(Verification);
      expect(verification.passed).toBe(true);
      expect(verification.confidence).toBeGreaterThan(0.5);
      expect(verification.methods).toContain('llm_judge');
    });

    test('returns failed Verification for unsuccessful result', async () => {
      const result = new Result({
        taskId: 'task-1',
        planId: 'plan-1',
        success: false,
        outputs: {},
        error: 'Something failed'
      });
      const plan = new Plan({ taskId: 'task-1', steps: [] });

      const verification = await verifier.verify(result, plan);

      expect(verification.passed).toBe(false);
      expect(verification.confidence).toBeLessThanOrEqual(0.5);
      expect(verification.failures.length).toBeGreaterThan(0);
    });

    test('uses critic model when available', async () => {
      const mockCriticModel = {
        score: async () => 0.85
      };
      verifier.setCriticModel(mockCriticModel);

      const result = new Result({
        taskId: 'task-1',
        planId: 'plan-1',
        success: true,
        outputs: {}
      });
      const plan = new Plan({ taskId: 'task-1', steps: [] });

      const verification = await verifier.verify(result, plan);

      expect(verification.confidence).toBe(0.85);
      expect(verification.methods).toContain('critic_model');
    });

    test('falls back to LLM judge when critic model fails', async () => {
      const mockCriticModel = {
        score: async () => { throw new Error('Model unavailable'); }
      };
      verifier.setCriticModel(mockCriticModel);

      const result = new Result({
        taskId: 'task-1',
        planId: 'plan-1',
        success: true,
        outputs: {}
      });
      const plan = new Plan({ taskId: 'task-1', steps: [] });

      const verification = await verifier.verify(result, plan);

      // Should fall back to LLM judge
      expect(verification.methods).toContain('failed');
    });
  });

  describe('setLLMJudge', () => {
    test('uses custom LLM judge', async () => {
      verifier.setLLMJudge(async () => 0.75);

      const result = new Result({
        taskId: 'task-1',
        planId: 'plan-1',
        success: true,
        outputs: {}
      });
      const plan = new Plan({ taskId: 'task-1', steps: [] });

      const verification = await verifier.verify(result, plan);

      expect(verification.confidence).toBe(0.75);
    });
  });

  describe('_defaultLLMJudge', () => {
    test('gives higher confidence for successful results with outputs', async () => {
      const result = new Result({
        taskId: 'task-1',
        planId: 'plan-1',
        success: true,
        outputs: { filesModified: 5 },
        metadata: { tokensUsed: 10000 }
      });
      const plan = new Plan({ taskId: 'task-1', steps: [] });

      const verification = await verifier.verify(result, plan);
      expect(verification.confidence).toBeGreaterThan(0.7);
    });

    test('gives lower confidence for failed results', async () => {
      const result = new Result({
        taskId: 'task-1',
        planId: 'plan-1',
        success: false,
        outputs: {},
        error: 'Test failure'
      });
      const plan = new Plan({ taskId: 'task-1', steps: [] });

      const verification = await verifier.verify(result, plan);
      expect(verification.confidence).toBeLessThanOrEqual(0.5);
    });
  });
});
