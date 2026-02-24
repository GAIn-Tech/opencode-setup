'use strict';

const { BaseAdapter, AdapterError } = require('./base-adapter');

/**
 * Cerebras API adapter for model discovery.
 *
 * Implements provider-specific logic for Cerebras's OpenAI-compatible model listing endpoint.
 * Normalizes Cerebras models to common schema.
 */
class CerebrasAdapter extends BaseAdapter {
  /**
   * @param {object} [config] - Adapter configuration.
   * @param {string} [config.endpoint] - Base endpoint (default: https://api.cerebras.ai/v1).
   * @param {string} [config.envKey] - Environment variable for API key (default: CEREBRAS_API_KEY).
   * @param {number} [config.timeoutMs] - Request timeout in milliseconds (default: 10000).
   * @param {object} [config.retry] - Retry configuration.
   * @param {Function} [config.fetchImpl] - Optional fetch implementation.
   * @param {object} [config.circuitBreaker] - Optional circuit breaker.
   * @param {object} [config.keyRotator] - Optional key rotator.
   */
  constructor(config = {}) {
    super('cerebras', {
      endpoint: config.endpoint || 'https://api.cerebras.ai/v1',
      authType: 'bearer',
      envKey: config.envKey || 'CEREBRAS_API_KEY',
      timeoutMs: config.timeoutMs || 10000,
      retry: config.retry,
      fetchImpl: config.fetchImpl,
      circuitBreaker: config.circuitBreaker,
      keyRotator: config.keyRotator
    });
  }

  /**
   * Fetch raw model list from Cerebras API.
   *
   * @param {object} options - List options.
   * @param {object} context - Internal operation context.
   * @returns {Promise<Array>} Raw model list from Cerebras.
   */
  async _listRaw(options, context) {
    const payload = await this._requestJson('/models', {}, context);
    const models = this._extractModelList(payload);

    if (!Array.isArray(models)) {
      throw new AdapterError('Cerebras response did not contain model list', {
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
   * Fetch one model by ID from Cerebras API.
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
   * Normalize Cerebras model payload to common schema.
   *
   * @param {object} raw - Raw Cerebras model payload.
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

    // Extract context window from various possible fields
    const contextTokens = this._extractContextTokens(raw);

    return {
      id,
      contextTokens,
      outputTokens: null,
      deprecated: Boolean(raw.deleted || false),
      object: raw.object || null,
      created: raw.created || null,
      ownedBy: raw.owned_by || null
    };
  }

  /**
   * Extract context window from Cerebras model payload.
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

    const id = String(raw.id || '').toLowerCase();
    if (id.includes('cse-2')) {
      return 200000;
    }
    if (id.includes('cse-1')) {
      return 100000;
    }

    return null;
  }
}

module.exports = {
  CerebrasAdapter
};
