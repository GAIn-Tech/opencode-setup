/**
 * Orchestrator
 *
 * Orchestrates model selection across multiple strategies.
 * Evaluates strategies in priority order and returns best model selection.
 */

class Orchestrator {
  #strategies = [];
  #sessionModelRegistry = null;
  #userPreference = null;
  #preferredModelId = null;
  #preferenceLoadPromise = null;

  /**
   * Initialize orchestrator with strategies
   * 
   * @param {Array<ModelSelectionStrategy>} strategies - Model selection strategies
   * @param {Object} sessionModelRegistry - Session model registry for sticky sessions
   * @param {Object} userPreference - User model preference persistence service
   */
  constructor(strategies = [], sessionModelRegistry = null, userPreference = null) {
    this.#strategies = strategies.sort((a, b) => b.getPriority() - a.getPriority());
    this.#sessionModelRegistry = sessionModelRegistry;
    this.#userPreference = userPreference;
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
    // Check for sticky session model first
    const sessionId = context?.sessionId || task?.sessionId;
    if (sessionId && this.#sessionModelRegistry) {
      try {
        const stickyModelId = this.#sessionModelRegistry.get(sessionId);
        if (stickyModelId) {
          // Return sticky model with high confidence
          console.log(`[Orchestrator] Using sticky session model: ${stickyModelId}`);
          return {
            model_id: stickyModelId,
            confidence: 1.0,
            strategy: 'sticky:session',
            reason: 'sticky:session'
          };
        }
      } catch (error) {
        console.error('[Orchestrator] Failed to check sticky session:', error?.message || error);
        // Continue with normal selection on error
      }
    }

    const preferredModelId = await this.#resolveUserPreferenceModelId(task, context);
    if (preferredModelId) {
      return {
        model_id: preferredModelId,
        confidence: 0.95,
        strategy: 'sticky:user-preference',
        reason: 'sticky:user-preference'
      };
    }

    for (const strategy of this.#strategies) {
      const strategyName = this.#getSafeStrategyName(strategy);
      let shouldApply = false;

      try {
        shouldApply = Boolean(strategy.shouldApply(task, context));
      } catch (error) {
        console.error(`[Orchestrator] Strategy ${strategyName} shouldApply() failed:`, error?.message || error);
        continue;
      }

      if (shouldApply) {
        let selection = null;

        try {
          selection = await strategy.selectModel(task, context);
        } catch (error) {
          console.error(`[Orchestrator] Strategy ${strategyName} selectModel() failed:`, error?.message || error);
          continue;
        }

        if (selection) {
          console.log(`[Orchestrator] Selected model from ${strategyName}: ${selection.model_id}`);

          // Store selected model in session registry for sticky behavior
          if (sessionId && this.#sessionModelRegistry && selection.model_id) {
            try {
              this.#sessionModelRegistry.set(sessionId, selection.model_id);
              console.log(`[Orchestrator] Stored model ${selection.model_id} for session ${sessionId}`);
            } catch (error) {
              console.error('[Orchestrator] Failed to store session model:', error?.message || error);
            }
          }

          this.#persistUserPreference(selection.model_id);

          return {
            ...selection,
            strategy: strategyName
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
      name: this.#getSafeStrategyName(s),
      priority: s.getPriority()
    }));
  }

  #getSafeStrategyName(strategy) {
    try {
      return strategy.getName();
    } catch {
      return strategy?.constructor?.name || 'UnknownStrategy';
    }
  }

  async #resolveUserPreferenceModelId(task, context) {
    if (!this.#userPreference || typeof this.#userPreference.load !== 'function') {
      return null;
    }

    if (typeof this.#preferredModelId === 'string' && this.#preferredModelId.trim().length > 0) {
      return this.#validatePreferredModelId(this.#preferredModelId, task, context);
    }

    if (!this.#preferenceLoadPromise) {
      this.#preferenceLoadPromise = Promise
        .resolve(this.#userPreference.load())
        .then((modelId) => {
          this.#preferredModelId = typeof modelId === 'string' ? modelId.trim() : null;
          return this.#preferredModelId;
        })
        .catch(() => {
          this.#preferredModelId = null;
          return null;
        });
    }

    const preferredModelId = await this.#preferenceLoadPromise;
    return this.#validatePreferredModelId(preferredModelId, task, context);
  }

  #validatePreferredModelId(modelId, task, context) {
    const normalizedModelId = typeof modelId === 'string' ? modelId.trim() : '';
    if (!normalizedModelId) {
      return null;
    }

    const availableModelIds = context?.availableModelIds || context?.models || task?.availableModelIds || null;
    if (Array.isArray(availableModelIds) && availableModelIds.length > 0 && !availableModelIds.includes(normalizedModelId)) {
      return null;
    }

    if (typeof context?.isModelAvailable === 'function') {
      try {
        if (!context.isModelAvailable(normalizedModelId)) {
          return null;
        }
      } catch {
        return null;
      }
    }

    return normalizedModelId;
  }

  #persistUserPreference(modelId) {
    const normalizedModelId = typeof modelId === 'string' ? modelId.trim() : '';
    if (!normalizedModelId || !this.#userPreference || typeof this.#userPreference.save !== 'function') {
      return;
    }

    if (this.#preferredModelId === normalizedModelId) {
      return;
    }

    this.#preferredModelId = normalizedModelId;
    Promise.resolve(this.#userPreference.save(normalizedModelId)).catch((error) => {
      console.error('[Orchestrator] Failed to persist user preference:', error?.message || error);
    });
  }
}

module.exports = Orchestrator;
