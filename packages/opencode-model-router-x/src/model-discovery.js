/**
 * Model Discovery
 * 
 * Discovers new models from configured providers.
 * Polls provider APIs to detect new models and triggers assessment workflow.
 * 
 * Design: Poll once when opening a new chat, with optional periodic polling.
 * 
 * Part of: dynamic-exploration-mode.md
 */

class ModelDiscovery {
  constructor(options = {}) {
    this.providers = {
      'openai': {
        endpoint: 'https://api.openai.com/v1/models',
        authType: 'bearer',
        envKey: 'OPENAI_API_KEY'
      },
      'anthropic': {
        endpoint: 'https://api.anthropic.com/v1/models',
        authType: 'anthropic',
        envKey: 'ANTHROPIC_API_KEY'
      },
      'google': {
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        authType: 'query',
        envKey: 'GOOGLE_API_KEY'
      },
      'groq': {
        endpoint: 'https://api.groq.com/openai/v1/models',
        authType: 'bearer',
        envKey: 'GROQ_API_KEY'
      },
      'cerebras': {
        endpoint: 'https://api.cerebras.ai/v1/models',
        authType: 'bearer',
        envKey: 'CEREBRAS_API_KEY'
      },
      'nvidia': {
        endpoint: 'https://integrate.api.nvidia.com/v1/models',
        authType: 'bearer',
        envKey: 'NVIDIA_API_KEY'
      }
    };

    this.discoveryCache = new Map(); // provider -> { models, hash, timestamp }
    this.lastPollTime = null;
    this.periodicPollingEnabled = false;
    this.periodicInterval = null;
    
    // Callback for new model detection
    this.onNewModels = options.onNewModels || null;
  }

  /**
   * Poll all providers for new models
   * Should be called ONCE when opening a new chat
   * @returns {Object} Results and new models found
   */
  async pollOnce() {
    const results = {};
    const allNewModels = [];

    for (const [providerId, config] of Object.entries(this.providers)) {
      try {
        const models = await this._fetchModels(providerId);
        
        const cache = this.discoveryCache.get(providerId);

        if (!cache) {
          // First poll - store all models
          this.discoveryCache.set(providerId, {
            models,
            hash: this._hashModels(models),
            timestamp: Date.now()
          });
          console.log(`[ModelDiscovery] ${providerId}: Initial poll found ${models.length} models`);
        } else {
          // Check for changes
          const newHash = this._hashModels(models);
          if (newHash !== cache.hash) {
            // Models added/removed
            const newModelsDetected = this._detectChanges(cache.models, models);
            console.log(`[ModelDiscovery] ${providerId}: Found ${newModelsDetected.length} new models`);
            
            // Add provider to each model
            for (const model of newModelsDetected) {
              model.provider = providerId;
            }
            
            allNewModels.push(...newModelsDetected);
            
            this.discoveryCache.set(providerId, {
              models,
              hash: newHash,
              timestamp: Date.now()
            });
          }
        }

        results[providerId] = models;
      } catch (error) {
        console.error(`[ModelDiscovery] Failed to poll ${providerId}:`, error.message);
        results[providerId] = { error: error.message };
      }
    }

    this.lastPollTime = Date.now();

    // Trigger callback if new models found
    if (allNewModels.length > 0 && this.onNewModels) {
      await this.onNewModels(allNewModels);
    }

    return { results, newModels: allNewModels };
  }

  /**
   * Start periodic polling (optional, for frequent updates)
   * @param {number} intervalHours - Polling interval in hours
   */
  startPeriodicPolling(intervalHours = 4) {
    if (this.periodicPollingEnabled) {
      console.log('[ModelDiscovery] Periodic polling already enabled');
      return;
    }

    this.periodicPollingEnabled = true;
    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    this.periodicInterval = setInterval(async () => {
      console.log('[ModelDiscovery] Periodic poll check...');
      await this.pollOnce();
    }, intervalMs);

    console.log(`[ModelDiscovery] Periodic polling enabled: every ${intervalHours} hours`);
  }

  /**
   * Stop periodic polling
   */
  stopPeriodicPolling() {
    if (this.periodicInterval) {
      clearInterval(this.periodicInterval);
      this.periodicInterval = null;
    }
    this.periodicPollingEnabled = false;
    console.log('[ModelDiscovery] Periodic polling stopped');
  }

  /**
   * Fetch models from a provider
   * @param {string} providerId - Provider identifier
   * @returns {Array} List of models
   */
  async _fetchModels(providerId) {
    const config = this.providers[providerId];
    const apiKey = this._getApiKey(config.envKey);

    if (!apiKey) {
      throw new Error(`No API key configured for ${providerId}`);
    }

    let url = config.endpoint;
    const headers = {};

    // Set up authentication based on provider type
    if (config.authType === 'bearer') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (config.authType === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else if (config.authType === 'query') {
      url += `?key=${apiKey}`;
    }

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return this._normalizeResponse(providerId, data);
  }

  /**
   * Normalize response format from different providers
   * @param {string} providerId - Provider identifier
   * @param {Object} data - Raw API response
   * @returns {Array} Normalized model list
   */
  _normalizeResponse(providerId, data) {
    switch (providerId) {
      case 'google':
        return (data.models || []).map(m => ({
          id: m.name || m.modelId,
          contextTokens: m.inputTokenLimit || m.context_window || 128000,
          outputTokens: m.outputTokenLimit || m.max_tokens || 64000,
          supportedMethods: m.supportedGenerationMethods || []
        }));

      case 'openai':
        return (data.data || [])
          .filter(m => m.object === 'model' && !m.id.startsWith('dall-e') && !m.id.startsWith('whisper'))
          .map(m => ({
            id: m.id,
            contextTokens: m.context_window || m.max_tokens || 128000,
            deprecated: m.deleted || false
          }));

      case 'anthropic':
        // Anthropic doesn't have a public models list API, use known models
        return [
          { id: 'claude-opus-4-5-20251114', contextTokens: 200000 },
          { id: 'claude-sonnet-4-5-20250501', contextTokens: 200000 },
          { id: 'claude-3-5-sonnet-20241022', contextTokens: 200000 },
          { id: 'claude-3-5-haiku-20241022', contextTokens: 200000 }
        ];

      case 'groq':
      case 'cerebras':
      case 'nvidia':
        // OpenAI-compatible format
        return (data.data || []).map(m => ({
          id: m.id,
          contextTokens: m.context_window || 128000,
          deprecated: false
        }));

      default:
        return [];
    }
  }

  /**
   * Detect new models between old and new lists
   * @param {Array} oldModels - Previous model list
   * @param {Array} newModels - Current model list
   * @returns {Array} New models not in old list
   */
  _detectChanges(oldModels, newModels) {
    const oldIds = new Set(oldModels.map(m => m.id));
    return newModels.filter(m => !oldIds.has(m.id));
  }

  /**
   * Generate hash for model list (for change detection)
   * @param {Array} models - Model list
   * @returns {string} Hash string
   */
  _hashModels(models) {
    const sortedIds = models.map(m => m.id).sort().join('|');
    return this._simpleHash(sortedIds);
  }

  /**
   * Simple string hash
   * @param {string} text - Input text
   * @returns {string} Hash
   */
  _simpleHash(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Get API key from environment
   * @param {string} envKey - Environment variable name
   * @returns {string|null} API key
   */
  _getApiKey(envKey) {
    // Support both single key and comma-separated keys (for rotators)
    const key = process.env[envKey];
    if (!key) return null;
    return key.split(',')[0]; // Use first key
  }

  /**
   * Get cached models for a provider
   * @param {string} providerId - Provider identifier
   * @returns {Array} Cached models
   */
  getCachedModels(providerId) {
    const cache = this.discoveryCache.get(providerId);
    return cache ? cache.models : [];
  }

  /**
   * Get all cached models
   * @returns {Object} Cache by provider
   */
  getAllCachedModels() {
    const result = {};
    for (const [provider, cache] of this.discoveryCache) {
      result[provider] = cache.models;
    }
    return result;
  }

  /**
   * Check if provider is configured
   * @param {string} providerId - Provider identifier
   * @returns {boolean} Whether provider has API key
   */
  isProviderConfigured(providerId) {
    const config = this.providers[providerId];
    return !!this._getApiKey(config?.envKey);
  }

  /**
   * Get configured providers
   * @returns {Array} List of configured provider IDs
   */
  getConfiguredProviders() {
    return Object.entries(this.providers)
      .filter(([_, config]) => this._getApiKey(config.envKey))
      .map(([id, _]) => id);
  }
}

module.exports = ModelDiscovery;
