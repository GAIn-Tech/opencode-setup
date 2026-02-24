// @ts-nocheck
const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const { GroqAdapter } = require('../../src/adapters/groq');
const { AdapterError } = require('../../src/adapters/base-adapter');

const TEST_ENV_KEY = 'GROQ_API_KEY';

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

describe('GroqAdapter', () => {
  beforeEach(() => {
    delete process.env[TEST_ENV_KEY];
  });

  afterEach(() => {
    delete process.env[TEST_ENV_KEY];
  });

  test('initializes with correct provider ID and defaults', () => {
    process.env[TEST_ENV_KEY] = 'test-key';
    const adapter = new GroqAdapter();
    expect(adapter.providerId).toBe('groq');
    expect(adapter.config.endpoint).toBe('https://api.groq.com');
    expect(adapter.config.authType).toBe('bearer');
    expect(adapter.config.envKey).toBe('GROQ_API_KEY');
  });

  test('lists all Groq models with OpenAI-compatible response', async () => {
    process.env[TEST_ENV_KEY] = 'test-secret';
    const requestLog = [];
    const fetchImpl = async (url, options) => {
      requestLog.push({ url, options });
      if (url.includes('/openai/v1/models')) {
        return jsonResponse({
          data: [
            { id: 'mixtral-8x7b-32768', context_window: 32768, deprecated: false },
            { id: 'llama2-70b-4096', context_window: 4096, deprecated: false }
          ]
        });
      }
      return jsonResponse({ message: 'not found' }, { status: 404 });
    };

    const adapter = new GroqAdapter({
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    const models = await adapter.list();
    expect(models.length).toBe(2);
    expect(models[0].id).toBe('mixtral-8x7b-32768');
    expect(models[0].contextTokens).toBe(32768);
    expect(requestLog[0].options.headers.Authorization).toBe('Bearer test-secret');
  });

  test('extracts context window from context_window field', async () => {
    process.env[TEST_ENV_KEY] = 'test-key';
    const fetchImpl = async () => {
      return jsonResponse({
        data: [{ id: 'model-with-context', context_window: 128000 }]
      });
    };

    const adapter = new GroqAdapter({
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
        data: [{ id: 'model-with-max-tokens', max_tokens: 4096 }]
      });
    };

    const adapter = new GroqAdapter({
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
        data: [{ id: 'model-without-context' }]
      });
    };

    const adapter = new GroqAdapter({
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    const models = await adapter.list();
    expect(models[0].contextTokens).toBeNull();
  });

  test('gets single model by ID', async () => {
    process.env[TEST_ENV_KEY] = 'test-key';
    const fetchImpl = async (url) => {
      if (url.includes('/openai/v1/models/mixtral-8x7b-32768')) {
        return jsonResponse({
          id: 'mixtral-8x7b-32768',
          context_window: 32768,
          deprecated: false
        });
      }
      return jsonResponse({ message: 'not found' }, { status: 404 });
    };

    const adapter = new GroqAdapter({
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    const model = await adapter.get('mixtral-8x7b-32768');
    expect(model).not.toBeNull();
    expect(model.id).toBe('mixtral-8x7b-32768');
    expect(model.contextTokens).toBe(32768);
  });

  test('returns null for non-existent model', async () => {
    process.env[TEST_ENV_KEY] = 'test-key';
    const fetchImpl = async () => {
      return jsonResponse({ message: 'not found' }, { status: 404 });
    };

    const adapter = new GroqAdapter({
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    const model = await adapter.get('non-existent-model');
    expect(model).toBeNull();
  });

  test('throws error when API key is missing', async () => {
    delete process.env[TEST_ENV_KEY];
    const adapter = new GroqAdapter({
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });
    await expect(adapter.list()).rejects.toThrow(AdapterError);
  });

  test('normalizes deprecated flag correctly', async () => {
    process.env[TEST_ENV_KEY] = 'test-key';
    const fetchImpl = async () => {
      return jsonResponse({
        data: [
          { id: 'deprecated-model', context_window: 4096, deprecated: true },
          { id: 'active-model', context_window: 4096, deprecated: false }
        ]
      });
    };

    const adapter = new GroqAdapter({
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

    const adapter = new GroqAdapter({
      fetchImpl,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 }
    });

    await adapter.list();
    expect(requestLog[0].options.headers.Authorization).toBe('Bearer my-secret-token');
  });

  test('throws error for invalid model payload in normalize', () => {
    process.env[TEST_ENV_KEY] = 'test-key';
    const adapter = new GroqAdapter();
    expect(() => adapter.normalize(null)).toThrow(AdapterError);
    expect(() => adapter.normalize(undefined)).toThrow(AdapterError);
    expect(() => adapter.normalize('string')).toThrow(AdapterError);
  });

  test('throws error when model payload missing id field', () => {
    process.env[TEST_ENV_KEY] = 'test-key';
    const adapter = new GroqAdapter();
    expect(() => adapter.normalize({ context_window: 4096 })).toThrow(AdapterError);
    expect(() => adapter.normalize({ id: '' })).toThrow(AdapterError);
  });
});
