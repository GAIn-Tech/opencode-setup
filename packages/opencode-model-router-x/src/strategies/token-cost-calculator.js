/**
 * Token Cost Calculator
 *
 * Calculates token costs based on model pricing tables.
 * Supports cost-per-success analysis and budget optimization.
 */

class TokenCostCalculator {
  #pricingTable;

  constructor() {
    this.#pricingTable = {
      // Claude (Anthropic)
      'anthropic': {
        'claude-sonnet-4.5': { input: 3.0, output: 15.0 },
        'claude-sonnet-4.5-thinking-low': { input: 3.0, output: 15.0, thinking_multiplier: 1.5 },
        'claude-sonnet-4.5-thinking-max': { input: 3.0, output: 15.0, thinking_multiplier: 3.0 },
        'claude-opus-4.6': { input: 15.0, output: 75.0 },
        'claude-opus-4.6-thinking-low': { input: 15.0, output: 75.0, thinking_multiplier: 1.5 },
        'claude-opus-4.6-thinking-max': { input: 15.0, output: 75.0, thinking_multiplier: 3.0 }
      },
      // Gemini (Google)
      'google': {
        "gemini-2.0-flash": { input: 0.075, output: 0.30 },
        'gemini-2.0-flash-thinking-minimal': { input: 0.075, output: 0.30, thinking_multiplier: 1.2 },
        'gemini-2.0-flash-thinking-low': { input: 0.075, output: 0.30, thinking_multiplier: 1.5 },
        'gemini-2.0-flash-thinking-medium': { input: 0.075, output: 0.30, thinking_multiplier: 2.0 },
        "gemini-2.0-pro": { input: 1.25, output: 5.0 },
        'gemini-2.0-pro-thinking-low': { input: 1.25, output: 5.0, thinking_multiplier: 1.5 },
        'gemini-2.0-pro-thinking-medium': { input: 1.25, output: 5.0, thinking_multiplier: 2.0 },
        'gemini-2.0-pro-thinking-high': { input: 1.25, output: 5.0, thinking_multiplier: 3.0 }
      },
      // OpenAI
      'openai': {
        'gpt-4o': { input: 2.50, output: 10.0 },
        'gpt-4o-thinking-low': { input: 2.50, output: 10.0, thinking_multiplier: 1.5 },
        'gpt-4o-thinking-max': { input: 2.50, output: 10.0, thinking_multiplier: 3.0 },
        'gpt-4o-mini': { input: 0.15, output: 0.60 },
        'o1': { input: 7.50, output: 30.0 }
      },
      // NVIDIA (hosted Llama)
      'nvidia': {
        'llama-3.1-405b': { input: 0.45, output: 0.45 },
        'llama-3.3-70b': { input: 0.15, output: 0.15 }
      },
      // Groq (hosted Llama)
      'groq': {
        'llama-3.1-405b': { input: 0.27, output: 0.27 },
        'llama-3.3-70b': { input: 0.08, output: 0.08 }
      },
      // Cerebras (hosted Llama)
      'cerebras': {
        'llama-3.1-405b': { input: 0.60, output: 0.60 },
        'llama-3.3-70b': { input: 0.20, output: 0.20 }
      }
    };
  }

  /**
   * Calculate cost for a request
   *
   * @param {string} provider - Provider name
   * @param {string} modelId - Model identifier
   * @param {number} inputTokens - Input token count
   * @param {number} outputTokens - Output token count
   * @param {number} [thinkingTokens=0] - Thinking token count (optional)
   * @returns {number} - Cost in dollars
   */
  calculateCost(provider, modelId, inputTokens, outputTokens, thinkingTokens = 0) {
    const pricing = this.#pricingTable[provider]?.[modelId];

    if (!pricing) {
      console.warn(`[TokenCostCalculator] Pricing not found for ${provider}/${modelId}`);
      return 0;
    }

    // Base cost calculation (per 1K tokens)
    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;

    // Thinking tokens multiplier
    let thinkingCost = 0;
    if (thinkingTokens > 0 && pricing.thinking_multiplier) {
      thinkingCost = ((thinkingTokens / 1000) * pricing.input) * pricing.thinking_multiplier;
    }

    const totalCost = inputCost + outputCost + thinkingCost;

    console.log(`[TokenCostCalculator] ${provider}/${modelId}: $${totalCost.toFixed(6)} ` +
                `(in: ${inputTokens}, out: ${outputTokens}, ${thinkingTokens === 0 ? 'no thinking' : `thinking: ${thinkingTokens}`})`);

    return totalCost;
  }

  /**
   * Calculate cost-per-success
   *
   * @param {string} provider - Provider name
   * @param {string} modelId - Model identifier
   * @param {number} inputTokens - Input token count
   * @param {number} outputTokens - Output token count
   * @param {number} [thinkingTokens=0] - Thinking token count
   * @param {number} successRate - Success rate (0-1)
   * @returns {Object} - Cost metrics including cost-per-success
   */
  calculateCostPerSuccess(provider, modelId, inputTokens, outputTokens, thinkingTokens, successRate) {
    const totalCost = this.calculateCost(provider, modelId, inputTokens, outputTokens, thinkingTokens);

    const costPerSuccess = successRate > 0 ? totalCost / successRate : Infinity;

    return {
      total_cost: totalCost,
      cost_per_success: costPerSuccess,
      success_rate: successRate
    };
  }

  /**
   * Compare costs across models
   *
   * @param {Array} modelSelections - Array of { provider, modelId, inputTokens, outputTokens, thinkingTokens }
   * @returns {Array} - Sorted by total cost (ascending)
   */
  compareCosts(modelSelections) {
    const results = modelSelections.map(selection => {
      const cost = this.calculateCost(
        selection.provider,
        selection.modelId,
        selection.inputTokens,
        selection.outputTokens,
        selection.thinkingTokens || 0
      );

      return {
        ...selection,
        total_cost: cost
      };
    });

    // Sort by cost ascending
    return results.sort((a, b) => a.total_cost - b.total_cost);
  }

  /**
   * Update pricing table
   *
   * @param {string} provider - Provider name
   * @param {string} modelId - Model identifier
   * @param {Object} pricing - Pricing object { input, output, thinking_multiplier }
   */
  updatePricing(provider, modelId, pricing) {
    if (!this.#pricingTable[provider]) {
      this.#pricingTable[provider] = {};
    }

    this.#pricingTable[provider][modelId] = pricing;

    console.log(`[TokenCostCalculator] Updated pricing for ${provider}/${modelId}`);
  }

  /**
   * Get pricing for a model
   *
   * @param {string} provider - Provider name
   * @param {string} modelId - Model identifier
   * @returns {Object|null} - Pricing object or null
   */
  getPricing(provider, modelId) {
    return this.#pricingTable[provider]?.[modelId] || null;
  }

  /**
   * Get all pricing
   *
   * @returns {Object} - Complete pricing table
   */
  getAllPricing() {
    return JSON.parse(JSON.stringify(this.#pricingTable));
  }
}

module.exports = TokenCostCalculator;
