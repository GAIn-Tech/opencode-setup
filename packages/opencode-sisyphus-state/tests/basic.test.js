
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { WorkflowStore, WorkflowExecutor, BudgetEnforcer } from '../src/index.js';
import { deriveDefaultParallelConcurrency } from '../src/executor.js';
import { AgentSandbox } from '../src/agent-sandbox.js';

const TEST_DB_BASE = path.join(os.tmpdir(), 'sisyphus-test');

describe('Sisyphus State Machine', () => {
  let store;
  let dbPath;

  beforeEach(() => {
    dbPath = `${TEST_DB_BASE}-${Date.now()}-${Math.random()}.db`;
    store = new WorkflowStore(dbPath);
  });

  afterEach(() => {
    if (store) store.close();
    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
        if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
        if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  it('should initialize store and create a run', () => {
    const runId = store.createRun('test-workflow', { foo: 'bar' });
    expect(runId).toBeDefined();

    const state = store.getRunState(runId);
    expect(state.id).toBe(runId);
    expect(state.status).toBe('running');
    expect(state.input).toEqual({ foo: 'bar' });
  });

  it('should execute a simple linear workflow', async () => {
    const executor = new WorkflowExecutor(store);

    const workflow = {
      name: 'linear-test',
      steps: [
        { id: 'step1', type: 'echo', message: 'hello' },
        { id: 'step2', type: 'echo', message: 'world' }
      ]
    };

    // Mock step handler
    executor.registerHandler('echo', async (step, input) => {
      return { message: step.message };
    });

    const result = await executor.execute(workflow, {});
    expect(result.status).toBe('completed');
    
    const state = store.getRunState(result.runId);
    expect(state.status).toBe('completed');
    expect(state.steps.length).toBe(2);
    expect(state.steps[0].status).toBe('completed');
    expect(state.steps[1].status).toBe('completed');
  });

  it('should be idempotent (skip completed steps)', async () => {
    const executor = new WorkflowExecutor(store);
    const runId = store.createRun('idempotency-test', {});

    // Manually mark step1 as completed
    store.upsertStep(runId, 'step1', 'completed', { executed: true });

    const workflow = {
      name: 'idempotency-test',
      steps: [
        { id: 'step1', type: 'echo' },
        { id: 'step2', type: 'echo' }
      ]
    };

    let executionCount = 0;
    executor.registerHandler('echo', async (step) => {
      executionCount++;
      return { executed: true };
    });

    // Execute with existing runId
    await executor.execute(workflow, {}, runId);

    // Should only execute step2
    expect(executionCount).toBe(1);
    
    const state = store.getRunState(runId);
    expect(state.steps.find(s => s.step_id === 'step1').status).toBe('completed');
    expect(state.steps.find(s => s.step_id === 'step2').status).toBe('completed');
  });

  it('should retry failed steps with backoff', async () => {
    const executor = new WorkflowExecutor(store);
    const workflow = {
      name: 'retry-test',
      steps: [{ id: 'step1', type: 'flaky', retries: 3, backoff: 10 }]
    };

    let attempts = 0;
    executor.registerHandler('flaky', async () => {
      attempts++;
      if (attempts < 3) throw new Error('Simulated failure');
      return { success: true };
    });

    const result = await executor.execute(workflow, {});
    expect(result.status).toBe('completed');
    expect(attempts).toBe(3); // 1 initial + 2 retries (success on 3rd)
    
    const state = store.getRunState(result.runId);
    const step = state.steps[0];
    expect(step.status).toBe('completed');
    // attempts in DB counts retries
    expect(step.attempts).toBe(2);
  });

  it('should fail after max retries', async () => {
    const executor = new WorkflowExecutor(store);
    const workflow = {
      name: 'fail-test',
      steps: [{ id: 'step1', type: 'fail', retries: 2, backoff: 10 }]
    };

    executor.registerHandler('fail', async () => {
      throw new Error('Permanent failure');
    });

    try {
      await executor.execute(workflow, {});
      throw new Error('Should have failed');
    } catch (e) {
      expect(e.message).toBe('Permanent failure');
    }

    const runs = store.db.prepare('SELECT * FROM workflow_runs WHERE name = ?').all('fail-test');
    const runId = runs[0].id;
    const state = store.getRunState(runId);
    expect(state.status).toBe('failed');
    
    const step = state.steps[0];
    expect(step.status).toBe('failed');
    expect(step.attempts).toBe(2); // Initial (0) + 2 retries
  });

  it('should execute parallel steps', async () => {
    const executor = new WorkflowExecutor(store);
    const workflow = {
      name: 'parallel-test',
      steps: [{
        id: 'p1',
        type: 'parallel-for',
        foreach: '${items}',
        substep: { id: 'worker', type: 'worker' }
      }]
    };

    executor.registerHandler('worker', async (step, context) => {
      return { result: context.item * 2 };
    });

    const result = await executor.execute(workflow, { items: [1, 2, 3] });
    expect(result.status).toBe('completed');

    const state = store.getRunState(result.runId);
    expect(state.steps.find(s => s.step_id === 'p1').status).toBe('completed');
    expect(state.steps.find(s => s.step_id === 'p1:0').status).toBe('completed');
    expect(state.steps.find(s => s.step_id === 'p1:1').status).toBe('completed');
    expect(state.steps.find(s => s.step_id === 'p1:2').status).toBe('completed');
  });

  it('should derive parallel-for concurrency from host specs', async () => {
    const executor = new WorkflowExecutor(store, {}, {
      systemInfo: {
        cpuCount: 8,
        totalMemoryBytes: 16 * 1024 * 1024 * 1024,
      },
    });

    const workflow = {
      name: 'parallel-derived-concurrency-test',
      steps: [{
        id: 'p1',
        type: 'parallel-for',
        foreach: '${items}',
        substep: { id: 'worker', type: 'worker' },
      }],
    };

    let active = 0;
    let maxActive = 0;
    executor.registerHandler('worker', async (step, context) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Bun.sleep(10);
      active -= 1;
      return { result: context.item };
    });

    await executor.execute(workflow, { items: [1, 2, 3, 4, 5, 6] });

    expect(executor.defaultParallelConcurrency).toBe(7);
    expect(maxActive).toBe(6);
  });

  it('should respect explicit step concurrency over host-derived default', async () => {
    const executor = new WorkflowExecutor(store, {}, {
      systemInfo: {
        cpuCount: 16,
        totalMemoryBytes: 64 * 1024 * 1024 * 1024,
      },
    });

    const workflow = {
      name: 'parallel-explicit-concurrency-test',
      steps: [{
        id: 'p1',
        type: 'parallel-for',
        foreach: '${items}',
        concurrency: 2,
        substep: { id: 'worker', type: 'worker' },
      }],
    };

    let active = 0;
    let maxActive = 0;
    executor.registerHandler('worker', async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Bun.sleep(10);
      active -= 1;
      return { ok: true };
    });

    await executor.execute(workflow, { items: [1, 2, 3, 4] });

    expect(executor.defaultParallelConcurrency).toBe(15);
    expect(maxActive).toBe(2);
  });

  it('should keep healthy policy parallel caps from reducing host-derived behavior', async () => {
    const executor = new WorkflowExecutor(store, {}, {
      systemInfo: {
        cpuCount: 8,
        totalMemoryBytes: 16 * 1024 * 1024 * 1024,
      },
    });

    const workflow = {
      name: 'parallel-policy-healthy-test',
      steps: [{
        id: 'p1',
        type: 'parallel-for',
        foreach: '${items}',
        substep: { id: 'worker', type: 'worker' },
      }],
    };

    let active = 0;
    let maxActive = 0;
    const processed = [];
    executor.registerHandler('worker', async (step, context) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      processed.push(context.item);
      await Bun.sleep(10);
      active -= 1;
      return { ok: true };
    });

    await executor.execute(workflow, {
      items: [1, 2, 3, 4, 5, 6],
      policyDecision: {
        outputs: {
          parallel: {
            maxFanout: 9,
            maxConcurrency: 9,
          },
        },
      },
    });

    expect(executor.defaultParallelConcurrency).toBe(7);
    expect(maxActive).toBe(6);
    expect(processed).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('should reduce parallel-for fanout and concurrency under pressured policy caps', async () => {
    const executor = new WorkflowExecutor(store, {}, {
      systemInfo: {
        cpuCount: 16,
        totalMemoryBytes: 64 * 1024 * 1024 * 1024,
      },
    });

    const workflow = {
      name: 'parallel-policy-pressured-test',
      steps: [{
        id: 'p1',
        type: 'parallel-for',
        foreach: '${items}',
        substep: { id: 'worker', type: 'worker' },
      }],
    };

    let active = 0;
    let maxActive = 0;
    const processed = [];
    executor.registerHandler('worker', async (step, context) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      processed.push(context.item);
      await Bun.sleep(10);
      active -= 1;
      return { ok: true };
    });

    await executor.execute(workflow, {
      items: [1, 2, 3, 4, 5, 6],
      orchestrationPolicyDecision: {
        outputs: {
          parallel: {
            maxFanout: 3,
            maxConcurrency: 2,
          },
        },
      },
    });

    expect(executor.defaultParallelConcurrency).toBe(15);
    expect(maxActive).toBe(2);
    expect(processed).toEqual([1, 2, 3]);
  });

  it('should fail open to host defaults when policy parallel caps are invalid', async () => {
    const executor = new WorkflowExecutor(store, {}, {
      systemInfo: {
        cpuCount: 8,
        totalMemoryBytes: 16 * 1024 * 1024 * 1024,
      },
    });

    const workflow = {
      name: 'parallel-policy-invalid-fail-open-test',
      steps: [{
        id: 'p1',
        type: 'parallel-for',
        foreach: '${items}',
        substep: { id: 'worker', type: 'worker' },
      }],
    };

    let active = 0;
    let maxActive = 0;
    const processed = [];
    executor.registerHandler('worker', async (step, context) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      processed.push(context.item);
      await Bun.sleep(10);
      active -= 1;
      return { ok: true };
    });

    await executor.execute(workflow, {
      items: [1, 2, 3, 4, 5, 6, 7, 8],
      policyDecision: {
        outputs: {
          parallel: {
            maxFanout: 'bad-value',
            maxConcurrency: 0,
          },
        },
      },
    });

    expect(executor.defaultParallelConcurrency).toBe(7);
    expect(maxActive).toBe(7);
    expect(processed).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('should keep low-spec systems at a safe minimum parallelism', () => {
    expect(deriveDefaultParallelConcurrency({
      cpuCount: 2,
      totalMemoryBytes: 2 * 1024 * 1024 * 1024,
    })).toBe(2);
  });

  it('should stop workflow when budget limits are exhausted', async () => {
    const budgetEnforcer = new BudgetEnforcer({ maxSteps: 1, maxTokens: 100000, maxTimeMs: 300000 });
    const executor = new WorkflowExecutor(store, {}, { budgetEnforcer });
    const workflow = {
      name: 'budget-stop-test',
      steps: [
        { id: 'step1', type: 'consume' },
        { id: 'step2', type: 'consume' }
      ]
    };

    executor.registerHandler('consume', async () => ({ ok: true }));

    await expect(executor.execute(workflow, {})).rejects.toThrow('Exceeded step limit (1)');

    const runs = store.db.prepare('SELECT * FROM workflow_runs WHERE name = ?').all('budget-stop-test');
    const state = store.getRunState(runs[0].id);
    expect(state.status).toBe('failed');
    expect(state.steps.find(s => s.step_id === 'step1').status).toBe('completed');
    expect(state.steps.find(s => s.step_id === 'step2').status).toBe('failed');
  });

  it('should exempt system tasks from budget checks', async () => {
    const budgetEnforcer = new BudgetEnforcer({ maxSteps: 0, maxTokens: 1, maxTimeMs: 1 });
    const executor = new WorkflowExecutor(store, {}, { budgetEnforcer });
    const workflow = {
      name: 'system-task-budget-exemption-test',
      steps: [
        { id: 'sys', type: 'noop', task: { type: 'system' } }
      ]
    };

    executor.registerHandler('noop', async () => ({ ok: true }));

    const result = await executor.execute(workflow, {});
    expect(result.status).toBe('completed');
  });

  it('should auto-wire BudgetEnforcer from budget options', async () => {
    const executor = new WorkflowExecutor(store, {}, {
      budget: { maxSteps: 1, maxTokens: 100000, maxTimeMs: 300000 }
    });

    const workflow = {
      name: 'auto-budget-wire-test',
      steps: [
        { id: 'step1', type: 'consume' },
        { id: 'step2', type: 'consume' }
      ]
    };

    executor.registerHandler('consume', async () => ({ ok: true }));

    await expect(executor.execute(workflow, {})).rejects.toThrow('Exceeded step limit (1)');
  });

  it('should block denied agent operations via sandbox manifests', async () => {
    const sandbox = new AgentSandbox();
    const executor = new WorkflowExecutor(store, {}, { agentSandbox: sandbox });
    const workflow = {
      name: 'sandbox-deny-test',
      steps: [
        { id: 'step1', type: 'noop', task: { agentRole: 'researcher', toolName: 'Write', agentId: 'agent-r1' } }
      ]
    };

    executor.registerHandler('noop', async () => ({ ok: true }));

    await expect(executor.execute(workflow, {})).rejects.toThrow('Capability denied');
    const denied = sandbox.getDeniedLog();
    expect(denied).toHaveLength(1);
    expect(denied[0].agentId).toBe('agent-r1');
    expect(denied[0].toolName).toBe('Write');
  });

  it('should allow operations permitted by sandbox manifests', async () => {
    const sandbox = new AgentSandbox();
    const executor = new WorkflowExecutor(store, {}, { agentSandbox: sandbox });
    const workflow = {
      name: 'sandbox-allow-test',
      steps: [
        { id: 'step1', type: 'noop', task: { agentRole: 'builder', toolName: 'Write', agentId: 'agent-b1' } }
      ]
    };

    executor.registerHandler('noop', async () => ({ ok: true }));

    const result = await executor.execute(workflow, {});
    expect(result.status).toBe('completed');
    expect(sandbox.getDeniedLog()).toHaveLength(0);
  });
});
