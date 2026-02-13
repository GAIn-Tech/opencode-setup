/**
 * Project Start Strategy
 *
 * Detects when a new session/experiment starts and forces high-power models.
 * Sets semantic foundation for the project - early quality compounds.
 */

const ModelSelectionStrategy = require('./model-selection-strategy');

class ProjectStartStrategy extends ModelSelectionStrategy {
  #taskCount = 0;
  #active = true;
  #highPowerModels = [
    { model_id: 'claude-opus-4.6-thinking-max', provider: 'anthropic' },
    { model_id: 'gpt-5.3-pro', provider: 'openai' }
  ];

  getName() {
    return 'ProjectStartStrategy';
  }

  getPriority() {
    return 100; // Highest priority - project start is critical
  }

  shouldApply(task, context = {}) {
    // Active only during first task of session
    if (!context.projectStartMode) return false;

    if (this.#taskCount < 1 && this.#active) {
      console.log('[ProjectStartStrategy] Project start detected - using high power model');
      return true;
    }

    return false;
  }

  async selectModel(task, context = {}) {
    const taskIndex = this.#taskCount;

    // Select high power model based on task intent
    let selectedModel;
    const intent = task.intent;

    if (['architecture', 'orchestration', 'debugging'].includes(intent)) {
      selectedModel = this.#highPowerModels[0]; // Claude Opus with max thinking
    } else if (['code_generation', 'code_transform'].includes(intent)) {
      selectedModel = this.#highPowerModels[1]; // GPT-5.3 Pro
    } else {
      selectedModel = this.#highPowerModels[0];
    }

    // Mark task as completed after first task
    this.#taskCount++;

    return {
      model_id: selectedModel.model_id,
      provider: selectedModel.provider,
      reasoning_effort: 'max',
      confidence: 1.0,
      strategy: 'ProjectStartStrategy',
      meta: {
        task_index: taskIndex,
        note: 'High power model for project start - sets semantic foundation'
      }
    };
  }

  /**
   * Check if project start mode is still active
   *
   * @returns {boolean}
   */
  isActive() {
    return this.#active && this.#taskCount < 1;
  }

  /**
   * Reset project start (for new session)
   */
  reset() {
    this.#taskCount = 0;
    this.#active = true;
    console.log('[ProjectStartStrategy] Reset for new project');
  }

  /**
   * Deactivate project start strategy
   */
  deactivate() {
    this.#active = false;
    console.log('[ProjectStartStrategy] Deactivated');
  }

  /**
   * Get task count
   *
   * @returns {number}
   */
  getTaskCount() {
    return this.#taskCount;
  }
}

module.exports = ProjectStartStrategy;
