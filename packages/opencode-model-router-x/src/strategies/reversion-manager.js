/**
 * Reversion Manager
 *
 * Manages reversion to prior models after perspective mode ends.
 */

class ReversionManager {
  #modelHistory = [];
  #maxHistorySize = 10;

  /**
   * Push current model to history
   *
   * @param {Object} model - Current model selection
   */
  pushHistory(model) {
    this.#modelHistory.push({
      ...model,
      timestamp: Date.now()
    });

    // Trim history
    if (this.#modelHistory.length > this.#maxHistorySize) {
      this.#modelHistory.shift();
    }

    console.log(`[ReversionManager] Pushed model to history: ${model.model_id}`);
  }

  /**
   * Pop the most recent non-perspective model
   *
   * @returns {Object|null} - Prior model or null
   */
  popPriorModel() {
    // Find most recent model that wasn't a PerspectiveSwitch
    for (let i = this.#modelHistory.length - 1; i >= 0; i--) {
      const historyEntry = this.#modelHistory[i];

      if (historyEntry.strategy !== 'PerspectiveSwitchStrategy' &&
          !historyEntry.meta?.perspective_switch) {
        // Remove and return this entry
        this.#modelHistory.splice(i, 1);

        console.log(`[ReversionManager] Reverting to prior model: ${historyEntry.model_id}`);

        return historyEntry;
      }
    }

    console.log('[ReversionManager] No prior model found for reversion');
    return null;
  }

  /**
   * Check if there is a prior model to revert to
   *
   * @returns {boolean}
   */
  hasPriorModel() {
    return this.#modelHistory.some(entry =>
      entry.strategy !== 'PerspectiveSwitchStrategy' &&
      !entry.meta?.perspective_switch
    );
  }

  /**
   * Get current model history
   *
   * @returns {Array} - Model history
   */
  getHistory() {
    return [...this.#modelHistory];
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.#modelHistory = [];
    console.log('[ReversionManager] History cleared');
  }

  /**
   * Get history statistics
   *
   * @returns {Object}
   */
  getStats() {
    return {
      history_size: this.#modelHistory.length,
      last_model: this.#modelHistory[this.#modelHistory.length - 1]?.model_id || null,
      has_prior: this.hasPriorModel()
    };
  }
}

module.exports = ReversionManager;
