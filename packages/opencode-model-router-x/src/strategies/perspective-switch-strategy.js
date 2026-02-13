/**
 * Perspective Switch Strategy
 *
 * When stuck on a bug, switches to most-different provider for new perspective.
 * Returns to original provider after perspective attempt.
 */

const ModelSelectionStrategy = require('./model-selection-strategy');

class PerspectiveSwitchStrategy extends ModelSelectionStrategy {
  #stuckBugDetector = null;
  #priorModel = null;
  #activePerspective = false;

  /**
   * Provider diversity matrix (most different providers)
   */
  #DIVERSITY_MATRIX = {
    anthropic: { most_different: ['gemini', 'openai'] },
    openai: { most_different: ['gemini', 'anthropic'] },
    gemini: { most_different: ['anthropic', 'openai'] },
    antigravity: { most_different: ['anthropic', 'openai'] },
    groq: { most_different: ['cerebras', 'nvidia', 'anthropic'] },
    cerebras: { most_different: ['groq', 'nvidia', 'anthropic'] },
    nvidia: { most_different: ['groq', 'cerebras', 'gemini'] }
  };

  /**
   * High-power models for perspective switch
   */
  #PERSPECTIVE_MODELS = {
    anthropic: 'claude-opus-4.6-thinking-max',
    openai: 'gpt-5.3-pro',
    gemini: 'gemini-3-pro-thinking-high'
  };

  constructor(stuckBugDetector) {
    super();
    this.#stuckBugDetector = stuckBugDetector;
  }

  getName() {
    return 'PerspectiveSwitchStrategy';
  }

  getPriority() {
    return 90; // Very high priority - stuck bug is critical
  }

  shouldApply(task, context = {}) {
    // Only apply when stuck on a bug
    if (!context.stuckBugDetected) {
      return false;
    }

    // Only apply if bug detector confirms stuck
    if (!this.#stuckBugDetector.isStuck()) {
      return false;
    }

    console.log('[PerspectiveSwitchStrategy] Stuck bug detected - switching models for perspective');

    return true;
  }

  async selectModel(task, context = {}) {
    // Store prior model for reversion
    if (!this.#priorModel && context.currentModel) {
      this.#priorModel = context.currentModel;
      console.log(`[PerspectiveSwitchStrategy] Stored prior model: ${this.#priorModel.model_id}`);
    }

    // Get alternative provider (most different)
    const currentProvider = context.currentModel?.provider || 'anthropic';
    const alternativeProvider = this.#getMostDifferentProvider(currentProvider);

    // Select high-power model from provider
    const modelId = this.#PERSPECTIVE_MODELS[alternativeProvider] ||
                    this.#PERSPECTIVE_MODELS['anthropic'];

    this.#activePerspective = true;

    console.log(`[PerspectiveSwitchStrategy] Switching to ${alternativeProvider}:${modelId} for new perspective`);

    return {
      model_id: modelId,
      provider: alternativeProvider,
      reasoning_effort: alternativeProvider === 'anthropic' ? 'max' : 'high',
      confidence: 0.95,
      strategy: 'PerspectiveSwitchStrategy',
      meta: {
        perspective_switch: true,
        prior_provider: currentProvider,
        prior_model: this.#priorModel?.model_id,
        reason: 'Stuck bug detected - switching to most-different provider'
      }
    };
  }

  /**
   * Get the most different provider from current provider
   *
   * @param {string} currentProvider - Current provider
   * @returns {string} - Most different provider
   */
  #getMostDifferentProvider(currentProvider) {
    const diversityInfo = this.#DIVERSITY_MATRIX[currentProvider];
    const alternatives = diversityInfo?.most_different || ['openai'];

    // Return first most-different provider
    return alternatives[0];
  }

  /**
   * Check if currently using perspective model
   *
   * @returns {boolean}
   */
  isPerspectiveActive() {
    return this.#activePerspective;
  }

  /**
   * Get prior model for reversion
   *
   * @returns {Object|null} - Prior model or null
   */
  getPriorModel() {
    return this.#priorModel;
  }

  /**
   * Clear perspective (for reversion)
   */
  clearPerspective() {
    const prior = this.#priorModel;
    this.#priorModel = null;
    this.#activePerspective = false;

    if (prior) {
      console.log(`[PerspectiveSwitchStrategy] Perspective cleared - prior model was ${prior.model_id}`);
    }

    return prior;
  }
}

module.exports = PerspectiveSwitchStrategy;
