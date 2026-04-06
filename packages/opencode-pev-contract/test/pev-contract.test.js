import { describe, test, expect } from 'bun:test';
import {
  PEVContract,
  Planner,
  Executor,
  Verifier,
  Critic,
  Plan,
  Result,
  Verification,
  validatePlan,
  validateResult,
  validateVerification,
  PEVRole,
  PEVLifecycleEvent
} from '../src/index.js';

describe('PEV Contract', () => {
  describe('PEVRole enum', () => {
    test('defines all four roles', () => {
      expect(PEVRole.PLANNER).toBe('planner');
      expect(PEVRole.EXECUTOR).toBe('executor');
      expect(PEVRole.VERIFIER).toBe('verifier');
      expect(PEVRole.CRITIC).toBe('critic');
    });
  });

  describe('PEVLifecycleEvent enum', () => {
    test('defines all lifecycle events', () => {
      expect(PEVLifecycleEvent.PLAN_CREATED).toBe('plan_created');
      expect(PEVLifecycleEvent.PLAN_VALIDATED).toBe('plan_validated');
      expect(PEVLifecycleEvent.EXECUTION_STARTED).toBe('execution_started');
      expect(PEVLifecycleEvent.EXECUTION_COMPLETED).toBe('execution_completed');
      expect(PEVLifecycleEvent.VERIFICATION_STARTED).toBe('verification_started');
      expect(PEVLifecycleEvent.VERIFICATION_PASSED).toBe('verification_passed');
      expect(PEVLifecycleEvent.VERIFICATION_FAILED).toBe('verification_failed');
      expect(PEVLifecycleEvent.CRITIC_EVALUATED).toBe('critic_evaluated');
    });
  });

  describe('Plan class', () => {
    test('creates a valid plan', () => {
      const plan = new Plan({
        taskId: 'task-1',
        steps: [
          { id: 'step-1', type: 'read', description: 'Read file' },
          { id: 'step-2', type: 'edit', description: 'Edit file' }
        ],
        metadata: { complexity: 'moderate' }
      });

      expect(plan.taskId).toBe('task-1');
      expect(plan.steps).toHaveLength(2);
      expect(plan.metadata.complexity).toBe('moderate');
      expect(plan.createdAt).toBeDefined();
    });

    test('plan steps have required fields', () => {
      const plan = new Plan({
        taskId: 'task-1',
        steps: [{ id: 's1', type: 'read', description: 'test' }]
      });

      expect(plan.steps[0].id).toBe('s1');
      expect(plan.steps[0].type).toBe('read');
      expect(plan.steps[0].description).toBe('test');
    });
  });

  describe('Result class', () => {
    test('creates a valid result', () => {
      const result = new Result({
        taskId: 'task-1',
        planId: 'plan-1',
        success: true,
        outputs: { filesModified: 2 },
        metadata: { tokensUsed: 5000 }
      });

      expect(result.taskId).toBe('task-1');
      expect(result.planId).toBe('plan-1');
      expect(result.success).toBe(true);
      expect(result.outputs.filesModified).toBe(2);
      expect(result.metadata.tokensUsed).toBe(5000);
      expect(result.completedAt).toBeDefined();
    });

    test('creates a failed result', () => {
      const result = new Result({
        taskId: 'task-1',
        planId: 'plan-1',
        success: false,
        error: 'Step failed: edit denied',
        outputs: {}
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Step failed: edit denied');
    });
  });

  describe('Verification class', () => {
    test('creates a passed verification', () => {
      const verification = new Verification({
        taskId: 'task-1',
        planId: 'plan-1',
        passed: true,
        methods: ['tests', 'static'],
        confidence: 0.95,
        details: { testsPassed: 12, testsFailed: 0 }
      });

      expect(verification.passed).toBe(true);
      expect(verification.methods).toContain('tests');
      expect(verification.confidence).toBe(0.95);
      expect(verification.details.testsPassed).toBe(12);
    });

    test('creates a failed verification', () => {
      const verification = new Verification({
        taskId: 'task-1',
        planId: 'plan-1',
        passed: false,
        methods: ['tests'],
        confidence: 0.0,
        failures: ['Test suite failed: 3 failures'],
        details: { testsPassed: 9, testsFailed: 3 }
      });

      expect(verification.passed).toBe(false);
      expect(verification.failures).toHaveLength(1);
      expect(verification.confidence).toBe(0.0);
    });
  });

  describe('validatePlan', () => {
    test('validates a correct plan', () => {
      const plan = {
        taskId: 'task-1',
        steps: [{ id: 's1', type: 'read', description: 'test' }]
      };
      const result = validatePlan(plan);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('rejects plan without taskId', () => {
      const plan = {
        steps: [{ id: 's1', type: 'read', description: 'test' }]
      };
      const result = validatePlan(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('taskId'))).toBe(true);
    });

    test('rejects plan without steps', () => {
      const plan = { taskId: 'task-1' };
      const result = validatePlan(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('steps'))).toBe(true);
    });

    test('rejects plan with empty steps', () => {
      const plan = { taskId: 'task-1', steps: [] };
      const result = validatePlan(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('at least one'))).toBe(true);
    });

    test('rejects plan with invalid step (missing id)', () => {
      const plan = {
        taskId: 'task-1',
        steps: [{ type: 'read', description: 'test' }]
      };
      const result = validatePlan(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('id'))).toBe(true);
    });

    test('rejects plan with invalid step (missing type)', () => {
      const plan = {
        taskId: 'task-1',
        steps: [{ id: 's1', description: 'test' }]
      };
      const result = validatePlan(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('type'))).toBe(true);
    });
  });

  describe('validateResult', () => {
    test('validates a correct result', () => {
      const result = {
        taskId: 'task-1',
        planId: 'plan-1',
        success: true,
        outputs: {}
      };
      const validation = validateResult(result);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    test('rejects result without taskId', () => {
      const result = { planId: 'plan-1', success: true, outputs: {} };
      const validation = validateResult(result);
      expect(validation.valid).toBe(false);
    });

    test('rejects result without success field', () => {
      const result = { taskId: 'task-1', planId: 'plan-1', outputs: {} };
      const validation = validateResult(result);
      expect(validation.valid).toBe(false);
    });
  });

  describe('validateVerification', () => {
    test('validates a correct verification', () => {
      const verification = {
        taskId: 'task-1',
        planId: 'plan-1',
        passed: true,
        methods: ['tests'],
        confidence: 0.9
      };
      const validation = validateVerification(verification);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    test('rejects verification without taskId', () => {
      const verification = { planId: 'plan-1', passed: true, methods: ['tests'], confidence: 0.9 };
      const validation = validateVerification(verification);
      expect(validation.valid).toBe(false);
    });

    test('rejects verification with invalid confidence (>1)', () => {
      const verification = {
        taskId: 'task-1',
        planId: 'plan-1',
        passed: true,
        methods: ['tests'],
        confidence: 1.5
      };
      const validation = validateVerification(verification);
      expect(validation.valid).toBe(false);
    });

    test('rejects verification with invalid confidence (<0)', () => {
      const verification = {
        taskId: 'task-1',
        planId: 'plan-1',
        passed: true,
        methods: ['tests'],
        confidence: -0.1
      };
      const validation = validateVerification(verification);
      expect(validation.valid).toBe(false);
    });

    test('rejects verification without methods', () => {
      const verification = {
        taskId: 'task-1',
        planId: 'plan-1',
        passed: true,
        confidence: 0.9
      };
      const validation = validateVerification(verification);
      expect(validation.valid).toBe(false);
    });
  });

  describe('Planner interface', () => {
    test('Planner is a class with required methods', () => {
      expect(typeof Planner).toBe('function');
      // Check that it's an abstract-like class (has decompose and validate)
      const planner = new Planner();
      expect(typeof planner.decompose).toBe('function');
      expect(typeof planner.validate).toBe('function');
    });

    test('Planner.decompose throws if not overridden', () => {
      const planner = new Planner();
      expect(() => planner.decompose({ task_type: 'debug' })).toThrow('must be implemented');
    });

    test('Planner.validate returns true for valid plan', () => {
      const planner = new Planner();
      const plan = new Plan({
        taskId: 'task-1',
        steps: [{ id: 's1', type: 'read', description: 'test' }]
      });
      expect(planner.validate(plan)).toBe(true);
    });

    test('Planner.validate returns false for invalid plan', () => {
      const planner = new Planner();
      expect(planner.validate({})).toBe(false);
    });

    test('Concrete Planner implementation works', () => {
      class TestPlanner extends Planner {
        decompose(taskContext) {
          return new Plan({
            taskId: taskContext.task_type,
            steps: [{ id: 's1', type: 'plan', description: `Plan for ${taskContext.task_type}` }]
          });
        }
      }

      const planner = new TestPlanner();
      const plan = planner.decompose({ task_type: 'debug' });
      expect(plan).toBeInstanceOf(Plan);
      expect(plan.taskId).toBe('debug');
      expect(plan.steps).toHaveLength(1);
      expect(planner.validate(plan)).toBe(true);
    });
  });

  describe('Executor interface', () => {
    test('Executor is a class with required methods', () => {
      expect(typeof Executor).toBe('function');
      const executor = new Executor();
      expect(typeof executor.execute).toBe('function');
    });

    test('Executor.execute throws if not overridden', async () => {
      const executor = new Executor();
      const plan = new Plan({
        taskId: 'task-1',
        steps: [{ id: 's1', type: 'read', description: 'test' }]
      });
      await expect(executor.execute(plan, {})).rejects.toThrow('must be implemented');
    });

    test('Concrete Executor implementation works', async () => {
      class TestExecutor extends Executor {
        async execute(plan, context) {
          return new Result({
            taskId: plan.taskId,
            planId: plan.taskId,
            success: true,
            outputs: { executed: true, context }
          });
        }
      }

      const executor = new TestExecutor();
      const plan = new Plan({
        taskId: 'task-1',
        steps: [{ id: 's1', type: 'read', description: 'test' }]
      });
      const result = await executor.execute(plan, { extra: 'data' });
      expect(result).toBeInstanceOf(Result);
      expect(result.success).toBe(true);
      expect(result.outputs.executed).toBe(true);
    });
  });

  describe('Verifier interface', () => {
    test('Verifier is a class with required methods', () => {
      expect(typeof Verifier).toBe('function');
      const verifier = new Verifier();
      expect(typeof verifier.verify).toBe('function');
    });

    test('Verifier.verify throws if not overridden', async () => {
      const verifier = new Verifier();
      const result = new Result({
        taskId: 'task-1',
        planId: 'plan-1',
        success: true,
        outputs: {}
      });
      const plan = new Plan({
        taskId: 'task-1',
        steps: [{ id: 's1', type: 'read', description: 'test' }]
      });
      await expect(verifier.verify(result, plan)).rejects.toThrow('must be implemented');
    });

    test('Concrete Verifier implementation works', async () => {
      class TestVerifier extends Verifier {
        async verify(result, plan) {
          return new Verification({
            taskId: result.taskId,
            planId: result.planId,
            passed: result.success,
            methods: ['tests'],
            confidence: result.success ? 0.9 : 0.0,
            details: { verified: true }
          });
        }
      }

      const verifier = new TestVerifier();
      const result = new Result({
        taskId: 'task-1',
        planId: 'plan-1',
        success: true,
        outputs: {}
      });
      const plan = new Plan({
        taskId: 'task-1',
        steps: [{ id: 's1', type: 'read', description: 'test' }]
      });
      const verification = await verifier.verify(result, plan);
      expect(verification).toBeInstanceOf(Verification);
      expect(verification.passed).toBe(true);
      expect(verification.confidence).toBe(0.9);
    });
  });

  describe('Critic interface', () => {
    test('Critic is a class with required methods', () => {
      expect(typeof Critic).toBe('function');
      const critic = new Critic();
      expect(typeof critic.evaluate).toBe('function');
    });

    test('Critic.evaluate throws if not overridden', async () => {
      const critic = new Critic();
      const results = [
        new Result({ taskId: 'task-1', planId: 'plan-1', success: true, outputs: {} })
      ];
      await expect(critic.evaluate(results)).rejects.toThrow('must be implemented');
    });

    test('Concrete Critic implementation works', async () => {
      class TestCritic extends Critic {
        async evaluate(results) {
          const best = results.find(r => r.success);
          return best || results[0];
        }
      }

      const critic = new TestCritic();
      const results = [
        new Result({ taskId: 'task-1', planId: 'plan-1', success: false, outputs: {}, error: 'failed' }),
        new Result({ taskId: 'task-1', planId: 'plan-2', success: true, outputs: { better: true } })
      ];
      const best = await critic.evaluate(results);
      expect(best).toBeInstanceOf(Result);
      expect(best.success).toBe(true);
    });
  });

  describe('PEVContract orchestrator', () => {
    test('creates a contract with all roles', () => {
      const contract = new PEVContract();
      expect(contract.planner).toBeNull();
      expect(contract.executor).toBeNull();
      expect(contract.verifier).toBeNull();
      expect(contract.critic).toBeNull();
    });

    test('registers all roles', () => {
      const contract = new PEVContract();

      class TestPlanner extends Planner {
        decompose(task) {
          return new Plan({ taskId: task.task_type, steps: [] });
        }
      }
      class TestExecutor extends Executor {
        async execute(plan) {
          return new Result({ taskId: plan.taskId, planId: plan.taskId, success: true, outputs: {} });
        }
      }
      class TestVerifier extends Verifier {
        async verify(result) {
          return new Verification({ taskId: result.taskId, planId: result.planId, passed: true, methods: ['tests'], confidence: 0.9 });
        }
      }
      class TestCritic extends Critic {
        async evaluate(results) { return results[0]; }
      }

      contract.registerRole(PEVRole.PLANNER, new TestPlanner());
      contract.registerRole(PEVRole.EXECUTOR, new TestExecutor());
      contract.registerRole(PEVRole.VERIFIER, new TestVerifier());
      contract.registerRole(PEVRole.CRITIC, new TestCritic());

      expect(contract.planner).toBeInstanceOf(TestPlanner);
      expect(contract.executor).toBeInstanceOf(TestExecutor);
      expect(contract.verifier).toBeInstanceOf(TestVerifier);
      expect(contract.critic).toBeInstanceOf(TestCritic);
    });

    test('rejects invalid role registration', () => {
      const contract = new PEVContract();
      expect(() => contract.registerRole('invalid_role', {})).toThrow('Invalid PEV role');
    });

    test('executes full PEV lifecycle', async () => {
      const contract = new PEVContract();

      class TestPlanner extends Planner {
        decompose(task) {
          return new Plan({
            taskId: task.task_type,
            steps: [{ id: 's1', type: 'test', description: 'test step' }]
          });
        }
      }
      class TestExecutor extends Executor {
        async execute(plan) {
          return new Result({ taskId: plan.taskId, planId: plan.taskId, success: true, outputs: { done: true } });
        }
      }
      class TestVerifier extends Verifier {
        async verify(result) {
          return new Verification({
            taskId: result.taskId,
            planId: result.planId,
            passed: result.success,
            methods: ['tests'],
            confidence: result.success ? 0.95 : 0.0
          });
        }
      }

      contract.registerRole(PEVRole.PLANNER, new TestPlanner());
      contract.registerRole(PEVRole.EXECUTOR, new TestExecutor());
      contract.registerRole(PEVRole.VERIFIER, new TestVerifier());

      const events = [];
      contract.onEvent((event) => events.push(event));

      const taskContext = { task_type: 'debug' };
      const plan = contract.planner.decompose(taskContext);
      expect(plan).toBeInstanceOf(Plan);
      expect(contract.planner.validate(plan)).toBe(true);

      const result = await contract.executor.execute(plan, {});
      expect(result).toBeInstanceOf(Result);
      expect(result.success).toBe(true);

      const verification = await contract.verifier.verify(result, plan);
      expect(verification).toBeInstanceOf(Verification);
      expect(verification.passed).toBe(true);
      expect(verification.confidence).toBe(0.95);

      expect(events.length).toBe(0); // Events are emitted via callback, not stored
    });

    test('isReady returns true only when all required roles are registered', () => {
      const contract = new PEVContract();
      expect(contract.isReady()).toBe(false);

      class TestPlanner extends Planner { decompose() { return new Plan({ taskId: 'x', steps: [] }); } }
      class TestExecutor extends Executor { async execute() { return new Result({ taskId: 'x', planId: 'x', success: true, outputs: {} }); } }
      class TestVerifier extends Verifier { async verify() { return new Verification({ taskId: 'x', planId: 'x', passed: true, methods: [], confidence: 1 }); } }

      contract.registerRole(PEVRole.PLANNER, new TestPlanner());
      expect(contract.isReady()).toBe(false);

      contract.registerRole(PEVRole.EXECUTOR, new TestExecutor());
      expect(contract.isReady()).toBe(false);

      contract.registerRole(PEVRole.VERIFIER, new TestVerifier());
      expect(contract.isReady()).toBe(true);
    });
  });
});
