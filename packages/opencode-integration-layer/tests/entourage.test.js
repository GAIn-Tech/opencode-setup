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

describe('Entourage Synergy (Quota + RL + Sisyphus)', () => {
  let dbPath, store, quotaManager, advisor, skillRL, integration, executor;

  beforeEach(() => {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    dbPath = path.join(__dirname, `entourage-${uniqueId}.db`);
    removeArtifacts(dbPath);

    store = new WorkflowStore(dbPath);
    quotaManager = new ProviderQuotaManager(store);
    advisor = new OrchestrationAdvisor();
    skillRL = new SkillRLManager();
    integration = new IntegrationLayer({ 
      skillRL, 
      advisor,
      quotaManager 
    });

    executor = new WorkflowExecutor(store);
  });

  afterEach(() => {
    if (store) store.close();
    removeArtifacts(dbPath);
  });

  it('coordinates quota-fallback across state, routing, and RL evolution', async () => {
    // 1. Setup critical quota for 'primary-provider'
    quotaManager.setupProvider('primary-provider', {
      quotaType: 'monthly',
      quotaLimit: 1000,
      criticalThreshold: 0.9
    });
    quotaManager.recordUsage({ providerId: 'primary-provider', tokensInput: 910 }); // 91%

    quotaManager.setupProvider('fallback-provider', { quotaType: 'monthly', quotaLimit: 1000 });

    // 2. Setup Base Router mock
    const baseRouter = {
      selectModel: async (params) => {
        return { 
          model: 'gpt-mock', 
          provider: params.provider || params.allowedProviders?.[0] || 'unknown' 
        };
      }
    };

    // 3. Create Quota-Aware Router
    const quotaRouter = createQuotaAwareRouterHandler(quotaManager, baseRouter);

    // 4. Register Sisyphus Handler that uses IntegrationLayer entourage
    executor.registerHandler('task', async (step, context) => {
      // IntegrationLayer entourage wrapper
      return await integration.executeTaskWithEvidence(
        { ...context, task: step.type },
        async (taskContext) => {
          // Inner execution uses the quota-aware router
          const routing = await quotaRouter({
            requestedProvider: 'primary-provider',
            category: 'coding'
          });
          return { success: true, ...routing, quota_signal: routing.quotaFactors?.[0] };
        }
      );
    });

    // 5. Execute workflow
    const runId = 'entourage-run-1';
    const workflow = {
      name: 'synergy-test',
      steps: [{ id: 'step1', type: 'task' }]
    };

    const result = await executor.execute(workflow, {}, runId);

    // 6. VERIFY ENTOURAGE EFFECTS

    // A. Quota Routing triggered fallback
    expect(result.status).toBe('completed');
    const stepResult = store.getRunState(runId).steps[0].result;
    expect(stepResult.fallbackApplied).toBe(true);
    expect(stepResult.model.provider).toBe('fallback-provider');

    // B. Sisyphus State updated context with last_quota_fallback
    const finalState = store.getRunState(runId);
    expect(finalState.context.last_quota_fallback).toBeDefined();
    expect(finalState.context.last_quota_fallback.provider).toBe('primary-provider');

    // C. RL Manager evolved the quota-aware-routing skill
    const allSkills = skillRL.skillBank.getAllSkills();
    console.log('All skills:', JSON.stringify(allSkills, null, 2));
    const quotaSkill = allSkills.taskSpecific.find(s => s.name === 'quota-aware-routing');
    expect(quotaSkill).toBeDefined();
    expect(quotaSkill.usage_count).toBeDefined(); // EvolutionEngine should have created/updated it

    // D. OrchestrationAdvisor sees the risk (verified via IntegrationLayer enrichment)
    const advice = await advisor.advise({ quota_signal: { percent_used: 0.91 } });
    expect(advice.warnings.some(w => w.type === 'quota_exhaustion_risk')).toBe(true);
  });
});
