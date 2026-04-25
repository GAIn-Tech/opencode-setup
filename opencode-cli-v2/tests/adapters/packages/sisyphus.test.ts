import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { SisyphusAdapter } from '../../../src/adapters/packages/sisyphus';
import { SisyphusAdapterError } from '../../../src/adapters/packages/sisyphus-errors';
import type { Task } from '../../../src/ports/orchestration';

async function withInitializedAdapter(
  fn: (adapter: SisyphusAdapter) => Promise<void>,
  options: ConstructorParameters<typeof SisyphusAdapter>[0] = {}
): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), 'opencode-cli-v2-sisyphus-adapter-'));
  const adapter = new SisyphusAdapter({
    dbPath: join(tempDir, 'state.db'),
    ...options
  });

  await adapter.runLoad();
  await adapter.runInitialize();

  try {
    await fn(adapter);
  } finally {
    await adapter.runShutdown();
    try {
      await rm(tempDir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 25
      });
    } catch {
      // Legacy sqlite runtime can hold short-lived locks on Windows.
    }
  }
}

async function expectAdapterError(
  candidate: Promise<unknown>,
  code: SisyphusAdapterError['code']
): Promise<void> {
  try {
    await candidate;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(SisyphusAdapterError);
    expect((error as SisyphusAdapterError).code).toBe(code);

    return;
  }

  throw new Error('Expected promise to reject with SisyphusAdapterError');
}

describe('SisyphusAdapter', () => {
  test('loads, initializes, and returns healthy status', async () => {
    await withInitializedAdapter(async (adapter) => {
      const health = await adapter.runHealthCheck();

      expect(adapter.getStatus()).toBe('ready');
      expect(health.status).toBe('healthy');
    });
  });

  test('spawns, lists, and kills agents via legacy store', async () => {
    await withInitializedAdapter(async (adapter) => {
      const port = adapter.getPort();

      const agentId = await port.spawnAgent({
        type: 'builder',
        task: 'Implement migration bridge',
        model: 'claude-sonnet-4-5',
        skills: ['analysis', 'typescript'],
        metadata: {
          ticket: 'W11-ORCH-01'
        },
        timeoutMs: 30_000
      });

      expect(await port.getAgentStatus(agentId)).toBe('running');

      const agents = await port.listAgents();
      const spawnedAgent = agents.find((agent) => agent.id === agentId);

      expect(spawnedAgent).toBeDefined();
      expect(spawnedAgent?.config.type).toBe('builder');

      await port.killAgent(agentId);

      expect(await port.getAgentStatus(agentId)).toBe('cancelled');
    });
  });

  test('executes task, retrieves status, and gets trajectory', async () => {
    await withInitializedAdapter(async (adapter) => {
      const port = adapter.getPort();
      const task: Task = {
        type: 'analysis',
        priority: 'normal',
        payload: {
          prompt: 'Summarize adapter mapping decisions'
        }
      };

      const result = await port.executeTask(task);
      expect(result.status).toBe('completed');
      expect(result.id.length).toBeGreaterThan(0);

      const taskStatus = await port.getTaskStatus(result.id);
      expect(taskStatus).toBe('completed');

      const trajectory = await port.getTrajectory(result.id);
      expect(trajectory.taskId).toBe(result.id);
      expect(trajectory.events.length).toBeGreaterThan(0);

      await port.replayTrajectory(result.id, {
        dryRun: true,
        preserveTimestamps: false
      });
    });
  });

  test('supports task cancellation state mapping', async () => {
    await withInitializedAdapter(
      async (adapter) => {
        const port = adapter.getPort();
        const taskId = 'task-cancel-1';

        const execution = port.executeTask({
          id: taskId,
          type: 'slow-task',
          priority: 'normal',
          payload: {
            delayMs: 100
          }
        });

        await Bun.sleep(10);
        await port.cancelTask(taskId);

        expect(await port.getTaskStatus(taskId)).toBe('cancelled');

        const result = await execution;
        expect(result.status).toBe('cancelled');
      },
      {
        taskRunner: async (task) => {
          const delayMs =
            typeof task.payload.delayMs === 'number' && task.payload.delayMs > 0
              ? task.payload.delayMs
              : 0;

          if (delayMs > 0) {
            await Bun.sleep(delayMs);
          }

          return {
            ok: true,
            payload: task.payload
          };
        }
      }
    );
  });

  test('maps validation and not-found failures to adapter errors', async () => {
    await withInitializedAdapter(async (adapter) => {
      const port = adapter.getPort();

      await expectAdapterError(
        port.spawnAgent({
          type: '',
          task: 'invalid-agent-config'
        }),
        'VALIDATION_ERROR'
      );

      await expectAdapterError(port.getAgentStatus('missing-agent'), 'AGENT_NOT_FOUND');
      await expectAdapterError(port.getTaskStatus('missing-task'), 'TASK_NOT_FOUND');
      await expectAdapterError(port.getTrajectory('missing-task'), 'TRAJECTORY_NOT_FOUND');
    });
  });
});
