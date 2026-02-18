/**
 * 6-Layer Fallback Strategy
 *
 * Default strategy for model selection using a 6-layer fallback structure.
 * Each layer corresponds to a provider, with model selection based on task intent.
 */

const ModelSelectionStrategy = require('./model-selection-strategy');

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
      simple_read: 'llama-3.3-70b-versatile',
      format_transform: 'llama-3.3-70b-versatile',
      code_generation: 'llama-3.3-70b-versatile',
      code_transform: 'llama-3.3-70b-versatile',
      debugging: 'llama-3.3-70b-versatile',
      documentation: 'llama-3.3-70b-versatile',
      architecture: 'llama-3.3-70b-versatile',
      large_context: 'llama-3.3-70b-versatile',
      multimodal: 'llama-3.3-70b-versatile',  // No native vision
      optimization: 'llama-3.3-70b-versatile',
      orchestration: 'llama-3.3-70b-versatile'
    },
    cerebras: {
      simple_read: 'llama-3.3-70b',
      format_transform: 'llama-3.3-70b',
      code_generation: 'llama-3.3-70b',
      code_transform: 'llama-3.3-70b',
      debugging: 'llama-3.3-70b',
      documentation: 'llama-3.3-70b',
      architecture: 'llama-3.3-70b',
      large_context: 'llama-3.3-70b',
      multimodal: 'llama-3.3-70b',  // No native vision
      optimization: 'llama-3.3-70b',
      orchestration: 'llama-3.3-70b'
    },
    nvidia: {
      simple_read: 'llama-3.3-70b',
      format_transform: 'llama-3.3-70b',
      code_generation: 'llama-3.3-70b',
      code_transform: 'llama-3.3-70b',
      debugging: 'llama-3.3-70b',
      documentation: 'llama-3.3-70b',
      architecture: 'llama-3.3-70b',
      large_context: 'llama-3.3-70b',
      multimodal: 'llama-3.3-70b',  // No native vision
      optimization: 'llama-3.3-70b',
      orchestration: 'llama-3.3-70b'
    },
    antigravity: {
      simple_read: "gemini-2.0-flash",
      format_transform: "gemini-2.0-flash",
      documentation: 'gemini-2.0-flash-thinking-minimal',
      code_generation: 'gemini-2.0-flash-thinking-minimal',
      code_transform: "gemini-2.0-flash",
      debugging: 'gemini-2.0-flash-thinking-medium',
      architecture: 'gemini-2.0-pro',
      large_context: "gemini-2.0-pro",
      multimodal: 'gemini-2.0-flash-thinking-minimal',
      orchestration: 'gemini-2.0-pro'
    },
    anthropic: {
      simple_read: 'claude-haiku-4-5',
      format_transform: 'claude-haiku-4-5',
      documentation: 'claude-sonnet-4-5',
      code_generation: 'claude-sonnet-4-5',
      code_transform: 'claude-sonnet-4-5',
      debugging: 'claude-sonnet-4-5-thinking-low',
      architecture: 'claude-opus-4-6',
      large_context: 'claude-opus-4-6',
      multimodal: 'claude-sonnet-4-6',
      orchestration: 'claude-opus-4-6'
    },
    openai: {
      simple_read: 'gpt-4o-mini',
      format_transform: 'gpt-4o-mini',
      documentation: 'gpt-4o',
      code_generation: 'gpt-4o',
      code_transform: 'gpt-4o',
      debugging: 'gpt-4o',
      architecture: 'o1',
      large_context: 'o1',
      multimodal: 'gpt-4o',
      orchestration: 'o1'
    },
    deepseek: {
      simple_read: 'deepseek-chat',
      format_transform: 'deepseek-chat',
      documentation: 'deepseek-chat',
      code_generation: 'deepseek-coder',
      code_transform: 'deepseek-coder',
      debugging: 'deepseek-coder',
      architecture: 'deepseek-chat',
      large_context: 'deepseek-chat',
      multimodal: null,
      orchestration: 'deepseek-chat'
    }
  };

  /**
   * Intent to catalog key mapping
    */
  #INTENT_MAP = {
    // Core intents
    research: 'documentation',
    analysis: 'documentation',
    ideation: 'documentation',
    architecture: 'architecture',
    implementation: 'code_generation',
    debugging: 'debugging',
    verification: 'documentation',
    documentation: 'documentation',
    system: 'orchestration',
    orchestration: 'orchestration',
    
    // Performance intents
    fast: 'code_generation',
    cheap: 'code_generation',
    speed: 'code_generation',
    budget: 'optimization',
    
    // Quality intents
    high_quality: 'architecture',
    best: 'architecture',
    premium: 'architecture',
    
    // Specialized intents
    refactor: 'code_transform',
    review: 'documentation',
    security: 'debugging',
    performance: 'optimization',
    
    // Vision/Image intents
    multimodal: 'multimodal',
    vision: 'multimodal',
    image_analysis: 'multimodal',
    screenshot: 'multimodal',
    
    // Context intents
    large_context: 'large_context',
    long_context: 'large_context',
    
    // Reasoning intents
    reasoning: 'architecture',
    think: 'architecture',
    chain_of_thought: 'architecture'
  };

  constructor() {
    super();
    this.currentLayer = 0;
    this._advanceLock = Promise.resolve();  // Quota signal propagation lock
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
      model_id: 'llama-3.3-70b-versatile',
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
   * Uses lock to prevent concurrent 429 responses from racing
   *
   * @param {string} reason - Reason for advancing
   * @returns {Promise<void>}
   */
  async advanceLayer(reason = '') {
    return this._acquireAdvanceLock(async () => {
      if (this.currentLayer < this.#LAYERS.length - 1) {
        this.currentLayer++;
        console.log(`[FallbackLayerStrategy] Advanced to layer ${this.currentLayer} (${this.#LAYERS[this.currentLayer]}): ${reason}`);
      }
    });
  }

  /**
   * Acquire lock for layer advancement to prevent race conditions
   * @private
   */
  _acquireAdvanceLock(callback) {
    return this._advanceLock.then(async () => {
      this._advanceLock = callback().finally(() => {
        this._advanceLock = Promise.resolve();
      });
      return this._advanceLock;
    });
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
