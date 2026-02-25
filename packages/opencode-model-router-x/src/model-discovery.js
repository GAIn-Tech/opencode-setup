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
    this.cacheTTL = Number(options.cacheTTL) || 300000; // 5 minutes default
    this.cacheMaxSize = Number(options.cacheMaxSize) || 50;
    this.lastPollTime = null;
    this.periodicPollingEnabled = false;
    this.periodicInterval = null;
    this.timeoutMs = Number(options.timeoutMs) || 10000;
    if (options.docsScraper) {
      this.docsScraper = options.docsScraper;
    } else {
      try {
        this.docsScraper = require('./docs-scraper');
      } catch {
        this.docsScraper = null;
      }
    }
    this.communitySourcesEnabled = options.communitySourcesEnabled !== false;
    
    // Callback for new model detection
    this.onNewModels = options.onNewModels || null;
    this.memory = options.memory || null;
  }

  /**
   * Get a cache entry if it exists and hasn't expired
   * @param {string} providerId
   * @returns {Object|null} Cache entry or null if expired/missing
   */
  _getCacheEntry(providerId) {
    const entry = this.discoveryCache.get(providerId);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.cacheTTL) {
      this.discoveryCache.delete(providerId);
      return null;
    }
    return entry;
  }

  /**
   * Set a cache entry with maxSize enforcement (FIFO eviction)
   * @param {string} providerId
   * @param {Array} models
   * @param {string} hash
   */
  _setCacheEntry(providerId, models, hash) {
    // Evict oldest entry if at capacity and this is a new key
    if (this.discoveryCache.size >= this.cacheMaxSize && !this.discoveryCache.has(providerId)) {
      const oldest = this.discoveryCache.keys().next().value;
      this.discoveryCache.delete(oldest);
    }
    this.discoveryCache.set(providerId, {
      models,
      hash,
      timestamp: Date.now()
    });
  }

  /**
   * Evict all expired entries from cache
   * @returns {number} Number of entries evicted
   */
  _evictExpired() {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.discoveryCache) {
      if (now - entry.timestamp > this.cacheTTL) {
        this.discoveryCache.delete(key);
        evicted++;
      }
    }
    return evicted;
  }

  /**
   * Poll all providers for new models
   * Should be called ONCE when opening a new chat
   * Fetches all providers in parallel for performance.
   * @returns {Object} Results and new models found
   */
  async pollOnce() {
    const results = {};
    const allNewModels = [];
    const providerEntries = Object.entries(this.providers);
    const totalProviders = providerEntries.length;
    let successCount = 0;
    let errorCount = 0;

    // Evict stale cache entries before polling
    this._evictExpired();

    // Fetch all providers in parallel for performance
    const providerResults = await Promise.all(
      providerEntries.map(async ([providerId]) => {
        try {
          const models = await this._fetchModels(providerId);
          return { providerId, models, success: true };
        } catch (error) {
          console.error(`[ModelDiscovery] Failed to poll ${providerId}:`, error.message);
          return { providerId, error: error.message, success: false };
        }
      })
    );

    for (const pr of providerResults) {
      if (!pr.success) {
        results[pr.providerId] = { error: pr.error };
        errorCount++;
        continue;
      }

      const { providerId, models } = pr;
      const cache = this._getCacheEntry(providerId);

      if (!cache) {
        // First poll or expired cache - store all models
        this._setCacheEntry(providerId, models, this._hashModels(models));
        console.log(`[ModelDiscovery] ${providerId}: Initial poll found ${models.length} models`);
      } else {
        // Check for changes
        const newHash = this._hashModels(models);
        if (newHash !== cache.hash) {
          // Models added/removed
          const newModelsDetected = this._detectChanges(cache.models, models);
          console.log(`[ModelDiscovery] ${providerId}: Found ${newModelsDetected.length} new models`);
          
          // Add provider to each model
          const discoveryTs = Date.now();
          for (const model of newModelsDetected) {
            model.provider = providerId;
            if (this.memory) {
              this.memory.storeDiscoveredModel({
                provider: providerId,
                model_id: model.id || model.model_id || model.name,
                context_tokens: model.contextTokens || model.context_tokens,
                output_tokens: model.outputTokens || model.output_tokens,
                deprecated: model.deprecated ? 1 : 0,
                discovered_at: discoveryTs,
              });
            }
          }
          
          allNewModels.push(...newModelsDetected);
          this._setCacheEntry(providerId, models, newHash);
        }
      }

      results[providerId] = models;
      successCount++;
    }

    const allProvidersFailed = errorCount === totalProviders;

    if (allProvidersFailed) {
      const cacheAge = this.lastPollTime
        ? Math.round((Date.now() - this.lastPollTime) / 1000 / 60)
        : null;
      const ageStr = cacheAge !== null ? ` (cache age: ${cacheAge}min)` : ' (no cache)';
      console.error(`[ModelDiscovery] ALL ${totalProviders} providers failed — discovery returning stale data${ageStr}`);
    }

    this.lastPollTime = Date.now();

    // Trigger callback if new models found
    if (allNewModels.length > 0 && this.onNewModels) {
      await this.onNewModels(allNewModels);
    }

    return {
      results,
      newModels: allNewModels,
      allProvidersFailed,
      ...(allProvidersFailed ? { staleCache: true } : {})
    };
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

  startPeriodicPollingMinutes(intervalMinutes = 30) {
    const minutes = Math.max(15, Math.min(60, intervalMinutes));
    this.startPeriodicPolling(minutes / 60);
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
      const fallback = await this._fetchFallbackModels(providerId, `No API key configured for ${providerId}`);
      if (fallback.length > 0) return fallback;
      throw new Error(`No API key configured for ${providerId}`);
    }

    let url = config.endpoint;
    const headers = {};
    const timeoutMs = Number(config.timeoutMs || this.timeoutMs);

    // Set up authentication based on provider type
    if (config.authType === 'bearer') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (config.authType === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else if (config.authType === 'query') {
      url += `?key=${apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(url, { headers, signal: controller.signal });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        const fallback = await this._fetchFallbackModels(providerId, `Request timed out after ${timeoutMs}ms`);
        if (fallback.length > 0) return fallback;
        throw new Error(`Request timed out after ${timeoutMs}ms`);
      }
      const fallback = await this._fetchFallbackModels(providerId, error.message || 'Fetch failed');
      if (fallback.length > 0) return fallback;
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
    
    if (!response.ok) {
      const fallback = await this._fetchFallbackModels(providerId, `HTTP ${response.status}: ${response.statusText}`);
      if (fallback.length > 0) return fallback;
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Early exit on invalid JSON — don't waste time normalizing bad data
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      const fallback = await this._fetchFallbackModels(providerId, `Invalid JSON response`);
      if (fallback.length > 0) return fallback;
      throw new Error(`Invalid JSON from ${providerId}: ${parseError.message}`);
    }
    return this._normalizeResponse(providerId, data);
  }

  async _fetchFallbackModels(providerId, reason) {
    const models = [];
    if (this.docsScraper?.scrapeProviderModels || this.docsScraper?.scrape) {
      try {
        const scrape = this.docsScraper.scrapeProviderModels || this.docsScraper.scrape;
        const scraped = await scrape(providerId);
        if (Array.isArray(scraped) && scraped.length > 0) {
          models.push(...scraped);
        }
      } catch (err) {
        console.warn(`[ModelDiscovery] Doc scraper failed for ${providerId}:`, err.message || err);
      }
    }

    if (models.length === 0 && this.communitySourcesEnabled) {
      const community = await this._fetchFromCommunity(providerId);
      models.push(...community);
    }

    if (models.length > 0) {
      console.warn(`[ModelDiscovery] Using fallback models for ${providerId}: ${reason}`);
    }

    return models;
  }

  async _fetchFromCommunity(providerId) {
    try {
      const response = await fetch('https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json');
      if (!response.ok) return [];
      const data = await response.json();
      const output = [];
      for (const [modelId, info] of Object.entries(data)) {
        if (!modelId.toLowerCase().includes(providerId)) continue;
        output.push({
          id: modelId,
          contextTokens: info?.max_context_length || 128000,
          outputTokens: info?.max_output_tokens || undefined,
          deprecated: info?.deprecated || false,
        });
      }
      return output;
    } catch (err) {
      console.warn(`[ModelDiscovery] Community source failed for ${providerId}:`, err.message || err);
      return [];
    }
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
          { id: 'claude-opus-4-6', contextTokens: 1000000 },
          { id: 'claude-sonnet-4-5', contextTokens: 200000 },
          { id: 'claude-haiku-4-5', contextTokens: 200000 }
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
    const cache = this._getCacheEntry(providerId);
    return cache ? cache.models : [];
  }

  /**
   * Get all cached models (excludes expired entries)
   * @returns {Object} Cache by provider
   */
  getAllCachedModels() {
    this._evictExpired();
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
