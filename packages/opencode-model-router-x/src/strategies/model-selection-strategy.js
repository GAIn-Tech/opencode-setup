/**
 * Base Model Selection Strategy
 *
 * Abstract base class for all model selection strategies.
 * The Strategy Pattern allows dynamic strategy selection.
 */

class ModelSelectionStrategy {
  /**
   * Select a model for the given task
   *
   * @param {Object} task - Task classification with intent and signals
   * @param {Object} context - Context including global model overrides, prior models, etc.
   * @returns {Promise<Object>} - Model selection result
   */
  async selectModel(task, context = {}) {
    throw new Error('selectModel must be implemented by subclass');
  }

  /**
   * Get strategy priority relative to other strategies
   * Higher priority strategies are evaluated first
   *
   * @returns {number} - Priority value (higher = higher priority)
   */
  getPriority() {
    return 0;
  }

  /**
   * Check if this strategy should be applied to the task
   *
   * @param {Object} task - Task classification
   * @param {Object} context - Context for strategy decision
   * @returns {boolean} - Should this strategy be applied?
   */
  shouldApply(task, context = {}) {
    return true;
  }

  /**
   * Get strategy name for logging/debugging
   *
   * @returns {string} - Strategy name
   */
  getName() {
    return this.constructor.name;
  }

  /**
   * Get alternative model selections if primary fails
   *
   * @param {Object} task - Task classification
   * @param {Object} context - Context
   * @returns {Promise<Array>} - Alternative model selections
   */
  async getAlternatives(task, context = {}) {
    return [];
  }
}

module.exports = ModelSelectionStrategy;
