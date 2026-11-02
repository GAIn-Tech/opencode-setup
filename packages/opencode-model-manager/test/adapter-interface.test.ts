// @ts-nocheck
const { describe, test, expect, beforeEach, afterEach } = require('bun:test');

const {
  ProviderAdapterInterface,
  AdapterInterfaceError
} = require('../src/adapters/adapter-interface');
const {
  BaseAdapter,
  AdapterError
} = require('../src/adapters/base-adapter');

const TEST_ENV_KEY = 'MODEL_MANAGER_TEST_API_KEY';

class MockAdapter extends BaseAdapter {
  async _listRaw(options, context) {
    void options;
    const payload = await this._requestJson('/models', { method: 'GET' }, context);
    return this._extractModelList(payload);
  }

  async _getRaw(id, options, context) {
    void options;
    const payload = await this._requestJson(`/models/${id}`, { method: 'GET' }, context);
    return payload?.model || payload || null;
  }

  normalize(raw) {
    return {
      id: raw.id,
      provider: this.providerId,
      contextTokens: raw.contextTokens || 0,
      outputTokens: raw.outputTokens || 0,
      capabilities: raw.capabilities || { streaming: false }
    };
  }

  getCapabilities(model) {
    return model.capabilities || { streaming: false };
  }
}

function jsonResponse(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    statusText: init.statusText,
    headers
  });
}

describe('Provider adapter interface and base adapter', () => {
  beforeEach(() => {
    delete process.env[TEST_ENV_KEY];
  });

  afterEach(() => {
    delete process.env[TEST_ENV_KEY];
  });

  test('enforces required interface methods', () => {
    expect(() => ProviderAdapterInterface.assertImplementation({})).toThrow(AdapterInterfaceError);

    const validAdapter = {
      list: async () => [],
      get: async () => null,
      normalize: () => ({}),
      getCapabilities: () => ({})
    };

    expect(() => ProviderAdapterInterface.assertImplementation(validAdapter)).not.toThrow();
  });

  test('base interface methods throw when not implemented', async () => {
    const adapter = new ProviderAdapterInterface('test-provider');

    await expect(adapter.list()).rejects.toThrow(AdapterInterfaceError);
    await expect(adapter.get('model-id')).rejects.toThrow(AdapterInterfaceError);
    expect(() => adapter.normalize({})).toThrow(AdapterInterfaceError);
    expect(() => adapter.getCapabilities({ id: 'x' })).toThrow(AdapterInterfaceError);
  });

  test('handles bearer auth and normalizes list/get responses', async () => {
    process.env[TEST_ENV_KEY] = 'test-secret';

    const requestLog = [];
    const fetchImpl = async (url, options) => {
      requestLog.push({ url, options });

      if (url.endsWith('/models')) {
        return jsonResponse({
          models: [
            { id: 'model-a', contextTokens: 1000, outputTokens: 500, capabilities: { streaming: true } }
          ]
        });
      }

      if (url.endsWith('/models/model-a')) {
        return jsonResponse({ id: 'model-a', contextTokens: 1000, outputTokens: 500, capabilities: { streaming: true } });
      }

      return jsonResponse({ message: 'not found' }, { status: 404 });
    };

    const adapter = new MockAdapter('openai', {
      endpoint: 'https://api.example.com',
      authType: 'bearer',
      envKey: TEST_ENV_KEY,
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    const list = await adapter.list();
    const model = await adapter.get('model-a');

    expect(list.length).toBe(1);
    expect(list[0]).toEqual({
      id: 'model-a',
      provider: 'openai',
      contextTokens: 1000,
      outputTokens: 500,
      capabilities: { streaming: true }
    });
    expect(model.id).toBe('model-a');
    expect(requestLog[0].options.headers.Authorization).toBe('Bearer test-secret');
    expect(requestLog[1].options.headers.Authorization).toBe('Bearer test-secret');
  });

  test('supports query auth mode from provider config pattern', async () => {
    process.env[TEST_ENV_KEY] = 'query-secret';

    const fetchImpl = async (url) => {
      expect(url).toContain('key=query-secret');
      return jsonResponse({ models: [{ id: 'query-model' }] });
    };

    const adapter = new MockAdapter('google', {
      endpoint: 'https://api.example.com',
      authType: 'query',
      envKey: TEST_ENV_KEY,
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    const list = await adapter.list();
    expect(list[0].id).toBe('query-model');
  });

  test('retries retryable HTTP errors and succeeds on next attempt', async () => {
    process.env[TEST_ENV_KEY] = 'retry-secret';

    let attempts = 0;
    const fetchImpl = async () => {
      attempts += 1;

      if (attempts === 1) {
        return jsonResponse({ error: { message: 'temporary outage' } }, { status: 500 });
      }

      return jsonResponse({ models: [{ id: 'model-recovered' }] }, { status: 200 });
    };

    const adapter = new MockAdapter('nvidia', {
      endpoint: 'https://api.example.com',
      authType: 'bearer',
      envKey: TEST_ENV_KEY,
      fetchImpl,
      retry: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    const list = await adapter.list();
    expect(attempts).toBe(2);
    expect(list[0].id).toBe('model-recovered');
  });

  test('normalizes network errors into AdapterError', async () => {
    process.env[TEST_ENV_KEY] = 'network-secret';

    const fetchImpl = async () => {
      const error = new Error('socket hang up');
      error.code = 'ECONNRESET';
      throw error;
    };

    const adapter = new MockAdapter('groq', {
      endpoint: 'https://api.example.com',
      authType: 'bearer',
      envKey: TEST_ENV_KEY,
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    try {
      await adapter.list();
      throw new Error('Expected adapter.list() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.retryable).toBe(true);
    }
  });

  test('enforces timeout handling for all I/O calls', async () => {
    process.env[TEST_ENV_KEY] = 'timeout-secret';

    const fetchImpl = async (_url, options) => {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    };

    const adapter = new MockAdapter('anthropic', {
      endpoint: 'https://api.example.com',
      authType: 'anthropic',
      envKey: TEST_ENV_KEY,
      timeoutMs: 20,
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    await expect(adapter.list()).rejects.toMatchObject({
      name: 'AdapterError',
      code: 'REQUEST_TIMEOUT'
    });
  });

  test('integrates with key-rotator style circuit breaker hooks', async () => {
    const calls = {
      success: [],
      failure: [],
      release: [],
      selections: 0
    };

    const rotator = {
      async getNextKey() {
        calls.selections += 1;
        return { id: 'key-provider-1', value: 'rotated-key' };
      },
      recordSuccess(keyId) {
        calls.success.push(keyId);
      },
      recordFailure(keyId, payload) {
        calls.failure.push({ keyId, payload });
      },
      releaseInFlight(keyId) {
        calls.release.push(keyId);
      }
    };

    const fetchImpl = async (_url, options) => {
      expect(options.headers.Authorization).toBe('Bearer rotated-key');
      return jsonResponse({ models: [{ id: 'rotated-model' }] });
    };

    const adapter = new MockAdapter('cerebras', {
      endpoint: 'https://api.example.com',
      authType: 'bearer',
      keyRotator: rotator,
      circuitBreaker: rotator,
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    const list = await adapter.list();
    expect(list[0].id).toBe('rotated-model');
    expect(calls.selections).toBe(1);
    expect(calls.success).toEqual(['key-provider-1']);
    expect(calls.release).toEqual(['key-provider-1']);
  });

  test('records failure hook data for retry-aware circuit integration', async () => {
    const calls = {
      failure: [],
      release: []
    };

    const rotator = {
      async getNextKey() {
        return { id: 'key-provider-2', value: 'rotated-key-fail' };
      },
      recordFailure(keyId, payload) {
        calls.failure.push({ keyId, payload });
      },
      releaseInFlight(keyId) {
        calls.release.push(keyId);
      }
    };

    const fetchImpl = async () => {
      return jsonResponse(
        { error: { message: 'rate limited' } },
        { status: 429, headers: { 'retry-after': '1' } }
      );
    };

    const adapter = new MockAdapter('groq', {
      endpoint: 'https://api.example.com',
      authType: 'bearer',
      keyRotator: rotator,
      circuitBreaker: rotator,
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    await expect(adapter.list()).rejects.toBeInstanceOf(AdapterError);
    expect(calls.failure.length).toBe(1);
    expect(calls.failure[0].keyId).toBe('key-provider-2');
    expect(calls.failure[0].payload.statusCode).toBe(429);
    expect(calls.release).toEqual(['key-provider-2']);
  });
});
