// @ts-nocheck
const { describe, test, expect, beforeEach, afterEach } = require('bun:test');

const { NvidiaAdapter } = require('../../src/adapters/nvidia');
const { AdapterError } = require('../../src/adapters/base-adapter');

const TEST_ENV_KEY = 'NVIDIA_API_KEY';

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

describe('NvidiaAdapter', () => {
  beforeEach(() => {
    delete process.env[TEST_ENV_KEY];
  });

  afterEach(() => {
    delete process.env[TEST_ENV_KEY];
  });

  test('initializes with correct provider ID and defaults', () => {
    process.env[TEST_ENV_KEY] = 'test-key';
    const adapter = new NvidiaAdapter();

    expect(adapter.providerId).toBe('nvidia');
    expect(adapter.config.endpoint).toBe('https://integrate.api.nvidia.com');
    expect(adapter.config.authType).toBe('bearer');
    expect(adapter.config.envKey).toBe('NVIDIA_API_KEY');
  });

  test('lists all NVIDIA models with OpenAI-compatible response', async () => {
    process.env[TEST_ENV_KEY] = 'test-secret';

    const requestLog = [];
    const fetchImpl = async (url, options) => {
      requestLog.push({ url, options });

      if (url.includes('/v1/models')) {
        return jsonResponse({
          data: [
            {
              id: 'nvidia/llama-3.1-nemotron-70b-instruct',
              object: 'model',
              created: 1704067200,
              owned_by: 'nvidia',
              context_window: 131072,
              deprecated: false
            },
            {
              id: 'nvidia/mistral-nemo-12b-instruct',
              object: 'model',
              created: 1704067200,
              owned_by: 'nvidia',
              context_window: 131072,
              deprecated: false
            }
          ]
        });
      }

      return jsonResponse({ message: 'not found' }, { status: 404 });
    };

    const adapter = new NvidiaAdapter({
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    const models = await adapter.list();

    expect(models.length).toBe(2);
    expect(models[0].id).toBe('nvidia/llama-3.1-nemotron-70b-instruct');
    expect(models[0].contextTokens).toBe(131072);
    expect(models[1].id).toBe('nvidia/mistral-nemo-12b-instruct');
    expect(models[1].contextTokens).toBe(131072);

    expect(requestLog[0].options.headers.Authorization).toBe('Bearer test-secret');
    expect(requestLog[0].url).toContain('/v1/models');
  });

  test('handles OpenAI-compatible data array format', async () => {
    process.env[TEST_ENV_KEY] = 'test-key';

    const fetchImpl = async () => {
      return jsonResponse({
        data: [
          {
            id: 'nvidia/llama-3.1-8b-instruct',
            context_window: 8192,
            object: 'model',
            created: 1704067200,
            owned_by: 'nvidia'
          }
        ]
      });
    };

    const adapter = new NvidiaAdapter({
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    const models = await adapter.list();

    expect(models.length).toBe(1);
    expect(models[0].id).toBe('nvidia/llama-3.1-8b-instruct');
    expect(models[0].contextTokens).toBe(8192);
  });

  test('extracts context window from context_window field', async () => {
    process.env[TEST_ENV_KEY] = 'test-key';

    const fetchImpl = async () => {
      return jsonResponse({
        data: [
          {
            id: 'model-with-context',
            context_window: 128000
          }
        ]
      });
    };

    const adapter = new NvidiaAdapter({
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    const models = await adapter.list();

    expect(models[0].contextTokens).toBe(128000);
  });

  test('falls back to max_tokens if context_window is missing', async () => {
    process.env[TEST_ENV_KEY] = 'test-key';

    const fetchImpl = async () => {
      return jsonResponse({
        data: [
          {
            id: 'model-with-max-tokens',
            max_tokens: 4096
          }
        ]
      });
    };

    const adapter = new NvidiaAdapter({
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    const models = await adapter.list();

    expect(models[0].contextTokens).toBe(4096);
  });

  test('returns null for context tokens if neither field is present', async () => {
    process.env[TEST_ENV_KEY] = 'test-key';

    const fetchImpl = async () => {
      return jsonResponse({
        data: [
          {
            id: 'model-without-context'
          }
        ]
      });
    };

    const adapter = new NvidiaAdapter({
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    const models = await adapter.list();

    expect(models[0].contextTokens).toBeNull();
  });

  test('gets single model by ID', async () => {
    process.env[TEST_ENV_KEY] = 'test-key';

    const fetchImpl = async (url) => {
      if (url.includes('/v1/models/nvidia/llama-3.1-nemotron-70b-instruct')) {
        return jsonResponse({
          id: 'nvidia/llama-3.1-nemotron-70b-instruct',
          object: 'model',
          created: 1704067200,
          owned_by: 'nvidia',
          context_window: 131072,
          deprecated: false
        });
      }

      return jsonResponse({ message: 'not found' }, { status: 404 });
    };

    const adapter = new NvidiaAdapter({
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    const model = await adapter.get('nvidia/llama-3.1-nemotron-70b-instruct');

    expect(model).not.toBeNull();
    expect(model.id).toBe('nvidia/llama-3.1-nemotron-70b-instruct');
    expect(model.contextTokens).toBe(131072);
  });

  test('returns null for non-existent model', async () => {
    process.env[TEST_ENV_KEY] = 'test-key';

    const fetchImpl = async () => {
      return jsonResponse({ message: 'not found' }, { status: 404 });
    };

    const adapter = new NvidiaAdapter({
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    const model = await adapter.get('non-existent-model');

    expect(model).toBeNull();
  });

  test('throws error when API key is missing', async () => {
    delete process.env[TEST_ENV_KEY];

    const adapter = new NvidiaAdapter({
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    await expect(adapter.list()).rejects.toThrow(AdapterError);
  });

  test('throws error when response is not valid JSON', async () => {
    process.env[TEST_ENV_KEY] = 'test-key';

    const fetchImpl = async () => {
      return jsonResponse({ message: 'Invalid response' }, { status: 500 });
    };

    const adapter = new NvidiaAdapter({
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    await expect(adapter.list()).rejects.toThrow(AdapterError);
  });

  test('normalizes deprecated flag correctly', async () => {
    process.env[TEST_ENV_KEY] = 'test-key';

    const fetchImpl = async () => {
      return jsonResponse({
        data: [
          {
            id: 'deprecated-model',
            context_window: 4096,
            deprecated: true
          },
          {
            id: 'active-model',
            context_window: 4096,
            deprecated: false
          }
        ]
      });
    };

    const adapter = new NvidiaAdapter({
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    const models = await adapter.list();

    expect(models[0].deprecated).toBe(true);
    expect(models[1].deprecated).toBe(false);
  });

  test('applies Bearer token authentication', async () => {
    process.env[TEST_ENV_KEY] = 'my-secret-token';

    const requestLog = [];
    const fetchImpl = async (url, options) => {
      requestLog.push({ url, options });
      return jsonResponse({ data: [] });
    };

    const adapter = new NvidiaAdapter({
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    await adapter.list();

    expect(requestLog[0].options.headers.Authorization).toBe('Bearer my-secret-token');
  });

  test('throws error for invalid model payload', async () => {
    process.env[TEST_ENV_KEY] = 'test-key';

    const adapter = new NvidiaAdapter({
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    expect(() => adapter.normalize(null)).toThrow(AdapterError);
    expect(() => adapter.normalize({})).toThrow(AdapterError);
    expect(() => adapter.normalize({ id: '' })).toThrow(AdapterError);
  });

  test('preserves additional metadata in normalized model', async () => {
    process.env[TEST_ENV_KEY] = 'test-key';

    const fetchImpl = async () => {
      return jsonResponse({
        data: [
          {
            id: 'test-model',
            object: 'model',
            created: 1704067200,
            owned_by: 'nvidia',
            context_window: 8192
          }
        ]
      });
    };

    const adapter = new NvidiaAdapter({
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    const models = await adapter.list();

    expect(models[0].object).toBe('model');
    expect(models[0].created).toBe(1704067200);
    expect(models[0].ownedBy).toBe('nvidia');
  });
});
