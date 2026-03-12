'use strict';

const { describe, it, expect } = require('bun:test');
const { IntegrationLayer } = require('../src/index.js');

describe('executeTaskWithEvidence runtime context wiring', () => {
  it('attaches runtime context to taskContext before execution', async () => {
    const integration = new IntegrationLayer({});
    integration.enrichTaskContext = (ctx) => ({
      ...ctx,
      sessionId: 'ses_runtime',
      model: 'claude-sonnet-4-20250514'
    });
    integration.resolveRuntimeContext = () => ({
      toolNames: ['distill_run_tool'],
      budget: { action: 'compress' },
      compression: {
        active: true,
        recommendedTools: ['distill_run_tool'],
        recommendedSkills: ['dcp']
      }
    });

    let capturedContext = null;
    const result = await integration.executeTaskWithEvidence({ task: 'compress' }, async (taskContext) => {
      capturedContext = taskContext;
      return { success: true, modelId: 'model-a' };
    });

    expect(result.success).toBe(true);
    expect(capturedContext.runtimeContext).toBeDefined();
    expect(capturedContext.runtime_context).toBeDefined();
    expect(capturedContext.runtimeContext.budget.action).toBe('compress');
  });

  it('derives adaptive options from runtime compression state', async () => {
    const integration = new IntegrationLayer({});
    integration.enrichTaskContext = (ctx) => ({
      ...ctx,
      sessionId: 'ses_runtime',
      model: 'claude-sonnet-4-20250514'
    });
    integration.resolveRuntimeContext = () => ({
      toolNames: ['distill_run_tool', 'checkContextBudget'],
      budget: { action: 'compress_urgent' },
      compression: {
        active: true,
        recommendedTools: ['distill_run_tool', 'checkContextBudget'],
        recommendedSkills: ['dcp', 'distill', 'context-governor']
      }
    });

    let capturedOptions = null;
    await integration.executeTaskWithEvidence({ task: 'compress' }, async (_taskContext, _skills, adaptiveOptions) => {
      capturedOptions = adaptiveOptions;
      return { success: true, modelId: 'model-a' };
    });

    expect(capturedOptions.budgetAction).toBe('compress_urgent');
    expect(capturedOptions.compressionActive).toBe(true);
    expect(capturedOptions.retries).toBe(1);
    expect(capturedOptions.backoff).toBe(3000);
    expect(capturedOptions.compressionRecommendedTools).toContain('distill_run_tool');
    expect(capturedOptions.compressionRecommendedSkills).toContain('dcp');
  });

  it('passes enriched context into executeTaskFn and preserves success path', async () => {
    const integration = new IntegrationLayer({});
    integration.enrichTaskContext = (ctx) => ({
      ...ctx,
      sessionId: 'ses_runtime',
      model: 'claude-sonnet-4-20250514',
      task_id: 'task-1'
    });
    integration.resolveRuntimeContext = () => ({
      toolNames: [],
      budget: { action: 'none' },
      compression: {
        active: false,
        recommendedTools: [],
        recommendedSkills: []
      }
    });

    const result = await integration.executeTaskWithEvidence({ task: 'normal' }, async (taskContext, _skills, adaptiveOptions) => {
      expect(taskContext.task_id).toBe('task-1');
      expect(taskContext.runtimeContext.budget.action).toBe('none');
      expect(adaptiveOptions.compressionActive).toBe(false);
      return { success: true, modelId: 'model-a', message: 'ok' };
    });

    expect(result.message).toBe('ok');
  });
});
