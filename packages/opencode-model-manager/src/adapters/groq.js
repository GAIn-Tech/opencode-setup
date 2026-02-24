'use strict';

const { BaseAdapter, AdapterError } = require('./base-adapter');

/**
 * Groq API adapter for model discovery.
 *
 * Implements provider-specific logic for Groq's OpenAI-compatible model listing endpoint.
 * Normalizes Groq models to common schema with context window extraction.
 */
class GroqAdapter extends BaseAdapter {
  /**
   * @param {object} [config] - Adapter configuration.
   * @param {string} [config.endpoint] - Base endpoint (default: https://api.groq.com).
   * @param {string} [config.envKey] - Environment variable for API key (default: GROQ_API_KEY).
   * @param {number} [config.timeoutMs] - Request timeout in milliseconds (default: 10000).
   * @param {object} [config.retry] - Retry configuration.
   * @param {Function} [config.fetchImpl] - Optional fetch implementation.
   * @param {object} [config.circuitBreaker] - Optional circuit breaker.
   * @param {object} [config.keyRotator] - Optional key rotator.
   */
  constructor(config = {}) {
    super('groq', {
      endpoint: config.endpoint || 'https://api.groq.com',
      authType: 'bearer',
      envKey: config.envKey || 'GROQ_API_KEY',
      timeoutMs: config.timeoutMs || 10000,
      retry: config.retry,
      fetchImpl: config.fetchImpl,
      circuitBreaker: config.circuitBreaker,
      keyRotator: config.keyRotator
    });
  }

  /**
   * Fetch raw model list from Groq API.
   *
   * Uses OpenAI-compatible endpoint: GET /openai/v1/models
   *
   * @param {object} options - List options.
   * @param {object} context - Internal operation context.
   * @returns {Promise<Array>} Raw model list from Groq.
   */
  async _listRaw(options, context) {
    const payload = await this._requestJson('/openai/v1/models', {}, context);
    const models = this._extractModelList(payload);

    if (!Array.isArray(models)) {
      throw new AdapterError('Groq response did not contain model list', {
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
   * Fetch one model by ID from Groq API.
   *
   * @param {string} id - Model identifier.
   * @param {object} options - Get options.
   * @param {object} context - Internal operation context.
   * @returns {Promise<object|null>} Raw model or null if not found.
   */
  async _getRaw(id, options, context) {
    try {
      const payload = await this._requestJson(`/openai/v1/models/${id}`, {}, context);
      return payload || null;
    } catch (error) {
      if (error instanceof AdapterError && error.code === 'MODEL_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Normalize Groq model payload to common schema.
   *
   * Extracts context window from Groq's context_window field and maps to common schema.
   *
   * @param {object} raw - Raw Groq model payload.
   * @returns {object} Normalized model.
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

    if (!id) {
      throw new AdapterError('Model payload missing id field', {
        providerId: this.providerId,
        code: 'INVALID_MODEL_PAYLOAD',
        retryable: false,
        details: { raw }
      });
    }

    // Extract context window from Groq's context_window field
    const contextTokens = this._extractContextTokens(raw);

    return {
      id,
      contextTokens,
      outputTokens: null,
      deprecated: Boolean(raw.deprecated || false),
      object: raw.object || null,
      created: raw.created || null,
      ownedBy: raw.owned_by || null
    };
  }

  /**
   * Extract context window from Groq model payload.
   *
   * @param {object} raw - Raw model payload.
   * @returns {number|null} Context window size or null if unknown.
   */
  _extractContextTokens(raw) {
    if (Number.isFinite(raw.context_window)) {
      return raw.context_window;
    }

    if (Number.isFinite(raw.max_tokens)) {
      return raw.max_tokens;
    }

    return null;
  }
}

module.exports = {
  GroqAdapter
};
