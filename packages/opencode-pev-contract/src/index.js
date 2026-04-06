/**
 * PEV Contract — Planner/Executor/Verifier/Critic interfaces for OpenCode orchestration.
 *
 * This package defines explicit contracts for the four PEV roles:
 * - Planner: decomposes tasks into executable plans
 * - Executor: executes plans and produces results
 * - Verifier: verifies results against plans
 * - Critic: evaluates multiple results and selects the best
 *
 * The contracts are designed to be compatible with existing OpenCode components:
 * - OrchestrationAdvisor → can implement Planner
 * - WorkflowExecutor → can implement Executor
 * - ShowboatWrapper → can implement Verifier
 *
 * @module opencode-pev-contract
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * @enum {string}
 */
const PEVRole = Object.freeze({
  PLANNER: 'planner',
  EXECUTOR: 'executor',
  VERIFIER: 'verifier',
  CRITIC: 'critic'
});

/**
 * @enum {string}
 */
const PEVLifecycleEvent = Object.freeze({
  PLAN_CREATED: 'plan_created',
  PLAN_VALIDATED: 'plan_validated',
  EXECUTION_STARTED: 'execution_started',
  EXECUTION_COMPLETED: 'execution_completed',
  VERIFICATION_STARTED: 'verification_started',
  VERIFICATION_PASSED: 'verification_passed',
  VERIFICATION_FAILED: 'verification_failed',
  CRITIC_EVALUATED: 'critic_evaluated'
});

// ---------------------------------------------------------------------------
// Data Classes
// ---------------------------------------------------------------------------

/**
 * Represents an executable plan produced by a Planner.
 *
 * @typedef {Object} PlanStep
 * @property {string} id - Unique step identifier
 * @property {string} type - Step type (e.g., 'read', 'edit', 'bash')
 * @property {string} description - Human-readable step description
 * @property {Object} [input] - Step-specific input data
 * @property {number} [retries] - Number of retries (default: 3)
 * @property {number} [backoff] - Backoff in ms (default: 1000)
 * @property {string} [pe_role] - PEV role responsible for this step
 */

/**
 * @class
 * @param {Object} options
 * @param {string} options.taskId - Task identifier
 * @param {PlanStep[]} options.steps - Plan steps
 * @param {Object} [options.metadata] - Optional metadata
 */
class Plan {
  constructor({ taskId, steps, metadata = {} }) {
    this.taskId = taskId;
    this.steps = steps;
    this.metadata = metadata;
    this.createdAt = new Date().toISOString();
  }
}

/**
 * Represents an execution result produced by an Executor.
 *
 * @class
 * @param {Object} options
 * @param {string} options.taskId - Task identifier
 * @param {string} options.planId - Plan identifier
 * @param {boolean} options.success - Whether execution succeeded
 * @param {Object} options.outputs - Execution outputs
 * @param {string} [options.error] - Error message if failed
 * @param {Object} [options.metadata] - Optional metadata (tokens used, latency, etc.)
 */
class Result {
  constructor({ taskId, planId, success, outputs, error, metadata = {} }) {
    this.taskId = taskId;
    this.planId = planId;
    this.success = success;
    this.outputs = outputs;
    this.error = error || null;
    this.metadata = metadata;
    this.completedAt = new Date().toISOString();
  }
}

/**
 * Represents a verification outcome produced by a Verifier.
 *
 * @class
 * @param {Object} options
 * @param {string} options.taskId - Task identifier
 * @param {string} options.planId - Plan identifier
 * @param {boolean} options.passed - Whether verification passed
 * @param {string[]} options.methods - Verification methods used (e.g., 'tests', 'static', 'llm')
 * @param {number} options.confidence - Confidence score (0.0 - 1.0)
 * @param {string[]} [options.failures] - Failure descriptions if verification failed
 * @param {Object} [options.details] - Optional verification details
 */
class Verification {
  constructor({ taskId, planId, passed, methods, confidence, failures = [], details = {} }) {
    this.taskId = taskId;
    this.planId = planId;
    this.passed = passed;
    this.methods = methods;
    this.confidence = confidence;
    this.failures = failures;
    this.details = details;
    this.verifiedAt = new Date().toISOString();
  }
}

// ---------------------------------------------------------------------------
// Validation Functions
// ---------------------------------------------------------------------------

/**
 * Validate a Plan object against the contract.
 *
 * @param {Object} plan - Plan object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePlan(plan) {
  const errors = [];

  if (!plan || typeof plan !== 'object') {
    return { valid: false, errors: ['Plan must be an object'] };
  }

  if (!plan.taskId || typeof plan.taskId !== 'string') {
    errors.push('Plan must have a non-empty string taskId');
  }

  if (!Array.isArray(plan.steps)) {
    errors.push('Plan must have a steps array');
  } else if (plan.steps.length === 0) {
    errors.push('Plan must have at least one step');
  } else {
    plan.steps.forEach((step, index) => {
      if (!step.id || typeof step.id !== 'string') {
        errors.push(`Step[${index}] must have a non-empty string id`);
      }
      if (!step.type || typeof step.type !== 'string') {
        errors.push(`Step[${index}] must have a non-empty string type`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a Result object against the contract.
 *
 * @param {Object} result - Result object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateResult(result) {
  const errors = [];

  if (!result || typeof result !== 'object') {
    return { valid: false, errors: ['Result must be an object'] };
  }

  if (!result.taskId || typeof result.taskId !== 'string') {
    errors.push('Result must have a non-empty string taskId');
  }

  if (!result.planId || typeof result.planId !== 'string') {
    errors.push('Result must have a non-empty string planId');
  }

  if (typeof result.success !== 'boolean') {
    errors.push('Result must have a boolean success field');
  }

  if (result.outputs === undefined || result.outputs === null) {
    errors.push('Result must have an outputs field');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a Verification object against the contract.
 *
 * @param {Object} verification - Verification object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateVerification(verification) {
  const errors = [];

  if (!verification || typeof verification !== 'object') {
    return { valid: false, errors: ['Verification must be an object'] };
  }

  if (!verification.taskId || typeof verification.taskId !== 'string') {
    errors.push('Verification must have a non-empty string taskId');
  }

  if (!verification.planId || typeof verification.planId !== 'string') {
    errors.push('Verification must have a non-empty string planId');
  }

  if (typeof verification.passed !== 'boolean') {
    errors.push('Verification must have a boolean passed field');
  }

  if (!Array.isArray(verification.methods)) {
    errors.push('Verification must have a methods array');
  }

  if (typeof verification.confidence !== 'number' || verification.confidence < 0 || verification.confidence > 1) {
    errors.push('Verification confidence must be a number between 0 and 1');
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Abstract-like Role Classes
// ---------------------------------------------------------------------------

/**
 * Planner role — decomposes tasks into executable plans.
 *
 * Existing component that can implement this: OrchestrationAdvisor
 * (packages/opencode-learning-engine/src/orchestration-advisor.js)
 *
 * @abstract
 */
class Planner {
  /**
   * Decompose a task context into an executable plan.
   *
   * @param {Object} taskContext - Task context (task_type, description, files, etc.)
   * @returns {Plan} - Executable plan
   * @abstract
   */
  decompose(taskContext) {
    throw new Error('Planner.decompose() must be implemented by subclass');
  }

  /**
   * Validate a plan against the contract.
   *
   * @param {Plan|Object} plan - Plan to validate
   * @returns {boolean} - Whether the plan is valid
   */
  validate(plan) {
    return validatePlan(plan).valid;
  }
}

/**
 * Executor role — executes plans and produces results.
 *
 * Existing component that can implement this: WorkflowExecutor
 * (packages/opencode-sisyphus-state/src/executor.js)
 *
 * @abstract
 */
class Executor {
  /**
   * Execute a plan and return the result.
   *
   * @param {Plan} plan - Plan to execute
   * @param {Object} context - Execution context
   * @returns {Promise<Result>} - Execution result
   * @abstract
   */
  async execute(plan, context) {
    throw new Error('Executor.execute() must be implemented by subclass');
  }
}

/**
 * Verifier role — verifies results against plans.
 *
 * Existing component that can implement this: ShowboatWrapper
 * (packages/opencode-showboat-wrapper/src/index.js)
 *
 * @abstract
 */
class Verifier {
  /**
   * Verify a result against its plan.
   *
   * @param {Result} result - Result to verify
   * @param {Plan} plan - Original plan
   * @returns {Promise<Verification>} - Verification outcome
   * @abstract
   */
  async verify(result, plan) {
    throw new Error('Verifier.verify() must be implemented by subclass');
  }
}

/**
 * Critic role — evaluates multiple results and selects the best.
 *
 * @abstract
 */
class Critic {
  /**
   * Evaluate multiple results and return the best one.
   *
   * @param {Result[]} results - Results to evaluate
   * @returns {Promise<Result>} - Best result
   * @abstract
   */
  async evaluate(results) {
    throw new Error('Critic.evaluate() must be implemented by subclass');
  }
}

// ---------------------------------------------------------------------------
// PEVContract Orchestrator
// ---------------------------------------------------------------------------

/**
 * PEVContract — Orchestrator that binds PEV roles together.
 *
 * Provides:
 * - Role registration with validation
 * - Lifecycle event emission
 * - Readiness checking
 *
 * Usage:
 *   const contract = new PEVContract();
 *   contract.registerRole(PEVRole.PLANNER, myPlanner);
 *   contract.registerRole(PEVRole.EXECUTOR, myExecutor);
 *   contract.registerRole(PEVRole.VERIFIER, myVerifier);
 *
 *   if (contract.isReady()) {
 *     const plan = contract.planner.decompose(taskContext);
 *     const result = await contract.executor.execute(plan, context);
 *     const verification = await contract.verifier.verify(result, plan);
 *   }
 */
class PEVContract {
  constructor() {
    /** @type {Planner|null} */
    this.planner = null;
    /** @type {Executor|null} */
    this.executor = null;
    /** @type {Verifier|null} */
    this.verifier = null;
    /** @type {Critic|null} */
    this.critic = null;
    /** @type {Function[]} */
    this._eventListeners = [];
  }

  /**
   * Register a PEV role implementation.
   *
   * @param {string} role - One of PEVRole values
   * @param {Planner|Executor|Verifier|Critic} impl - Role implementation
   */
  registerRole(role, impl) {
    switch (role) {
      case PEVRole.PLANNER:
        if (!(impl instanceof Planner)) {
          throw new Error('Planner role must be an instance of Planner');
        }
        this.planner = impl;
        break;
      case PEVRole.EXECUTOR:
        if (!(impl instanceof Executor)) {
          throw new Error('Executor role must be an instance of Executor');
        }
        this.executor = impl;
        break;
      case PEVRole.VERIFIER:
        if (!(impl instanceof Verifier)) {
          throw new Error('Verifier role must be an instance of Verifier');
        }
        this.verifier = impl;
        break;
      case PEVRole.CRITIC:
        if (!(impl instanceof Critic)) {
          throw new Error('Critic role must be an instance of Critic');
        }
        this.critic = impl;
        break;
      default:
        throw new Error(`Invalid PEV role: ${role}. Must be one of: ${Object.values(PEVRole).join(', ')}`);
    }
  }

  /**
   * Check if all required roles (planner, executor, verifier) are registered.
   *
   * @returns {boolean}
   */
  isReady() {
    return this.planner !== null && this.executor !== null && this.verifier !== null;
  }

  /**
   * Register an event listener for PEV lifecycle events.
   *
   * @param {Function} listener - Callback receiving PEVLifecycleEvent and payload
   */
  onEvent(listener) {
    this._eventListeners.push(listener);
  }

  /**
   * Emit a lifecycle event to all registered listeners.
   *
   * @param {string} event - One of PEVLifecycleEvent values
   * @param {Object} [payload] - Event payload
   * @private
   */
  _emit(event, payload = {}) {
    const eventObj = { event, payload, timestamp: new Date().toISOString() };
    for (const listener of this._eventListeners) {
      try {
        listener(eventObj);
      } catch (e) {
        // fail-open: event listener errors should not break orchestration
        console.error('[PEVContract] Event listener error:', e);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  PEVContract,
  Planner,
  Executor,
  Verifier,
  Critic,
  Plan,
  Result,
  Verification,
  validatePlan,
  validateResult,
  validateVerification,
  PEVRole,
  PEVLifecycleEvent
};
