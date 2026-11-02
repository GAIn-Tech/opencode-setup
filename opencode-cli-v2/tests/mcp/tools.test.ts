import { describe, expect, test } from 'bun:test';

import { MCPToolService } from '../../src/mcp/tools';
import { MCPServerManager } from '../../src/mcp/servers';
import type { MCPServerConfig } from '../../src/ports/mcp';
import { createStdioServer, FakeTransport } from './helpers';

describe('MCPToolService', () => {
  test('discovers server tools and executes with duration', async () => {
    const manager = new MCPServerManager({
      clientFactory: (config: MCPServerConfig) => ({
        connect: async () => {},
        disconnect: async () => {},
        discoverTools: async () => new FakeTransport(config).listTools(),
        executeTool: async (toolName: string, args: unknown) => ({
          serverId: config.id,
          toolName,
          content: { args },
          isError: false
        }),
        readResource: async (uri: string) => ({ uri, text: uri }),
        invokePrompt: async (promptName: string) => ({ promptName, messages: [] }),
        healthCheck: async () => ({
          serverId: config.id,
          status: 'running',
          reachable: true,
          checkedAt: new Date().toISOString()
        })
      })
    });

    await manager.registerServer(createStdioServer('playwright'));
    await manager.connectServer('playwright');
    const tools = new MCPToolService(manager);

    const discovered = await tools.discoverTools('playwright');
    expect(discovered.map((tool: { name: string }) => tool.name)).toContain('search');

    const result = await tools.executeTool('playwright', 'search', { query: 'automation' });
    expect(result.isError).toBe(false);
    expect(result.durationMs).toBeNumber();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('returns error result when underlying execution fails', async () => {
    const manager = new MCPServerManager({
      clientFactory: (config: MCPServerConfig) => ({
        connect: async () => {},
        disconnect: async () => {},
        discoverTools: async () => new FakeTransport(config).listTools(),
        executeTool: async () => {
          throw new Error('tool exploded');
        },
        readResource: async (uri: string) => ({ uri }),
        invokePrompt: async (promptName: string) => ({ promptName, messages: [] }),
        healthCheck: async () => ({
          serverId: config.id,
          status: 'running',
          reachable: true,
          checkedAt: new Date().toISOString()
        })
      })
    });

    await manager.registerServer(createStdioServer('sequentialthinking'));
    await manager.connectServer('sequentialthinking');

    const tools = new MCPToolService(manager);
    const result = await tools.executeTool('sequentialthinking', 'search', { query: 'debug' });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual({
      message: 'tool exploded'
    });
  });
});
