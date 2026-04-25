import { describe, expect, test } from 'bun:test';

import { MCPClient } from '../../src/mcp/client';
import { createStdioServer, FakeTransport } from './helpers';

describe('MCPClient', () => {
  test('connects and reports health', async () => {
    const config = createStdioServer('context7');
    const transport = new FakeTransport(config);
    const client = new MCPClient(config, {
      transportFactory: async () => transport
    });

    await client.connect();

    const health = await client.healthCheck();
    expect(health.status).toBe('running');
    expect(health.reachable).toBe(true);
    expect(health.serverId).toBe('context7');
  });

  test('discovers tools and executes tool calls', async () => {
    const config = createStdioServer('tavily');
    const client = new MCPClient(config, {
      transportFactory: async () => new FakeTransport(config)
    });

    await client.connect();

    const tools = await client.discoverTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe('search');

    const result = await client.executeTool('search', { query: 'bun' });
    expect(result.isError).toBe(false);
    expect(result.content).toEqual({
      ok: true,
      args: { query: 'bun' }
    });
  });

  test('throws before connect and normalizes execution failure', async () => {
    const config = createStdioServer('grep');
    const transport = new FakeTransport(config, { failToolName: 'explode' });
    const client = new MCPClient(config, {
      transportFactory: async () => transport
    });

    await expect(client.discoverTools()).rejects.toThrow('not connected');

    await client.connect();
    const failed = await client.executeTool('explode', { term: 'x' });
    expect(failed.isError).toBe(true);
    expect(failed.content).toEqual({
      message: 'tool failed: explode'
    });
  });
});
