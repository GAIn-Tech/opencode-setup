import type { MCPManagedClient } from '../../src/mcp/servers';
import { MCPClient } from '../../src/mcp/client';
import type { MCPServerConfig } from '../../src/ports/mcp';
import { FakeTransport } from './helpers';

export function createManagedClient(config: MCPServerConfig): MCPManagedClient {
  return new MCPClient(config, {
    transportFactory: () => Promise.resolve(new FakeTransport(config))
  });
}
