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

  it('propagates preload selection meta_context into downstream adaptive options', async () => {
    const integration = new IntegrationLayer({});
    integration.enrichTaskContext = (ctx) => ({
      ...ctx,
      sessionId: 'ses_runtime',
      model: 'claude-sonnet-4-20250514',
      task_id: 'task-meta-context'
    });
    integration.resolveRuntimeContext = () => ({
      selection: {
        meta_context: '<!-- META-KB CONTEXT -->\nUse test-driven-development for integration edits.'
      },
      meta_context: '<!-- META-KB CONTEXT -->\nUse test-driven-development for integration edits.',
      toolNames: ['grep'],
      budget: { action: 'none' },
      compression: {
        active: false,
        recommendedTools: [],
        recommendedSkills: []
      }
    });
    integration.advisor = {
      advise: () => ({
        risk_score: 5,
        quota_risk: 0.1,
        meta_context: {
          warnings: ['Avoid retry storms'],
          suggestions: ['Prefer deterministic retries'],
          conventions: ['Fail-open on optional context']
        }
      })
    };

    let capturedTaskContext = null;
    let capturedOptions = null;
    await integration.executeTaskWithEvidence({ task: 'normal' }, async (taskContext, _skills, adaptiveOptions) => {
      capturedTaskContext = taskContext;
      capturedOptions = adaptiveOptions;
      return { success: true, modelId: 'model-a' };
    });

    expect(capturedOptions.metaContext).toBeDefined();
    expect(capturedOptions.metaContext.source).toBe('merged');
    expect(capturedOptions.metaContext.block).toContain('META-KB CONTEXT');
    expect(capturedOptions.metaContext.structured.warnings).toContain('Avoid retry storms');
    expect(capturedTaskContext.meta_context.source).toBe('merged');
  });

  it('emits orchestration policy telemetry when policy decision is present', async () => {
    const events = [];
    const parallelEvents = [];
    const integration = new IntegrationLayer({
      pipelineMetrics: {
        recordPolicyDecision: (decision, details) => {
          events.push({ decision, details });
          return { ok: true };
        },
        recordParallelControls: (event) => {
          parallelEvents.push(event);
          return event;
        },
      }
    });
    integration.enrichTaskContext = (ctx) => ({
      ...ctx,
      session_id: 'ses_policy',
      task_id: 'task_policy',
      model: 'gpt-5'
    });
    integration.resolveRuntimeContext = () => ({
      toolNames: [],
      budget: { action: 'none' },
      compression: { active: false, recommendedTools: [], recommendedSkills: [] },
      policyDecision: {
        contractVersion: '1.0',
        failOpen: true,
        inputs: {
          budgetSignals: { contextPressure: 0.4, costPressure: 0.2 },
          taskClassification: { category: 'deep', complexity: 'high' }
        },
        outputs: {
          parallel: { maxFanout: 3, maxConcurrency: 2 },
          routing: {
            fallback: {
              reason: 'policy-applied',
              metadata: { precedenceRule: 'budget.adaptiveScale' }
            }
          }
        },
        explain: {
          budget: {
            score: 0.34,
            band: 'healthy',
            components: { context: 0.28, cost: 0.06 }
          }
        }
      },
      telemetry: {
        policyDecisionSampleRate: 1
      }
    });

    await integration.executeTaskWithEvidence({ task: 'normal' }, async () => ({ success: true, modelId: 'model-a' }));

    expect(events).toHaveLength(1);
    expect(events[0].details.sessionId).toBe('ses_policy');
    expect(events[0].details.taskId).toBe('task_policy');
    expect(events[0].details.taskType).toBe('normal');
    expect(events[0].details.sampleRate).toBe(1);
    expect(events[0].decision.outputs.routing.fallback.reason).toBe('policy-applied');

    expect(parallelEvents).toHaveLength(1);
    expect(parallelEvents[0].taskType).toBe('normal');
    const appliedFanout = parallelEvents[0].appliedFanout ?? parallelEvents[0].applied?.fanout;
    const appliedConcurrency = parallelEvents[0].appliedConcurrency ?? parallelEvents[0].applied?.concurrency;
    expect(appliedFanout).toBe(3);
    expect(appliedConcurrency).toBe(2);
    expect(parallelEvents[0].fallbackReason).toBe('policy-applied');
  });

  it('keeps execution fail-open when telemetry emission throws', async () => {
    const integration = new IntegrationLayer({
      pipelineMetrics: {
        recordPolicyDecision: () => {
          throw new Error('telemetry unavailable');
        }
      }
    });
    integration.enrichTaskContext = (ctx) => ({
      ...ctx,
      session_id: 'ses_policy',
      task_id: 'task_policy',
      model: 'gpt-5'
    });
    integration.resolveRuntimeContext = () => ({
      toolNames: [],
      budget: { action: 'none' },
      compression: { active: false, recommendedTools: [], recommendedSkills: [] },
      policyDecision: {
        contractVersion: '1.0',
        outputs: { routing: { fallback: { reason: 'policy-applied' } }, parallel: { maxFanout: 2, maxConcurrency: 1 } },
        explain: { budget: { score: 0.2, components: { context: 0.14, cost: 0.06 } } }
      },
      telemetry: {
        policyDecisionSampleRate: 1
      }
    });

    const result = await integration.executeTaskWithEvidence({ task: 'normal' }, async () => ({ success: true, modelId: 'model-a' }));

    expect(result.success).toBe(true);
  });

  it('bridges package execution events into pipeline metrics collector', () => {
    const packageEvents = [];
    const integration = new IntegrationLayer({
      pipelineMetrics: {
        recordPackageExecution: (event) => {
          packageEvents.push(event);
          return event;
        }
      }
    });

    integration.recordPackageExecution('preloadSkills', 'selectTools', true, 7, {
      sessionId: 'ses_pkg',
      taskType: 'deep',
    });

    expect(packageEvents).toHaveLength(1);
    expect(packageEvents[0].package).toBe('preloadSkills');
    expect(packageEvents[0].method).toBe('selectTools');
    expect(packageEvents[0].success).toBe(true);
    expect(packageEvents[0].durationMs).toBe(7);
    expect(packageEvents[0].sessionId).toBe('ses_pkg');
    expect(packageEvents[0].taskType).toBe('deep');
  });

  it('routes model with computed orchestration policy decision before invocation', async () => {
    let capturedRouteCtx = null;
    const integration = new IntegrationLayer({
      modelRouter: {
        route: (routeCtx) => {
          capturedRouteCtx = routeCtx;
          return { modelId: routeCtx.modelId, score: 0.9, reason: 'kept' };
        },
        recordResult: () => {}
      }
    });
    integration.enrichTaskContext = (ctx) => ({
      ...ctx,
      session_id: 'ses_policy_route',
      task_id: 'task_policy_route',
      model: 'gpt-5',
      complexity: 'high'
    });
    integration.resolveRuntimeContext = () => ({
      toolNames: [],
      budget: { action: 'none', pct: 0.32 },
      compression: { active: false, recommendedTools: [], recommendedSkills: [] },
      parallel: { requestedFanout: 5, requestedConcurrency: 3 }
    });

    await integration.executeTaskWithEvidence({ task: 'deep', category: 'deep' }, async () => ({ success: true, modelId: 'gpt-5' }));

    expect(capturedRouteCtx).toBeDefined();
    expect(capturedRouteCtx.taskType).toBe('deep');
    expect(capturedRouteCtx.policyDecision).toBeDefined();
    expect(capturedRouteCtx.policyDecision.contractVersion).toBe('1.0');
    expect(capturedRouteCtx.policyDecision.outputs.routing.fallback.reason).toBe('policy-applied');
  });

  it('applies policy routing refinements for default rollout-enabled categories', async () => {
    let capturedRouteCtx = null;
    const integration = new IntegrationLayer({
      modelRouter: {
        route: (routeCtx) => {
          capturedRouteCtx = routeCtx;
          return { modelId: routeCtx.modelId, score: 0.9, reason: 'kept' };
        },
        recordResult: () => {}
      }
    });
    integration.enrichTaskContext = (ctx) => ({
      ...ctx,
      session_id: 'ses_rollout_default_on',
      model: 'gpt-5',
      complexity: 'high'
    });
    integration.resolveRuntimeContext = () => ({
      toolNames: [],
      budget: { action: 'none' },
      compression: { active: false, recommendedTools: [], recommendedSkills: [] }
    });

    await integration.executeTaskWithEvidence({ task: 'deep', category: 'deep' }, async () => ({ success: true, modelId: 'gpt-5' }));

    expect(capturedRouteCtx).toBeDefined();
    expect(capturedRouteCtx.policyDecision).toBeDefined();
    expect(capturedRouteCtx.policyDecision.inputs.taskClassification.category).toBe('deep');
  });

  it('preserves pre-policy routing parity for categories outside rollout defaults', async () => {
    let capturedRouteCtx = null;
    const integration = new IntegrationLayer({
      modelRouter: {
        route: (routeCtx) => {
          capturedRouteCtx = routeCtx;
          return { modelId: routeCtx.modelId, score: 0.8, reason: 'baseline' };
        },
        recordResult: () => {}
      }
    });
    integration.enrichTaskContext = (ctx) => ({
      ...ctx,
      session_id: 'ses_rollout_default_off',
      model: 'gpt-5',
      complexity: 'moderate'
    });
    integration.resolveRuntimeContext = () => ({
      toolNames: [],
      budget: { action: 'none' },
      compression: { active: false, recommendedTools: [], recommendedSkills: [] }
    });

    await integration.executeTaskWithEvidence({ task: 'quick', category: 'quick' }, async () => ({ success: true, modelId: 'gpt-5' }));

    expect(capturedRouteCtx).toEqual({
      sessionId: 'ses_rollout_default_off',
      modelId: 'gpt-5',
      taskType: 'quick',
      complexity: 'moderate',
      task: 'quick'
    });
  });

  it('allows explicit rollout enablement for non-default categories', async () => {
    let capturedRouteCtx = null;
    const integration = new IntegrationLayer({
      modelRouter: {
        route: (routeCtx) => {
          capturedRouteCtx = routeCtx;
          return { modelId: routeCtx.modelId, score: 0.83, reason: 'policy-enabled' };
        },
        recordResult: () => {}
      }
    });
    integration.enrichTaskContext = (ctx) => ({
      ...ctx,
      session_id: 'ses_rollout_override',
      model: 'gpt-5',
      complexity: 'moderate',
      orchestrationPolicy: {
        rollout: {
          enabledCategories: ['quick']
        }
      }
    });
    integration.resolveRuntimeContext = () => ({
      toolNames: [],
      budget: { action: 'none' },
      compression: { active: false, recommendedTools: [], recommendedSkills: [] }
    });

    await integration.executeTaskWithEvidence({ task: 'quick', category: 'quick' }, async () => ({ success: true, modelId: 'gpt-5' }));

    expect(capturedRouteCtx).toBeDefined();
    expect(capturedRouteCtx.policyDecision).toBeDefined();
    expect(capturedRouteCtx.policyDecision.inputs.taskClassification.category).toBe('quick');
  });

  it('fails open on invalid rollout config by using deterministic defaults', async () => {
    let capturedRouteCtx = null;
    const integration = new IntegrationLayer({
      modelRouter: {
        route: (routeCtx) => {
          capturedRouteCtx = routeCtx;
          return { modelId: routeCtx.modelId, score: 0.81, reason: 'fallback-defaults' };
        },
        recordResult: () => {}
      }
    });
    integration.enrichTaskContext = (ctx) => ({
      ...ctx,
      session_id: 'ses_rollout_invalid',
      model: 'gpt-5',
      complexity: 'high',
      orchestrationPolicy: {
        rollout: {
          enabledCategories: 'not-an-array'
        }
      }
    });
    integration.resolveRuntimeContext = () => ({
      toolNames: [],
      budget: { action: 'none' },
      compression: { active: false, recommendedTools: [], recommendedSkills: [] }
    });

    const result = await integration.executeTaskWithEvidence({ task: 'deep', category: 'deep' }, async () => ({ success: true, modelId: 'gpt-5' }));

    expect(result.success).toBe(true);
    expect(capturedRouteCtx).toBeDefined();
    expect(capturedRouteCtx.policyDecision).toBeDefined();
    expect(capturedRouteCtx.policyDecision.inputs.taskClassification.category).toBe('deep');
  });

  it('preserves pre-policy routing parity when policy is explicitly disabled', async () => {
    let capturedRouteCtx = null;
    const integration = new IntegrationLayer({
      modelRouter: {
        route: (routeCtx) => {
          capturedRouteCtx = routeCtx;
          return { modelId: routeCtx.modelId, score: 0.8, reason: 'baseline' };
        },
        recordResult: () => {}
      }
    });
    integration.enrichTaskContext = (ctx) => ({
      ...ctx,
      session_id: 'ses_policy_off',
      model: 'gpt-5',
      complexity: 'moderate',
      orchestrationPolicy: { enabled: false }
    });
    integration.resolveRuntimeContext = () => ({
      toolNames: [],
      budget: { action: 'none' },
      compression: { active: false, recommendedTools: [], recommendedSkills: [] }
    });

    await integration.executeTaskWithEvidence({ task: 'quick' }, async () => ({ success: true, modelId: 'gpt-5' }));

    expect(capturedRouteCtx).toEqual({
      sessionId: 'ses_policy_off',
      modelId: 'gpt-5',
      taskType: 'quick',
      complexity: 'moderate',
      task: 'quick'
    });
  });

  it('keeps routing fail-open with deterministic fallback metadata when policy evaluation fails', async () => {
    let capturedRouteCtx = null;
    const integration = new IntegrationLayer({
      modelRouter: {
        route: (routeCtx) => {
          capturedRouteCtx = routeCtx;
          return { modelId: routeCtx.modelId, score: 0.7, reason: 'fallback' };
        },
        recordResult: () => {}
      }
    });
    integration.enrichTaskContext = (ctx) => ({
      ...ctx,
      session_id: 'ses_policy_fail_open',
      model: 'gpt-5',
      complexity: 'moderate'
    });
    integration.resolveRuntimeContext = () => ({
      toolNames: [],
      budget: { action: 'none' },
      compression: { active: false, recommendedTools: [], recommendedSkills: [] }
    });
    integration._resolveOrchestrationPolicyDecision = () => {
      throw new Error('policy evaluator unavailable');
    };

    const result = await integration.executeTaskWithEvidence({ task: 'deep', category: 'deep' }, async () => ({ success: true, modelId: 'gpt-5' }));

    expect(result.success).toBe(true);
    expect(capturedRouteCtx).toBeDefined();
    expect(capturedRouteCtx.policyDecision).toBeDefined();
    expect(capturedRouteCtx.policyDecision.failOpen).toBe(true);
    expect(capturedRouteCtx.policyDecision.outputs.routing.fallback.reason).toBe('policy-evaluation-failed');
    expect(capturedRouteCtx.policyDecision.outputs.routing.fallback.metadata.error).toBe('policy evaluator unavailable');
  });
});
