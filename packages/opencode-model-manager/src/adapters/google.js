'use strict';

const { BaseAdapter, AdapterError } = require('./base-adapter');
const { ADAPTER_TIMEOUT_MS, GOOGLE_API_PAGE_SIZE } = require('../constants');

/**
 * Google Gemini API adapter for model discovery.
 *
 * Implements provider-specific logic for Google's Gemini model listing endpoint.
 * Handles pagination with pageToken and extracts rich metadata including
 * supportedGenerationMethods, inputTokenLimit, and outputTokenLimit.
 */
class GoogleAdapter extends BaseAdapter {
  /**
   * @param {object} [config] - Adapter configuration.
   * @param {string} [config.endpoint] - Base endpoint (default: https://generativelanguage.googleapis.com/v1beta).
   * @param {string} [config.envKey] - Environment variable for API key (default: GOOGLE_API_KEY).
   * @param {number} [config.timeoutMs] - Request timeout in milliseconds (default: 10000).
   * @param {object} [config.retry] - Retry configuration.
   * @param {Function} [config.fetchImpl] - Optional fetch implementation.
   * @param {object} [config.circuitBreaker] - Optional circuit breaker.
   * @param {object} [config.keyRotator] - Optional key rotator.
   */
  constructor(config = {}) {
    super('google', {
      endpoint: config.endpoint || 'https://generativelanguage.googleapis.com/v1beta',
      authType: 'query',
      envKey: config.envKey || 'GOOGLE_API_KEY',
      timeoutMs: config.timeoutMs || ADAPTER_TIMEOUT_MS,
      retry: config.retry,
      fetchImpl: config.fetchImpl,
      circuitBreaker: config.circuitBreaker,
      keyRotator: config.keyRotator
    });
  }

  /**
   * Fetch raw model list from Google Gemini API with pagination support.
   *
   * @param {object} options - List options.
   * @param {string} [options.pageToken] - Pagination token for fetching next page.
   * @param {number} [options.pageSize] - Number of models per page (default: 100).
   * @param {object} context - Internal operation context.
   * @returns {Promise<Array>} Raw model list from Google.
   */
  async _listRaw(options, context) {
    const pageSize = options?.pageSize || GOOGLE_API_PAGE_SIZE;
    const pageToken = options?.pageToken;

    // Build query parameters
    const queryParams = new URLSearchParams();
    queryParams.set('pageSize', String(pageSize));
    if (pageToken) {
      queryParams.set('pageToken', pageToken);
    }

    const endpoint = `/models?${queryParams.toString()}`;
    const payload = await this._requestJson(endpoint, {}, context);

    if (!payload || typeof payload !== 'object') {
      throw new AdapterError('Google API response is not an object', {
        providerId: this.providerId,
        code: 'INVALID_RESPONSE_FORMAT',
        retryable: false,
        operation: context.operation,
        details: { payload }
      });
    }

    const models = this._extractModelList(payload);

    if (!Array.isArray(models)) {
      throw new AdapterError('Google response did not contain model list', {
        providerId: this.providerId,
        code: 'INVALID_RESPONSE_FORMAT',
        retryable: false,
        operation: context.operation,
        details: { payload }
      });
    }

    // Store pagination token for potential follow-up requests
    if (payload.nextPageToken) {
      context.nextPageToken = payload.nextPageToken;
    }

    return models;
  }

  /**
   * Fetch one model by ID from Google Gemini API.
   *
   * @param {string} id - Model identifier (e.g., "models/gemini-pro").
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
   * Normalize Google Gemini model payload to common schema.
   *
   * Extracts displayName, inputTokenLimit, outputTokenLimit, and supportedGenerationMethods.
   *
   * @param {object} raw - Raw Google model payload.
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

    // Extract model ID from name field (e.g., "models/gemini-pro" -> "gemini-pro")
    const fullName = String(raw.name || '').trim();
    const id = fullName.replace(/^models\//, '');

    if (!id) {
      throw new AdapterError('Model missing required name field', {
        providerId: this.providerId,
        code: 'INVALID_MODEL_PAYLOAD',
        retryable: false,
        details: { raw }
      });
    }

    return {
      id,
      displayName: raw.displayName || id,
      contextTokens: raw.inputTokenLimit || null,
      outputTokens: raw.outputTokenLimit || null,
      supportedGenerationMethods: Array.isArray(raw.supportedGenerationMethods)
        ? raw.supportedGenerationMethods
        : [],
      // Preserve additional metadata for reference
      name: fullName,
      description: raw.description || null,
      version: raw.version || null
    };
  }

  /**
   * Derive capabilities from normalized Google model.
   *
   * @param {object} model - Normalized model.
   * @returns {object} Normalized capabilities.
   */
  getCapabilities(model) {
    const methods = model.supportedGenerationMethods || [];

    return {
      streaming: methods.includes('generateContentStream'),
      vision: methods.includes('generateContent') && (model.id.includes('vision') || model.displayName.includes('Vision')),
      functionCalling: methods.includes('generateContent'),
      textGeneration: methods.includes('generateContent'),
      supportedMethods: methods
    };
  }
}

module.exports = {
  GoogleAdapter
};
