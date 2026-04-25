import { z } from 'zod';

/**
 * MCP port defines server lifecycle and tool/resource/prompt integration contracts.
 */

export const MCPTransportSchema = z.enum(['stdio', 'http', 'websocket']);
export type MCPTransport = z.infer<typeof MCPTransportSchema>;

export const MCPServerConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  transport: MCPTransportSchema,
  command: z.string().min(1).optional(),
  args: z.array(z.string()).default([]),
  url: z.string().url().optional(),
  env: z.record(z.string(), z.string()).optional(),
  startupTimeoutMs: z.number().int().positive().optional()
});
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

export const MCPServerStatusSchema = z.enum(['stopped', 'starting', 'running', 'failed']);
export type MCPServerStatus = z.infer<typeof MCPServerStatusSchema>;

export const MCPServerInfoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: MCPServerStatusSchema,
  transport: MCPTransportSchema,
  startedAt: z.string().datetime().optional(),
  lastError: z.string().optional()
});
export type MCPServerInfo = z.infer<typeof MCPServerInfoSchema>;

export const MCPToolDefinitionSchema = z.object({
  serverId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: z.record(z.string(), z.unknown()).optional()
});
export type MCPToolDefinition = z.infer<typeof MCPToolDefinitionSchema>;

export const MCPToolCallRequestSchema = z.object({
  serverId: z.string().min(1),
  toolName: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).default({}),
  timeoutMs: z.number().int().positive().optional()
});
export type MCPToolCallRequest = z.infer<typeof MCPToolCallRequestSchema>;

export const MCPToolCallResultSchema = z.object({
  serverId: z.string().min(1),
  toolName: z.string().min(1),
  content: z.unknown(),
  isError: z.boolean().default(false),
  durationMs: z.number().nonnegative().optional()
});
export type MCPToolCallResult = z.infer<typeof MCPToolCallResultSchema>;

export const MCPResourceRequestSchema = z.object({
  serverId: z.string().min(1),
  uri: z.string().min(1)
});
export type MCPResourceRequest = z.infer<typeof MCPResourceRequestSchema>;

export const MCPResourceResultSchema = z.object({
  uri: z.string().min(1),
  mimeType: z.string().min(1).optional(),
  text: z.string().optional(),
  blobBase64: z.string().optional()
});
export type MCPResourceResult = z.infer<typeof MCPResourceResultSchema>;

export const MCPPromptRequestSchema = z.object({
  serverId: z.string().min(1),
  promptName: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).default({})
});
export type MCPPromptRequest = z.infer<typeof MCPPromptRequestSchema>;

export const MCPPromptResultSchema = z.object({
  promptName: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string().min(1)
    })
  )
});
export type MCPPromptResult = z.infer<typeof MCPPromptResultSchema>;

export const MCPErrorCodeSchema = z.enum([
  'SERVER_NOT_FOUND',
  'SERVER_START_FAILED',
  'SERVER_STOP_FAILED',
  'TOOL_NOT_FOUND',
  'TOOL_CALL_FAILED',
  'RESOURCE_READ_FAILED',
  'PROMPT_INVOKE_FAILED',
  'VALIDATION_ERROR',
  'UNKNOWN'
]);
export type MCPErrorCode = z.infer<typeof MCPErrorCodeSchema>;

export const MCPPortErrorSchema = z.object({
  code: MCPErrorCodeSchema,
  message: z.string().min(1),
  retriable: z.boolean().default(false),
  details: z.record(z.string(), z.unknown()).optional()
});
export type MCPPortError = z.infer<typeof MCPPortErrorSchema>;

export interface MCPPort {
  /** Lists all configured MCP servers and lifecycle state. */
  listServers(): Promise<MCPServerInfo[]>;
  /** Registers a new MCP server definition. */
  registerServer(config: MCPServerConfig): Promise<void>;
  /** Removes a registered MCP server definition. */
  unregisterServer(serverId: string): Promise<void>;
  /** Starts a registered MCP server. */
  startServer(serverId: string): Promise<void>;
  /** Stops a running MCP server. */
  stopServer(serverId: string): Promise<void>;
  /** Lists tools exposed by a server. */
  listTools(serverId: string): Promise<MCPToolDefinition[]>;
  /** Calls a tool exposed by a server. */
  callTool(request: MCPToolCallRequest): Promise<MCPToolCallResult>;
  /** Reads a resource from a server. */
  readResource(request: MCPResourceRequest): Promise<MCPResourceResult>;
  /** Invokes a prompt on a server. */
  invokePrompt(request: MCPPromptRequest): Promise<MCPPromptResult>;
}
