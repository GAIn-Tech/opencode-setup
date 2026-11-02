// @ts-nocheck
const { describe, test, expect, beforeEach, afterEach } = require('bun:test');

const { AnthropicAdapter } = require('../../src/adapters/anthropic');
const { AdapterError } = require('../../src/adapters/base-adapter');

const TEST_API_KEY = 'sk-ant-test-key-12345';
const TEST_ENV_KEY = 'ANTHROPIC_API_KEY';

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

describe('AnthropicAdapter', () => {
  beforeEach(() => {
    process.env[TEST_ENV_KEY] = TEST_API_KEY;
  });

  afterEach(() => {
    delete process.env[TEST_ENV_KEY];
  });

  test('extends BaseAdapter with correct provider config', () => {
    const adapter = new AnthropicAdapter();
    expect(adapter.providerId).toBe('anthropic');
    expect(adapter.config.authType).toBe('anthropic');
    expect(adapter.config.envKey).toBe(TEST_ENV_KEY);
    expect(adapter.config.endpoint).toBe('https://api.anthropic.com');
  });

  test('list() fetches models from Anthropic API', async () => {
    const mockModels = [
      {
        id: 'claude-opus-4-6',
        type: 'model',
        display_name: 'Claude Opus 4.6',
        created_at: '2024-01-01T00:00:00Z',
        deprecated_at: null,
        input_tokens: 1000000,
        output_tokens: 4096
      },
      {
        id: 'claude-sonnet-4-5',
        type: 'model',
        display_name: 'Claude Sonnet 4.5',
        created_at: '2024-01-01T00:00:00Z',
        deprecated_at: null,
        input_tokens: 200000,
        output_tokens: 4096
      }
    ];

    const mockFetch = async (url, options) => {
      expect(url).toContain('/v1/models');
      expect(options.headers['x-api-key']).toBe(TEST_API_KEY);
      expect(options.headers['anthropic-version']).toBeDefined();
      return jsonResponse({ data: mockModels });
    };

    const adapter = new AnthropicAdapter({ fetchImpl: mockFetch });
    const models = await adapter.list();

    expect(models).toHaveLength(2);
    expect(models[0].id).toBe('claude-opus-4-6');
    expect(models[0].provider).toBe('anthropic');
    expect(models[0].contextTokens).toBe(1000000);
    expect(models[0].outputTokens).toBe(4096);
    expect(models[1].id).toBe('claude-sonnet-4-5');
  });

  test('list() handles pagination parameters', async () => {
    let capturedUrl = '';

    const mockFetch = async (url) => {
      capturedUrl = url;
      return jsonResponse({
        data: [
          {
            id: 'claude-opus-4-6',
            type: 'model',
            display_name: 'Claude Opus 4.6',
            input_tokens: 1000000,
            output_tokens: 4096
          }
        ],
        has_more: true,
        after_id: 'claude-opus-4-6'
      });
    };

    const adapter = new AnthropicAdapter({ fetchImpl: mockFetch });
    await adapter.list({ after_id: 'claude-haiku-4-5', limit: 50 });

    expect(capturedUrl).toContain('after_id=claude-haiku-4-5');
    expect(capturedUrl).toContain('limit=50');
  });

  test('list() enforces maximum limit of 100', async () => {
    let capturedUrl = '';

    const mockFetch = async (url) => {
      capturedUrl = url;
      return jsonResponse({ data: [] });
    };

    const adapter = new AnthropicAdapter({ fetchImpl: mockFetch });
    await adapter.list({ limit: 500 });

    expect(capturedUrl).toContain('limit=100');
  });

  test('get() fetches single model by ID', async () => {
    const mockModel = {
      id: 'claude-opus-4-6',
      type: 'model',
      display_name: 'Claude Opus 4.6',
      created_at: '2024-01-01T00:00:00Z',
      deprecated_at: null,
      input_tokens: 1000000,
      output_tokens: 4096
    };

    const mockFetch = async (url) => {
      expect(url).toContain('/v1/models/claude-opus-4-6');
      return jsonResponse(mockModel);
    };

    const adapter = new AnthropicAdapter({ fetchImpl: mockFetch });
    const model = await adapter.get('claude-opus-4-6');

    expect(model).toBeDefined();
    expect(model.id).toBe('claude-opus-4-6');
    expect(model.provider).toBe('anthropic');
    expect(model.contextTokens).toBe(1000000);
  });

  test('get() returns null for 404 (model not found)', async () => {
    const mockFetch = async () => {
      return jsonResponse(
        { error: { message: 'Model not found' } },
        { status: 404, statusText: 'Not Found' }
      );
    };

    const adapter = new AnthropicAdapter({ fetchImpl: mockFetch });
    const model = await adapter.get('nonexistent-model');

    expect(model).toBeNull();
  });

  test('normalize() converts Anthropic model to common schema', () => {
    const adapter = new AnthropicAdapter();

    const raw = {
      id: 'claude-opus-4-6',
      display_name: 'Claude Opus 4.6',
      input_tokens: 1000000,
      output_tokens: 4096,
      deprecated_at: null
    };

    const normalized = adapter.normalize(raw);

    expect(normalized.id).toBe('claude-opus-4-6');
    expect(normalized.provider).toBe('anthropic');
    expect(normalized.displayName).toBe('Claude Opus 4.6');
    expect(normalized.contextTokens).toBe(1000000);
    expect(normalized.outputTokens).toBe(4096);
    expect(normalized.deprecated).toBeUndefined();
  });

  test('normalize() marks deprecated models', () => {
    const adapter = new AnthropicAdapter();

    const raw = {
      id: 'claude-2',
      display_name: 'Claude 2',
      input_tokens: 100000,
      output_tokens: 4096,
      deprecated_at: '2024-06-01T00:00:00Z'
    };

    const normalized = adapter.normalize(raw);

    expect(normalized.deprecated).toBe(true);
  });

  test('normalize() handles missing fields gracefully', () => {
    const adapter = new AnthropicAdapter();

    const raw = {
      id: 'claude-test'
    };

    const normalized = adapter.normalize(raw);

    expect(normalized.id).toBe('claude-test');
    expect(normalized.provider).toBe('anthropic');
    expect(normalized.displayName).toBe('claude-test');
    expect(normalized.contextTokens).toBeUndefined();
    expect(normalized.outputTokens).toBeUndefined();
  });

  test('getCapabilities() returns streaming and tools for all models', () => {
    const adapter = new AnthropicAdapter();

    const model = {
      id: 'claude-opus-4-6',
      provider: 'anthropic'
    };

    const capabilities = adapter.getCapabilities(model);

    expect(capabilities.streaming).toBe(true);
    expect(capabilities.tools).toBe(true);
    expect(capabilities.vision).toBe(false);
    expect(capabilities.reasoning).toBeUndefined();
  });

  test('getCapabilities() detects vision support from model ID', () => {
    const adapter = new AnthropicAdapter();

    const visionModel = {
      id: 'claude-vision-4-5',
      provider: 'anthropic'
    };

    const capabilities = adapter.getCapabilities(visionModel);

    expect(capabilities.vision).toBe(true);
  });

  test('getCapabilities() detects reasoning support from model ID', () => {
    const adapter = new AnthropicAdapter();

    const reasoningModel = {
      id: 'claude-opus-4-6-thinking',
      provider: 'anthropic'
    };

    const capabilities = adapter.getCapabilities(reasoningModel);

    expect(capabilities.reasoning).toBe(true);
  });

  test('throws AdapterError when API key is missing', async () => {
    delete process.env[TEST_ENV_KEY];

    const adapter = new AnthropicAdapter();

    try {
      await adapter.list();
      expect.unreachable('Should have thrown AdapterError');
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      expect(error.code).toBe('API_KEY_MISSING');
    }
  });

  test('throws AdapterError on HTTP 401 (unauthorized)', async () => {
    const mockFetch = async () => {
      return jsonResponse(
        { error: { message: 'Invalid API key' } },
        { status: 401, statusText: 'Unauthorized' }
      );
    };

    const adapter = new AnthropicAdapter({ fetchImpl: mockFetch });

    try {
      await adapter.list();
      expect.unreachable('Should have thrown AdapterError');
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.statusCode).toBe(401);
    }
  });

  test('throws AdapterError on HTTP 429 (rate limited)', async () => {
    const mockFetch = async () => {
      return jsonResponse(
        { error: { message: 'Rate limited' } },
        { status: 429, statusText: 'Too Many Requests' }
      );
    };

    const adapter = new AnthropicAdapter({ fetchImpl: mockFetch });

    try {
      await adapter.list();
      expect.unreachable('Should have thrown AdapterError');
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.retryable).toBe(true);
    }
  });

  test('applies anthropic-version header to requests', async () => {
    let capturedHeaders = null;

    const mockFetch = async (url, options) => {
      capturedHeaders = options.headers;
      return jsonResponse({ data: [] });
    };

    const adapter = new AnthropicAdapter({
      fetchImpl: mockFetch,
      anthropicVersion: '2024-06-15'
    });

    await adapter.list();

    expect(capturedHeaders['anthropic-version']).toBe('2024-06-15');
  });

  test('uses x-api-key header for authentication', async () => {
    let capturedHeaders = null;

    const mockFetch = async (url, options) => {
      capturedHeaders = options.headers;
      return jsonResponse({ data: [] });
    };

    const adapter = new AnthropicAdapter({ fetchImpl: mockFetch });

    await adapter.list();

    expect(capturedHeaders['x-api-key']).toBe(TEST_API_KEY);
    expect(capturedHeaders.Authorization).toBeUndefined();
  });

  test('retries on transient errors (500)', async () => {
    let attemptCount = 0;

    const mockFetch = async () => {
      attemptCount += 1;
      if (attemptCount < 3) {
        return jsonResponse(
          { error: { message: 'Server error' } },
          { status: 500, statusText: 'Internal Server Error' }
        );
      }
      return jsonResponse({ data: [] });
    };

    const adapter = new AnthropicAdapter({
      fetchImpl: mockFetch,
      retry: { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50 }
    });

    const models = await adapter.list();

    expect(attemptCount).toBe(3);
    expect(models).toEqual([]);
  });

  test('does not retry on permanent errors (401)', async () => {
    let attemptCount = 0;

    const mockFetch = async () => {
      attemptCount += 1;
      return jsonResponse(
        { error: { message: 'Unauthorized' } },
        { status: 401, statusText: 'Unauthorized' }
      );
    };

    const adapter = new AnthropicAdapter({
      fetchImpl: mockFetch,
      retry: { maxAttempts: 3 }
    });

    try {
      await adapter.list();
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(attemptCount).toBe(1);
      expect(error.code).toBe('AUTH_ERROR');
    }
  });

  test('list() with empty response returns empty array', async () => {
    const mockFetch = async () => {
      return jsonResponse({ data: [] });
    };

    const adapter = new AnthropicAdapter({ fetchImpl: mockFetch });
    const models = await adapter.list();

    expect(models).toEqual([]);
  });

  test('list() extracts models from various response shapes', async () => {
    const mockModel = {
      id: 'claude-opus-4-6',
      type: 'model',
      display_name: 'Claude Opus 4.6',
      input_tokens: 1000000,
      output_tokens: 4096
    };

    // Test with "data" key
    const mockFetch1 = async () => jsonResponse({ data: [mockModel] });
    const adapter1 = new AnthropicAdapter({ fetchImpl: mockFetch1 });
    const models1 = await adapter1.list();
    expect(models1).toHaveLength(1);

    // Test with direct array
    const mockFetch2 = async () => jsonResponse([mockModel]);
    const adapter2 = new AnthropicAdapter({ fetchImpl: mockFetch2 });
    const models2 = await adapter2.list();
    expect(models2).toHaveLength(1);
  });
});
