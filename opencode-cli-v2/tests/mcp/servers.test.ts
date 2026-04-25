import { describe, expect, test } from 'bun:test';

import { DEFAULT_MCP_SERVER_CATALOG, MCPServerManager } from '../../src/mcp/servers';
import type { MCPServerConfig } from '../../src/ports/mcp';
import { createStdioServer, FakeTransport } from './helpers';

describe('MCPServerManager', () => {
  test('includes 15+ default servers in catalog', () => {
    expect(Object.keys(DEFAULT_MCP_SERVER_CATALOG).length).toBeGreaterThanOrEqual(15);
    expect(DEFAULT_MCP_SERVER_CATALOG.websearch?.id).toBe('websearch');
    expect(DEFAULT_MCP_SERVER_CATALOG.supermemory?.id).toBe('supermemory');
    expect(DEFAULT_MCP_SERVER_CATALOG.context7?.id).toBe('context7');
  });

  test('registers, connects, lists, and disconnects servers', async () => {
    const manager = new MCPServerManager({
      clientFactory: (config: MCPServerConfig) => ({
        connect: async () => {},
        disconnect: async () => {},
        discoverTools: async () => new FakeTransport(config).listTools(),
        executeTool: async (toolName: string, args: unknown) => ({
          serverId: config.id,
          toolName,
          content: args,
          isError: false
        }),
        readResource: async (uri: string) => ({ uri, text: `resource:${uri}` }),
        invokePrompt: async (promptName: string) => ({
          promptName,
          messages: [{ role: 'assistant', content: 'ok' }]
        }),
        healthCheck: async () => ({
          serverId: config.id,
          status: 'running',
          reachable: true,
          checkedAt: new Date().toISOString()
        })
      })
    });

    await manager.registerServer(createStdioServer('websearch'));
    await manager.connectServer('websearch');

    const servers = await manager.listServers();
    expect(servers).toHaveLength(1);
    expect(servers[0]?.status).toBe('running');

    await manager.disconnectServer('websearch');
    const disconnected = await manager.listServers();
    expect(disconnected[0]?.status).toBe('stopped');
  });

  test('marks failed status when connect fails', async () => {
    const manager = new MCPServerManager({
      clientFactory: (config: MCPServerConfig) => ({
        connect: async () => {
          throw new Error(`boom:${config.id}`);
        },
        disconnect: async () => {},
        discoverTools: async () => [],
        executeTool: async (toolName: string) => ({
          serverId: config.id,
          toolName,
          content: null,
          isError: true
        }),
        readResource: async (uri: string) => ({ uri }),
        invokePrompt: async (promptName: string) => ({ promptName, messages: [] }),
        healthCheck: async () => ({
          serverId: config.id,
          status: 'failed',
          reachable: false,
          checkedAt: new Date().toISOString(),
          error: 'boom'
        })
      })
    });

    await manager.registerServer(createStdioServer('distill'));
    await expect(manager.connectServer('distill')).rejects.toThrow('boom:distill');

    const servers = await manager.listServers();
    expect(servers[0]?.status).toBe('failed');
    expect(servers[0]?.lastError).toContain('boom:distill');
  });
});
