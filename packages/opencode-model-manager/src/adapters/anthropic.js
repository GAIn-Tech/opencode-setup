'use strict';

const { BaseAdapter } = require('./base-adapter');

/**
 * Anthropic API adapter for model discovery.
 *
 * Implements the ProviderAdapterInterface for Anthropic's models API.
 * Handles pagination with after_id/before_id and normalizes to common schema.
 *
 * API: https://api.anthropic.com/v1/models
 * Docs: https://docs.anthropic.com/en/api/models-list
 */
class AnthropicAdapter extends BaseAdapter {
  /**
   * @param {object} [config] - Adapter configuration.
   * @param {string} [config.endpoint] - Base endpoint (default: https://api.anthropic.com).
   * @param {string} [config.envKey] - Environment variable for API key (default: ANTHROPIC_API_KEY).
   * @param {number} [config.timeoutMs] - Request timeout in milliseconds.
   * @param {object} [config.retry] - Retry configuration.
   * @param {Function} [config.fetchImpl] - Optional fetch implementation.
   * @param {object} [config.circuitBreaker] - Optional circuit breaker.
   * @param {object} [config.keyRotator] - Optional key rotator.
   */
  constructor(config = {}) {
    super('anthropic', {
      endpoint: config.endpoint || 'https://api.anthropic.com',
      authType: 'anthropic',
      envKey: config.envKey || 'ANTHROPIC_API_KEY',
      timeoutMs: config.timeoutMs,
      retry: config.retry,
      fetchImpl: config.fetchImpl,
      circuitBreaker: config.circuitBreaker,
      keyRotator: config.keyRotator,
      anthropicVersion: config.anthropicVersion || '2023-06-01'
    });
  }

  /**
   * Fetch raw model list from Anthropic API with pagination support.
   *
   * @param {object} options - List options.
   * @param {string} [options.after_id] - Pagination: return models after this ID.
   * @param {string} [options.before_id] - Pagination: return models before this ID.
   * @param {number} [options.limit] - Pagination: max models per request (default: 100).
   * @param {object} context - Internal operation context.
   * @returns {Promise<Array>} Raw model list from API.
   */
  async _listRaw(options = {}, context = {}) {
    const limit = Math.min(Number(options.limit) || 100, 100);
    const params = new URLSearchParams();

    params.set('limit', String(limit));

    if (options.after_id && typeof options.after_id === 'string') {
      params.set('after_id', options.after_id);
    }

    if (options.before_id && typeof options.before_id === 'string') {
      params.set('before_id', options.before_id);
    }

    const endpoint = `/v1/models?${params.toString()}`;
    const payload = await this._requestJson(endpoint, {}, context);

    // Extract model list from response
    const models = this._extractModelList(payload);

    // Store pagination info if needed for caller
    if (payload && typeof payload === 'object') {
      context.paginationInfo = {
        has_more: Boolean(payload.has_more),
        after_id: payload.after_id || null,
        before_id: payload.before_id || null
      };
    }

    return models;
  }

  /**
   * Fetch a single model by ID from Anthropic API.
   *
   * @param {string} id - Model identifier.
   * @param {object} options - Get options.
   * @param {object} context - Internal operation context.
   * @returns {Promise<object|null>} Raw model payload or null if not found.
   */
  async _getRaw(id, options = {}, context = {}) {
    const endpoint = `/v1/models/${encodeURIComponent(id)}`;

    try {
      const payload = await this._requestJson(endpoint, {}, context);
      return payload || null;
    } catch (error) {
      // Return null for 404 (model not found) instead of throwing
      if (error && error.code === 'MODEL_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Normalize Anthropic model payload to common schema.
   *
   * Anthropic API returns models with structure:
   * {
   *   id: string,
   *   type: 'model',
   *   display_name: string,
   *   created_at: ISO8601,
   *   deprecated_at: ISO8601 | null,
   *   input_tokens: number,
   *   output_tokens: number
   * }
   *
   * @param {object} raw - Raw Anthropic model payload.
   * @returns {object} Normalized model.
   */
  normalize(raw) {
    if (!raw || typeof raw !== 'object') {
      return {
        id: 'unknown',
        provider: 'anthropic'
      };
    }

    const normalized = {
      id: String(raw.id || 'unknown'),
      provider: 'anthropic',
      displayName: raw.display_name || raw.id || 'Unknown Model',
      contextTokens: Number.isFinite(raw.input_tokens) ? raw.input_tokens : undefined,
      outputTokens: Number.isFinite(raw.output_tokens) ? raw.output_tokens : undefined
    };

    // Mark as deprecated if deprecation date is set
    if (raw.deprecated_at) {
      normalized.deprecated = true;
    }

    return normalized;
  }

  /**
   * Derive capabilities from normalized Anthropic model.
   *
   * @param {object} model - Normalized model.
   * @returns {object} Capabilities map.
   */
  getCapabilities(model) {
    if (!model || typeof model !== 'object') {
      return {};
    }

    const capabilities = {
      streaming: true, // All Anthropic models support streaming
      tools: true,     // All current Anthropic models support tool use
      vision: false    // Default to false, can be overridden per model
    };

    // Vision support for specific models
    if (model.id && model.id.includes('vision')) {
      capabilities.vision = true;
    }

    // Reasoning support for specific models
    if (model.id && model.id.includes('thinking')) {
      capabilities.reasoning = true;
    }

    return capabilities;
  }
}

module.exports = {
  AnthropicAdapter
};
