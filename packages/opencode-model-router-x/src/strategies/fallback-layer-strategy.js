const ModelSelectionStrategy = require('./model-selection-strategy');

class FallbackLayerStrategy extends ModelSelectionStrategy {
  #TIER_MODELS = {
    flagship: [
      'anthropic/claude-opus-4-6',
      'openai/moonshotai/kimi-k2.5',
      'gpt-5.3-codex-spark'
    ],
    balanced: [
      'gemini-3-pro'
    ],
    speed: [
      'gemini-3-flash',
      'openai/minimaxai/minimax-m2.1'
    ],
    fallback: [
      'openai/z-ai/glm4.7'
    ]
  };

  #INTENT_TIER_MAP = {
    simple_read: 'speed',
    format_transform: 'speed',
    documentation: 'balanced',
    code_generation: 'flagship',
    code_transform: 'balanced',
    debugging: 'flagship',
    architecture: 'flagship',
    large_context: 'balanced',
    multimodal: 'balanced',
    orchestration: 'flagship'
  };

  constructor() {
    super();
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
    const { intent } = task;
    const tier = this.#INTENT_TIER_MAP[intent] || 'balanced';
    const models = this.#TIER_MODELS[tier];
    
    if (!models || models.length === 0) {
      // Fall through to total fallback
      const fallback = this.#TIER_MODELS.fallback;
      if (!fallback || fallback.length === 0) {
        throw new Error(`No models available for tier: ${tier}`);
      }
      return {
        model_id: fallback[0],
        provider: 'openai',
        reasoning_effort: 'medium',
        confidence: 0.7,
        strategy: 'FallbackLayerStrategy',
        meta: { tier: 'fallback', original_tier: tier }
      };
    }

    // Determine provider from model ID
    const modelId = models[0];
    let provider = 'openai';
    if (modelId.startsWith('anthropic/')) provider = 'anthropic';
    else if (modelId.startsWith('gemini-')) provider = 'google';

    return {
      model_id: modelId,
      provider,
      reasoning_effort: tier === 'flagship' ? 'high' : tier === 'speed' ? 'low' : 'medium',
      confidence: tier === 'flagship' ? 0.95 : tier === 'balanced' ? 0.9 : 0.85,
      strategy: 'FallbackLayerStrategy',
      meta: { tier }
    };
  }
}

module.exports = FallbackLayerStrategy;
