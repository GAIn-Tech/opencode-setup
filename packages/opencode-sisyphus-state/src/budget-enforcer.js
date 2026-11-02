const { EventEmitter } = require('events');

/**
 * Enforces budget limits on agent tasks
 * Tracks step count, token count, and elapsed time per task
 * Emits BUDGET_EXHAUSTED event when limits are hit
 */
class BudgetEnforcer extends EventEmitter {
  constructor(defaults = {}) {
    super();
    this.defaults = {
      maxSteps: defaults.maxSteps || 50,
      maxTokens: defaults.maxTokens || 100_000,
      maxTimeMs: defaults.maxTimeMs || 300_000
    };

    this.taskBudgets = new Map();
    this.taskState = new Map();
  }

  /**
   * Set custom budget for a specific task
   */
  setTaskBudget(taskId, budget) {
    this.taskBudgets.set(taskId, {
      maxSteps: budget.maxSteps,
      maxTokens: budget.maxTokens,
      maxTimeMs: budget.maxTimeMs
    });
  }

  /**
   * Track a step execution for a task
   */
  trackStep(taskId) {
    const state = this._getState(taskId);
    state.steps += 1;
  }

  /**
   * Track token usage for a task
   */
  trackTokens(taskId, tokens) {
    const state = this._getState(taskId);
    state.tokens += tokens;
  }

  /**
   * Track task start time
   */
  trackStart(taskId, startTime = Date.now()) {
    const state = this._getState(taskId);
    state.startTime = startTime;
  }

  /**
   * Check if task is within budget
   * Returns { allowed: boolean, reason: string | null }
   */
  checkBudget(taskId, context = {}) {
    const task = context.task || {};

    if (this._isSystemTask(task)) {
      return { allowed: true, reason: null };
    }

    const state = this._getState(taskId);
    const budget = this._getBudget(taskId);
    const now = context.now || Date.now();

    if (state.steps >= budget.maxSteps) {
      this._emitExhausted(taskId, 'step', budget.maxSteps, state.steps);
      return { allowed: false, reason: `Exceeded step limit (${budget.maxSteps})` };
    }

    if (state.tokens >= budget.maxTokens) {
      this._emitExhausted(taskId, 'token', budget.maxTokens, state.tokens);
      return { allowed: false, reason: `Exceeded token limit (${budget.maxTokens})` };
    }

    if (state.startTime) {
      const elapsed = now - state.startTime;
      if (elapsed >= budget.maxTimeMs) {
        this._emitExhausted(taskId, 'time', budget.maxTimeMs, elapsed);
        return { allowed: false, reason: `Exceeded time limit (${budget.maxTimeMs}ms)` };
      }
    }

    return { allowed: true, reason: null };
  }

  /**
   * Reset budget tracking for a task
   */
  resetBudget(taskId) {
    this.taskState.delete(taskId);
    this.taskBudgets.delete(taskId);
  }

  /**
   * Get or create state for a task
   */
  _getState(taskId) {
    if (!this.taskState.has(taskId)) {
      this.taskState.set(taskId, {
        steps: 0,
        tokens: 0,
        startTime: null
      });
    }
    return this.taskState.get(taskId);
  }

  /**
   * Get budget for a task (custom or default)
   */
  _getBudget(taskId) {
    const custom = this.taskBudgets.get(taskId);
    return {
      maxSteps: custom?.maxSteps ?? this.defaults.maxSteps,
      maxTokens: custom?.maxTokens ?? this.defaults.maxTokens,
      maxTimeMs: custom?.maxTimeMs ?? this.defaults.maxTimeMs
    };
  }

  /**
   * Check if task is a system task (exempt from limits)
   */
  _isSystemTask(task) {
    return task.type === 'health_check' ||
           task.type === 'system' ||
           task.isSystem === true;
  }

  /**
   * Emit BUDGET_EXHAUSTED event
   */
  _emitExhausted(taskId, type, limit, actual) {
    this.emit('BUDGET_EXHAUSTED', {
      taskId,
      reason: `Exceeded ${type} limit`,
      limit,
      actual
    });
  }
}

module.exports = { BudgetEnforcer };
