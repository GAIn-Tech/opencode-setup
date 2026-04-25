import { z } from 'zod';

import {
  MCPPromptRequestSchema,
  MCPPromptResultSchema,
  MCPResourceRequestSchema,
  MCPResourceResultSchema,
  MCPServerConfigSchema,
  MCPToolCallRequestSchema,
  MCPToolCallResultSchema,
  MCPToolDefinitionSchema,
  type MCPPromptResult,
  type MCPResourceResult,
  type MCPServerConfig,
  type MCPToolCallResult,
  type MCPToolDefinition
} from '../ports/mcp';

const MCPServerHealthSchema = z.object({
  serverId: z.string().min(1),
  status: z.enum(['running', 'failed', 'stopped']),
  reachable: z.boolean(),
  checkedAt: z.string().datetime(),
  error: z.string().optional()
});

export type MCPServerHealth = z.infer<typeof MCPServerHealthSchema>;

export interface MCPClientTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  ping(): Promise<boolean>;
  listTools(): Promise<MCPToolDefinition[]>;
  callTool(request: z.input<typeof MCPToolCallRequestSchema>): Promise<MCPToolCallResult>;
  readResource(request: z.input<typeof MCPResourceRequestSchema>): Promise<MCPResourceResult>;
  invokePrompt(request: z.input<typeof MCPPromptRequestSchema>): Promise<MCPPromptResult>;
}

export interface MCPClientOptions {
  readonly transportFactory?: (config: MCPServerConfig) => Promise<MCPClientTransport>;
}

/**
 * Thin MCP client wrapper around a single server transport.
 */
export class MCPClient {
  private readonly config: MCPServerConfig;
  private transport?: MCPClientTransport;
  private connected = false;

  public constructor(config: MCPServerConfig, private readonly options: MCPClientOptions = {}) {
    this.config = MCPServerConfigSchema.parse(config);
  }

  public async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    const transportFactory = this.options.transportFactory ?? createDefaultTransport;
    this.transport = await transportFactory(this.config);
    await this.transport.start();
    this.connected = true;
  }

  public async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    await this.requireTransport().stop();
    this.connected = false;
    this.transport = undefined;
  }

  public async discoverTools(): Promise<MCPToolDefinition[]> {
    const tools = await this.requireConnectedTransport().listTools();

    return tools.map((tool) =>
      MCPToolDefinitionSchema.parse({
        ...tool,
        serverId: tool.serverId || this.config.id
      })
    );
  }

  public async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<MCPToolCallResult> {
    const request = MCPToolCallRequestSchema.parse({
      serverId: this.config.id,
      toolName,
      arguments: args,
      timeoutMs
    });

    try {
      return MCPToolCallResultSchema.parse(await this.requireConnectedTransport().callTool(request));
    } catch (error: unknown) {
      return MCPToolCallResultSchema.parse({
        serverId: this.config.id,
        toolName,
        content: {
          message: error instanceof Error ? error.message : String(error)
        },
        isError: true
      });
    }
  }

  public async readResource(uri: string): Promise<MCPResourceResult> {
    const request = MCPResourceRequestSchema.parse({
      serverId: this.config.id,
      uri
    });

    return MCPResourceResultSchema.parse(await this.requireConnectedTransport().readResource(request));
  }

  public async invokePrompt(
    promptName: string,
    args: Record<string, unknown>
  ): Promise<MCPPromptResult> {
    const request = MCPPromptRequestSchema.parse({
      serverId: this.config.id,
      promptName,
      arguments: args
    });

    return MCPPromptResultSchema.parse(await this.requireConnectedTransport().invokePrompt(request));
  }

  public async healthCheck(): Promise<MCPServerHealth> {
    const checkedAt = new Date().toISOString();

    if (!this.connected || !this.transport) {
      return MCPServerHealthSchema.parse({
        serverId: this.config.id,
        status: 'stopped',
        reachable: false,
        checkedAt
      });
    }

    try {
      const reachable = await this.transport.ping();
      return MCPServerHealthSchema.parse({
        serverId: this.config.id,
        status: reachable ? 'running' : 'failed',
        reachable,
        checkedAt,
        error: reachable ? undefined : 'MCP server ping returned false'
      });
    } catch (error: unknown) {
      return MCPServerHealthSchema.parse({
        serverId: this.config.id,
        status: 'failed',
        reachable: false,
        checkedAt,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private requireTransport(): MCPClientTransport {
    if (!this.transport) {
      throw new Error(`MCP client for server "${this.config.id}" has no transport`);
    }

    return this.transport;
  }

  private requireConnectedTransport(): MCPClientTransport {
    if (!this.connected) {
      throw new Error(`MCP client for server "${this.config.id}" is not connected`);
    }

    return this.requireTransport();
  }
}

async function createDefaultTransport(config: MCPServerConfig): Promise<MCPClientTransport> {
  try {
    const sdkTransport = await createSdkTransport(config);
    if (sdkTransport) {
      return sdkTransport;
    }
  } catch {
    // Fall through to loopback transport for offline/test mode.
  }

  return new LoopbackTransport(config);
}

/**
 * Default in-process transport used in tests and offline mode.
 * Real MCP SDK transport can be injected through `transportFactory`.
 */
class LoopbackTransport implements MCPClientTransport {
  private started = false;

  public constructor(private readonly config: MCPServerConfig) {}

  public async start(): Promise<void> {
    this.started = true;
  }

  public async stop(): Promise<void> {
    this.started = false;
  }

  public async ping(): Promise<boolean> {
    return this.started;
  }

  public async listTools(): Promise<MCPToolDefinition[]> {
    return [
      {
        serverId: this.config.id,
        name: 'search',
        description: `Search via ${this.config.name}`,
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          }
        }
      }
    ];
  }

  public async callTool(request: z.input<typeof MCPToolCallRequestSchema>): Promise<MCPToolCallResult> {
    return {
      serverId: request.serverId,
      toolName: request.toolName,
      content: {
        source: this.config.id,
        arguments: request.arguments
      },
      isError: false
    };
  }

  public async readResource(request: z.input<typeof MCPResourceRequestSchema>): Promise<MCPResourceResult> {
    return {
      uri: request.uri,
      text: `resource:${request.uri}`
    };
  }

  public async invokePrompt(request: z.input<typeof MCPPromptRequestSchema>): Promise<MCPPromptResult> {
    return {
      promptName: request.promptName,
      messages: [
        {
          role: 'assistant',
          content: JSON.stringify(request.arguments)
        }
      ]
    };
  }
}

async function createSdkTransport(config: MCPServerConfig): Promise<MCPClientTransport | null> {
  const sdkClientModule = await loadOptionalModule('@modelcontextprotocol/sdk/client/index.js');
  if (!sdkClientModule || typeof sdkClientModule.Client !== 'function') {
    return null;
  }

  const stdioTransportModule = await loadOptionalModule('@modelcontextprotocol/sdk/client/stdio.js');
  const streamableHttpTransportModule = await loadOptionalModule(
    '@modelcontextprotocol/sdk/client/streamableHttp.js'
  );

  const ClientCtor = sdkClientModule.Client as new (
    metadata: Record<string, unknown>
  ) => {
    connect(transport: unknown): Promise<void>;
    close(): Promise<void>;
    listTools(): Promise<{ tools: unknown[] }>;
    callTool(payload: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>;
    readResource(payload: { uri: string }): Promise<unknown>;
    getPrompt(payload: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>;
  };

  const client = new ClientCtor({
    name: `opencode-cli-v2-${config.id}`,
    version: '0.1.0'
  });

  if (config.transport === 'stdio') {
    const StdioCtor = stdioTransportModule?.StdioClientTransport as
      | (new (options: { command: string; args?: string[]; env?: Record<string, string> }) => unknown)
      | undefined;

    if (!StdioCtor || !config.command) {
      return null;
    }

    return new SdkBackedTransport(client, new StdioCtor({
      command: config.command,
      args: config.args,
      env: config.env
    }));
  }

  if (config.transport === 'http') {
    const HttpCtor = streamableHttpTransportModule?.StreamableHTTPClientTransport as
      | (new (url: URL, options?: Record<string, unknown>) => unknown)
      | undefined;

    if (!HttpCtor || !config.url) {
      return null;
    }

    return new SdkBackedTransport(client, new HttpCtor(new URL(config.url)));
  }

  return null;
}

async function loadOptionalModule(specifier: string): Promise<Record<string, unknown> | null> {
  return import(specifier)
    .then((module) => module as Record<string, unknown>)
    .catch(() => null);
}

class SdkBackedTransport implements MCPClientTransport {
  private connected = false;

  public constructor(
    private readonly client: {
      connect(transport: unknown): Promise<void>;
      close(): Promise<void>;
      listTools(): Promise<{ tools: unknown[] }>;
      callTool(payload: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>;
      readResource(payload: { uri: string }): Promise<unknown>;
      getPrompt(payload: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>;
    },
    private readonly transport: unknown
  ) {}

  public async start(): Promise<void> {
    await this.client.connect(this.transport);
    this.connected = true;
  }

  public async stop(): Promise<void> {
    await this.client.close();
    this.connected = false;
  }

  public async ping(): Promise<boolean> {
    return this.connected;
  }

  public async listTools(): Promise<MCPToolDefinition[]> {
    const response = await this.client.listTools();
    const tools = Array.isArray(response.tools) ? response.tools : [];

    return tools
      .map((tool) => {
        const value = (tool ?? {}) as Record<string, unknown>;
        return {
          serverId: '',
          name: typeof value.name === 'string' ? value.name : '',
          description:
            typeof value.description === 'string' && value.description.length > 0
              ? value.description
              : 'MCP tool',
          inputSchema:
            typeof value.inputSchema === 'object' && value.inputSchema !== null
              ? (value.inputSchema as Record<string, unknown>)
              : {}
        };
      })
      .filter((tool) => tool.name.length > 0);
  }

  public async callTool(request: z.input<typeof MCPToolCallRequestSchema>): Promise<MCPToolCallResult> {
    const result = await this.client.callTool({
      name: request.toolName,
      arguments: request.arguments
    });

    return {
      serverId: request.serverId,
      toolName: request.toolName,
      content: result,
      isError: false
    };
  }

  public async readResource(request: z.input<typeof MCPResourceRequestSchema>): Promise<MCPResourceResult> {
    const result = (await this.client.readResource({ uri: request.uri })) as Record<string, unknown>;

    return {
      uri: request.uri,
      mimeType: typeof result.mimeType === 'string' ? result.mimeType : undefined,
      text: typeof result.text === 'string' ? result.text : undefined,
      blobBase64: typeof result.blobBase64 === 'string' ? result.blobBase64 : undefined
    };
  }

  public async invokePrompt(request: z.input<typeof MCPPromptRequestSchema>): Promise<MCPPromptResult> {
    const result = (await this.client.getPrompt({
      name: request.promptName,
      arguments: request.arguments
    })) as Record<string, unknown>;

    const messages = Array.isArray(result.messages) ? result.messages : [];

    return {
      promptName: request.promptName,
      messages: messages
        .map((message) => {
          const value = (message ?? {}) as Record<string, unknown>;
          const role =
            value.role === 'system' || value.role === 'assistant' || value.role === 'user'
              ? value.role
              : 'assistant';
          return {
            role,
            content: typeof value.content === 'string' ? value.content : JSON.stringify(value.content ?? '')
          } as const;
        })
        .filter((message) => message.content.length > 0)
    };
  }
}
