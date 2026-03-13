#!/usr/bin/env node

import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const { Runbooks } = require('./index.js');

function toTextPayload(payload) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function toErrorPayload(message, extra = {}) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...extra }, null, 2) }],
    structuredContent: { error: message, ...extra },
    isError: true,
  };
}

export function createRunbooksHandlers(runbooks) {
  return {
    async matchRunbookError({ error }) {
      try {
        return toTextPayload({ match: runbooks.matchError(error) });
      } catch (err) {
        return toErrorPayload(err instanceof Error ? err.message : String(err));
      }
    },

    async matchAllRunbookErrors({ error, minScore }) {
      try {
        return toTextPayload({ matches: runbooks.matchAll(error, minScore ?? 2) });
      } catch (err) {
        return toErrorPayload(err instanceof Error ? err.message : String(err));
      }
    },

    async getRunbookRemedy({ errorId }) {
      try {
        return toTextPayload({ remedy: runbooks.getRemedy(errorId) });
      } catch (err) {
        return toErrorPayload(err instanceof Error ? err.message : String(err));
      }
    },

    async diagnoseRunbookError({ error, context }) {
      try {
        return toTextPayload(runbooks.diagnose(error, context ?? {}));
      } catch (err) {
        return toErrorPayload(err instanceof Error ? err.message : String(err));
      }
    },

    async executeRunbookRemedy({ errorId, context }) {
      try {
        return toTextPayload({ result: runbooks.executeRemedy(errorId, context ?? {}) });
      } catch (err) {
        return toErrorPayload(err instanceof Error ? err.message : String(err));
      }
    },

    async listRunbookPatterns() {
      try {
        return toTextPayload({ patterns: runbooks.listPatterns() });
      } catch (err) {
        return toErrorPayload(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export function createRunbooksServer(runbooks = new Runbooks()) {
  const server = new McpServer({
    name: 'opencode-runbooks',
    version: '0.1.0',
  });

  const handlers = createRunbooksHandlers(runbooks);

  server.registerTool(
    'matchRunbookError',
    {
      title: 'Match Runbook Error',
      description: 'Match an error or message against known runbook patterns and return the best match.',
      inputSchema: {
        error: z.union([z.string(), z.record(z.string(), z.any())]),
      },
    },
    handlers.matchRunbookError,
  );

  server.registerTool(
    'matchAllRunbookErrors',
    {
      title: 'Match All Runbook Errors',
      description: 'Return all runbook pattern matches that exceed the provided minimum score.',
      inputSchema: {
        error: z.union([z.string(), z.record(z.string(), z.any())]),
        minScore: z.number().int().min(1).optional(),
      },
    },
    handlers.matchAllRunbookErrors,
  );

  server.registerTool(
    'getRunbookRemedy',
    {
      title: 'Get Runbook Remedy',
      description: 'Look up remediation details for a known runbook error id.',
      inputSchema: {
        errorId: z.string(),
      },
    },
    handlers.getRunbookRemedy,
  );

  server.registerTool(
    'diagnoseRunbookError',
    {
      title: 'Diagnose Runbook Error',
      description: 'Match an error, select the best remedy, and return the diagnosis payload.',
      inputSchema: {
        error: z.union([z.string(), z.record(z.string(), z.any())]),
        context: z.record(z.string(), z.any()).optional(),
      },
    },
    handlers.diagnoseRunbookError,
  );

  server.registerTool(
    'executeRunbookRemedy',
    {
      title: 'Execute Runbook Remedy',
      description: 'Execute the runbook remedy for a known error id. Remedies return instructions or suggestions and do not perform destructive actions automatically.',
      inputSchema: {
        errorId: z.string(),
        context: z.record(z.string(), z.any()).optional(),
      },
    },
    handlers.executeRunbookRemedy,
  );

  server.registerTool(
    'listRunbookPatterns',
    {
      title: 'List Runbook Patterns',
      description: 'List all registered runbook error patterns and their severities/remedies.',
      inputSchema: {},
    },
    handlers.listRunbookPatterns,
  );

  return server;
}

export async function main() {
  const server = createRunbooksServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('[runbooks-mcp] fatal:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
