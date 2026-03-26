/**
 * Modern fallback strategy.
 *
 * Uses a provider-layer chain with post-mid-2025 model IDs only.
 */

const ModelSelectionStrategy = require('./model-selection-strategy');

class FallbackLayerStrategy extends ModelSelectionStrategy {
  #LAYERS = ['antigravity', 'anthropic', 'openai', 'google'];

  #MODEL_CATALOG = {
    antigravity: {
      simple_read: 'antigravity-gemini-3-flash',
      format_transform: 'antigravity-gemini-3-flash',
      documentation: 'antigravity-gemini-3-flash',
      code_generation: 'antigravity-claude-sonnet-4-5-thinking',
      code_transform: 'antigravity-claude-sonnet-4-5-thinking',
      debugging: 'antigravity-claude-opus-4-6-thinking',
      architecture: 'antigravity-claude-opus-4-6-thinking',
      large_context: 'antigravity-gemini-3-pro',
      multimodal: 'antigravity-gemini-3-pro',
      optimization: 'antigravity-gemini-3-flash-8b',
      orchestration: 'antigravity-claude-opus-4-6-thinking',
    },
    anthropic: {
      simple_read: 'claude-haiku-4-5',
      format_transform: 'claude-haiku-4-5',
      documentation: 'claude-sonnet-4-5',
      code_generation: 'claude-sonnet-4-5',
      code_transform: 'claude-sonnet-4-5',
      debugging: 'claude-opus-4-6',
      architecture: 'claude-opus-4-6',
      large_context: 'claude-opus-4-6',
      multimodal: 'claude-sonnet-4-5',
      optimization: 'claude-sonnet-4-5',
      orchestration: 'claude-opus-4-6',
    },
    openai: {
      simple_read: 'gpt-5.2',
      format_transform: 'gpt-5.2',
      documentation: 'gpt-5.2',
      code_generation: 'gpt-5.3-codex',
      code_transform: 'gpt-5.3-codex',
      debugging: 'gpt-5.3-codex',
      architecture: 'gpt-5.2',
      large_context: 'gpt-5.2',
      multimodal: 'gpt-5',
      optimization: 'gpt-5',
      orchestration: 'gpt-5.2',
    },
    google: {
      simple_read: 'gemini-3-flash',
      format_transform: 'gemini-3-flash',
      documentation: 'gemini-3-flash',
      code_generation: 'gemini-3-pro',
      code_transform: 'gemini-3-pro',
      debugging: 'gemini-3-pro',
      architecture: 'gemini-3-pro',
      large_context: 'gemini-3-pro',
      multimodal: 'gemini-3-pro',
      optimization: 'gemini-3-flash',
      orchestration: 'gemini-3-pro',
    },
  };

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
    orchestration: 'orchestration',
    fast: 'code_generation',
    cheap: 'optimization',
    speed: 'optimization',
    budget: 'optimization',
    high_quality: 'architecture',
    best: 'architecture',
    premium: 'architecture',
    refactor: 'code_transform',
    review: 'documentation',
    security: 'debugging',
    performance: 'optimization',
    multimodal: 'multimodal',
    vision: 'multimodal',
    image_analysis: 'multimodal',
    screenshot: 'multimodal',
    large_context: 'large_context',
    long_context: 'large_context',
    reasoning: 'architecture',
    think: 'architecture',
    chain_of_thought: 'architecture',
  };

  constructor() {
    super();
    this.currentLayer = 0;
    this._advanceLock = Promise.resolve();
  }

  getName() {
    return 'FallbackLayerStrategy';
  }

  getPriority() {
    return 0;
  }

  shouldApply(task, context = {}) {
    return !context.manualOverride &&
      !context.projectStartMode &&
      !context.stuckBugDetected &&
      !context.perspectiveMode;
  }

  async selectModel(task, context = {}) {
    const catalogKey = this.#INTENT_MAP[task.intent] || 'documentation';

    for (let i = 0; i < this.#LAYERS.length; i++) {
      const provider = this.#LAYERS[(this.currentLayer + i) % this.#LAYERS.length];
      const modelId = this.#MODEL_CATALOG[provider]?.[catalogKey];

      if (modelId) {
        return {
          model_id: modelId,
          provider,
          reasoning_effort: this.#getReasoningEffort(provider, task.intent),
          confidence: 1.0 - (i * 0.1),
          alternative_models: this.#getAlternatives(task.intent, i),
        };
      }
    }

    return {
      model_id: 'antigravity-gemini-3-flash',
      provider: 'antigravity',
      reasoning_effort: 'none',
      confidence: 0.5,
    };
  }

  async getAlternatives(task) {
    const catalogKey = this.#INTENT_MAP[task.intent] || 'documentation';
    const alternatives = [];

    for (let i = 1; i < this.#LAYERS.length; i++) {
      const provider = this.#LAYERS[(this.currentLayer + i) % this.#LAYERS.length];
      const modelId = this.#MODEL_CATALOG[provider]?.[catalogKey];
      if (!modelId) continue;
      alternatives.push({
        model_id: modelId,
        provider,
        reason: `Layer ${i + 1} fallback`,
      });
    }

    return alternatives;
  }

  async advanceLayer(reason = '') {
    return this._acquireAdvanceLock(async () => {
      if (this.currentLayer < this.#LAYERS.length - 1) {
        this.currentLayer++;
        console.log(`[FallbackLayerStrategy] Advanced to layer ${this.currentLayer} (${this.#LAYERS[this.currentLayer]}): ${reason}`);
      }
    });
  }

  _acquireAdvanceLock(callback) {
    return this._advanceLock.then(async () => {
      this._advanceLock = callback().finally(() => {
        this._advanceLock = Promise.resolve();
      });
      return this._advanceLock;
    });
  }

  resetLayer() {
    this.currentLayer = 0;
    console.log('[FallbackLayerStrategy] Reset to layer 0');
  }

  #getReasoningEffort(provider, intent) {
    const providerMap = {
      antigravity: {
        debugging: 'medium',
        architecture: 'medium',
      },
      anthropic: {
        debugging: 'low',
        architecture: 'low',
      },
      openai: {
        code_generation: 'medium',
        debugging: 'medium',
      },
    };

    return providerMap[provider]?.[intent] || 'none';
  }

  #getAlternatives(intent, offset) {
    const catalogKey = this.#INTENT_MAP[intent] || 'documentation';
    const alternatives = [];

    for (let i = 1; i < 3; i++) {
      const provider = this.#LAYERS[(this.currentLayer + offset + i) % this.#LAYERS.length];
      const modelId = this.#MODEL_CATALOG[provider]?.[catalogKey];
      if (!modelId) continue;
      alternatives.push({
        model_id: modelId,
        provider,
        reason: `Fallback layer ${i}`,
      });
    }

    return alternatives;
  }
}

module.exports = FallbackLayerStrategy;
