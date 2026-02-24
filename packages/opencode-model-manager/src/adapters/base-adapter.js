'use strict';

const {
  ProviderAdapterInterface,
  AdapterInterfaceError
} = require('./adapter-interface');

const RETRYABLE_HTTP_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT'
]);

/**
 * Standardized adapter error.
 */
class AdapterError extends Error {
  /**
   * @param {string} message - Human-readable message.
   * @param {object} [options] - Structured error details.
   * @param {string} [options.providerId] - Provider identifier.
   * @param {string} [options.code] - Stable error code.
   * @param {number|null} [options.statusCode] - HTTP status code when relevant.
   * @param {boolean} [options.retryable] - Whether retry is allowed.
   * @param {number|null} [options.retryAfterMs] - Retry delay from provider headers.
   * @param {string|null} [options.operation] - Adapter operation name.
   * @param {number|null} [options.attempt] - Current attempt number.
   * @param {object} [options.details] - Optional structured details.
   * @param {Error} [options.cause] - Underlying error.
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'AdapterError';
    this.providerId = options.providerId || 'unknown';
    this.code = options.code || 'ADAPTER_ERROR';
    this.statusCode = Number.isFinite(options.statusCode) ? options.statusCode : null;
    this.retryable = Boolean(options.retryable);
    this.retryAfterMs = Number.isFinite(options.retryAfterMs) ? options.retryAfterMs : null;
    this.operation = options.operation || null;
    this.attempt = Number.isFinite(options.attempt) ? options.attempt : null;
    this.details = options.details || {};

    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

/**
 * Base provider adapter with shared request resilience.
 *
 * This class intentionally keeps provider behavior abstract:
 * subclasses define provider-specific endpoints and normalization,
 * while the base class provides auth, timeout, retry, and failure hooks.
 */
class BaseAdapter extends ProviderAdapterInterface {
  /**
   * @param {string} providerId - Provider identifier.
   * @param {object} [config] - Adapter configuration.
   * @param {string} [config.endpoint] - Provider base endpoint.
   * @param {string} [config.authType] - Auth strategy: bearer, anthropic, query, header, none.
   * @param {string} [config.envKey] - Environment variable containing API key(s).
   * @param {number} [config.timeoutMs] - Per-request timeout in milliseconds.
   * @param {object} [config.retry] - Retry configuration.
   * @param {number} [config.retry.maxAttempts] - Total attempts including first try.
   * @param {number} [config.retry.baseDelayMs] - Exponential backoff base delay.
   * @param {number} [config.retry.maxDelayMs] - Maximum backoff delay.
   * @param {number} [config.retry.jitterMs] - Random jitter added to delay.
   * @param {Function} [config.fetchImpl] - Optional fetch implementation.
   * @param {object} [config.circuitBreaker] - Failure hook target (recordFailure/recordSuccess/execute).
   * @param {object} [config.keyRotator] - IntelligentRotator-compatible key manager.
   */
  constructor(providerId, config = {}) {
    super(providerId);

    if (!providerId || typeof providerId !== 'string') {
      throw new AdapterInterfaceError('providerId is required');
    }

    const retryConfig = config.retry || {};

    this.config = {
      endpoint: config.endpoint || '',
      authType: config.authType || 'bearer',
      envKey: config.envKey || null,
      timeoutMs: Number(config.timeoutMs) || 10000,
      retry: {
        maxAttempts: Math.max(1, Number(retryConfig.maxAttempts) || 3),
        baseDelayMs: Math.max(0, Number(retryConfig.baseDelayMs) || 250),
        maxDelayMs: Math.max(0, Number(retryConfig.maxDelayMs) || 2000),
        jitterMs: Math.max(0, Number(retryConfig.jitterMs) || 50)
      },
      queryKeyParam: config.queryKeyParam || 'key',
      customAuthHeader: config.customAuthHeader || 'x-api-key',
      anthropicVersion: config.anthropicVersion || '2023-06-01'
    };

    this.fetchImpl = typeof config.fetchImpl === 'function' ? config.fetchImpl : globalThis.fetch;
    this.circuitBreaker = config.circuitBreaker || null;
    this.keyRotator = config.keyRotator || null;
  }

  /**
   * List provider models and normalize each model.
   *
   * @param {import('./adapter-interface').AdapterListOptions} [options] - List options.
   * @returns {Promise<import('./adapter-interface').NormalizedProviderModel[]>} Normalized model list.
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

      return rawModels.map((rawModel) => {
        const normalized = this.normalize(rawModel);
        const capabilities = this.getCapabilities(normalized);
        if (capabilities && typeof capabilities === 'object') {
          normalized.capabilities = capabilities;
        }
        return normalized;
      });
    });
  }

  /**
   * Get one provider model by ID and normalize it.
   *
   * @param {string} id - Provider model identifier.
   * @param {import('./adapter-interface').AdapterGetOptions} [options] - Get options.
   * @returns {Promise<import('./adapter-interface').NormalizedProviderModel|null>} Normalized model or null.
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
      const capabilities = this.getCapabilities(normalized);
      if (capabilities && typeof capabilities === 'object') {
        normalized.capabilities = capabilities;
      }

      return normalized;
    });
  }

  /**
   * Normalize provider-specific model payload.
   *
   * @param {unknown} raw - Provider-native model payload.
   * @returns {import('./adapter-interface').NormalizedProviderModel} Normalized model.
   */
  normalize(raw) {
    void raw;
    throw new AdapterInterfaceError('normalize() must be implemented by subclass');
  }

  /**
   * Derive capabilities from normalized model payload.
   *
   * @param {import('./adapter-interface').NormalizedProviderModel} model - Normalized model.
   * @returns {import('./adapter-interface').AdapterModelCapabilities} Normalized capabilities.
   */
  getCapabilities(model) {
    return model?.capabilities || {};
  }

  /**
   * Subclass hook: fetch raw model list.
   *
   * @param {import('./adapter-interface').AdapterListOptions} options - List options.
   * @param {object} context - Internal operation context.
   * @returns {Promise<Array>} Raw model payload list.
   */
  async _listRaw(options, context) {
    void options;
    void context;
    throw new AdapterInterfaceError('_listRaw() must be implemented by subclass');
  }

  /**
   * Subclass hook: fetch one raw model.
   *
   * @param {string} id - Provider model ID.
   * @param {import('./adapter-interface').AdapterGetOptions} options - Get options.
   * @param {object} context - Internal operation context.
   * @returns {Promise<object|null>} Raw provider model.
   */
  async _getRaw(id, options, context) {
    void id;
    void options;
    void context;
    throw new AdapterInterfaceError('_getRaw() must be implemented by subclass');
  }

  /**
   * Execute an adapter operation with retries and circuit breaker hooks.
   *
   * @param {string} operation - Operation name.
   * @param {object} options - Operation options.
   * @param {Function} fn - Operation callback.
   * @returns {Promise<unknown>} Operation result.
   */
  async _runOperation(operation, options, fn) {
    const maxAttempts = this.config.retry.maxAttempts;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const context = {
        operation,
        attempt,
        signal: options?.signal,
        keyId: null,
        responseHeaders: null
      };

      try {
        const result = await this._executeWithCircuitBreaker(
          () => fn(context),
          context
        );
        this._recordSuccess(context);
        return result;
      } catch (error) {
        const normalizedError = this._normalizeError(error, context);
        lastError = normalizedError;
        this._recordFailure(context, normalizedError);

        const hasAttemptsLeft = attempt < maxAttempts;
        if (!normalizedError.retryable || !hasAttemptsLeft) {
          throw normalizedError;
        }

        const backoffMs = this._resolveRetryDelayMs(normalizedError, attempt);
        await this._sleep(backoffMs);
      } finally {
        this._releaseKey(context);
      }
    }

    throw lastError || new AdapterError(`Adapter operation failed: ${operation}`, {
      providerId: this.providerId,
      code: 'OPERATION_FAILED',
      retryable: false,
      operation
    });
  }

  /**
   * Execute function through optional circuit breaker interface.
   *
   * @param {Function} fn - Operation callback.
   * @param {object} context - Operation context.
   * @returns {Promise<unknown>} Callback result.
   */
  async _executeWithCircuitBreaker(fn, context) {
    void context;
    if (this.circuitBreaker && typeof this.circuitBreaker.execute === 'function') {
      return this.circuitBreaker.execute(fn);
    }
    return fn();
  }

  /**
   * Perform a JSON request with timeout and auth handling.
   *
   * @param {string} endpointOrPath - Absolute URL or path relative to config.endpoint.
   * @param {object} [requestOptions] - Fetch options.
   * @param {object} [context] - Internal operation context.
   * @returns {Promise<any>} Parsed JSON payload.
   */
  async _requestJson(endpointOrPath, requestOptions = {}, context = {}) {
    if (typeof this.fetchImpl !== 'function') {
      throw new AdapterError('fetch implementation is not available', {
        providerId: this.providerId,
        code: 'FETCH_UNAVAILABLE',
        retryable: false,
        operation: context.operation
      });
    }

    const authContext = await this._resolveAuthContext();
    context.keyId = authContext.keyId;

    const method = String(requestOptions.method || 'GET').toUpperCase();
    const url = this._resolveUrl(endpointOrPath);
    const headers = { ...(requestOptions.headers || {}) };
    const resolvedUrl = this._applyAuth(url, headers, authContext.apiKey);

    const controller = new AbortController();
    const timeoutMs = Number(requestOptions.timeoutMs || this.config.timeoutMs);
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const removeSignalBridge = this._bridgeAbortSignal(context.signal, controller);

    let response;
    try {
      response = await this.fetchImpl(resolvedUrl, {
        ...requestOptions,
        method,
        headers,
        signal: controller.signal
      });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new AdapterError(`Request timed out after ${timeoutMs}ms`, {
          providerId: this.providerId,
          code: 'REQUEST_TIMEOUT',
          retryable: true,
          operation: context.operation,
          attempt: context.attempt,
          cause: error
        });
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
      removeSignalBridge();
    }

    context.responseHeaders = this._headersToObject(response.headers);

    if (!response.ok) {
      const body = await this._readResponseBody(response);
      throw this._createHttpError(response.status, response.statusText, body, context);
    }

    return this._readResponseBody(response);
  }

  /**
   * Extract a model list array from common provider response shapes.
   *
   * @param {unknown} payload - Parsed JSON payload.
   * @returns {Array} Raw model list.
   */
  _extractModelList(payload) {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (payload && typeof payload === 'object') {
      if (Array.isArray(payload.models)) return payload.models;
      if (Array.isArray(payload.data)) return payload.data;
      if (Array.isArray(payload.items)) return payload.items;
    }

    return [];
  }

  /**
   * Convert unknown errors into normalized AdapterError instances.
   *
   * @param {unknown} error - Unknown thrown value.
   * @param {object} context - Internal operation context.
   * @returns {AdapterError} Normalized error.
   */
  _normalizeError(error, context) {
    if (error instanceof AdapterError) {
      if (!error.operation) error.operation = context.operation;
      if (!error.attempt) error.attempt = context.attempt;
      if (!error.providerId || error.providerId === 'unknown') {
        error.providerId = this.providerId;
      }
      return error;
    }

    if (error && error.name === 'AbortError') {
      return new AdapterError('Request aborted', {
        providerId: this.providerId,
        code: 'REQUEST_ABORTED',
        retryable: true,
        operation: context.operation,
        attempt: context.attempt,
        cause: error
      });
    }

    if (error && RETRYABLE_NETWORK_CODES.has(error.code)) {
      return new AdapterError(error.message || 'Network error', {
        providerId: this.providerId,
        code: 'NETWORK_ERROR',
        retryable: true,
        operation: context.operation,
        attempt: context.attempt,
        details: { networkCode: error.code },
        cause: error
      });
    }

    return new AdapterError(error?.message || 'Unknown adapter error', {
      providerId: this.providerId,
      code: 'UNKNOWN_ADAPTER_ERROR',
      retryable: false,
      operation: context.operation,
      attempt: context.attempt,
      cause: error
    });
  }

  /**
   * Resolve API key using key rotator or environment variable.
   *
   * @returns {Promise<{apiKey: string|null, keyId: string|null}>} Auth context.
   */
  async _resolveAuthContext() {
    if (this.keyRotator && typeof this.keyRotator.getNextKey === 'function') {
      const selectedKey = await this.keyRotator.getNextKey();

      if (!selectedKey || !selectedKey.value) {
        throw new AdapterError(`No healthy API key available for ${this.providerId}`, {
          providerId: this.providerId,
          code: 'API_KEY_EXHAUSTED',
          retryable: true
        });
      }

      return {
        apiKey: selectedKey.value,
        keyId: selectedKey.id || null
      };
    }

    if (this.config.authType === 'none') {
      return { apiKey: null, keyId: null };
    }

    if (!this.config.envKey) {
      throw new AdapterError(`envKey is required for ${this.providerId} auth`, {
        providerId: this.providerId,
        code: 'AUTH_CONFIG_INVALID',
        retryable: false
      });
    }

    const raw = process.env[this.config.envKey];
    if (!raw) {
      throw new AdapterError(`No API key configured for ${this.providerId}`, {
        providerId: this.providerId,
        code: 'API_KEY_MISSING',
        retryable: false
      });
    }

    return {
      apiKey: raw.split(',')[0].trim(),
      keyId: null
    };
  }

  /**
   * Apply provider auth strategy to URL/headers.
   *
   * @param {string} url - Target URL.
   * @param {object} headers - Mutable request headers.
   * @param {string|null} apiKey - API key.
   * @returns {string} Final URL after auth injection.
   */
  _applyAuth(url, headers, apiKey) {
    const authType = this.config.authType;
    if (authType === 'none') {
      return url;
    }

    if (!apiKey) {
      throw new AdapterError(`No API key configured for ${this.providerId}`, {
        providerId: this.providerId,
        code: 'API_KEY_MISSING',
        retryable: false
      });
    }

    if (authType === 'bearer') {
      headers.Authorization = `Bearer ${apiKey}`;
      return url;
    }

    if (authType === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = this.config.anthropicVersion;
      return url;
    }

    if (authType === 'query') {
      const parsedUrl = new URL(url);
      parsedUrl.searchParams.set(this.config.queryKeyParam, apiKey);
      return parsedUrl.toString();
    }

    if (authType === 'header') {
      headers[this.config.customAuthHeader] = apiKey;
      return url;
    }

    throw new AdapterError(`Unsupported authType: ${authType}`, {
      providerId: this.providerId,
      code: 'AUTH_TYPE_UNSUPPORTED',
      retryable: false
    });
  }

  /**
   * Convert endpoint input into absolute URL.
   *
   * @param {string} endpointOrPath - Absolute URL or relative path.
   * @returns {string} Resolved URL.
   */
  _resolveUrl(endpointOrPath) {
    if (!endpointOrPath || typeof endpointOrPath !== 'string') {
      throw new AdapterError('endpointOrPath must be a non-empty string', {
        providerId: this.providerId,
        code: 'INVALID_ENDPOINT',
        retryable: false
      });
    }

    if (/^https?:\/\//i.test(endpointOrPath)) {
      return endpointOrPath;
    }

    if (!this.config.endpoint) {
      throw new AdapterError(`Base endpoint missing for ${this.providerId}`, {
        providerId: this.providerId,
        code: 'MISSING_BASE_ENDPOINT',
        retryable: false
      });
    }

    return new URL(endpointOrPath, this.config.endpoint).toString();
  }

  /**
   * Create a normalized HTTP error.
   *
   * @param {number} status - HTTP status code.
   * @param {string} statusText - HTTP status text.
   * @param {unknown} body - Parsed response body.
   * @param {object} context - Internal operation context.
   * @returns {AdapterError} Normalized error.
   */
  _createHttpError(status, statusText, body, context) {
    const retryAfterMs = this._extractRetryAfterMs(context.responseHeaders);
    const errorMessage = this._extractErrorMessage(body) || statusText || 'Request failed';
    const retryable = RETRYABLE_HTTP_STATUS.has(status);

    let code = 'HTTP_ERROR';
    if (status === 401 || status === 403) code = 'AUTH_ERROR';
    else if (status === 404) code = 'MODEL_NOT_FOUND';
    else if (status === 408) code = 'REQUEST_TIMEOUT';
    else if (status === 429) code = 'RATE_LIMITED';
    else if (status >= 500) code = 'PROVIDER_UNAVAILABLE';

    return new AdapterError(`HTTP ${status}: ${errorMessage}`, {
      providerId: this.providerId,
      code,
      statusCode: status,
      retryable,
      retryAfterMs,
      operation: context.operation,
      attempt: context.attempt,
      details: { body }
    });
  }

  /**
   * Read response body and parse JSON when possible.
   *
   * @param {Response} response - Fetch response.
   * @returns {Promise<any>} Parsed response body.
   */
  async _readResponseBody(response) {
    const contentType = response.headers?.get('content-type') || '';

    if (contentType.includes('application/json')) {
      return response.json();
    }

    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch (_) {
      return { message: text };
    }
  }

  /**
   * Parse retry-after hints from response headers.
   *
   * @param {object|null} headers - Header map.
   * @returns {number|null} Retry delay in milliseconds.
   */
  _extractRetryAfterMs(headers) {
    if (!headers) {
      return null;
    }

    const retryAfter = headers['retry-after'] || headers['x-ratelimit-reset'];
    if (!retryAfter) {
      return null;
    }

    const asNumber = Number.parseInt(String(retryAfter), 10);
    if (!Number.isFinite(asNumber)) {
      return null;
    }

    return asNumber > 1000 ? asNumber : asNumber * 1000;
  }

  /**
   * Determine sleep duration before next retry.
   *
   * @param {AdapterError} error - Normalized error.
   * @param {number} attempt - Current attempt number.
   * @returns {number} Delay in milliseconds.
   */
  _resolveRetryDelayMs(error, attempt) {
    if (Number.isFinite(error.retryAfterMs) && error.retryAfterMs > 0) {
      return error.retryAfterMs;
    }

    const base = this.config.retry.baseDelayMs * (2 ** (attempt - 1));
    const jitter = this.config.retry.jitterMs > 0
      ? Math.floor(Math.random() * this.config.retry.jitterMs)
      : 0;
    return Math.min(this.config.retry.maxDelayMs, base + jitter);
  }

  /**
   * Convert Headers instance to plain object with lowercase keys.
   *
   * @param {Headers|undefined} headers - Fetch headers instance.
   * @returns {object|null} Plain object headers.
   */
  _headersToObject(headers) {
    if (!headers || typeof headers.forEach !== 'function') {
      return null;
    }

    const result = {};
    headers.forEach((value, key) => {
      result[String(key).toLowerCase()] = value;
    });

    return result;
  }

  /**
   * Extract a useful message from provider error payload.
   *
   * @param {unknown} body - Provider response body.
   * @returns {string} Extracted message.
   */
  _extractErrorMessage(body) {
    if (!body) return '';
    if (typeof body === 'string') return body;

    if (typeof body === 'object') {
      if (typeof body.message === 'string') return body.message;
      if (typeof body.error === 'string') return body.error;
      if (typeof body.error?.message === 'string') return body.error.message;
      if (typeof body.detail === 'string') return body.detail;
    }

    return '';
  }

  /**
   * Bridge external abort signal into an internal AbortController.
   *
   * @param {AbortSignal|undefined} externalSignal - Optional caller signal.
   * @param {AbortController} controller - Internal controller.
   * @returns {Function} Cleanup callback.
   */
  _bridgeAbortSignal(externalSignal, controller) {
    if (!externalSignal) {
      return () => {};
    }

    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
      return () => {};
    }

    const onAbort = () => controller.abort(externalSignal.reason);
    externalSignal.addEventListener('abort', onAbort, { once: true });
    return () => externalSignal.removeEventListener('abort', onAbort);
  }

  /**
   * Forward success signal to configured breaker/rotator hooks.
   *
   * @param {object} context - Internal operation context.
   */
  _recordSuccess(context) {
    const hookTargets = this._getHookTargets();
    const hookId = context.keyId || this.providerId;

    for (const target of hookTargets) {
      if (typeof target.recordSuccess === 'function') {
        target.recordSuccess(hookId);
      }
    }
  }

  /**
   * Forward failure signal to configured breaker/rotator hooks.
   *
   * @param {object} context - Internal operation context.
   * @param {AdapterError} error - Normalized error.
   */
  _recordFailure(context, error) {
    const hookTargets = this._getHookTargets();
    const hookId = context.keyId || this.providerId;
    const retryAfterSec = Number.isFinite(error.retryAfterMs) && error.retryAfterMs > 0
      ? Math.ceil(error.retryAfterMs / 1000)
      : undefined;
    const payload = {
      message: error.message,
      detail: error.code,
      retryAfter: retryAfterSec,
      headers: context.responseHeaders,
      statusCode: error.statusCode
    };

    for (const target of hookTargets) {
      if (typeof target.recordFailure === 'function') {
        target.recordFailure(hookId, payload);
      }
    }
  }

  /**
   * Release in-flight key if rotator tracks concurrent usage.
   *
   * @param {object} context - Internal operation context.
   */
  _releaseKey(context) {
    const hookTargets = this._getHookTargets();
    if (!context.keyId) {
      return;
    }

    for (const target of hookTargets) {
      if (typeof target.releaseInFlight === 'function') {
        target.releaseInFlight(context.keyId);
      }
    }
  }

  /**
   * Collect unique breaker/rotator hook targets.
   *
   * @returns {Array<object>} Hook targets.
   */
  _getHookTargets() {
    const targets = [];
    if (this.circuitBreaker) targets.push(this.circuitBreaker);
    if (this.keyRotator) targets.push(this.keyRotator);
    return Array.from(new Set(targets));
  }

  /**
   * Sleep helper used for retry backoff.
   *
   * @param {number} delayMs - Delay duration in milliseconds.
   * @returns {Promise<void>} Promise resolved after delay.
   */
  async _sleep(delayMs) {
    if (!delayMs || delayMs <= 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

module.exports = {
  BaseAdapter,
  AdapterError
};
