import test from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryGraphHandlers } from '../src/mcp-server.mjs';

test('buildMemoryGraph delegates to memoryGraph.buildGraph', async () => {
  const calls = [];
  const graph = {
    buildGraph: async (sourcePath) => {
      calls.push(sourcePath);
      return { meta: { total_entries: 3 }, nodes: [{}, {}], edges: [{}] };
    },
  };

  const handlers = createMemoryGraphHandlers(graph);
  const result = await handlers.buildMemoryGraph({ sourcePath: '/tmp/logs' });

  assert.deepEqual(calls, ['/tmp/logs']);
  assert.equal(result.structuredContent.ok, true);
  assert.equal(result.structuredContent.nodeCount, 2);
  assert.equal(result.structuredContent.edgeCount, 1);
});

test('session and error query handlers delegate correctly', async () => {
  const graph = {
    getSessionPath: async (sessionId) => [{ sessionId, error_type: 'type_error' }],
    getSessionErrors: async (sessionId) => [{ sessionId, error_type: 'type_error', weight: 2 }],
    getErrorFrequency: async () => [{ error_type: 'type_error', count: 4 }],
    getSessions: async () => ['ses-1', 'ses-2'],
  };

  const handlers = createMemoryGraphHandlers(graph);
  const path = await handlers.getMemoryGraphSessionPath({ sessionId: 'ses-1' });
  const errors = await handlers.getMemoryGraphSessionErrors({ sessionId: 'ses-1' });
  const freq = await handlers.getMemoryGraphErrorFrequency();
  const sessions = await handlers.getMemoryGraphSessions();

  assert.deepEqual(path.structuredContent.path, [{ sessionId: 'ses-1', error_type: 'type_error' }]);
  assert.deepEqual(errors.structuredContent.errors, [{ sessionId: 'ses-1', error_type: 'type_error', weight: 2 }]);
  assert.deepEqual(freq.structuredContent.errors, [{ error_type: 'type_error', count: 4 }]);
  assert.deepEqual(sessions.structuredContent.sessions, ['ses-1', 'ses-2']);
});

test('activation and graph state handlers return structured content', async () => {
  const graph = {
    activationStatus: () => ({ active: true, sessions_tracked: 4, last_backfill: '2026-03-13T00:00:00Z' }),
    activate: async ({ logsDir, skipBackfill }) => ({ activated: true, logsDir, skipBackfill }),
    getGraph: () => ({ nodes: [{ id: 'session:1' }], edges: [], meta: { total_entries: 1 } }),
  };

  const handlers = createMemoryGraphHandlers(graph);
  const status = await handlers.getMemoryGraphActivationStatus();
  const activated = await handlers.activateMemoryGraph({ logsDir: '/tmp/logs', skipBackfill: true });
  const fullGraph = await handlers.getMemoryGraph();

  assert.equal(status.structuredContent.active, true);
  assert.equal(activated.structuredContent.activated, true);
  assert.equal(activated.structuredContent.logsDir, '/tmp/logs');
  assert.deepEqual(fullGraph.structuredContent.graph.meta, { total_entries: 1 });
});

test('handlers return MCP error payloads on exceptions', async () => {
  const graph = {
    buildGraph: async () => {
      throw new Error('boom');
    },
  };

  const handlers = createMemoryGraphHandlers(graph);
  const result = await handlers.buildMemoryGraph({ sourcePath: '/tmp/logs' });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error, 'boom');
});
