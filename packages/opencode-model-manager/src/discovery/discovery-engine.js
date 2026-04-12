'use strict';

const { EventEmitter } = require('events');

const { OpenAIAdapter } = require('../adapters/openai');
const { AnthropicAdapter } = require('../adapters/anthropic');
const { GoogleAdapter } = require('../adapters/google');
const { GroqAdapter } = require('../adapters/groq');
const { CerebrasAdapter } = require('../adapters/cerebras');
const { NvidiaAdapter } = require('../adapters/nvidia');

const PROVIDER_ORDER = Object.freeze([
  'openai',
  'google',
  'groq',
  'cerebras',
  'nvidia',
  'anthropic'
]);

const ADAPTER_FACTORIES = {
  openai: () => new OpenAIAdapter(),
  anthropic: () => new AnthropicAdapter(),
  google: () => new GoogleAdapter(),
  groq: () => new GroqAdapter(),
  cerebras: () => new CerebrasAdapter(),
  nvidia: () => new NvidiaAdapter()
};

/**
 * DiscoveryEngine orchestrates provider adapters for model discovery.
 *
 * Events:
 * - models:discovered { models, errors }
 * - provider:failed { provider, error }
 */
class DiscoveryEngine extends EventEmitter {
  /**
   * @param {Object<string, {list: Function}>|Map<string, {list: Function}>} [adapters]
   */
  constructor(adapters = {}) {
    super();
    this.adapters = this._resolveAdapters(adapters);
  }

  /**
   * Discover models from all configured providers in parallel.
   *
   * @param {object} [options]
   * @returns {Promise<{models: Array, errors: Array<{provider: string, error: Error}>}>}
   */
  async discover(options = {}) {
    const providerEntries = PROVIDER_ORDER.map((providerId) => [providerId, this.adapters[providerId]]);

    const settled = await Promise.allSettled(
      providerEntries.map(async ([providerId, adapter]) => {
        if (!adapter || typeof adapter.list !== 'function') {
          throw new Error(`Adapter for "${providerId}" must implement list(options)`);
        }

        const models = await adapter.list(options);

        if (!Array.isArray(models)) {
          throw new Error(`Adapter "${providerId}" returned a non-array model list`);
        }

        return {
          providerId,
          models: models.map((model) => this._attachProvider(model, providerId))
        };
      })
    );

    const models = [];
    const errors = [];

    for (let i = 0; i < settled.length; i += 1) {
      const providerId = providerEntries[i][0];
      const result = settled[i];

      if (result.status === 'fulfilled') {
        models.push(...result.value.models);
        continue;
      }

      const error = result.reason instanceof Error
        ? result.reason
        : new Error(String(result.reason || 'Unknown discovery error'));
      const providerError = { provider: providerId, error };

      errors.push(providerError);

      console.warn(
        `[DiscoveryEngine] Failed to discover models from ${providerId}: ${error.message}`
      );
      this.emit('provider:failed', providerError);
    }

    const discoveryResult = { models, errors };
    this.emit('models:discovered', discoveryResult);

    return discoveryResult;
  }

  /**
   * @param {Object<string, any>|Map<string, any>} adapters
   * @returns {Object<string, any>}
   */
  _resolveAdapters(adapters) {
    const provided = adapters instanceof Map
      ? Object.fromEntries(adapters)
      : (adapters && typeof adapters === 'object' ? adapters : {});
    const resolved = {};

    for (const providerId of PROVIDER_ORDER) {
      resolved[providerId] = provided[providerId] || ADAPTER_FACTORIES[providerId]();
    }

    return resolved;
  }

  /**
   * @param {Record<string, unknown>} model
   * @param {string} providerId
   * @returns {object}
   */
  _attachProvider(model, providerId) {
    if (!model || typeof model !== 'object') {
      return {
        id: String(model || ''),
        provider: providerId
      };
    }

    if (typeof model.provider === 'string' && model.provider.length > 0) {
      return model;
    }

    return {
      ...model,
      provider: providerId
    };
  }
}

module.exports = {
  DiscoveryEngine,
  PROVIDER_ORDER
};
