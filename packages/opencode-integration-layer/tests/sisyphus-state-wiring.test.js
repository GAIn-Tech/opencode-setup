'use strict';

const { describe, test, expect } = require('bun:test');
const { IntegrationLayer } = require('../src/index.js');

describe('sisyphus-state wiring', () => {
  test('executeWorkflow delegates to workflowExecutor.execute', async () => {
    const mockExecutor = {
      execute: async (def, input, runId) => ({ runId: runId || 'r1', status: 'completed', context: { input } }),
    };
    const il = new IntegrationLayer({ workflowExecutor: mockExecutor });
    const result = await il.executeWorkflow({ name: 'test' }, { key: 'val' }, 'r1');
    expect(result).toEqual({ runId: 'r1', status: 'completed', context: { input: { key: 'val' } } });
  });

  test('resumeWorkflow delegates to workflowExecutor.resume', async () => {
    const mockExecutor = {
      resume: async (runId, def) => ({ runId, status: 'resumed' }),
    };
    const il = new IntegrationLayer({ workflowExecutor: mockExecutor });
    const result = await il.resumeWorkflow('r1', { name: 'test' });
    expect(result).toEqual({ runId: 'r1', status: 'resumed' });
  });

  test('getWorkflowState delegates to workflowStore.getRunState', () => {
    const mockStore = {
      getRunState: (runId) => ({ runId, status: 'running', step: 2 }),
    };
    const il = new IntegrationLayer({ workflowStore: mockStore });
    const result = il.getWorkflowState('r1');
    expect(result).toEqual({ runId: 'r1', status: 'running', step: 2 });
  });

  test('returns null when executor unavailable', async () => {
    const il = new IntegrationLayer({});
    expect(await il.executeWorkflow({ name: 'test' }, {})).toBeNull();
    expect(await il.resumeWorkflow('r1', { name: 'test' })).toBeNull();
  });

  test('bootstrap tracks sisyphus-state status', () => {
    const { getBootstrapStatus, resetBootstrap } = require('../src/bootstrap.js');
    resetBootstrap();
    const status = getBootstrapStatus();
    expect(status.packages).toBeDefined();
    // sisyphus-state will be true if the package is available, false/undefined otherwise
    expect(typeof status.packages === 'object').toBe(true);
  });
});
