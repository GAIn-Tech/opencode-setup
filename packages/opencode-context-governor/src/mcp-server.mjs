#!/usr/bin/env node

import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const { Governor } = require('./index.js');

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

export function createContextGovernorHandlers(governor) {
  return {
    async checkContextBudget({ sessionId, model, proposedTokens }) {
      try {
        const result = governor.checkBudget(sessionId, model, proposedTokens);
        return toTextPayload({ sessionId, model, proposedTokens, ...result });
      } catch (error) {
        return toErrorPayload(error instanceof Error ? error.message : String(error));
      }
    },

    async recordTokenUsage({ sessionId, model, tokens }) {
      try {
        const result = governor.consumeTokens(sessionId, model, tokens);
        return toTextPayload({ sessionId, model, tokens, ...result });
      } catch (error) {
        return toErrorPayload(error instanceof Error ? error.message : String(error));
      }
    },

    async getContextBudgetStatus({ sessionId, model }) {
      try {
        const result = governor.getRemainingBudget(sessionId, model);
        return toTextPayload({ sessionId, model, ...result });
      } catch (error) {
        return toErrorPayload(error instanceof Error ? error.message : String(error));
      }
    },

    async listBudgetSessions() {
      try {
        return toTextPayload({ sessions: governor.getAllSessions() });
      } catch (error) {
        return toErrorPayload(error instanceof Error ? error.message : String(error));
      }
    },

    async resetBudgetSession({ sessionId, model }) {
      try {
        governor.resetSession(sessionId, model);
        return toTextPayload({ ok: true, sessionId, model: model || null });
      } catch (error) {
        return toErrorPayload(error instanceof Error ? error.message : String(error));
      }
    },

    async getModelBudgets() {
      try {
        return toTextPayload({ budgets: Governor.getModelBudgets() });
      } catch (error) {
        return toErrorPayload(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export function createContextGovernorServer(governor = new Governor()) {
  const server = new McpServer({
    name: 'opencode-context-governor',
    version: '0.1.0',
  });

  const handlers = createContextGovernorHandlers(governor);

  server.registerTool(
    'checkContextBudget',
    {
      title: 'Check Context Budget',
      description: 'Check whether a proposed token usage fits within the remaining context budget for a session and model.',
      inputSchema: {
        sessionId: z.string(),
        model: z.string(),
        proposedTokens: z.number().int().positive(),
      },
    },
    handlers.checkContextBudget,
  );

  server.registerTool(
    'recordTokenUsage',
    {
      title: 'Record Token Usage',
      description: 'Record actual token consumption for a session and model.',
      inputSchema: {
        sessionId: z.string(),
        model: z.string(),
        tokens: z.number().int().positive(),
      },
    },
    handlers.recordTokenUsage,
  );

  server.registerTool(
    'getContextBudgetStatus',
    {
      title: 'Get Context Budget Status',
      description: 'Get the remaining context budget and usage status for a session and model.',
      inputSchema: {
        sessionId: z.string(),
        model: z.string(),
      },
    },
    handlers.getContextBudgetStatus,
  );

  server.registerTool(
    'listBudgetSessions',
    {
      title: 'List Budget Sessions',
      description: 'List all tracked budget sessions and their per-model usage summaries.',
      inputSchema: {},
    },
    handlers.listBudgetSessions,
  );

  server.registerTool(
    'resetBudgetSession',
    {
      title: 'Reset Budget Session',
      description: 'Reset tracked token usage for an entire session or a specific model within that session.',
      inputSchema: {
        sessionId: z.string(),
        model: z.string().optional(),
      },
    },
    handlers.resetBudgetSession,
  );

  server.registerTool(
    'getModelBudgets',
    {
      title: 'Get Model Budgets',
      description: 'Return the configured token budget thresholds for all known models.',
      inputSchema: {},
    },
    handlers.getModelBudgets,
  );

  return server;
}

export async function main() {
  const governor = new Governor();
  const server = createContextGovernorServer(governor);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('[context-governor-mcp] fatal:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
