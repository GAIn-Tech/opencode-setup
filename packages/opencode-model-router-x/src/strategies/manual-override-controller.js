/**
 * Manual Override Controller
 *
 * Allows user to manually force specific model selections.
 * Overrides all automatic strategy decisions.
 */

const ModelSelectionStrategy = require('./model-selection-strategy');

class ManualOverrideController extends ModelSelectionStrategy {
  #overrideModel = null;
  #overrideDuration = null;
  #overrideStartTime = null;

  constructor() {
    super();
  }

  getName() {
    return 'ManualOverrideController';
  }

  getPriority() {
    return 999; // Absolute highest priority - manual overrides always apply
  }

  shouldApply(task, context = {}) {
    if (!context.manualOverride || !this.#overrideModel) {
      return false;
    }

    // Check if override has expired
    if (this.#overrideDuration && this.#overrideStartTime) {
      const elapsed = Date.now() - this.#overrideStartTime;
      if (elapsed > this.#overrideDuration) {
        console.log('[ManualOverrideController] Override expired - clearing');
        this.clearOverride();
        return false;
      }
    }

    return true;
  }

  async selectModel(task, context = {}) {
    console.log(`[ManualOverrideController] Using manually overriden model: ${this.#overrideModel.model_id}`);

    return {
      ...this.#overrideModel,
      strategy: 'ManualOverrideController',
      confidence: 1.0,
      meta: {
        manual_override: true,
        ...(this.#overrideDuration && { remaining_ms: this.#overrideDuration - (Date.now() - this.#overrideStartTime) })
      }
    };
  }

  /**
   * Set manual override
   *
   * @param {string} model_id - Model to override to
   * @param {string} provider - Provider
   * @param {number} duration - Override duration in milliseconds (optional)
   */
  setOverride(model_id, provider, duration = null) {
    this.#overrideModel = { model_id, provider };
    this.#overrideDuration = duration;
    this.#overrideStartTime = Date.now();

    console.log(`[ManualOverrideController] Manual override set to ${model_id} (${provider})` +
                (duration ? ` for ${duration}ms` : ' indefinitely'));

    return this.#overrideModel;
  }

  /**
   * Clear manual override
   */
  clearOverride() {
    const previous = this.#overrideModel;
    this.#overrideModel = null;
    this.#overrideDuration = null;
    this.#overrideStartTime = null;

    if (previous) {
      console.log(`[ManualOverrideController] Manual override cleared (was ${previous.model_id})`);
    }
  }

  /**
   * Get current override
   *
   * @returns {Object|null} - Current override or null
   */
  getOverride() {
    return this.#overrideModel ? {
      ...this.#overrideModel,
      remaining_ms: this.#overrideDuration ? Math.max(0, this.#overrideDuration - (Date.now() - this.#overrideStartTime)) : null
    } : null;
  }

  /**
   * Check if override is active
   *
   * @returns {boolean}
   */
  hasOverride() {
    if (!this.#overrideModel) return false;

    // Check if expired
    if (this.#overrideDuration && this.#overrideStartTime) {
      const elapsed = Date.now() - this.#overrideStartTime;
      return elapsed < this.#overrideDuration;
    }

    return true;
  }
}

module.exports = ManualOverrideController;
