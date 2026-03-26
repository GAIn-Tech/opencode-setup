#!/usr/bin/env node

import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { wrapMcpHandler } from '../../opencode-mcp-utils/src/index.mjs';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const { Governor } = require('./index.js');

export function createContextGovernorHandlers(governor) {
  return {
    checkContextBudget: wrapMcpHandler(
      ({ sessionId, model, proposedTokens }) => {
        const result = governor.checkBudget(sessionId, model, proposedTokens);
        return { sessionId, model, proposedTokens, ...result };
      },
      { source: 'context-governor:checkContextBudget' },
    ),

    recordTokenUsage: wrapMcpHandler(
      ({ sessionId, model, tokens }) => {
        const result = governor.consumeTokens(sessionId, model, tokens);
        return { sessionId, model, tokens, ...result };
      },
      { source: 'context-governor:recordTokenUsage' },
    ),

    getContextBudgetStatus: wrapMcpHandler(
      ({ sessionId, model }) => {
        const result = governor.getRemainingBudget(sessionId, model);
        return { sessionId, model, ...result };
      },
      { source: 'context-governor:getContextBudgetStatus' },
    ),

    listBudgetSessions: wrapMcpHandler(
      () => ({ sessions: governor.getAllSessions() }),
      { source: 'context-governor:listBudgetSessions' },
    ),

    resetBudgetSession: wrapMcpHandler(
      ({ sessionId, model }) => {
        governor.resetSession(sessionId, model);
        return { ok: true, sessionId, model: model || null };
      },
      { source: 'context-governor:resetBudgetSession' },
    ),

    getModelBudgets: wrapMcpHandler(
      () => ({ budgets: Governor.getModelBudgets() }),
      { source: 'context-governor:getModelBudgets' },
    ),
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
