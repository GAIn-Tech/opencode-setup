'use strict';

const { BaseAdapter, AdapterError } = require('./base-adapter');

/**
 * OpenAI API adapter for model discovery.
 *
 * Implements provider-specific logic for OpenAI's model listing endpoint.
 * Filters out non-text models (dall-e, whisper) and normalizes to common schema.
 */
class OpenAIAdapter extends BaseAdapter {
  /**
   * @param {object} [config] - Adapter configuration.
   * @param {string} [config.endpoint] - Base endpoint (default: https://api.openai.com/v1).
   * @param {string} [config.envKey] - Environment variable for API key (default: OPENAI_API_KEY).
   * @param {number} [config.timeoutMs] - Request timeout in milliseconds (default: 10000).
   * @param {object} [config.retry] - Retry configuration.
   * @param {Function} [config.fetchImpl] - Optional fetch implementation.
   * @param {object} [config.circuitBreaker] - Optional circuit breaker.
   * @param {object} [config.keyRotator] - Optional key rotator.
   */
  constructor(config = {}) {
    super('openai', {
      endpoint: config.endpoint || 'https://api.openai.com/v1',
      authType: 'bearer',
      envKey: config.envKey || 'OPENAI_API_KEY',
      timeoutMs: config.timeoutMs || 10000,
      retry: config.retry,
      fetchImpl: config.fetchImpl,
      circuitBreaker: config.circuitBreaker,
      keyRotator: config.keyRotator
    });
  }

  /**
   * Fetch raw model list from OpenAI API.
   *
   * @param {object} options - List options.
   * @param {object} context - Internal operation context.
   * @returns {Promise<Array>} Raw model list from OpenAI.
   */
  async _listRaw(options, context) {
    const payload = await this._requestJson('/models', {}, context);
    const models = this._extractModelList(payload);

    if (!Array.isArray(models)) {
      throw new AdapterError('OpenAI response did not contain model list', {
        providerId: this.providerId,
        code: 'INVALID_RESPONSE_FORMAT',
        retryable: false,
        operation: context.operation,
        details: { payload }
      });
    }

    return models;
  }

  /**
   * Fetch one model by ID from OpenAI API.
   *
   * @param {string} id - Model identifier.
   * @param {object} options - Get options.
   * @param {object} context - Internal operation context.
   * @returns {Promise<object|null>} Raw model or null if not found.
   */
  async _getRaw(id, options, context) {
    try {
      const payload = await this._requestJson(`/models/${id}`, {}, context);
      return payload || null;
    } catch (error) {
      if (error instanceof AdapterError && error.code === 'MODEL_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Override get to handle filtering of non-text models.
   *
   * @param {string} id - Model identifier.
   * @param {object} options - Get options.
   * @returns {Promise<object|null>} Normalized model or null if not found or filtered.
   */
  async get(id, options = {}) {
    if (!id || typeof id !== 'string') {
      throw new AdapterError('id is required for get()', {
        providerId: this.providerId,
        code: 'INVALID_MODEL_ID',
        retryable: false,
        operation: 'get'
      });
    }

    return this._runOperation('get', options, async (context) => {
      const rawModel = await this._getRaw(id, options, context);
      if (!rawModel) {
        return null;
      }

      const normalized = this.normalize(rawModel);
      // Return null if model is filtered out (dall-e, whisper)
      if (normalized === null) {
        return null;
      }

      const capabilities = this.getCapabilities(normalized);
      if (capabilities && typeof capabilities === 'object') {
        normalized.capabilities = capabilities;
      }

      return normalized;
    });
  }

  /**
   * Normalize OpenAI model payload to common schema.
   *
   * Filters out non-text models (dall-e, whisper) and extracts relevant fields.
   *
   * @param {object} raw - Raw OpenAI model payload.
   * @returns {object|null} Normalized model or null if filtered out.
   */
  normalize(raw) {
    if (!raw || typeof raw !== 'object') {
      throw new AdapterError('Invalid model payload', {
        providerId: this.providerId,
        code: 'INVALID_MODEL_PAYLOAD',
        retryable: false,
        details: { raw }
      });
    }

    const id = String(raw.id || '').trim();

    // Filter out non-text models - return null to signal filtering
    if (id.startsWith('dall-e') || id.startsWith('whisper')) {
      return null;
    }

    // Extract context window from various possible fields
    const contextTokens = this._extractContextTokens(raw);

    return {
      id,
      contextTokens,
      outputTokens: null, // OpenAI doesn't expose output token limits in list endpoint
      deprecated: Boolean(raw.deleted || false),
      // Preserve additional metadata for reference
      object: raw.object || null,
      created: raw.created || null,
      ownedBy: raw.owned_by || null
    };
  }

  /**
   * Extract context window from OpenAI model payload.
   *
   * @param {object} raw - Raw model payload.
   * @returns {number|null} Context window size or null if unknown.
   */
  _extractContextTokens(raw) {
    // Try common field names
    if (Number.isFinite(raw.context_window)) {
      return raw.context_window;
    }

    if (Number.isFinite(raw.max_tokens)) {
      return raw.max_tokens;
    }

    // Default to a reasonable value for known models
    const id = String(raw.id || '').toLowerCase();
    if (id.includes('gpt-4-turbo') || id.includes('gpt-4-1106')) {
      return 128000;
    }
    if (id.includes('gpt-4')) {
      return 8192;
    }
    if (id.includes('gpt-3.5-turbo')) {
      return 4096;
    }

    return null;
  }

  /**
   * Override list to handle filtering of non-text models.
   *
   * @param {object} options - List options.
   * @returns {Promise<Array>} Filtered normalized models.
   */
  async list(options = {}) {
    return this._runOperation('list', options, async (context) => {
      const rawModels = await this._listRaw(options, context);

      if (!Array.isArray(rawModels)) {
        throw new AdapterError('list() raw result must be an array', {
          providerId: this.providerId,
          code: 'INVALID_LIST_PAYLOAD',
          retryable: false,
          operation: 'list'
        });
      }

      const normalized = [];
      for (const rawModel of rawModels) {
        const model = this.normalize(rawModel);
        // Skip null entries (filtered models like dall-e, whisper)
        if (model === null) {
          continue;
        }

        const capabilities = this.getCapabilities(model);
        if (capabilities && typeof capabilities === 'object') {
          model.capabilities = capabilities;
        }
        normalized.push(model);
      }

      return normalized;
    });
  }
}

module.exports = {
  OpenAIAdapter
};
