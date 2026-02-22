/**
 * Dynamic Exploration Mode Controller
 * 
 * Enables adaptive learning of model strengths through systematic data collection.
 * When activated, the system dynamically selects models based on task category
 * and exploration strategy, tracks performance metrics, and enables Thompson
 * Sampling for intelligent model selection.
 * 
 * Part of: dynamic-exploration-mode.md
 */

class DynamicExplorationController {
  constructor() {
    this.active = false;
    this.explorationBudget = 0; // % of queries to explore vs exploit
    this.explorationMode = 'balanced';
    this.tracker = null;
    this.sampler = null;
    this.memory = null;
    this._initialized = false;
    const { createRandomSource } = require('./deterministic-rng');
    this._randomSource = createRandomSource('dynamic-exploration-controller');
  }

  /**
   * Initialize exploration components
   * @param {Object} options - Configuration options
   */
  async initialize(options = {}) {
    if (this._initialized) return;
    
    try {
      const ModelPerformanceTracker = require('./model-performance-tracker');
      const ThompsonSamplingRouter = require('./thompson-sampling-router');
      const ModelComprehensionMemory = require('./model-comprehension-memory');
      
      this.tracker = new ModelPerformanceTracker();
      this.sampler = new ThompsonSamplingRouter();
      this.memory = new ModelComprehensionMemory(options.dbPath);
      
      await this.memory.initialize();
      this.sampler.loadFromMemory(this.memory.data);
      
      this._initialized = true;
      console.log('[DynamicExploration] Components initialized');
    } catch (err) {
      console.error('[DynamicExploration] Initialization failed:', err.message);
      this._initialized = false;
      throw err;
    }
  }

  /**
   * Activate exploration mode
   * @param {string} mode - 'balanced', 'aggressive', 'conservative'
   * @param {number} budget - % of queries to explore (0-100)
   */
  async activate(mode = 'balanced', budget = 20) {
    if (!this._initialized) {
      await this.initialize();
    }
    
    this.active = true;
    this.explorationBudget = budget;
    this.explorationMode = mode;

    console.log(`[DynamicExploration] Mode activated: ${mode}, Budget: ${budget}%`);
  }

  async deactivate() {
    this.active = false;
    console.log('[DynamicExploration] Mode deactivated');
  }

  /**
   * Select model for task
   * @param {Object} task - { taskId, intentCategory, complexity, context }
   * @returns {Object|null} { model, provider, isExploration } or null if inactive
   */
  async selectModelForTask(task) {
    if (!this.active || !this.tracker || !this.sampler) {
      return null; // Let standard orchestration handle it
    }

    const shouldExplore = this._randomSource.next() * 100 < this.explorationBudget;

    if (shouldExplore) {
      // Exploration: Use Thompson Sampling to select diverse model
      const modelId = this.sampler.select(task.intentCategory);
      const provider = this.extractProvider(modelId);
      return { model: modelId, provider, isExploration: true };
    } else {
      // Exploitation: Use best-known model for this task
      const bestModel = this.tracker.getBestModel(task.intentCategory);
      if (!bestModel) {
        // No data yet, fall back to exploration
        const modelId = this.sampler.select(task.intentCategory);
        const provider = this.extractProvider(modelId);
        return { model: modelId, provider, isExploration: true };
      }
      const provider = this.extractProvider(bestModel);
      return { model: bestModel, provider, isExploration: false };
    }
  }

  /**
   * Gather metrics after task completion
   * @param {Object} task - Task metadata
   * @param {Object} selection - Model selection { model, provider, isExploration }
   * @param {Object} result - Task result { success, accuracy, latency, tokensUsed }
   */
  async gatherMetrics(task, selection, result) {
    if (!this.memory || !this.tracker) {
      console.warn('[DynamicExploration] Not initialized, skipping metrics');
      return null;
    }

    const metrics = {
      taskId: task.taskId,
      intentCategory: task.intentCategory,
      modelId: selection.model,
      provider: selection.provider,
      isExploration: selection.isExploration,
      timestamp: Date.now(),
      // 4-Pillar Metrics
      accuracy: this.calculateAccuracy(result),
      latency: result.latency || 0,
      cost: this.calculateCost(selection.model, result.tokensUsed),
      success: result.success || false,
      tokensUsed: result.tokensUsed,
      // Context metadata
      complexity: task.complexity,
      fileSize: task.fileSize,
      language: task.language
    };

    // Track in memory
    await this.tracker.track(metrics);
    await this.memory.store(metrics);

    // Update Thompson Sampling posterior
    if (selection.isExploration) {
      this.sampler.update(task.intentCategory, selection.model, result.success);
    }

    return metrics;
  }

  /**
   * Calculate accuracy from result
   * @param {Object} result - Task result
   * @returns {number} accuracy score 0-1
   */
  calculateAccuracy(result) {
    // G-Eval (LLM-as-a-judge) or Pass@k for code
    if (result.passRate !== undefined) return result.passRate;
    if (result.qualityScore !== undefined) return result.qualityScore;
    if (result.accuracy !== undefined) return result.accuracy;
    return result.success ? 1.0 : 0.0;
  }

  /**
   * Calculate cost based on token usage and provider pricing
   * @param {string} modelId - Model identifier
   * @param {Object} tokensUsed - { input, output }
   * @returns {number} cost in USD
   */
  calculateCost(modelId, tokensUsed) {
    const pricing = this.getProviderPricing(modelId);
    if (!pricing || !tokensUsed) return 0;

    const { input, output } = pricing;
    const inputTokens = tokensUsed.input || 0;
    const outputTokens = tokensUsed.output || 0;
    return (inputTokens * input + outputTokens * output) / 1000000; // Convert to USD
  }

  /**
   * Get provider pricing from config or use defaults
   * @param {string} modelId - Model identifier
   * @returns {Object|null} { input, output } price per 1M tokens
   */
  getProviderPricing(modelId) {
    // Try to load from config first
    const pricing = this._loadProviderPricing();
    if (pricing) return pricing;
    
    // Default pricing fallback
    const defaultPricing = {
      input: 0.5,
      output: 1.5
    };
    
    // Model-specific overrides
    const pricingOverrides = {
      'groq': { input: 0.59, output: 0.79 },
      'cerebras': { input: 0.6, output: 0.8 },
      'nvidia': { input: 0.75, output: 1.0 },
      'claude': { input: 3.0, output: 15.0 },
      'gpt': { input: 2.5, output: 10.0 },
      'gemini': { input: 0.0, output: 0.0 }
    };

    for (const [provider, price] of Object.entries(pricingOverrides)) {
      if (modelId.toLowerCase().includes(provider)) {
        return price;
      }
    }

    return defaultPricing;
  }

  /**
   * Load provider pricing from config
   * @private
   */
  _loadProviderPricing() {
    if (this._pricing) return this._pricing;
    
    try {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.resolve(__dirname, '../../../opencode-config/opencode.json');
      
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        
        // Build pricing map from provider configs
        if (config.provider) {
          this._pricing = {};
          for (const [providerName, providerConfig] of Object.entries(config.provider)) {
            if (providerConfig.pricing) {
              this._pricing[providerName] = providerConfig.pricing;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[DynamicExploration] Failed to load pricing:', err.message);
    }
    
    return this._pricing;
  }

  /**
   * Extract provider from model ID
   * @param {string} modelId - Model identifier
   * @returns {string} provider name
   */
  extractProvider(modelId) {
    const id = modelId.toLowerCase();
    if (id.includes('llama') || id.includes('groq')) return 'groq';
    if (id.includes('cerebras')) return 'cerebras';
    if (id.includes('nvidia')) return 'nvidia';
    if (id.includes('gemini')) return 'google';
    if (id.includes('claude')) return 'anthropic';
    if (id.includes('gpt') || id.includes('codex') || id.includes('openai')) return 'openai';
    if (id.includes('deepseek')) return 'deepseek';
    return 'unknown';
  }

  /**
   * Get exploration status
   * @returns {Object} Current status
   */
  getStatus() {
    return {
      active: this.active,
      mode: this.explorationMode,
      budget: this.explorationBudget,
      initialized: this._initialized,
      trackedModels: this.tracker ? this.tracker.aggregates.size : 0
      ,seededReplay: this._randomSource.seeded
    };
  }

  /**
   * Close resources
   */
  async close() {
    if (this.memory) {
      this.memory.close();
    }
  }
}

module.exports = DynamicExplorationController;
