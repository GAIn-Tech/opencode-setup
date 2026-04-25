import { describe, expect, test } from 'bun:test';

import {
  type BudgetPort,
  BudgetStatusSchema,
  type LearningPort,
  LearningSignalSchema,
  type MCPPort,
  MCPToolCallRequestSchema,
  type OrchestrationPort,
  TaskSchema,
  type PluginsPort,
  PluginManifestSchema,
  type RoutingPort,
  RoutingRequestSchema,
  type SkillsPort,
  SkillExecutionRequestSchema
} from '../../src/ports';

describe('Port contracts', () => {
  test('orchestration port interface shape compiles', () => {
    const port: OrchestrationPort = {
      async spawnAgent() {
        return 'agent-1';
      },
      async killAgent() {},
      async getAgentStatus() {
        return 'running';
      },
      async listAgents() {
        return [];
      },
      async executeTask() {
        return {
          id: 'task-1',
          status: 'completed',
          startedAt: new Date().toISOString()
        };
      },
      async cancelTask() {},
      async getTaskStatus() {
        return 'completed';
      },
      async getTrajectory() {
        return { taskId: 'task-1', events: [] };
      },
      async replayTrajectory() {}
    };

    expect(port).toBeDefined();
    expect(TaskSchema.safeParse({ type: 'analysis', payload: {} }).success).toBe(true);
    expect(TaskSchema.safeParse({ type: '', payload: {} }).success).toBe(false);
  });

  test('routing port interface and schema contract', () => {
    const port: RoutingPort = {
      async listModels() {
        return [];
      },
      async selectModel() {
        return { modelId: 'm1', reason: 'fit', score: 0.9, alternatives: [] };
      },
      async getModelHealth(modelId) {
        return { modelId, status: 'healthy', checkedAt: new Date().toISOString() };
      },
      async recordOutcome() {},
      async getStats() {
        return {
          totalRoutes: 0,
          successRate: 1,
          averageLatencyMs: 0,
          modelSelectionCounts: {}
        };
      }
    };

    expect(port).toBeDefined();
    expect(RoutingRequestSchema.safeParse({ taskType: 'chat', prompt: 'hi' }).success).toBe(true);
    expect(RoutingRequestSchema.safeParse({ taskType: '', prompt: 'hi' }).success).toBe(false);
  });

  test('budget port interface and schema contract', () => {
    const port: BudgetPort = {
      async upsertAllocation() {},
      async consumeTokens() {
        return {
          sessionId: 's',
          model: 'm',
          usedTokens: 10,
          remainingTokens: 90,
          maxTokens: 100,
          warningThreshold: 75,
          criticalThreshold: 80,
          status: 'healthy',
          updatedAt: new Date().toISOString()
        };
      },
      async checkBudget() {
        return {
          allowed: true,
          remainingTokens: 90,
          usedTokens: 10,
          maxTokens: 100,
          status: 'healthy'
        };
      },
      async getStatus() {
        return {
          sessionId: 's',
          model: 'm',
          usedTokens: 10,
          remainingTokens: 90,
          maxTokens: 100,
          warningThreshold: 75,
          criticalThreshold: 80,
          status: 'healthy',
          updatedAt: new Date().toISOString()
        };
      },
      async listSessions() {
        return [];
      },
      async reset() {}
    };

    expect(port).toBeDefined();
    expect(
      BudgetStatusSchema.safeParse({
        sessionId: 's',
        model: 'm',
        usedTokens: 1,
        remainingTokens: 99,
        maxTokens: 100,
        warningThreshold: 75,
        criticalThreshold: 80,
        status: 'healthy',
        updatedAt: new Date().toISOString()
      }).success
    ).toBe(true);
  });

  test('skills port interface and schema contract', () => {
    const port: SkillsPort = {
      async listSkills() {
        return [];
      },
      async getSkill() {
        return null;
      },
      async loadSkill() {
        return { loaded: true };
      },
      async unloadSkill() {},
      async executeSkill() {
        return { success: true, logs: [] };
      }
    };

    expect(port).toBeDefined();
    expect(SkillExecutionRequestSchema.safeParse({ name: 'my-skill' }).success).toBe(true);
    expect(SkillExecutionRequestSchema.safeParse({ name: '' }).success).toBe(false);
  });

  test('learning port interface and schema contract', () => {
    const port: LearningPort = {
      async ingestSignal() {},
      async analyzePatterns() {
        return [];
      },
      async recommend() {
        return [];
      },
      async applyAdaptation() {},
      async getState() {
        return { patternCount: 0, signalCount: 0, version: '1.0.0' };
      }
    };

    expect(port).toBeDefined();
    expect(
      LearningSignalSchema.safeParse({
        id: 'sig-1',
        sessionId: 's-1',
        category: 'routing',
        input: {},
        timestamp: new Date().toISOString()
      }).success
    ).toBe(true);
  });

  test('plugins port interface and schema contract', () => {
    const port: PluginsPort = {
      async listPlugins() {
        return [];
      },
      async installPlugin() {
        return {
          id: 'plugin-1',
          name: 'Plugin',
          version: '1.0.0',
          entrypoint: 'index.js',
          hooks: [],
          capabilities: [],
          requiredPermissions: []
        };
      },
      async uninstallPlugin() {},
      async loadPlugin() {},
      async unloadPlugin() {},
      async enablePlugin() {},
      async disablePlugin() {},
      async runHook() {
        return [];
      },
      async getPluginHealth(pluginId) {
        return {
          pluginId,
          status: 'healthy',
          checkedAt: new Date().toISOString()
        };
      }
    };

    expect(port).toBeDefined();
    expect(
      PluginManifestSchema.safeParse({
        id: 'plugin-1',
        name: 'plugin',
        version: '1.0.0',
        entrypoint: 'index.ts'
      }).success
    ).toBe(true);
  });

  test('mcp port interface and schema contract', () => {
    const port: MCPPort = {
      async listServers() {
        return [];
      },
      async registerServer() {},
      async unregisterServer() {},
      async startServer() {},
      async stopServer() {},
      async listTools() {
        return [];
      },
      async callTool(request) {
        return {
          serverId: request.serverId,
          toolName: request.toolName,
          content: null,
          isError: false
        };
      },
      async readResource(request) {
        return { uri: request.uri };
      },
      async invokePrompt(request) {
        return {
          promptName: request.promptName,
          messages: [{ role: 'user', content: 'hello' }]
        };
      }
    };

    expect(port).toBeDefined();
    expect(
      MCPToolCallRequestSchema.safeParse({
        serverId: 'server-1',
        toolName: 'search',
        arguments: { query: 'test' }
      }).success
    ).toBe(true);
  });
});
