const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const fs = require('fs');
const path = require('path');
const { WorkflowStore, WorkflowExecutor } = require('../../opencode-sisyphus-state/src/index');
const { ProviderQuotaManager } = require('../../opencode-sisyphus-state/src/quota-manager');
const { createQuotaAwareRouterHandler } = require('../../opencode-sisyphus-state/src/integrations/quota-routing');
const { IntegrationLayer } = require('../src/index');
const { OrchestrationAdvisor } = require('../../opencode-learning-engine/src/orchestration-advisor');
const { SkillRLManager } = require('../../opencode-skill-rl-manager/src/index');
const { IntelligentRotator } = require('../../opencode-model-router-x/src/key-rotator');

function removeArtifacts(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${dbPath}${suffix}`;
    if (fs.existsSync(target)) {
      try { fs.unlinkSync(target); } catch (_) {}
    }
  }
}

describe('Rotator Entourage Synergy (Key Exhaustion -> High Risk -> Evidence)', () => {
  let dbPath, store, quotaManager, advisor, skillRL, integration, executor, showboatMock, modelRouterMock;

  beforeEach(() => {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    dbPath = path.join(__dirname, `rotator-synergy-${uniqueId}.db`);
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

    // 1. Setup Rotator Mock with exhausted keys
    const nvidiaRotator = new IntelligentRotator('nvidia', ['key1', 'key2']);
    // Exhaust all keys by setting status to 'dead'
    nvidiaRotator.keys[0].status = 'dead';
    nvidiaRotator.keys[1].status = 'dead';

    modelRouterMock = {
      rotators: {
        nvidia: nvidiaRotator
      }
    };

    integration = new IntegrationLayer({ 
      skillRLManager: skillRL, 
      showboatWrapper: showboatMock,
      quotaManager,
      orchestrationAdvisor: advisor,
      modelRouter: modelRouterMock
    });
    
    executor = new WorkflowExecutor(store);
  });

  afterEach(() => {
    if (store) store.close();
    removeArtifacts(dbPath);
  });

  it('triggers entourage effects when provider rotators are under pressure', async () => {
    // 1. Setup healthy quota but exhausted rotator
    quotaManager.setupProvider('nvidia', { quotaLimit: 1000, criticalThreshold: 0.9 });
    quotaManager.recordUsage({ providerId: 'nvidia', tokensInput: 100 }); // Only 10% used at provider level

    // 2. Setup Base Router mock
    const baseRouter = {
      selectModel: async (params) => {
        return { model: 'llama-3.1-405b', provider: 'nvidia' };
      }
    };
    const quotaRouter = createQuotaAwareRouterHandler(quotaManager, baseRouter);

    // 3. Register Sisyphus Handler
    executor.registerHandler('nvidia-task', async (step, context) => {
      return await integration.executeTaskWithEvidence(
        { ...context, task: step.type, run_id: context.run_id, step_id: step.id },
        async (taskContext, skills, options) => {
          // The quota router will see the rotator exhaustion via its own internal logic (if wired)
          // or here we simulate the fallback result
          const routing = {
              model: 'fallback-model',
              provider: 'sambanova',
              fallbackApplied: true,
              reason: 'NVIDIA keys exhausted'
          };
          return { success: true, ...routing };
        }
      );
    });

    // 4. Execute workflow
    const runId = 'rotator-synergy-run';
    const workflow = {
      name: 'rotator-synergy-test',
      steps: [{ id: 'step-rotator', type: 'nvidia-task' }]
    };

    const result = await executor.execute(workflow, { run_id: runId }, runId);

    // 5. VERIFY ENTOURAGE SYNERGY

    // A. Quota Signal in Integration Layer
    // Rotator exhaustion (0.9 risk) should override low provider usage (0.1)
    const context = integration.enrichTaskContext({ task: 'nvidia-task' });
    expect(context.quota_signal.percent_used).toBe(0.9);
    expect(context.quota_signal.rotator_risk).toBe(0.9);

    // B. Orchestration Advisor Risk (Entourage)
    const advice = advisor.advise(context);
    expect(advice.warnings.some(w => w.type === 'quota_exhaustion_risk')).toBe(true);
    expect(advice.routing.skills).toContain('quota-aware-routing');

    // C. Forced Evidence Capture (Entourage: High Risk -> Showboat)
    // Risk score should be high enough to trigger showboat even if impact is low
    expect(showboatMock.captured.length).toBeGreaterThan(0);

    // D. RL Learning (Entourage: Fallback -> Meta-Skill)
    const quotaSkill = skillRL.skillBank.getAllSkills().taskSpecific.find(s => s.name === 'quota-aware-routing');
    expect(quotaSkill).toBeDefined();

    // E. Sisyphus State persistence (Entourage: Tracing)
    const finalState = store.getRunState(runId);
    expect(finalState.context.last_quota_fallback).toBeDefined();
    expect(finalState.context.last_quota_fallback.provider).toBe('sambanova');
  });
});
