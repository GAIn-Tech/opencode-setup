/**
 * Orchestrator
 *
 * Orchestrates model selection across multiple strategies.
 * Evaluates strategies in priority order and returns best model selection.
 */

class Orchestrator {
  #strategies = [];

  /**
   * Initialize orchestrator with strategies
   *
   * @param {Array<ModelSelectionStrategy>} strategies - Model selection strategies
   */
  constructor(strategies = []) {
    this.#strategies = strategies.sort((a, b) => b.getPriority() - a.getPriority());
  }

  /**
   * Add a strategy to the orchestrator
   *
   * @param {ModelSelectionStrategy} strategy - Strategy to add
   */
  addStrategy(strategy) {
    this.#strategies.push(strategy);
    this.#strategies.sort((a, b) => b.getPriority() - a.getPriority());
  }

  /**
   * Select best model for the task
   *
   * @param {Object} task - Task classification
   * @param {Object} context - Global context
   * @returns {Promise<Object>} - Model selection result
   */
  async selectModel(task, context = {}) {
    for (const strategy of this.#strategies) {
      if (strategy.shouldApply(task, context)) {
        const selection = await strategy.selectModel(task, context);

        if (selection) {
          console.log(`[Orchestrator] Selected model from ${strategy.getName()}: ${selection.model_id}`);

          return {
            ...selection,
            strategy: strategy.getName()
          };
        }
      }
    }

    throw new Error('No applicable strategy found for task');
  }

  /**
   * Get all registered strategies
   *
   * @returns {Array<ModelSelectionStrategy>} - Registered strategies
   */
  getStrategies() {
    return this.#strategies;
  }

  /**
   * Reset fallback layers across all strategies
   */
  resetFallbackLayers() {
    for (const strategy of this.#strategies) {
      if (strategy.resetLayer) {
        strategy.resetLayer();
      }
    }
  }

  /**
   * Get current strategy order
   *
   * @returns {Array<Object>} - Strategy names and priorities
   */
  getStrategyOrder() {
    return this.#strategies.map(s => ({
      name: s.getName(),
      priority: s.getPriority()
    }));
  }
}

module.exports = Orchestrator;
