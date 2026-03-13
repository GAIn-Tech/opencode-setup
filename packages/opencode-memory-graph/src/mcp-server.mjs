#!/usr/bin/env node

import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const { MemoryGraph } = require('./index.js');

function toTextPayload(payload) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function toErrorPayload(message, extra = {}) {
  const payload = { error: message, ...extra };
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: true,
  };
}

export function createMemoryGraphHandlers(memoryGraph) {
  return {
    async buildMemoryGraph({ sourcePath }) {
      try {
        const graph = await memoryGraph.buildGraph(sourcePath);
        return toTextPayload({
          ok: true,
          sourcePath,
          meta: graph?.meta || null,
          nodeCount: graph?.nodes?.length || 0,
          edgeCount: graph?.edges?.length || 0,
        });
      } catch (error) {
        return toErrorPayload(error instanceof Error ? error.message : String(error), { sourcePath });
      }
    },

    async getMemoryGraph() {
      try {
        return toTextPayload({ graph: memoryGraph.getGraph() });
      } catch (error) {
        return toErrorPayload(error instanceof Error ? error.message : String(error));
      }
    },

    async getMemoryGraphErrorFrequency() {
      try {
        return toTextPayload({ errors: await memoryGraph.getErrorFrequency() });
      } catch (error) {
        return toErrorPayload(error instanceof Error ? error.message : String(error));
      }
    },

    async getMemoryGraphSessionPath({ sessionId }) {
      try {
        return toTextPayload({ sessionId, path: await memoryGraph.getSessionPath(sessionId) });
      } catch (error) {
        return toErrorPayload(error instanceof Error ? error.message : String(error), { sessionId });
      }
    },

    async getMemoryGraphSessions() {
      try {
        return toTextPayload({ sessions: await memoryGraph.getSessions() });
      } catch (error) {
        return toErrorPayload(error instanceof Error ? error.message : String(error));
      }
    },

    async getMemoryGraphSessionErrors({ sessionId }) {
      try {
        return toTextPayload({ sessionId, errors: await memoryGraph.getSessionErrors(sessionId) });
      } catch (error) {
        return toErrorPayload(error instanceof Error ? error.message : String(error), { sessionId });
      }
    },

    async getMemoryGraphActivationStatus() {
      try {
        return toTextPayload(memoryGraph.activationStatus());
      } catch (error) {
        return toErrorPayload(error instanceof Error ? error.message : String(error));
      }
    },

    async activateMemoryGraph({ logsDir, skipBackfill = false } = {}) {
      try {
        return toTextPayload(await memoryGraph.activate({ logsDir, skipBackfill }));
      } catch (error) {
        return toErrorPayload(error instanceof Error ? error.message : String(error), { logsDir: logsDir || null });
      }
    },
  };
}

export function createMemoryGraphServer(memoryGraph = new MemoryGraph()) {
  const server = new McpServer({
    name: 'opencode-memory-graph',
    version: '0.1.0',
  });

  const handlers = createMemoryGraphHandlers(memoryGraph);

  server.registerTool(
    'buildMemoryGraph',
    {
      title: 'Build Memory Graph',
      description: 'Build the session-to-error memory graph from a log file or directory path.',
      inputSchema: {
        sourcePath: z.string(),
      },
    },
    handlers.buildMemoryGraph,
  );

  server.registerTool(
    'getMemoryGraph',
    {
      title: 'Get Memory Graph',
      description: 'Return the current in-memory graph with nodes, edges, and metadata.',
      inputSchema: {},
    },
    handlers.getMemoryGraph,
  );

  server.registerTool(
    'getMemoryGraphErrorFrequency',
    {
      title: 'Get Memory Graph Error Frequency',
      description: 'Return ranked error frequency statistics from the current memory graph.',
      inputSchema: {},
    },
    handlers.getMemoryGraphErrorFrequency,
  );

  server.registerTool(
    'getMemoryGraphSessionPath',
    {
      title: 'Get Memory Graph Session Path',
      description: 'Return the ordered error sequence for a given session.',
      inputSchema: {
        sessionId: z.string(),
      },
    },
    handlers.getMemoryGraphSessionPath,
  );

  server.registerTool(
    'getMemoryGraphSessions',
    {
      title: 'Get Memory Graph Sessions',
      description: 'List all sessions represented in the current memory graph.',
      inputSchema: {},
    },
    handlers.getMemoryGraphSessions,
  );

  server.registerTool(
    'getMemoryGraphSessionErrors',
    {
      title: 'Get Memory Graph Session Errors',
      description: 'Return weighted error relationships for a specific session.',
      inputSchema: {
        sessionId: z.string(),
      },
    },
    handlers.getMemoryGraphSessionErrors,
  );

  server.registerTool(
    'getMemoryGraphActivationStatus',
    {
      title: 'Get Memory Graph Activation Status',
      description: 'Return activation state and recent backfill status for memory graph collection.',
      inputSchema: {},
    },
    handlers.getMemoryGraphActivationStatus,
  );

  server.registerTool(
    'activateMemoryGraph',
    {
      title: 'Activate Memory Graph',
      description: 'Activate memory graph collection and optionally backfill from a logs directory.',
      inputSchema: {
        logsDir: z.string().optional(),
        skipBackfill: z.boolean().optional(),
      },
    },
    handlers.activateMemoryGraph,
  );

  return server;
}

export async function main() {
  const memoryGraph = new MemoryGraph();
  const server = createMemoryGraphServer(memoryGraph);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('[memory-graph-mcp] fatal:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
