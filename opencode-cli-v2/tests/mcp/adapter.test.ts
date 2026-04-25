import { describe, expect, test } from 'bun:test';

import { MCPBridgeAdapter } from '../../src/mcp/adapter';

describe('MCPBridgeAdapter', () => {
  test('implements MCPPort lifecycle and tool operations', async () => {
    const adapter = new MCPBridgeAdapter();

    await adapter.runLoad();
    await adapter.runInitialize();
    const port = adapter.getPort();

    await port.registerServer({
      id: 'github',
      name: 'github',
      transport: 'stdio',
      command: 'bunx',
      args: ['-y', '@modelcontextprotocol/server-github']
    });

    await port.startServer('github');

    const servers = await port.listServers();
    expect(servers.find((server: { id: string; status: string }) => server.id === 'github')?.status).toBe(
      'running'
    );

    const tools = await port.listTools('github');
    expect(tools).toBeArray();

    const result = await port.callTool({
      serverId: 'github',
      toolName: 'search',
      arguments: {
        query: 'repo:foo/bar'
      }
    });

    expect(result.serverId).toBe('github');
    expect(result.toolName).toBe('search');

    const resource = await port.readResource({
      serverId: 'github',
      uri: 'github://repos/foo/bar'
    });
    expect(resource.uri).toBe('github://repos/foo/bar');

    const prompt = await port.invokePrompt({
      serverId: 'github',
      promptName: 'default',
      arguments: { topic: 'triage' }
    });
    expect(prompt.promptName).toBe('default');

    await port.stopServer('github');
    await adapter.runShutdown();
  });

  test('exposes convenience connect/discover/execute/health methods', async () => {
    const adapter = new MCPBridgeAdapter();

    await adapter.runLoad();
    await adapter.runInitialize();

    await adapter.connectServer({
      id: 'tavily',
      name: 'tavily',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@tavily/mcp']
    });

    const tools = await adapter.discoverTools('tavily');
    expect(tools).toBeArray();

    const executed = await adapter.executeTool('tavily', 'search', {
      query: 'opencode'
    });
    expect(executed.serverId).toBe('tavily');

    const health = await adapter.healthCheckServer('tavily');
    expect(health.serverId).toBe('tavily');

    await adapter.disconnectServer('tavily');
    await adapter.runShutdown();
  });
});
