const { v4: uuidv4 } = require('uuid');

// Initialize crash guard at module load time
let crashGuard;
try {
  const crashGuardModule = require('@jackoatmon/opencode-crash-guard');
  crashGuard = crashGuardModule.initCrashGuard({
    enableRecovery: true,
    enableMemoryGuard: true,
    enableIsolation: true,
    memoryThresholdMB: 512,
    onCrash: (crashInfo) => {
      console.error('[CrashGuard] Captured crash in workflow:', crashInfo.type);
    }
  });
  console.log('[WorkflowExecutor] Crash guard initialized');
} catch (e) {
  console.warn('[WorkflowExecutor] Crash guard not available:', e.message);
}

class WorkflowExecutor {
  constructor(store, handlers = {}) {
    this.store = store;
    this.handlers = handlers;
  }

  registerHandler(type, handler) {
    this.handlers[type] = handler;
  }

  async execute(workflowDef, input, runId = null) {
    if (!runId) runId = uuidv4();
    this.store.createRun(workflowDef.name, input, runId);

    try {
      const context = { ...input };
      
      for (const step of workflowDef.steps) {
        await this.executeStepWithCheckpoint(runId, step, context);
      }

      this.store.updateRunStatus(runId, 'completed');
      return { runId, status: 'completed', context };
    } catch (err) {
      this.store.updateRunStatus(runId, 'failed');
      throw err;
    }
  }

  async executeStepWithCheckpoint(runId, step, context) {
    const state = this.store.getRunState(runId);
    const stepState = state.steps.find(s => s.step_id === step.id);
    
    if (stepState?.status === 'completed') {
      if (stepState.result && typeof stepState.result === 'object') {
        Object.assign(context, stepState.result);
      }
      return;
    }

    // Parallel Execution Logic with concurrency limits to prevent OOM
    if (step.type === 'parallel-for') {
      const listPath = step.foreach.replace(/^\${|}$/g, '');
      const list = listPath.split('.').reduce((obj, key) => obj?.[key], context) || [];
      
      if (!Array.isArray(list)) {
        throw new Error(`parallel-for: ${step.foreach} is not an array`);
      }

      this.store.upsertStep(runId, step.id, 'running', null);
      this.store.logEvent(runId, 'step_started', { stepId: step.id, type: 'parallel-for', count: list.length });

      // Concurrency limit to prevent memory exhaustion (default 5, configurable via step.concurrency)
      const concurrencyLimit = step.concurrency ?? 5;

      try {
        // Process in batches with concurrency control
        for (let i = 0; i < list.length; i += concurrencyLimit) {
          const batch = list.slice(i, i + concurrencyLimit);
          await Promise.all(batch.map(async (item, batchIndex) => {
            const index = i + batchIndex;
            const childStep = {
              ...step.substep,
              id: `${step.id}:${index}`,
              input: { ...step.input, item }
            };
            // Use isolated context for child step to prevent race conditions
            const childContext = { ...context, item };
            await this.executeStepWithCheckpoint(runId, childStep, childContext);
          }));
        }

        this.store.upsertStep(runId, step.id, 'completed', { count: list.length });
        this.store.logEvent(runId, 'step_completed', { stepId: step.id });
        return;
      } catch (err) {
        this.store.upsertStep(runId, step.id, 'failed', { error: err.message });
        throw err;
      }
    }

    let attempts = stepState?.attempts || 0;
    const maxRetries = step.retries ?? 3;
    const backoff = step.backoff ?? 1000;

    while (attempts <= maxRetries) {
      try {
        this.store.upsertStep(runId, step.id, 'running', null, attempts);
        if (attempts > 0) {
          this.store.logEvent(runId, 'step_retry', { stepId: step.id, attempt: attempts });
        } else {
          this.store.logEvent(runId, 'step_started', { stepId: step.id });
        }

        const handler = this.handlers[step.type];
        if (!handler) {
          throw new Error(`No handler for step type: ${step.type}`);
        }
        
        const result = await handler(step, context);
        
        const updateState = this.store.db.transaction(() => {
          this.store.upsertStep(runId, step.id, 'completed', result, attempts);
          this.store.logEvent(runId, 'step_completed', { stepId: step.id, result });
          
          // Entourage effect: persist quota fallback telemetry to run context
          if (result && result.fallbackApplied) {
            const provider = result.provider || result.quotaFactors?.[0]?.provider;
            this.store.logEvent(runId, 'quota_fallback', { 
              stepId: step.id, 
              provider,
              reason: result.reason 
            });
            // Update context so subsequent steps (or resumes) are aware
            const currentContext = this.store.getRunState(runId).context || {};
            this.store.updateRunContext(runId, {
              ...currentContext,
              last_quota_fallback: {
                step_id: step.id,
                timestamp: new Date().toISOString(),
                provider,
                reason: result.reason
              }
            });
          }
        });
        
        updateState();

        Object.assign(context, result);
        return;
      } catch (err) {
        attempts++;
        if (attempts > maxRetries) {
          this.store.upsertStep(runId, step.id, 'failed', { error: err.message }, attempts - 1);
          this.store.logEvent(runId, 'step_failed', { stepId: step.id, error: err.message });
          throw err;
        }
        
        // Wait before retry
        const waitTime = backoff * Math.pow(2, attempts - 1);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  async resume(runId, workflowDef) {
    const state = this.store.getRunState(runId);
    if (!state) throw new Error(`Run not found: ${runId}`);
    if (state.status === 'completed') return { runId, status: 'completed', context: state.context };

    this.store.updateRunStatus(runId, 'running');
    const context = { ...state.input, ...state.context };

    for (const step of workflowDef.steps) {
      await this.executeStepWithCheckpoint(runId, step, context);
    }

    this.store.updateRunStatus(runId, 'completed');
    return { runId, status: 'completed', context };
  }
}

module.exports = { WorkflowExecutor };
