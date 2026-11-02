import { describe, expect, test } from 'bun:test';

import { PackageAdapter } from '../../../src/adapters/base';
import {
  OhMyOpenCodePluginAdapter,
  type AgentRegistry,
  type RegisteredAgent
} from '../../../src/adapters/plugins/oh-my-opencode';

class InMemoryAgentRegistry implements AgentRegistry {
  public readonly agents: RegisteredAgent[] = [];

  public registerAgent(agent: RegisteredAgent): void {
    this.agents.push(agent);
  }
}

describe('OhMyOpenCodePluginAdapter', () => {
  test('extends package adapter base contract', () => {
    const adapter = new OhMyOpenCodePluginAdapter({
      loadLegacyModule: async () => ({ createBuiltinAgents: async () => ({}) })
    });

    expect(adapter).toBeInstanceOf(PackageAdapter);
  });

  test('registers legacy agents in registry', async () => {
    const adapter = new OhMyOpenCodePluginAdapter({
      loadLegacyModule: async () => ({
        createBuiltinAgents: async () => ({
          prom: {
            model: 'anthropic/claude-opus-4-6',
            instructions: 'Strategic planner',
            tools: ['read', 'task']
          },
          'sisyphus-junior': {
            model: 'anthropic/claude-sonnet-4-6',
            instructions: 'Task executor',
            tools: ['read', 'write']
          },
          atlas: {
            model: 'anthropic/claude-sonnet-4-6',
            instructions: 'Orchestrator',
            tools: ['todowrite', 'read']
          }
        })
      })
    });

    await adapter.runLoad();
    await adapter.runInitialize();

    const registry = new InMemoryAgentRegistry();
    await adapter.registerAgents(registry);

    expect(registry.agents.map((agent) => agent.id)).toEqual(['prom', 'sisyphus-junior', 'atlas']);
    expect(registry.agents[0]?.role).toBe('strategic-planner');
    expect(registry.agents[1]?.role).toBe('executor');
  });

  test('orchestrates multi-agent workflow through plugin hook', async () => {
    const adapter = new OhMyOpenCodePluginAdapter({
      loadLegacyModule: async () => ({
        createBuiltinAgents: async () => ({
          prom: { model: 'm1', instructions: 'planner' },
          atlas: { model: 'm2', instructions: 'orchestrator' },
          'sisyphus-junior': { model: 'm3', instructions: 'executor' }
        })
      })
    });

    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();
    const [result] = await port.runHook({
      name: 'orchestrate.workflow',
      payload: {
        patternId: 'plan-execute-review',
        input: {
          task: 'Add adapter tests'
        }
      }
    });

    expect(result).toBeDefined();
    if (!result) throw new Error('Expected hook result');
    expect(result.handled).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.output).toMatchObject({
      patternId: 'plan-execute-review',
      status: 'completed'
    });
  });

  test('returns hook error for unknown orchestration pattern', async () => {
    const adapter = new OhMyOpenCodePluginAdapter({
      loadLegacyModule: async () => ({
        createBuiltinAgents: async () => ({ prom: { model: 'm1', instructions: 'planner' } })
      })
    });

    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();
    const [result] = await port.runHook({
      name: 'orchestrate.workflow',
      payload: {
        patternId: 'does-not-exist',
        input: {}
      }
    });

    expect(result).toBeDefined();
    if (!result) throw new Error('Expected hook result');
    expect(result.handled).toBe(false);
    expect(result.error).toContain('Unknown orchestration pattern');
  });

  test('fails load when legacy module shape is invalid', async () => {
    const adapter = new OhMyOpenCodePluginAdapter({
      loadLegacyModule: async () => ({})
    });

    await expect(adapter.runLoad()).rejects.toThrow('Failed to load adapter: oh-my-opencode');
  });
});
