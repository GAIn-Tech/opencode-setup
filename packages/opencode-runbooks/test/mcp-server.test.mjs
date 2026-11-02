import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunbooksHandlers } from '../src/mcp-server.mjs';

test('matchRunbookError delegates to runbooks', async () => {
  const runbooks = {
    matchError(error) {
      assert.equal(error, 'MCP command unavailable');
      return { id: 'MCP_NOT_FOUND', score: 12 };
    },
  };

  const handlers = createRunbooksHandlers(runbooks);
  const result = await handlers.matchRunbookError({ error: 'MCP command unavailable' });

  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.match.id, 'MCP_NOT_FOUND');
});

test('diagnoseRunbookError and executeRunbookRemedy delegate to runbooks', async () => {
  const runbooks = {
    diagnose(error, context) {
      assert.equal(error, 'rate limit exceeded');
      assert.equal(context.provider, 'openai');
      return { match: { id: 'RATE_LIMIT' }, result: { action: 'switch_model' } };
    },
    executeRemedy(errorId, context) {
      assert.equal(errorId, 'RATE_LIMIT');
      assert.equal(context.provider, 'openai');
      return { action: 'switch_model', status: 'suggestion' };
    },
  };

  const handlers = createRunbooksHandlers(runbooks);
  const diagnosis = await handlers.diagnoseRunbookError({ error: 'rate limit exceeded', context: { provider: 'openai' } });
  const remedy = await handlers.executeRunbookRemedy({ errorId: 'RATE_LIMIT', context: { provider: 'openai' } });

  assert.equal(diagnosis.structuredContent.match.id, 'RATE_LIMIT');
  assert.equal(remedy.structuredContent.result.action, 'switch_model');
});

test('listRunbookPatterns and getRunbookRemedy return structured content', async () => {
  const runbooks = {
    listPatterns() {
      return [{ id: 'MCP_NOT_FOUND', severity: 'high' }];
    },
    getRemedy(errorId) {
      assert.equal(errorId, 'MCP_NOT_FOUND');
      return { id: errorId, remedy: 'enableMCP' };
    },
  };

  const handlers = createRunbooksHandlers(runbooks);
  const patterns = await handlers.listRunbookPatterns({});
  const remedy = await handlers.getRunbookRemedy({ errorId: 'MCP_NOT_FOUND' });

  assert.equal(patterns.structuredContent.patterns[0].id, 'MCP_NOT_FOUND');
  assert.equal(remedy.structuredContent.remedy.remedy, 'enableMCP');
});

test('handlers return MCP error payloads on exceptions', async () => {
  const runbooks = {
    matchAll() {
      throw new Error('boom');
    },
  };

  const handlers = createRunbooksHandlers(runbooks);
  const result = await handlers.matchAllRunbookErrors({ error: 'anything' });

  assert.equal(result.isError, true);
  assert.match(result.structuredContent.error, /boom/);
});
