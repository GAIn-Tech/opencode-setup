import type {
  MCPPromptRequest,
  MCPPromptResult,
  MCPResourceRequest,
  MCPResourceResult,
  MCPServerConfig,
  MCPToolCallRequest,
  MCPToolCallResult,
  MCPToolDefinition
} from '../../src/ports/mcp';

import type { MCPClientTransport } from '../../src/mcp/client';

export class FakeTransport implements MCPClientTransport {
  public started = false;
  public stopped = false;
  public readonly tools: MCPToolDefinition[];

  public constructor(
    private readonly config: MCPServerConfig,
    private readonly options: {
      readonly failStart?: boolean;
      readonly failPing?: boolean;
      readonly failToolName?: string;
    } = {}
  ) {
    this.tools = [
      {
        serverId: config.id,
        name: 'search',
        description: 'Search from fake transport',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          }
        }
      }
    ];
  }

  public async start(): Promise<void> {
    if (this.options.failStart) {
      throw new Error(`Failed to start ${this.config.id}`);
    }

    this.started = true;
  }

  public async stop(): Promise<void> {
    this.stopped = true;
    this.started = false;
  }

  public async ping(): Promise<boolean> {
    if (this.options.failPing) {
      return false;
    }

    return this.started;
  }

  public async listTools(): Promise<MCPToolDefinition[]> {
    return this.tools;
  }

  public async callTool(request: MCPToolCallRequest): Promise<MCPToolCallResult> {
    if (request.toolName === this.options.failToolName) {
      throw new Error(`tool failed: ${request.toolName}`);
    }

    return {
      serverId: request.serverId,
      toolName: request.toolName,
      content: {
        ok: true,
        args: request.arguments
      },
      isError: false
    };
  }

  public async readResource(request: MCPResourceRequest): Promise<MCPResourceResult> {
    return {
      uri: request.uri,
      text: `resource:${request.uri}`
    };
  }

  public async invokePrompt(request: MCPPromptRequest): Promise<MCPPromptResult> {
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

export function createStdioServer(id: string): MCPServerConfig {
  return {
    id,
    name: id,
    transport: 'stdio',
    command: 'bunx',
    args: ['-y', `@example/${id}-mcp`]
  };
}
