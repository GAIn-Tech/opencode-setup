/**
 * Thompson Sampling Router
 * 
 * Uses Thompson Sampling (Bayesian approach) to balance exploration vs exploitation.
 * Maintains Beta distributions for each model-task pair and samples from posterior
 * to select models probabilistically based on observed performance.
 * 
 * Part of: dynamic-exploration-mode.md
 */

const path = require('path');
const fs = require('fs');
const { createRandomSource } = require('./deterministic-rng');

class ThompsonSamplingRouter {
  constructor() {
    // Beta distribution parameters: Beta(α=successes, β=failures)
    // Maps: intentCategory -> modelId -> { alpha, beta }
    this.posteriors = new Map();
    this.defaultPrior = { alpha: 1, beta: 1 }; // Uniform prior
    this._models = null;
    this._config = null;
    this._randomSource = createRandomSource('thompson-sampling-router');
  }

  /**
   * Load configuration and extract models
   * @private
   */
  _loadConfig() {
    if (this._config) return this._config;
    
    try {
      // Try to load from opencode-config
      const configPath = path.resolve(__dirname, '../../../opencode-config/opencode.json');
      if (fs.existsSync(configPath)) {
        this._config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch (err) {
      console.warn('[ThompsonSampling] Failed to load config:', err.message);
    }
    
    return this._config;
  }

  /**
   * Select model using Thompson Sampling
   * Samples from posterior distribution for each model, picks highest
   * @param {string} intentCategory - Task category
   * @returns {string} Selected model ID
   */
  select(intentCategory) {
    if (!this.posteriors.has(intentCategory)) {
      this.posteriors.set(intentCategory, new Map());
    }

    const categoryPosteriors = this.posteriors.get(intentCategory);
    
    // Get available models
    const availableModels = this.getAvailableModels();
    const modelsWithPosteriors = availableModels.filter(m => categoryPosteriors.has(m));
    
    if (modelsWithPosteriors.length === 0) {
      // No data yet - return random model for initial exploration
      return availableModels[Math.floor(this._randomSource.next() * availableModels.length)];
    }

    // Sample from each model's posterior and pick highest
    let bestModel = null;
    let bestSample = -Infinity;

    for (const modelId of modelsWithPosteriors) {
      const posterior = categoryPosteriors.get(modelId);
      const sample = this._sampleBeta(posterior.alpha, posterior.beta);
      
      if (sample > bestSample) {
        bestSample = sample;
        bestModel = modelId;
      }
    }

    return bestModel || availableModels[0];
  }

  /**
   * Update posterior with observed success/failure
   * @param {string} intentCategory - Task category
   * @param {string} modelId - Model identifier
   * @param {boolean} success - Whether the task succeeded
   */
  update(intentCategory, modelId, success) {
    if (!this.posteriors.has(intentCategory)) {
      this.posteriors.set(intentCategory, new Map());
    }

    const categoryPosteriors = this.posteriors.get(intentCategory);
    
    if (!categoryPosteriors.has(modelId)) {
      // Initialize with prior
      categoryPosteriors.set(modelId, { 
        alpha: this.defaultPrior.alpha, 
        beta: this.defaultPrior.beta 
      });
    }

    const posterior = categoryPosteriors.get(modelId);
    
    if (success) {
      posterior.alpha++; // Increment success parameter
    } else {
      posterior.beta++; // Increment failure parameter
    }
  }

  /**
   * Get expected value (mean) of posterior for a model
   * @param {string} intentCategory - Task category
   * @param {string} modelId - Model identifier
   * @returns {number} Expected success probability
   */
  getExpectedValue(intentCategory, modelId) {
    const categoryPosteriors = this.posteriors.get(intentCategory);
    if (!categoryPosteriors || !categoryPosteriors.has(modelId)) {
      return 0.5; // Prior mean
    }
    
    const posterior = categoryPosteriors.get(modelId);
    return posterior.alpha / (posterior.alpha + posterior.beta);
  }

  /**
   * Get all posterior parameters for a category
   * @param {string} intentCategory - Task category
   * @returns {Map} Map of modelId -> { alpha, beta }
   */
  getPosteriors(intentCategory) {
    return this.posteriors.get(intentCategory) || new Map();
  }

  /**
   * Load posteriors from memory data
   * @param {Map} memoryData - Data from ModelComprehensionMemory
   */
  loadFromMemory(memoryData) {
    // Aggregate successes/failures from memory
    for (const [key, records] of memoryData) {
      const [intentCategory, modelId] = key.split(':');
      
      let successes = 0;
      let failures = 0;
      
      for (const record of records) {
        // Handle both object and raw data formats
        const success = record.success ?? record.isSuccessful ?? record.is_exploration;
        if (success) {
          successes++;
        } else {
          failures++;
        }
      }
      
      if (successes > 0 || failures > 0) {
        // Set posterior directly without calling update()
        if (!this.posteriors.has(intentCategory)) {
          this.posteriors.set(intentCategory, new Map());
        }
        const categoryPosteriors = this.posteriors.get(intentCategory);
        categoryPosteriors.set(modelId, {
          alpha: successes + 1,
          beta: failures + 1
        });
      }
    }
    
    console.log(`[ThompsonSampling] Loaded posteriors for ${this.posteriors.size} categories`);
  }

  /**
   * Get list of available models from config
   * @returns {Array<string>} Available model IDs
   */
  getAvailableModels() {
    // Return cached models if loaded
    if (this._models) return this._models;
    
    // Try to load from config
    const config = this._loadConfig();
    
    if (config?.provider) {
      const models = [];
      for (const [providerName, providerConfig] of Object.entries(config.provider)) {
        if (providerConfig.models) {
          for (const [modelId, modelConfig] of Object.entries(providerConfig.models)) {
            models.push(modelId);
          }
        }
      }
      if (models.length > 0) {
        this._models = models;
        return models;
      }
    }
    
    // Fallback to default models if config fails
    return [
      'gemini-3-flash',
      'gemini-3-pro',
      'claude-opus-4-6',
      'claude-sonnet-4-5',
      'gpt-5',
      'gpt-5-codex'
    ];
  }

  /**
   * Sample from Beta(alpha, beta) distribution
   * Uses Gamma method for sampling
   * @param {number} alpha - Success parameter
   * @param {number} beta - Failure parameter
   * @returns {number} Sample from Beta distribution
   */
  _sampleBeta(alpha, beta) {
    const gamma1 = this._sampleGamma(alpha, 1);
    const gamma2 = this._sampleGamma(beta, 1);
    return gamma1 / (gamma1 + gamma2);
  }

  /**
   * Sample from Gamma(k, theta) distribution
   * Uses Marsaglia and Tsang's method
   * @param {number} k - Shape parameter
   * @param {number} theta - Scale parameter
   * @returns {number} Sample from Gamma distribution
   */
  _sampleGamma(k, theta) {
    if (k < 1) {
      // Use relationship: Gamma(k,θ) = Gamma(k+1,θ) * U^(1/k)
      return this._sampleGamma(k + 1, theta) * Math.pow(this._randomSource.next(), 1 / k);
    }

    const d = k - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x, v;
      do {
        x = this._randomNormal();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = this._randomSource.next();
      
      if (u < 1 - 0.0331 * (x * x) * (x * x)) {
        return d * v * theta;
      }
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v * theta;
      }
    }
  }

  /**
   * Generate random normal sample using Box-Muller transform
   * @returns {number} Standard normal sample
   */
  _randomNormal() {
    const u1 = this._randomSource.next();
    const u2 = this._randomSource.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

module.exports = ThompsonSamplingRouter;
