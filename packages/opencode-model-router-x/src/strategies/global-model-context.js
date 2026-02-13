/**
 * Global Model Context
 *
 * Broadcasts model choices to all agents and subtasks for global scope.
 */

class GlobalModelContext {
  #modelContext = new Map(); // session_id -> model selection
  #propagationCallbacks = new Map(); // session_id -> callback function

  /**
   * Set model context for a session
   *
   * @param {string} sessionId - Session identifier
   * @param {Object} modelSelection - Model selection object
   * @param {string} modelSelection.provider - Provider name
   * @param {string} modelSelection.model_id - Model identifier
   * @param {Object} modelSelection.meta - Additional metadata
   */
  setModelContext(sessionId, modelSelection) {
    this.#modelContext.set(sessionId, {
      ...modelSelection,
      timestamp: Date.now()
    });

    console.log(`[GlobalModelContext] Set model for session ${sessionId}: ${modelSelection.provider}/${modelSelection.model_id}`);

    // Trigger propagation callback if registered
    if (this.#propagationCallbacks.has(sessionId)) {
      const callback = this.#propagationCallbacks.get(sessionId);
      callback(modelSelection);
    }
  }

  /**
   * Get model context for a session
   *
   * @param {string} sessionId - Session identifier
   * @returns {Object|null} - Model selection or null
   */
  getModelContext(sessionId) {
    return this.#modelContext.get(sessionId) || null;
  }

  /**
   * Clear model context for a session
   *
   * @param {string} sessionId - Session identifier
   */
  clearModelContext(sessionId) {
    this.#modelContext.delete(sessionId);
    this.#propagationCallbacks.delete(sessionId);
    console.log(`[GlobalModelContext] Cleared model for session ${sessionId}`);
  }

  /**
   * Register a propagation callback for model changes
   *
   * @param {string} sessionId - Session identifier
   * @param {Function} callback - Callback function(modelSelection)
   */
  onModelChange(sessionId, callback) {
    this.#propagationCallbacks.set(sessionId, callback);
  }

  /**
   * Get all active contexts
   *
   * @returns {Object} - Map of session IDs to model contexts
   */
  getAllContexts() {
    const contexts = {};
    for (const [sessionId, context] of this.#modelContext.entries()) {
      contexts[sessionId] = context;
    }
    return contexts;
  }

  /**
   * Get context statistics
   *
   * @returns {Object}
   */
  getStats() {
    return {
      active_sessions: this.#modelContext.size,
      contexts: this.getAllContexts()
    };
  }

  /**
   * Broadcast model change to all active contexts
   *
   * @param {Object} modelSelection - New model selection
   * @returns {number} - Number of sessions updated
   */
  broadcast(modelSelection) {
    let updated = 0;

    for (const [sessionId] of this.#modelContext.entries()) {
      this.setModelContext(sessionId, modelSelection);
      updated++;
    }

    console.log(`[GlobalModelContext] Broadcasted model to ${updated} sessions`);
    return updated;
  }

  /**
   * Propagate model context to subtask
   *
   * @param {string} parentSessionId - Parent session ID
   * @param {string} subTaskSessionId - Subtask session ID
   * @returns {Object|null} - Inherited model context or null
   */
  propagateToSubTask(parentSessionId, subTaskSessionId) {
    const parentContext = this.getModelContext(parentSessionId);

    if (parentContext) {
      this.setModelContext(subTaskSessionId, {
        ...parentContext,
        parent_session: parentSessionId,
        propagated: true
      });

      console.log(`[GlobalModelContext] Propagated model from ${parentSessionId} to ${subTaskSessionId}`);
      return parentContext;
    }

    console.log(`[GlobalModelContext] No parent context to propagate for ${parentSessionId}`);
    return null;
  }
}

module.exports = GlobalModelContext;
