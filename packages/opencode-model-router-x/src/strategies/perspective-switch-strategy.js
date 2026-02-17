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

  #PERSPECTIVE_MODELS = [
    'anthropic/claude-opus-4-6',
    'openai/gpt-5.3-codex-spark',
    'opencode/kimi-k2.5-free'
  ];

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

    const currentProvider = context.currentModel?.provider || 'openai';
    const currentModelId = context.currentModel?.model_id;
    const modelId = this.#getPerspectiveModel(currentModelId);

    this.#activePerspective = true;

    console.log(`[PerspectiveSwitchStrategy] Switching to ${modelId} for new perspective`);

    let provider = 'openai';
    if (modelId.startsWith('anthropic/')) provider = 'anthropic';
    else if (modelId.startsWith('google/')) provider = 'google';
    else if (modelId.startsWith('opencode/')) provider = 'opencode';
    else if (modelId.startsWith('nvidia/')) provider = 'nvidia';

    return {
      model_id: modelId,
      provider,
      reasoning_effort: 'high',
      confidence: 0.95,
      strategy: 'PerspectiveSwitchStrategy',
      meta: {
        perspective_switch: true,
        prior_provider: currentProvider,
        prior_model: this.#priorModel?.model_id,
        reason: 'Stuck bug detected - switching to alternate runtime model'
      }
    };
  }

  /**
   * Pick a perspective model different from the current one.
   *
   * @param {string|undefined} currentModelId - Current model ID
   * @returns {string}
   */
  #getPerspectiveModel(currentModelId) {
    const alternative = this.#PERSPECTIVE_MODELS.find((modelId) => modelId !== currentModelId);
    return alternative || this.#PERSPECTIVE_MODELS[0];
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
