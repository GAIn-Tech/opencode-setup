#!/usr/bin/env node

import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { wrapMcpHandler } from '../../opencode-mcp-utils/src/index.mjs';
import { z } from 'zod';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const GRAPH_PERSIST_PATH = path.join(os.homedir(), '.opencode', 'memory-graph.json');
const DEFAULT_MESSAGES_DIR = path.join(os.homedir(), '.opencode', 'messages');

const require = createRequire(import.meta.url);
const { MemoryGraph } = require('./index.js');

async function persistGraph(memoryGraph) {
  if (!memoryGraph._graph) return;
  try {
    fs.mkdirSync(path.dirname(GRAPH_PERSIST_PATH), { recursive: true });
    await memoryGraph.export('json', GRAPH_PERSIST_PATH);
  } catch (_) { /* non-fatal */ }
}

export function createMemoryGraphHandlers(memoryGraph) {
  return {
    buildMemoryGraph: wrapMcpHandler(
      async ({ sourcePath }) => {
        const graph = await memoryGraph.buildGraph(sourcePath);
        // Persist immediately — Windows doesn't reliably send SIGTERM on process kill
        await persistGraph(memoryGraph);
        return {
          ok: true,
          sourcePath,
          meta: graph?.meta || null,
          nodeCount: graph?.nodes?.length || 0,
          edgeCount: graph?.edges?.length || 0,
        };
      },
      {
        source: 'memory-graph:buildMemoryGraph',
        errorExtras: (_error, input) => ({ sourcePath: input?.sourcePath ?? null }),
      },
    ),

    getMemoryGraph: wrapMcpHandler(
      async () => ({ graph: memoryGraph.getGraph() }),
      { source: 'memory-graph:getMemoryGraph' },
    ),

    getMemoryGraphErrorFrequency: wrapMcpHandler(
      async () => ({ errors: await memoryGraph.getErrorFrequency() }),
      { source: 'memory-graph:getMemoryGraphErrorFrequency' },
    ),

    getMemoryGraphSessionPath: wrapMcpHandler(
      async ({ sessionId }) => ({ sessionId, path: await memoryGraph.getSessionPath(sessionId) }),
      {
        source: 'memory-graph:getMemoryGraphSessionPath',
        errorExtras: (_error, input) => ({ sessionId: input?.sessionId ?? null }),
      },
    ),

    getMemoryGraphSessions: wrapMcpHandler(
      async () => ({ sessions: await memoryGraph.getSessions() }),
      { source: 'memory-graph:getMemoryGraphSessions' },
    ),

    getMemoryGraphSessionErrors: wrapMcpHandler(
      async ({ sessionId }) => ({ sessionId, errors: await memoryGraph.getSessionErrors(sessionId) }),
      {
        source: 'memory-graph:getMemoryGraphSessionErrors',
        errorExtras: (_error, input) => ({ sessionId: input?.sessionId ?? null }),
      },
    ),

    getMemoryGraphActivationStatus: wrapMcpHandler(
      async () => memoryGraph.activationStatus(),
      { source: 'memory-graph:getMemoryGraphActivationStatus' },
    ),

    activateMemoryGraph: wrapMcpHandler(
      async ({ logsDir, skipBackfill = false } = {}) => {
        const result = await memoryGraph.activate({ logsDir, skipBackfill });
        // activate() populates _backfillEngine but NOT _graph.
        // buildGraph() is required to set _graph before export() works.
        const messagesDir = logsDir || DEFAULT_MESSAGES_DIR;
        if (fs.existsSync(messagesDir)) {
          await memoryGraph.buildGraph(messagesDir);
        }
        // Persist immediately after activation — Windows doesn't reliably send SIGTERM on process kill
        await persistGraph(memoryGraph);
        return result;
      },
      {
        source: 'memory-graph:activateMemoryGraph',
        errorExtras: (_error, input) => ({ logsDir: input?.logsDir ?? null }),
      },
    ),
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

  // Load persisted graph on startup if available
  if (fs.existsSync(GRAPH_PERSIST_PATH)) {
    try {
      await memoryGraph.buildGraph(GRAPH_PERSIST_PATH);
      console.error(`[memory-graph-mcp] Loaded persisted graph from ${GRAPH_PERSIST_PATH}`);
    } catch (err) {
      console.error(`[memory-graph-mcp] Could not load persisted graph: ${err.message}`);
    }
  }

  // Save graph to disk on shutdown
  const saveGraph = async () => {
    if (memoryGraph._graph) {
      try {
        fs.mkdirSync(path.dirname(GRAPH_PERSIST_PATH), { recursive: true });
        await memoryGraph.export('json', GRAPH_PERSIST_PATH);
        console.error(`[memory-graph-mcp] Graph saved to ${GRAPH_PERSIST_PATH}`);
      } catch (err) {
        console.error(`[memory-graph-mcp] Failed to save graph: ${err.message}`);
      }
    }
  };

  process.on('SIGTERM', async () => { await saveGraph(); process.exit(0); });
  process.on('SIGINT',  async () => { await saveGraph(); process.exit(0); });

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
