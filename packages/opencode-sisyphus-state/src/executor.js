const { v4: uuidv4 } = require('uuid');

class WorkflowExecutor {
  constructor(store, handlers = {}, options = {}) {
    this.store = store;
    this.handlers = handlers;
    this.budgetEnforcer = options.budgetEnforcer || null;
    this.agentSandbox = options.agentSandbox || null;
  }

  registerHandler(type, handler) {
    this.handlers[type] = handler;
  }

  async execute(workflowDef, input, runId = null) {
    if (!runId) runId = uuidv4();
    this.store.createRun(workflowDef.name, input, runId);
    if (this.budgetEnforcer) {
      this.budgetEnforcer.trackStart(runId);
    }

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
        this._enforceBudget(runId, step, context);
        this._enforceSandbox(step);

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
        this._trackTokenUsage(runId, result);
        
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
        if (err && (err.code === 'BUDGET_EXHAUSTED' || err.code === 'SANDBOX_DENIED')) {
          this.store.upsertStep(runId, step.id, 'failed', { error: err.message }, attempts);
          this.store.logEvent(runId, 'step_failed', { stepId: step.id, error: err.message, code: err.code });
          throw err;
        }

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
    if (this.budgetEnforcer) {
      this.budgetEnforcer.trackStart(runId, state.created_at ? Date.parse(state.created_at) : Date.now());
    }
    const context = { ...state.input, ...state.context };

    for (const step of workflowDef.steps) {
      await this.executeStepWithCheckpoint(runId, step, context);
    }

    this.store.updateRunStatus(runId, 'completed');
    return { runId, status: 'completed', context };
  }

  _enforceBudget(runId, step, context) {
    if (!this.budgetEnforcer) return;

    const task = step.task || { type: step.type };
    const check = this.budgetEnforcer.checkBudget(runId, { task });
    if (!check.allowed) {
      const error = new Error(check.reason || 'Budget exhausted');
      error.code = 'BUDGET_EXHAUSTED';
      throw error;
    }

    this.budgetEnforcer.trackStep(runId);
  }

  _trackTokenUsage(runId, result) {
    if (!this.budgetEnforcer || !result || typeof result !== 'object') return;

    const tokenCandidates = [
      result.tokens,
      result.totalTokens,
      result.tokensUsed,
      result.token_usage,
      result.input_tokens,
      result.output_tokens,
    ].filter((v) => Number.isFinite(v));

    if (tokenCandidates.length === 0) return;

    const total = tokenCandidates.reduce((sum, n) => sum + Number(n), 0);
    if (total > 0) {
      this.budgetEnforcer.trackTokens(runId, total);
    }
  }

  _enforceSandbox(step) {
    if (!this.agentSandbox) return;

    const task = step.task || {};
    const agentRole = task.agentRole;
    const toolName = task.toolName;
    const agentId = task.agentId || null;

    if (!agentRole || !toolName) return;

    const check = this.agentSandbox.checkCapability(agentRole, toolName, agentId);
    if (!check.allowed) {
      const error = new Error(check.reason || 'Capability denied by agent sandbox');
      error.code = 'SANDBOX_DENIED';
      throw error;
    }
  }
}

module.exports = { WorkflowExecutor };
