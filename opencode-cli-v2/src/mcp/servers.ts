import path from 'node:path';

import {
  MCPServerConfigSchema,
  MCPServerInfoSchema,
  MCPToolDefinitionSchema,
  type MCPPromptResult,
  type MCPResourceResult,
  type MCPServerConfig,
  type MCPServerInfo,
  type MCPToolCallResult,
  type MCPToolDefinition
} from '../ports/mcp';
import { MCPClient, type MCPServerHealth } from './client';

export interface MCPManagedClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  discoverTools(): Promise<MCPToolDefinition[]>;
  executeTool(toolName: string, args: Record<string, unknown>, timeoutMs?: number): Promise<MCPToolCallResult>;
  readResource(uri: string): Promise<MCPResourceResult>;
  invokePrompt(promptName: string, args: Record<string, unknown>): Promise<MCPPromptResult>;
  healthCheck(): Promise<MCPServerHealth>;
}

export interface MCPServerManagerOptions {
  readonly clientFactory?: (config: MCPServerConfig) => MCPManagedClient;
}

interface ServerEntry {
  config: MCPServerConfig;
  info: MCPServerInfo;
  client?: MCPManagedClient;
}

/**
 * Registry and lifecycle manager for MCP servers.
 */
export class MCPServerManager {
  private readonly servers = new Map<string, ServerEntry>();

  public constructor(private readonly options: MCPServerManagerOptions = {}) {}

  public async registerServer(config: MCPServerConfig): Promise<void> {
    const parsed = MCPServerConfigSchema.parse(config);
    this.servers.set(parsed.id, {
      config: parsed,
      info: MCPServerInfoSchema.parse({
        id: parsed.id,
        name: parsed.name,
        status: 'stopped',
        transport: parsed.transport
      })
    });
  }

  public async unregisterServer(serverId: string): Promise<void> {
    const entry = this.requireEntry(serverId);

    if (entry.info.status === 'running' && entry.client) {
      await entry.client.disconnect();
    }

    this.servers.delete(serverId);
  }

  public async connectServer(serverId: string): Promise<void> {
    const entry = this.requireEntry(serverId);
    entry.info = {
      ...entry.info,
      status: 'starting',
      lastError: undefined
    };

    try {
      const client = this.getOrCreateClient(entry);
      await client.connect();
      entry.info = MCPServerInfoSchema.parse({
        ...entry.info,
        status: 'running',
        startedAt: new Date().toISOString(),
        lastError: undefined
      });
    } catch (error: unknown) {
      entry.info = MCPServerInfoSchema.parse({
        ...entry.info,
        status: 'failed',
        lastError: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  public async disconnectServer(serverId: string): Promise<void> {
    const entry = this.requireEntry(serverId);
    if (entry.client) {
      await entry.client.disconnect();
    }

    entry.info = MCPServerInfoSchema.parse({
      ...entry.info,
      status: 'stopped'
    });
  }

  public async listServers(): Promise<MCPServerInfo[]> {
    return [...this.servers.values()].map((entry) => ({ ...entry.info }));
  }

  public async healthCheck(serverId: string): Promise<MCPServerHealth> {
    const entry = this.requireEntry(serverId);
    const client = this.getOrCreateClient(entry);
    const health = await client.healthCheck();

    entry.info = MCPServerInfoSchema.parse({
      ...entry.info,
      status: health.status === 'running' ? 'running' : 'failed',
      lastError: health.error
    });

    return health;
  }

  public async discoverTools(serverId: string): Promise<MCPToolDefinition[]> {
    const tools = await this.requireClient(serverId).discoverTools();
    return tools.map((tool) => MCPToolDefinitionSchema.parse(tool));
  }

  public async executeTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<MCPToolCallResult> {
    return this.requireClient(serverId).executeTool(toolName, args, timeoutMs);
  }

  public async readResource(serverId: string, uri: string): Promise<MCPResourceResult> {
    return this.requireClient(serverId).readResource(uri);
  }

  public async invokePrompt(
    serverId: string,
    promptName: string,
    args: Record<string, unknown>
  ): Promise<MCPPromptResult> {
    return this.requireClient(serverId).invokePrompt(promptName, args);
  }

  private requireEntry(serverId: string): ServerEntry {
    const entry = this.servers.get(serverId);
    if (!entry) {
      throw new Error(`MCP server "${serverId}" is not registered`);
    }

    return entry;
  }

  private requireClient(serverId: string): MCPManagedClient {
    const entry = this.requireEntry(serverId);
    if (entry.info.status !== 'running') {
      throw new Error(`MCP server "${serverId}" is not running`);
    }

    return this.getOrCreateClient(entry);
  }

  private getOrCreateClient(entry: ServerEntry): MCPManagedClient {
    entry.client ??= this.options.clientFactory?.(entry.config) ?? new MCPClient(entry.config);

    return entry.client;
  }
}

function stdioServer(id: string, command: string, args: string[]): MCPServerConfig {
  return MCPServerConfigSchema.parse({
    id,
    name: id,
    transport: 'stdio',
    command,
    args
  });
}

function httpServer(id: string, url: string): MCPServerConfig {
  return MCPServerConfigSchema.parse({
    id,
    name: id,
    transport: 'http',
    url
  });
}

const MONOREPO_ROOT = path.resolve(import.meta.dir, '../../../');

function monorepoPath(...segments: string[]): string {
  return path.join(MONOREPO_ROOT, ...segments);
}

/**
 * Canonical MCP server catalog for v2 bridge.
 */
export const DEFAULT_MCP_SERVER_CATALOG: Record<string, MCPServerConfig> = {
  supermemory: httpServer('supermemory', 'https://mcp.supermemory.ai/mcp'),
  context7: httpServer('context7', 'https://mcp.context7.com/mcp'),
  playwright: stdioServer('playwright', 'bunx', ['@playwright/mcp@0.0.64']),
  sequentialthinking: stdioServer('sequentialthinking', 'bunx', ['-y', '@modelcontextprotocol/server-sequential-thinking']),
  websearch: stdioServer('websearch', 'bunx', ['-y', '@ignidor/web-search-mcp']),
  grep: stdioServer('grep', 'uvx', ['grep-mcp']),
  github: stdioServer('github', 'npx', ['-y', '@modelcontextprotocol/server-github']),
  distill: stdioServer('distill', 'bun', [monorepoPath('scripts', 'run-distill-mcp.mjs'), 'serve', '--lazy']),
  'opencode-memory-graph': stdioServer('opencode-memory-graph', 'bun', [
    monorepoPath('packages', 'opencode-memory-graph', 'src', 'mcp-server.mjs')
  ]),
  'opencode-context-governor': stdioServer('opencode-context-governor', 'bun', [
    monorepoPath('packages', 'opencode-context-governor', 'src', 'mcp-server.mjs')
  ]),
  'opencode-runbooks': stdioServer('opencode-runbooks', 'bun', [
    monorepoPath('packages', 'opencode-runbooks', 'src', 'mcp-server.mjs')
  ]),
  filesystem: stdioServer('filesystem', 'npx', ['-y', '@modelcontextprotocol/server-filesystem']),
  fetch: stdioServer('fetch', 'npx', ['-y', '@modelcontextprotocol/server-fetch']),
  time: stdioServer('time', 'npx', ['-y', '@modelcontextprotocol/server-time']),
  sqlite: stdioServer('sqlite', 'npx', ['-y', '@modelcontextprotocol/server-sqlite'])
};
