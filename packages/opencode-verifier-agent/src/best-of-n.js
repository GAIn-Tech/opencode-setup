/**
 * Best-of-N Selector — Runs executor N times, uses verifier to score, returns best.
 *
 * Implements the Critic interface from opencode-pev-contract.
 *
 * Trigger conditions:
 * - task complexity >= 'complex'
 * - OR anti_pattern risk_score > threshold
 * - OR user explicitly requests
 *
 * @module opencode-best-of-n
 */

import { Critic } from '../../opencode-pev-contract/src/index.js';

/**
 * Default Best-of-N policy.
 */
const DEFAULT_BEST_OF_N_POLICY = Object.freeze({
  n: 3,
  timeout_ms: 300000,
  trigger_complexity: ['complex', 'extreme'],
  trigger_risk_score: 20,
  temperature_variance: 0.3,
  seed_variance: true
});

/**
 * BestOfNSelector — Implements PEV Critic interface.
 *
 * @extends {Critic}
 */
class BestOfNSelector extends Critic {
  /**
   * @param {object} options
   * @param {object} options.executor - Executor instance to run multiple times
   * @param {object} options.verifier - Verifier instance to score results
   * @param {object} [options.policy] - Policy overrides
   */
  constructor(options) {
    super();
    if (!options.executor) throw new Error('BestOfNSelector requires an executor');
    if (!options.verifier) throw new Error('BestOfNSelector requires a verifier');

    this.executor = options.executor;
    this.verifier = options.verifier;
    this.policy = { ...DEFAULT_BEST_OF_N_POLICY, ...(options.policy || {}) };
  }

  /**
   * Evaluate multiple results and return the best one.
   *
   * @param {object[]} results - Results to evaluate
   * @returns {Promise<object>} Best result
   */
  async evaluate(results) {
    if (!results || results.length === 0) {
      throw new Error('BestOfNSelector.evaluate() requires at least one result');
    }

    // Score each result using verifier
    const scored = [];
    for (const result of results) {
      // We need the plan to verify — if not available, use success as proxy
      const score = result.success ? 1 : 0;
      scored.push({ result, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored[0].result;
  }

  /**
   * Run executor N times and return best result.
   *
   * @param {object} plan - Plan to execute
   * @param {object} context - Execution context
   * @param {object} [options] - Override options
   * @returns {Promise<{bestResult: object, allResults: object[], scores: number[]}>}
   */
  async runBestOfN(plan, context, options = {}) {
    const n = options.n || this.policy.n;
    const results = [];

    for (let i = 0; i < n; i++) {
      try {
        // Vary temperature/seed for diversity
        const variedContext = this._varyContext(context, i);
        const result = await this.executor.execute(plan, variedContext);
        results.push(result);
      } catch (err) {
        results.push({
          taskId: plan.taskId,
          planId: plan.taskId,
          success: false,
          outputs: {},
          error: err.message,
          metadata: { attempt: i + 1 }
        });
      }
    }

    // Score each result
    const scores = [];
    for (const result of results) {
      try {
        const verification = await this.verifier.verify(result, plan);
        scores.push(verification.confidence);
      } catch {
        scores.push(result.success ? 0.5 : 0);
      }
    }

    // Find best
    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] > bestScore) {
        bestScore = scores[i];
        bestIdx = i;
      }
    }

    return {
      bestResult: results[bestIdx],
      allResults: results,
      scores,
      bestScore,
      attempts: n
    };
  }

  /**
   * Check if Best-of-N should be triggered for a task.
   *
   * @param {object} taskContext - Task context
   * @returns {boolean}
   */
  shouldTrigger(taskContext) {
    const { complexity, risk_score, explicit_request } = taskContext;

    if (explicit_request) return true;
    if (this.policy.trigger_complexity.includes(complexity)) return true;
    if (risk_score > this.policy.trigger_risk_score) return true;

    return false;
  }

  /**
   * Vary context for diversity across attempts.
   * @private
   */
  _varyContext(context, attemptIndex) {
    if (!this.policy.seed_variance) return context;

    return {
      ...context,
      _best_of_n_attempt: attemptIndex + 1,
      _temperature_offset: (attemptIndex / this.policy.n) * this.policy.temperature_variance
    };
  }

  /**
   * Update policy.
   * @param {object} overrides
   */
  setPolicy(overrides) {
    this.policy = { ...this.policy, ...overrides };
  }

  /**
   * Get current policy.
   * @returns {object}
   */
  getPolicy() {
    return { ...this.policy };
  }
}

export { BestOfNSelector, DEFAULT_BEST_OF_N_POLICY };
export default BestOfNSelector;
