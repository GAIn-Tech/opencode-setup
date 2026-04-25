import { MCPToolCallResultSchema, MCPToolDefinitionSchema, type MCPToolCallResult, type MCPToolDefinition } from '../ports/mcp';
import type { MCPServerManager } from './servers';

/**
 * Tool discovery and execution service over server manager.
 */
export class MCPToolService {
  public constructor(private readonly servers: MCPServerManager) {}

  public async discoverTools(serverId: string): Promise<MCPToolDefinition[]> {
    const tools = await this.servers.discoverTools(serverId);
    return tools.map((tool) => MCPToolDefinitionSchema.parse(tool));
  }

  public async executeTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<MCPToolCallResult> {
    const started = performance.now();

    try {
      const result = await this.servers.executeTool(serverId, toolName, args, timeoutMs);
      return MCPToolCallResultSchema.parse({
        ...result,
        serverId,
        toolName,
        durationMs: Math.max(0, performance.now() - started)
      });
    } catch (error: unknown) {
      return MCPToolCallResultSchema.parse({
        serverId,
        toolName,
        isError: true,
        durationMs: Math.max(0, performance.now() - started),
        content: {
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }
}
