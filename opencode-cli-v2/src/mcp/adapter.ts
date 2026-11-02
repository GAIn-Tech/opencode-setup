import { z } from 'zod';

import { PackageAdapter } from '../adapters/base';
import type { AdapterHealthInput } from '../adapters/health';
import {
  MCPPromptRequestSchema,
  MCPPromptResultSchema,
  MCPResourceRequestSchema,
  MCPResourceResultSchema,
  MCPServerConfigSchema,
  MCPToolCallRequestSchema,
  MCPToolCallResultSchema,
  type MCPPort,
  type MCPPromptRequest,
  type MCPPromptResult,
  type MCPResourceRequest,
  type MCPResourceResult,
  type MCPServerConfig,
  type MCPServerInfo,
  type MCPToolCallRequest,
  type MCPToolCallResult,
  type MCPToolDefinition
} from '../ports/mcp';
import {
  DEFAULT_MCP_SERVER_CATALOG,
  MCPServerManager,
  type MCPManagedClient,
  type MCPServerManagerOptions
} from './servers';
import { MCPToolService } from './tools';
import type { MCPServerHealth } from './client';

const NonEmptyStringSchema = z.string().min(1);

export interface MCPBridgeAdapterOptions {
  readonly managerOptions?: MCPServerManagerOptions;
  readonly clientFactory?: (config: MCPServerConfig) => MCPManagedClient;
  readonly preloadServers?: readonly MCPServerConfig[];
}

/**
 * MCP bridge adapter that exposes MCPPort to the v2 kernel.
 */
export class MCPBridgeAdapter extends PackageAdapter<MCPPort> {
  public readonly name = 'mcp-bridge';
  public readonly version = '1.0.0';
  public readonly portType = Symbol.for('mcp');
  public readonly required = false;

  private manager?: MCPServerManager;
  private tools?: MCPToolService;

  public constructor(private readonly options: MCPBridgeAdapterOptions = {}) {
    super();
  }

  public async load(): Promise<void> {
    this.manager = new MCPServerManager({
      ...this.options.managerOptions,
      clientFactory: this.options.clientFactory ?? this.options.managerOptions?.clientFactory
    });

    const preloadServers =
      this.options.preloadServers ?? (Object.values(DEFAULT_MCP_SERVER_CATALOG) as readonly MCPServerConfig[]);
    for (const server of preloadServers) {
      await this.manager.registerServer(server);
    }
  }

  public async initialize(): Promise<void> {
    const manager = this.requireManager();
    this.tools = new MCPToolService(manager);
    this.setPort({
      listServers: () => manager.listServers(),
      registerServer: async (config) => {
        const parsed = MCPServerConfigSchema.parse(config);
        await manager.registerServer(parsed);
      },
      unregisterServer: async (serverId) => {
        const parsed = NonEmptyStringSchema.parse(serverId);
        await manager.unregisterServer(parsed);
      },
      startServer: async (serverId) => {
        const parsed = NonEmptyStringSchema.parse(serverId);
        await manager.connectServer(parsed);
      },
      stopServer: async (serverId) => {
        const parsed = NonEmptyStringSchema.parse(serverId);
        await manager.disconnectServer(parsed);
      },
      listTools: async (serverId) => {
        const parsed = NonEmptyStringSchema.parse(serverId);
        return this.requireTools().discoverTools(parsed);
      },
      callTool: async (request) => {
        const parsed = MCPToolCallRequestSchema.parse(request);
        return this.requireTools().executeTool(
          parsed.serverId,
          parsed.toolName,
          parsed.arguments,
          parsed.timeoutMs
        );
      },
      readResource: async (request) => {
        const parsed = MCPResourceRequestSchema.parse(request);
        return MCPResourceResultSchema.parse(await manager.readResource(parsed.serverId, parsed.uri));
      },
      invokePrompt: async (request) => {
        const parsed = MCPPromptRequestSchema.parse(request);
        return MCPPromptResultSchema.parse(
          await manager.invokePrompt(parsed.serverId, parsed.promptName, parsed.arguments)
        );
      }
    });
  }

  public async healthCheck(): Promise<AdapterHealthInput> {
    const manager = this.manager;
    if (!manager) {
      return {
        status: 'unhealthy',
        details: 'MCP server manager is not initialized'
      };
    }

    const servers = await manager.listServers();
    if (servers.length === 0) {
      return {
        status: 'healthy',
        details: 'No MCP servers registered'
      };
    }

    const runningServers = servers.filter((server) => server.status === 'running');
    if (runningServers.length === 0) {
      return {
        status: 'degraded',
        details: 'No MCP servers are currently running'
      };
    }

    const healthChecks = await Promise.all(
      runningServers.map(async (server) => this.healthCheckServer(server.id))
    );
    const hasFailure = healthChecks.some((health) => health.status !== 'running');

    return {
      status: hasFailure ? 'degraded' : 'healthy',
      details: `Checked ${healthChecks.length} running MCP server(s)`
    };
  }

  public async shutdown(): Promise<void> {
    const manager = this.manager;
    if (manager) {
      const servers = await manager.listServers();

      for (const server of servers) {
        if (server.status === 'running') {
          await manager.disconnectServer(server.id);
        }
      }
    }

    this.tools = undefined;
    this.manager = undefined;
  }

  public async connectServer(config: MCPServerConfig): Promise<MCPServerInfo> {
    const parsed = MCPServerConfigSchema.parse(config);
    const manager = this.requireManager();

    await manager.registerServer(parsed);
    await manager.connectServer(parsed.id);

    const servers = await manager.listServers();
    const connected = servers.find((server) => server.id === parsed.id);
    if (!connected) {
      throw new Error(`MCP server "${parsed.id}" did not appear in registry after connect`);
    }

    return connected;
  }

  public async disconnectServer(name: string): Promise<void> {
    const parsed = NonEmptyStringSchema.parse(name);
    await this.requireManager().disconnectServer(parsed);
  }

  public async discoverTools(serverName: string): Promise<MCPToolDefinition[]> {
    const parsed = NonEmptyStringSchema.parse(serverName);
    return this.requireTools().discoverTools(parsed);
  }

  public async executeTool(
    serverName: string,
    toolName: string,
    args: unknown
  ): Promise<MCPToolCallResult> {
    const parsedServer = NonEmptyStringSchema.parse(serverName);
    const parsedTool = NonEmptyStringSchema.parse(toolName);
    const parsedArgs = z.record(z.string(), z.unknown()).parse(args ?? {});

    return MCPToolCallResultSchema.parse(
      await this.requireTools().executeTool(parsedServer, parsedTool, parsedArgs)
    );
  }

  public async healthCheckServer(serverName: string): Promise<MCPServerHealth> {
    const parsed = NonEmptyStringSchema.parse(serverName);
    return this.requireManager().healthCheck(parsed);
  }

  private requireManager(): MCPServerManager {
    if (!this.manager) {
      throw new Error('MCP bridge manager has not been loaded');
    }

    return this.manager;
  }

  private requireTools(): MCPToolService {
    if (!this.tools) {
      throw new Error('MCP bridge tools service has not been initialized');
    }

    return this.tools;
  }
}

export function createMCPBridgeAdapter(options: MCPBridgeAdapterOptions = {}): MCPBridgeAdapter {
  return new MCPBridgeAdapter(options);
}

export type {
  MCPPromptRequest,
  MCPPromptResult,
  MCPResourceRequest,
  MCPResourceResult,
  MCPToolCallRequest,
  MCPToolCallResult
};
