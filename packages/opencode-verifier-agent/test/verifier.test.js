import { describe, test, expect, beforeEach } from 'bun:test';
import { CodeVerifier, DEFAULT_POLICY } from '../src/index.js';
import { Verifier, Verification, Plan, Result } from '../../opencode-pev-contract/src/index.js';

describe('CodeVerifier', () => {
  let verifier;

  beforeEach(() => {
    verifier = new CodeVerifier({
      workDir: process.cwd(),
      policy: {
        ...DEFAULT_POLICY,
        test_command: 'echo "test pass"',
        lint_command: 'echo "lint pass"',
        timeout_ms: 5000
      }
    });
  });

  describe('Implements Verifier interface', () => {
    test('extends Verifier class', () => {
      expect(verifier).toBeInstanceOf(Verifier);
    });

    test('has verify method', () => {
      expect(typeof verifier.verify).toBe('function');
    });
  });

  describe('verify', () => {
    test('returns Verification object', async () => {
      const result = new Result({
        taskId: 'task-1',
        planId: 'plan-1',
        success: true,
        outputs: { filesModified: 2 }
      });
      const plan = new Plan({
        taskId: 'task-1',
        steps: [{ id: 's1', type: 'edit', description: 'test' }]
      });

      const verification = await verifier.verify(result, plan);

      expect(verification).toBeInstanceOf(Verification);
      expect(verification.taskId).toBe('task-1');
      expect(verification.planId).toBe('plan-1');
      expect(verification.methods).toBeDefined();
      expect(verification.confidence).toBeGreaterThanOrEqual(0);
      expect(verification.confidence).toBeLessThanOrEqual(1);
    });

    test('selects minimal methods for successful result with on-failure policy', async () => {
      const v = new CodeVerifier({
        policy: { ...DEFAULT_POLICY, when: 'on-failure', test_command: 'echo pass', lint_command: 'echo pass' }
      });

      const result = new Result({
        taskId: 'task-1',
        planId: 'plan-1',
        success: true,
        outputs: {}
      });
      const plan = new Plan({ taskId: 'task-1', steps: [{ id: 's1', type: 'edit' }] });

      const verification = await v.verify(result, plan);

      // on-failure policy should only run static for successful results
      expect(verification.methods).toContain('static');
    });

    test('runs full verification on failure with on-failure policy', async () => {
      const v = new CodeVerifier({
        policy: { ...DEFAULT_POLICY, when: 'on-failure', test_command: 'echo pass', lint_command: 'echo pass' }
      });

      const result = new Result({
        taskId: 'task-1',
        planId: 'plan-1',
        success: false,
        outputs: {},
        error: 'Something failed'
      });
      const plan = new Plan({ taskId: 'task-1', steps: [{ id: 's1', type: 'edit' }] });

      const verification = await v.verify(result, plan);

      // on-failure policy should run all methods for failed results
      expect(verification.methods.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('verifyTests', () => {
    test('passes when test command succeeds', async () => {
      const result = await verifier.verifyTests({ success: true, outputs: {} });
      expect(result.passed).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    test('fails when test command fails', async () => {
      const v = new CodeVerifier({
        policy: { ...DEFAULT_POLICY, test_command: 'exit 1', timeout_ms: 5000 }
      });
      const result = await v.verifyTests({ success: true, outputs: {} });
      expect(result.passed).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
    });
  });

  describe('verifyStatic', () => {
    test('passes when lint command succeeds', async () => {
      const result = await verifier.verifyStatic({ success: true, outputs: {} });
      expect(result.passed).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    test('fails when lint command fails', async () => {
      const v = new CodeVerifier({
        policy: { ...DEFAULT_POLICY, lint_command: 'exit 1', timeout_ms: 5000 }
      });
      const result = await v.verifyStatic({ success: true, outputs: {} });
      expect(result.passed).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
    });
  });

  describe('verifyLLM', () => {
    test('passes when result has outputs', async () => {
      const result = await verifier.verifyLLM(
        { success: true, outputs: { filesModified: 2 } },
        { taskId: 'task-1', steps: [] }
      );
      expect(result.passed).toBe(true);
    });

    test('fails when result has no outputs', async () => {
      const result = await verifier.verifyLLM(
        { success: true, outputs: {} },
        { taskId: 'task-1', steps: [] }
      );
      expect(result.passed).toBe(false);
      expect(result.failures.some(f => f.includes('No outputs'))).toBe(true);
    });

    test('fails when result has error', async () => {
      const result = await verifier.verifyLLM(
        { success: false, outputs: {}, error: 'Something broke' },
        { taskId: 'task-1', steps: [] }
      );
      expect(result.passed).toBe(false);
      expect(result.failures.some(f => f.includes('Execution error'))).toBe(true);
    });
  });

  describe('Policy management', () => {
    test('getPolicy returns current policy', () => {
      const policy = verifier.getPolicy();
      expect(policy).toBeDefined();
      expect(policy.when).toBe('on-failure');
    });

    test('setPolicy updates policy', () => {
      verifier.setPolicy({ when: 'always', max_retries: 5 });
      const policy = verifier.getPolicy();
      expect(policy.when).toBe('always');
      expect(policy.max_retries).toBe(5);
    });
  });

  describe('DEFAULT_POLICY', () => {
    test('has expected structure', () => {
      expect(DEFAULT_POLICY.when).toBe('on-failure');
      expect(DEFAULT_POLICY.methods).toContain('tests');
      expect(DEFAULT_POLICY.methods).toContain('static');
      expect(DEFAULT_POLICY.max_retries).toBe(3);
      expect(DEFAULT_POLICY.escalation).toBe('human');
    });
  });
});
