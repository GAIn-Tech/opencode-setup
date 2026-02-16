const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const fs = require('fs');
const path = require('path');
const { WorkflowStore, WorkflowExecutor } = require('../../opencode-sisyphus-state/src/index');
const { ProviderQuotaManager } = require('../../opencode-sisyphus-state/src/quota-manager');
const { createQuotaAwareRouterHandler } = require('../../opencode-sisyphus-state/src/integrations/quota-routing');
const { IntegrationLayer } = require('../src/index');
const { OrchestrationAdvisor } = require('../../opencode-learning-engine/src/orchestration-advisor');
const { SkillRLManager } = require('../../opencode-skill-rl-manager/src/index');

function removeArtifacts(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${dbPath}${suffix}`;
    if (fs.existsSync(target)) {
      try { fs.unlinkSync(target); } catch (_) {}
    }
  }
}

describe('Entourage Synergy v2 (Full Cycle + Adaptive Behavior)', () => {
  let dbPath, store, quotaManager, advisor, skillRL, integration, executor, showboatMock;

  beforeEach(() => {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    dbPath = path.join(__dirname, `entourage-v2-${uniqueId}.db`);
    removeArtifacts(dbPath);

    store = new WorkflowStore(dbPath);
    quotaManager = new ProviderQuotaManager(store);
    advisor = new OrchestrationAdvisor();
    skillRL = new SkillRLManager();
    
    showboatMock = {
      captured: [],
      isHighImpact: (ctx) => ctx.impact === 'high',
      captureEvidence: function(data) {
        this.captured.push(data);
        return { path: 'mock-evidence.md' };
      }
    };

    integration = new IntegrationLayer({ 
      skillRLManager: skillRL, 
      showboatWrapper: showboatMock,
      quotaManager,
      orchestrationAdvisor: advisor
    });
    
    // Wire advisor into integration layer manually since it's used in executeTaskWithEvidence
    integration.advisor = advisor;

    executor = new WorkflowExecutor(store);
  });

  afterEach(() => {
    if (store) store.close();
    removeArtifacts(dbPath);
  });

  it('demonstrates nonlinear adaptive behavior and deep tracing', async () => {
    // 1. Setup critical quota
    quotaManager.setupProvider('primary-provider', { quotaType: 'monthly', quotaLimit: 1000, criticalThreshold: 0.9 });
    quotaManager.recordUsage({ providerId: 'primary-provider', tokensInput: 950 }); // 95%

    // 2. Setup uncertain skill
    skillRL.addSkill({ 
      name: 'experimental-optimization', 
      success_rate: 0.4, 
      usage_count: 1 
    }, 'task-specific');

    // 3. Setup Base Router mock
    const baseRouter = {
      selectModel: async (params) => {
        return { 
          model: 'gpt-mock', 
          provider: params.provider || params.allowedProviders?.[0] || 'unknown' 
        };
      }
    };
    const quotaRouter = createQuotaAwareRouterHandler(quotaManager, baseRouter);

    // 4. Register Sisyphus Handler
    let capturedOptions = null;
    executor.registerHandler('complex-task', async (step, context) => {
      return await integration.executeTaskWithEvidence(
        { ...context, task: step.type, run_id: context.run_id, step_id: step.id },
        async (taskContext, skills, options) => {
          capturedOptions = options;
          const routing = await quotaRouter({
            requestedProvider: 'primary-provider',
            category: 'coding'
          });
          return { success: true, ...routing };
        }
      );
    });

    // 5. Execute workflow
    const runId = 'entourage-v2-run';
    const workflow = {
      name: 'synergy-v2-test',
      steps: [{ id: 'step-adaptive', type: 'complex-task' }]
    };

    // Inject runId into initial context for tracing
    const result = await executor.execute(workflow, { run_id: runId }, runId);

    // 6. VERIFY NONLINEAR SYNERGY

    // A. Adaptive Options (Entourage 1: Quota-Adaptive Backoff)
    // Quota risk is high (>0.8), so retries should be reduced and backoff increased
    expect(capturedOptions.retries).toBe(1);
    expect(capturedOptions.backoff).toBe(3000);

    // B. Forced Evidence Capture (Entourage 2: Uncertainty-Triggered)
    // Skill 'experimental-optimization' is uncertain, should trigger showboat
    expect(showboatMock.captured.length).toBeGreaterThan(0);
    expect(showboatMock.captured[0].verification.is_skill_uncertain).toBe(true);

    // C. Deep Tracing (Entourage 3)
    // Check if RL learned outcome has run_id and step_id
    const report = skillRL.getReport();
    // In our test, success reinforced skills. Let's check the reinforced skill in skill bank
    const quotaSkill = skillRL.skillBank.getAllSkills().taskSpecific.find(s => s.name === 'quota-aware-routing');
    expect(quotaSkill).toBeDefined();

    // D. Sisyphus State persistence
    const finalState = store.getRunState(runId);
    expect(finalState.context.last_quota_fallback).toBeDefined();
    expect(finalState.context.last_quota_fallback.step_id).toBe('step-adaptive');
  });

  it('records failure learning and evidence when task execution throws', async () => {
    const beforeFailures = skillRL.evolutionEngine.getFailureStats().total_failures;

    let thrown = null;
    try {
      await integration.executeTaskWithEvidence(
        {
          task: 'complex-task',
          impact: 'high',
          run_id: 'run-throw-1',
          step_id: 'step-throw-1',
          sessionId: 'session-throw-1',
        },
        async (taskContext) => {
          expect(taskContext.task_id.startsWith('task_')).toBe(true);
          expect(taskContext.session_id).toBe('session-throw-1');
          expect(taskContext.sessionId).toBe('session-throw-1');
          throw new Error('simulated crash');
        }
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeDefined();
    expect(thrown.message).toBe('simulated crash');

    const afterFailures = skillRL.evolutionEngine.getFailureStats().total_failures;
    expect(afterFailures).toBeGreaterThan(beforeFailures);

    expect(showboatMock.captured.length).toBeGreaterThan(0);
    const latestEvidence = showboatMock.captured[showboatMock.captured.length - 1];
    expect(latestEvidence.outcome).toBe('FAIL');
  });

  it('normalizes mixed quota signal aliases across context and outcome', async () => {
    await integration.executeTaskWithEvidence(
      {
        task: 'complex-task',
        impact: 'low',
        sessionId: 'session-mixed-1',
        quotaSignal: {
          providerId: 'context-provider',
          percentUsed: 0.62,
          warningThreshold: 0.7,
          criticalThreshold: 0.95,
          fallbackApplied: true,
          rotatorRisk: 0.2,
        },
      },
      async (taskContext) => {
        expect(taskContext.session_id).toBe('session-mixed-1');
        expect(taskContext.sessionId).toBe('session-mixed-1');
        expect(taskContext.quota_signal.fallback_applied).toBe(true);
        expect(taskContext.quotaSignal).toEqual(taskContext.quota_signal);

        return {
          success: true,
          quota_signal: {
            provider_id: 'outcome-provider',
            percentUsed: 0.86,
            warning_threshold: 0.8,
            criticalThreshold: 0.97,
            fallback_applied: false,
            rotatorRisk: 0.4,
          },
        };
      }
    );

    const extracted = integration._extractQuotaSignal(
      {
        quotaSignal: {
          providerId: 'context-provider',
          percentUsed: 0.62,
          warningThreshold: 0.7,
          criticalThreshold: 0.95,
          fallbackApplied: true,
          rotatorRisk: 0.2,
        },
      },
      {
        quota_signal: {
          provider_id: 'outcome-provider',
          percentUsed: 0.86,
          warning_threshold: 0.8,
          criticalThreshold: 0.97,
          fallback_applied: false,
          rotatorRisk: 0.4,
        },
        fallbackApplied: true,
      }
    );

    expect(extracted.provider_id).toBe('outcome-provider');
    expect(extracted.percent_used).toBe(1);
    expect(extracted.warning_threshold).toBe(0.8);
    expect(extracted.critical_threshold).toBe(0.97);
    expect(extracted.fallback_applied).toBe(true);
    expect(extracted.rotator_risk).toBe(0.4);
  });
});
