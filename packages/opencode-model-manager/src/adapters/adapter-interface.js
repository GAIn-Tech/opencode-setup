'use strict';

/**
 * @typedef {Object} AdapterModelCapabilities
 * @property {boolean} [streaming] - Supports streaming output.
 * @property {boolean} [tools] - Supports tool/function calling.
 * @property {boolean} [vision] - Supports image input.
 * @property {boolean} [reasoning] - Supports reasoning mode.
 * @property {Object<string, boolean|number|string>} [extra] - Provider-specific capability flags.
 */

/**
 * @typedef {Object} NormalizedProviderModel
 * @property {string} id - Stable model identifier.
 * @property {string} [provider] - Provider identifier.
 * @property {string} [displayName] - Human-friendly model name.
 * @property {number} [contextTokens] - Maximum input context tokens.
 * @property {number} [outputTokens] - Maximum output tokens.
 * @property {boolean} [deprecated] - Whether the model is deprecated.
 * @property {AdapterModelCapabilities} [capabilities] - Normalized capability map.
 */

/**
 * @typedef {Object} AdapterListOptions
 * @property {AbortSignal} [signal] - Optional external cancellation signal.
 */

/**
 * @typedef {Object} AdapterGetOptions
 * @property {AbortSignal} [signal] - Optional external cancellation signal.
 */

const REQUIRED_ADAPTER_METHODS = ['list', 'get', 'normalize', 'getCapabilities'];

/**
 * Interface-level error for invalid adapter implementations.
 */
class AdapterInterfaceError extends Error {
  /**
   * @param {string} message - Error message.
   */
  constructor(message) {
    super(message);
    this.name = 'AdapterInterfaceError';
  }
}

/**
 * @interface
 * Provider adapter contract used by model management workflows.
 *
 * Implementations must be stateless and deterministic:
 * - No in-memory caching at adapter layer
 * - No provider-specific side effects outside API calls
 * - Normalization must produce a consistent schema
 */
class ProviderAdapterInterface {
  /**
   * @param {string} providerId - Provider identifier (for logs and errors).
   */
  constructor(providerId) {
    this.providerId = providerId;
  }

  /**
   * Validate that an object implements all required adapter methods.
   *
   * @param {object} adapter - Adapter instance to validate.
   * @throws {AdapterInterfaceError} When required methods are missing.
   */
  static assertImplementation(adapter) {
    for (const methodName of REQUIRED_ADAPTER_METHODS) {
      if (typeof adapter?.[methodName] !== 'function') {
        throw new AdapterInterfaceError(
          `Adapter must implement method "${methodName}()"`
        );
      }
    }
  }

  /**
   * List all models available from the provider.
   *
   * @param {AdapterListOptions} [options] - Read options.
   * @returns {Promise<NormalizedProviderModel[]>} Normalized model list.
   */
  async list(options = {}) {
    void options;
    throw new AdapterInterfaceError('list() must be implemented by subclass');
  }

  /**
   * Get one model by ID.
   *
   * @param {string} id - Provider model ID.
   * @param {AdapterGetOptions} [options] - Read options.
   * @returns {Promise<NormalizedProviderModel|null>} Normalized model or null.
   */
  async get(id, options = {}) {
    void id;
    void options;
    throw new AdapterInterfaceError('get() must be implemented by subclass');
  }

  /**
   * Convert one provider-native model object into normalized schema.
   *
   * @param {unknown} raw - Provider-native model object.
   * @returns {NormalizedProviderModel} Normalized model.
   */
  normalize(raw) {
    void raw;
    throw new AdapterInterfaceError('normalize() must be implemented by subclass');
  }

  /**
   * Derive normalized capabilities from a normalized model object.
   *
   * @param {NormalizedProviderModel} model - Normalized model.
   * @returns {AdapterModelCapabilities} Capability map for downstream routing.
   */
  getCapabilities(model) {
    void model;
    throw new AdapterInterfaceError('getCapabilities() must be implemented by subclass');
  }
}

module.exports = {
  ProviderAdapterInterface,
  AdapterInterfaceError,
  REQUIRED_ADAPTER_METHODS
};
