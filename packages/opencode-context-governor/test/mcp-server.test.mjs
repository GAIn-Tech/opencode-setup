import test from 'node:test';
import assert from 'node:assert/strict';
import { createContextGovernorHandlers } from '../src/mcp-server.mjs';

test('checkContextBudget handler delegates to governor', async () => {
  const governor = {
    checkBudget(sessionId, model, proposedTokens) {
      assert.equal(sessionId, 'ses_test');
      assert.equal(model, 'google/gemini-3-flash-preview');
      assert.equal(proposedTokens, 1000);
      return { allowed: true, status: 'ok', urgency: 0, remaining: 199000, message: 'OK' };
    },
  };

  const handlers = createContextGovernorHandlers(governor);
  const result = await handlers.checkContextBudget({
    sessionId: 'ses_test',
    model: 'google/gemini-3-flash-preview',
    proposedTokens: 1000,
  });

  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.allowed, true);
  assert.equal(result.structuredContent.status, 'ok');
});

test('recordTokenUsage handler delegates to governor', async () => {
  const governor = {
    consumeTokens(sessionId, model, tokens) {
      assert.equal(sessionId, 'ses_consume');
      assert.equal(model, 'google/gemini-3-flash-preview');
      assert.equal(tokens, 2500);
      return { used: 2500, remaining: 197500, pct: 0.0125, status: 'ok' };
    },
  };

  const handlers = createContextGovernorHandlers(governor);
  const result = await handlers.recordTokenUsage({
    sessionId: 'ses_consume',
    model: 'google/gemini-3-flash-preview',
    tokens: 2500,
  });

  assert.equal(result.structuredContent.used, 2500);
  assert.equal(result.structuredContent.status, 'ok');
});

test('listBudgetSessions and getModelBudgets handlers return structured content', async () => {
  const governor = {
    getAllSessions() {
      return {
        ses_a: {
          'google/gemini-3-flash-preview': { used: 1000, remaining: 199000, max: 200000, pct: 0.005, status: 'ok' },
        },
      };
    },
  };

  const handlers = createContextGovernorHandlers(governor);
  const sessions = await handlers.listBudgetSessions({});
  assert.ok(sessions.structuredContent.sessions.ses_a);

  const budgets = await handlers.getModelBudgets({});
  assert.ok(budgets.structuredContent.budgets['google/gemini-3-flash-preview']);
});

test('handlers return MCP error payloads on exceptions', async () => {
  const governor = {
    getRemainingBudget() {
      throw new Error('boom');
    },
    resetSession() {
      throw new Error('reset failed');
    },
  };

  const handlers = createContextGovernorHandlers(governor);
  const budgetResult = await handlers.getContextBudgetStatus({ sessionId: 'ses_err', model: 'google/gemini-3-flash-preview' });
  const resetResult = await handlers.resetBudgetSession({ sessionId: 'ses_err' });

  assert.equal(budgetResult.isError, true);
  assert.match(budgetResult.structuredContent.error, /boom/);
  assert.equal(resetResult.isError, true);
  assert.match(resetResult.structuredContent.error, /reset failed/);
});
