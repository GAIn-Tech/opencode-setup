const { v4: uuidv4 } = require('uuid');
const os = require('os');
const { BudgetEnforcer } = require('./budget-enforcer');

const GIB = 1024 * 1024 * 1024;

function getCpuCount(systemInfo = {}) {
  if (Number.isFinite(systemInfo.cpuCount) && systemInfo.cpuCount > 0) {
    return Math.floor(systemInfo.cpuCount);
  }

  if (typeof os.availableParallelism === 'function') {
    return os.availableParallelism();
  }

  const cpus = typeof os.cpus === 'function' ? os.cpus() : [];
  return Math.max(1, cpus.length || 1);
}

function getTotalMemoryBytes(systemInfo = {}) {
  if (Number.isFinite(systemInfo.totalMemoryBytes) && systemInfo.totalMemoryBytes > 0) {
    return systemInfo.totalMemoryBytes;
  }

  return typeof os.totalmem === 'function' ? os.totalmem() : 0;
}

function deriveDefaultParallelConcurrency(systemInfo = {}) {
  const cpuCount = getCpuCount(systemInfo);
  const totalMemoryBytes = getTotalMemoryBytes(systemInfo);
  const totalMemoryGiB = totalMemoryBytes / GIB;

  const cpuBound = Math.max(2, cpuCount - 1);

  const MEMORY_OVERHEAD_GIB = 2;
  const MEMORY_PER_TASK_GIB = 2;
  const memoryBound = Math.max(2, Math.floor((totalMemoryGiB - MEMORY_OVERHEAD_GIB) / MEMORY_PER_TASK_GIB));

  return Math.max(2, Math.min(cpuBound, memoryBound));
}

function asPositiveInt(value, maxValue = Infinity, fieldName = 'value') {
  if (value === undefined || value === null) {
    return null;
  }
  
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    console.warn(`Invalid ${fieldName}: must be positive finite number, got ${typeof value}`);
    return null;
  }
  
  const floored = Math.floor(numeric);
  if (floored > maxValue) {
    console.warn(`Invalid ${fieldName}: exceeds maximum ${maxValue}, got ${floored}`);
    return null;
  }
  
  return floored;
}

function validateWorkflowStep(step) {
  if (!step || typeof step !== 'object') {
    throw new Error('Workflow step must be an object');
  }

  if (typeof step.id !== 'string' || step.id.trim() === '') {
    throw new Error('Workflow step must have a non-empty string id');
  }

  if (typeof step.type !== 'string' || step.type.trim() === '') {
    throw new Error('Workflow step must have a non-empty string type');
  }

  // Validate retries
  if (step.retries !== undefined) {
    const validRetries = asPositiveInt(step.retries, 10, 'retries');
    if (validRetries === null && step.retries !== null) {
      throw new Error('Step retries must be a positive integer ≤ 10');
    }
  }

  // Validate backoff
  if (step.backoff !== undefined) {
    const validBackoff = asPositiveInt(step.backoff, 60000, 'backoff');
    if (validBackoff === null && step.backoff !== null) {
      throw new Error('Step backoff must be a positive integer ≤ 60000ms');
    }
  }

  // Validate concurrency for parallel-for steps
  if (step.type === 'parallel-for') {
    if (!step.foreach || typeof step.foreach !== 'string') {
      throw new Error('parallel-for step must have a foreach property referencing context array');
    }
    
    if (!step.substep || typeof step.substep !== 'object') {
      throw new Error('parallel-for step must have a substep object');
    }

    if (step.concurrency !== undefined) {
      const validConcurrency = asPositiveInt(step.concurrency, 100, 'concurrency');
      if (validConcurrency === null && step.concurrency !== null) {
        throw new Error('Parallel concurrency must be a positive integer ≤ 100');
      }
    }
  }

  return true;
}

function validatePolicyDecision(policy) {
  if (!policy || typeof policy !== 'object') {
    return { valid: false, error: 'Policy must be an object' };
  }

  // Validate structure
  const allowedKeys = ['outputs', 'constraints', 'rules', 'metadata', 'version'];
  const unexpectedKeys = Object.keys(policy).filter(key => !allowedKeys.includes(key));
  if (unexpectedKeys.length > 0) {
    return { valid: false, error: `Unexpected policy keys: ${unexpectedKeys.join(', ')}` };
  }

  // Validate outputs if present
  if (policy.outputs && typeof policy.outputs !== 'object') {
    return { valid: false, error: 'Policy outputs must be an object' };
  }

  if (policy.outputs?.parallel) {
    const parallel = policy.outputs.parallel;
    if (typeof parallel !== 'object') {
      return { valid: false, error: 'Parallel policy must be an object' };
    }

    // Validate numeric bounds
    const numericFields = ['maxFanout', 'maxConcurrency'];
    for (const field of numericFields) {
      if (field in parallel) {
        const value = parallel[field];
        if (!Number.isFinite(value) || value < 1 || value > 10000) {
          return { valid: false, error: `Parallel.${field} must be a positive finite number between 1-10000` };
        }
      }
    }
  }

  // Validate constraints if present
  if (policy.constraints && typeof policy.constraints !== 'object') {
    return { valid: false, error: 'Policy constraints must be an object' };
  }

  // Validate rules if present
  if (policy.rules && !Array.isArray(policy.rules)) {
    return { valid: false, error: 'Policy rules must be an array' };
  }

  return { valid: true };
}

function getPolicyDecision(context = {}) {
  if (!context || typeof context !== 'object') {
    return null;
  }

  const policy = context.policyDecision
    || context.orchestrationPolicyDecision
    || context.taskContext?.policyDecision
    || null;

  // Validate policy if found
  if (policy) {
    const validation = validatePolicyDecision(policy);
    if (!validation.valid) {
      console.warn(`Invalid policy decision: ${validation.error}`);
      return null;
    }
  }

  return policy;
}

function resolveParallelControls(step, listLength, context, defaultParallelConcurrency) {
  const baseConcurrency = step.concurrency ?? defaultParallelConcurrency;
  const baseFanout = listLength;

  const policyDecision = getPolicyDecision(context);
  const policyParallel = policyDecision?.outputs?.parallel && typeof policyDecision.outputs.parallel === 'object'
    ? policyDecision.outputs.parallel
    : null;

  const policyMaxFanout = asPositiveInt(policyParallel?.maxFanout);
  const policyMaxConcurrency = asPositiveInt(policyParallel?.maxConcurrency);

  const fanoutLimit = policyMaxFanout ? Math.min(baseFanout, policyMaxFanout) : baseFanout;
  const concurrencyLimit = policyMaxConcurrency ? Math.min(baseConcurrency, policyMaxConcurrency) : baseConcurrency;

  return {
    fanoutLimit,
    concurrencyLimit,
    explain: {
      precedence: [
        'step.concurrency-or-host-default',
        'policy.outputs.parallel.max* (cap-only)',
      ],
      appliedRule: policyParallel ? 'policy-cap-applied' : 'baseline-only',
      base: {
        fanout: baseFanout,
        concurrency: baseConcurrency,
      },
      policy: {
        maxFanout: policyParallel?.maxFanout,
        maxConcurrency: policyParallel?.maxConcurrency,
        validMaxFanout: policyMaxFanout,
        validMaxConcurrency: policyMaxConcurrency,
      },
      effective: {
        fanout: fanoutLimit,
        concurrency: concurrencyLimit,
      },
      failOpen: policyParallel !== null && (policyMaxFanout === null || policyMaxConcurrency === null),
    },
  };
}

class WorkflowExecutor {
constructor(store, handlers = {}, options = {}) {
    if (!store || typeof store !== 'object') {
      throw new Error('WorkflowExecutor requires a valid store');
    }

    // Validate required store methods
    const requiredMethods = ['createRun', 'getRunState', 'upsertStep', 'logEvent', 'updateRunStatus'];
    const missingMethods = requiredMethods.filter(method => typeof store[method] !== 'function');
    if (missingMethods.length > 0) {
      throw new Error(`WorkflowExecutor store missing required methods: ${missingMethods.join(', ')}`);
    }

    this.store = store;
    this.handlers = handlers || {};
    
    // Validate handlers
    if (typeof handlers !== 'object') {
      throw new Error('Handlers must be an object');
    }
    
    for (const [type, handler] of Object.entries(handlers)) {
      if (typeof handler !== 'function') {
        throw new Error(`Handler for type "${type}" must be a function`);
      }
    }

    this.budgetEnforcer = options.budgetEnforcer ||
      (options.budget ? new BudgetEnforcer(options.budget) : null);
    this.agentSandbox = options.agentSandbox || null;
    
    // Validate system info
    const systemInfo = options.systemInfo || {};
    if (systemInfo && typeof systemInfo !== 'object') {
      throw new Error('systemInfo must be an object');
    }

    this.defaultParallelConcurrency = options.defaultParallelConcurrency
      ?? deriveDefaultParallelConcurrency(systemInfo);
    
    // Validate concurrency bounds
    if (this.defaultParallelConcurrency < 1 || this.defaultParallelConcurrency > 100) {
      throw new Error('Default parallel concurrency must be between 1 and 100');
    }
  }

  registerHandler(type, handler) {
    this.handlers[type] = handler;
  }

async execute(workflowDef, input, runId = null) {
    // Validate workflow definition
    if (!workflowDef || typeof workflowDef !== 'object') {
      throw new Error('Workflow definition must be an object');
    }

    if (typeof workflowDef.name !== 'string' || workflowDef.name.trim() === '') {
      throw new Error('Workflow definition must have a non-empty string name');
    }

    if (!Array.isArray(workflowDef.steps)) {
      throw new Error('Workflow definition must have an array of steps');
    }

    if (workflowDef.steps.length === 0) {
      throw new Error('Workflow definition must have at least one step');
    }

    // Validate each step
    for (const step of workflowDef.steps) {
      validateWorkflowStep(step);
    }

    // Validate input
    if (input !== undefined && (typeof input !== 'object' || input === null)) {
      throw new Error('Input must be an object or undefined');
    }

    if (!runId) runId = uuidv4();
    if (typeof runId !== 'string' || runId.trim() === '') {
      throw new Error('runId must be a non-empty string');
    }

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
    // Validate step before execution
    try {
      validateWorkflowStep(step);
    } catch (validationError) {
      this.store.upsertStep(runId, step.id, 'failed', { error: validationError.message });
      throw validationError;
    }

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

      const parallelControls = resolveParallelControls(step, list.length, context, this.defaultParallelConcurrency);
      const selectedItems = list.slice(0, parallelControls.fanoutLimit);

      this.store.upsertStep(runId, step.id, 'running', null);
      this.store.logEvent(runId, 'step_started', {
        stepId: step.id,
        type: 'parallel-for',
        count: selectedItems.length,
        totalCount: list.length,
        parallelControls: parallelControls.explain,
      });

      const concurrencyLimit = parallelControls.concurrencyLimit;

      try {
        // Process in batches with concurrency control
        for (let i = 0; i < selectedItems.length; i += concurrencyLimit) {
          const batch = selectedItems.slice(i, i + concurrencyLimit);
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

        this.store.upsertStep(runId, step.id, 'completed', {
          count: selectedItems.length,
          totalCount: list.length,
          parallelControls: parallelControls.explain,
        });
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

module.exports = { WorkflowExecutor, deriveDefaultParallelConcurrency };
