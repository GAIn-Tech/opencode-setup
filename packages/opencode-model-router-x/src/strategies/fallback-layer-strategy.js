/**
 * 6-Layer Fallback Strategy
 *
 * Default strategy for model selection using a 6-layer fallback structure.
 * Each layer corresponds to a provider, with model selection based on task intent.
 */

class FallbackLayerStrategy extends ModelSelectionStrategy {
  /**
   * 6-layer provider structure
   */
  #LAYERS = [
    'groq',        // Layer 1: Ultra-fast, ultra-low cost
    'cerebras',    // Layer 2: Very fast, low cost
    'nvidia',      // Layer 3: Fast, moderate cost
    'antigravity', // Layer 4: Balanced accuracy/speed (Gemini variants)
    'anthropic',   // Layer 5: High quality (Claude Sonnet)
    'openai'       // Layer 6: Fallback-of-last-resort
  ];

  /**
   * Model catalog by provider and intent
   */
  #MODEL_CATALOG = {
    groq: {
      simple_read: 'llama-3.1-70b',
      format_transform: 'llama-3.1-70b',
      documentation: 'llama-3.1-70b',
      code_generation: 'llama-3.1-70b',
      code_transform: 'llama-3.1-405b',
      debugging: 'llama-3.1-70b',
      architecture: 'llama-3.1-405b',
      large_context: 'llama-3.1-405b',
      multimodal: 'llama-3.1-70b',
      orchestration: 'llama-3.1-405b'
    },
    cerebras: {
      simple_read: 'llama-3.1-70b',
      format_transform: 'llama-3.1-70b',
      documentation: 'llama-3.1-70b',
      code_generation: 'llama-3.1-70b',
      code_transform: 'llama-3.1-405b',
      debugging: 'llama-3.1-70b',
      architecture: 'llama-3.1-405b',
      large_context: 'llama-3.1-405b',
      multimodal: 'llama-3.1-70b',
      orchestration: 'llama-3.1-405b'
    },
    nvidia: {
      simple_read: 'llama-3.1-70b',
      format_transform: 'llama-3.1-70b',
      documentation: 'llama-3.1-70b',
      code_generation: 'llama-3.1-405b',
      code_transform: 'llama-3.1-405b',
      debugging: 'llama-3.1-405b',
      architecture: 'llama-3.1-405b',
      large_context: 'llama-3.1-405b',
      multimodal: 'llama-3.1-70b',
      orchestration: 'llama-3.1-405b'
    },
    antigravity: {
      simple_read: 'gemini-3-flash',
      format_transform: 'gemini-3-flash',
      documentation: 'gemini-3-flash-thinking-minimal',
      code_generation: 'gemini-3-flash-thinking-minimal',
      code_transform: 'gemini-3-flash',
      debugging: 'gemini-3-flash-thinking-medium',
      architecture: 'claude-sonnet-4.5',
      large_context: 'gemini-3-pro',
      multimodal: 'gemini-3-flash-thinking-minimal',
      orchestration: 'claude-sonnet-4.5'
    },
    anthropic: {
      simple_read: null,
      format_transform: null,
      documentation: 'gemini-3-flash-thinking-minimal',
      code_generation: 'claude-sonnet-4.5',
      code_transform: 'claude-sonnet-4.5',
      debugging: 'claude-sonnet-4.5-thinking-low',
      architecture: 'claude-sonnet-4.5',
      large_context: 'gemini-3-pro',
      multimodal: 'claude-sonnet-4.6',
      orchestration: 'claude-sonnet-4.5'
    },
    openai: {
      simple_read: null,
      format_transform: null,
      documentation: null,
      code_generation: 'gpt-5.3-codex',
      code_transform: 'gpt-5.3-codex',
      debugging: 'gpt-5.3-codex',
      architecture: 'gpt-5.3-codex',
      large_context: 'gpt-5.3-pro',
      multimodal: 'gpt-5.3-pro',
      orchestration: 'gpt-5.3-pro'
    }
  };

  /**
   * Intent to catalog key mapping
   */
  #INTENT_MAP = {
    research: 'documentation',
    analysis: 'documentation',
    ideation: 'documentation',
    architecture: 'architecture',
    implementation: 'code_generation',
    debugging: 'debugging',
    verification: 'documentation',
    documentation: 'documentation',
    system: 'orchestration',
    orchestration: 'orchestration'
  };

  constructor() {
    super();
    this.currentLayer = 0;
  }

  getName() {
    return 'FallbackLayerStrategy';
  }

  getPriority() {
    return 0; // Lowest priority - fallthrough if no other strategy matches
  }

  shouldApply(task, context = {}) {
    return !context.manualOverride &&
           !context.projectStartMode &&
           !context.stuckBugDetected &&
           !context.perspectiveMode;
  }

  async selectModel(task, context = {}) {
    const { intent, signals } = task;
    const catalogKey = this.#INTENT_MAP[intent] || 'documentation';

    // Try providers in order, starting from current layer
    for (let i = 0; i < this.#LAYERS.length; i++) {
      const provider = this.#LAYERS[(this.currentLayer + i) % this.#LAYERS.length];
      const modelId = this.#MODEL_CATALOG[provider]?.[catalogKey];

      if (modelId) {
        return {
          model_id: modelId,
          provider,
          reasoning_effort: this.#getReasoningEffort(provider, intent),
          confidence: 1.0 - (i * 0.1),
          alternative_models: this.#getAlternatives(intent, i)
        };
      }
    }

    // Fallback to lowest available model
    return {
      model_id: 'llama-3.1-70b',
      provider: 'groq',
      reasoning_effort: 'none',
      confidence: 0.5
    };
  }

  async getAlternatives(task, context = {}) {
    const { intent } = task;
    const catalogKey = this.#INTENT_MAP[intent] || 'documentation';
    const alternatives = [];

    for (let i = 1; i < this.#LAYERS.length; i++) {
      const provider = this.#LAYERS[(this.currentLayer + i) % this.#LAYERS.length];
      const modelId = this.#MODEL_CATALOG[provider]?.[catalogKey];

      if (modelId) {
        alternatives.push({
          model_id: modelId,
          provider,
          reason: `Layer ${i + 1} fallback`
        });
      }
    }

    return alternatives;
  }

  /**
   * Advance to next layer (called on metrics-specific triggers)
   *
   * @param {string} reason - Reason for advancing
   */
  advanceLayer(reason = '') {
    if (this.currentLayer < this.#LAYERS.length - 1) {
      this.currentLayer++;
      console.log(`[FallbackLayerStrategy] Advanced to layer ${this.currentLayer} (${this.#LAYERS[this.currentLayer]}): ${reason}`);
    }
  }

  /**
   * Reset to first layer
   */
  resetLayer() {
    this.currentLayer = 0;
    console.log('[FallbackLayerStrategy] Reset to layer 0');
  }

  /**
   * Get reasoning effort based on provider and intent
   *
   * @param {string} provider - Provider name
   * @param {string} intent - Task intent
   * @returns {string} - Reasoning effort level
   */
  #getReasoningEffort(provider, intent) {
    const providerMap = {
      antigravity: {
        debugging: 'medium',
        documentation: 'minimal'
      },
      anthropic: {
        debugging: 'low',
        architecture: 'low'
      }
    };

    return providerMap[provider]?.[intent] || 'none';
  }

  /**
   * Get alternative models for given intent and offset
   *
   * @param {string} intent - Task intent
   * @param {number} offset - Layer offset
   * @returns {Array} - Alternative models
   */
  #getAlternatives(intent, offset) {
    const catalogKey = this.#INTENT_MAP[intent] || 'documentation';
    const alternatives = [];

    for (let i = 1; i < 3; i++) {
      const provider = this.#LAYERS[(this.currentLayer + offset + i) % this.#LAYERS.length];
      const modelId = this.#MODEL_CATALOG[provider]?.[catalogKey];

      if (modelId) {
        alternatives.push({
          model_id: modelId,
          provider,
          reason: `Fallback layer ${i}`
        });
      }
    }

    return alternatives;
  }
}

module.exports = FallbackLayerStrategy;
