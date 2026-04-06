/**
 * Critic Verifier — Uses trained critic model or LLM-as-judge to score results.
 *
 * Implements the Verifier interface from opencode-pev-contract.
 * Falls back to LLM-as-judge if critic model is unavailable.
 *
 * @module opencode-critic-verifier
 */

import { Verifier, Verification } from '../../opencode-pev-contract/src/index.js';

/**
 * CriticVerifier — Scores results using critic model or LLM-as-judge.
 *
 * @extends {Verifier}
 */
class CriticVerifier extends Verifier {
  /**
   * @param {object} [options]
   * @param {object} [options.criticModel] - Trained critic model (optional)
   * @param {function} [options.llmJudge] - LLM-as-judge function (fallback)
   */
  constructor(options = {}) {
    super();
    this.criticModel = options.criticModel || null;
    this.llmJudge = options.llmJudge || this._defaultLLMJudge.bind(this);
  }

  /**
   * Verify a result using critic model or LLM-as-judge.
   *
   * @param {object} result - Result from Executor
   * @param {object} plan - Original Plan
   * @returns {Promise<Verification>}
   */
  async verify(result, plan) {
    let confidence;
    let method;
    const failures = [];

    try {
      if (this.criticModel && typeof this.criticModel.score === 'function') {
        // Use trained critic model
        confidence = await this.criticModel.score(result, plan);
        method = 'critic_model';
      } else {
        // Fallback to LLM-as-judge
        confidence = await this.llmJudge(result, plan);
        method = 'llm_judge';
      }
    } catch (err) {
      failures.push(`Verification failed: ${err.message}`);
      confidence = 0;
      method = 'failed';
    }

    if (!result.success) {
      failures.push(result.error || 'Execution failed');
    }

    return new Verification({
      taskId: result.taskId,
      planId: result.planId,
      passed: result.success && confidence > 0.5,
      methods: [method],
      confidence: Math.max(0, Math.min(1, confidence)),
      failures,
      details: {
        resultSuccess: result.success,
        verificationMethod: method,
        hasCriticModel: !!this.criticModel
      }
    });
  }

  /**
   * Default LLM-as-judge implementation.
   * Uses structural heuristics when no LLM is available.
   *
   * @param {object} result
   * @param {object} plan
   * @returns {Promise<number>} Confidence score (0-1)
   * @private
   */
  async _defaultLLMJudge(result, plan) {
    let confidence = 0.5; // Base

    // Success boosts confidence
    if (result.success) confidence += 0.3;

    // Outputs present boosts confidence
    if (result.outputs && Object.keys(result.outputs).length > 0) {
      confidence += 0.1;
    }

    // Error reduces confidence
    if (result.error) confidence -= 0.3;

    // Metadata with tokens used suggests quality tracking
    if (result.metadata?.tokensUsed) confidence += 0.05;

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Set critic model.
   *
   * @param {object} model - Model with score(result, plan) method
   */
  setCriticModel(model) {
    this.criticModel = model;
  }

  /**
   * Set LLM judge function.
   *
   * @param {function} fn - Async function(result, plan) => confidence
   */
  setLLMJudge(fn) {
    this.llmJudge = fn;
  }
}

export { CriticVerifier };
export default CriticVerifier;
