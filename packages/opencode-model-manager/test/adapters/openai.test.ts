// @ts-nocheck
const { describe, test, expect, beforeEach, afterEach, mock } = require('bun:test');
const { OpenAIAdapter } = require('../../src/adapters/openai');

describe('OpenAIAdapter', () => {
  let adapter: InstanceType<typeof OpenAIAdapter>;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock((url: string, options: Record<string, unknown>) => {
      // Check for valid auth header
      const hasValidAuth = options.headers?.Authorization === 'Bearer sk-test-key-12345';
      
      // Mock OpenAI API responses
      if (url.includes('/models') && !url.includes('/models/')) {
        // List endpoint
        if (!hasValidAuth) {
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            headers: new Map([['content-type', 'application/json']]),
            json: () => Promise.resolve({
              error: {
                message: 'Incorrect API key provided',
                type: 'invalid_request_error',
                param: null,
                code: 'invalid_api_key'
              }
            })
          });
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({
            object: 'list',
            data: [
              {
                id: 'gpt-4-turbo',
                object: 'model',
                created: 1704067200,
                owned_by: 'openai-dev',
                context_window: 128000,
                deleted: false
              },
              {
                id: 'gpt-4',
                object: 'model',
                created: 1687882411,
                owned_by: 'openai',
                max_tokens: 8192,
                deleted: false
              },
              {
                id: 'gpt-3.5-turbo',
                object: 'model',
                created: 1677649963,
                owned_by: 'openai-internal',
                max_tokens: 4096,
                deleted: false
              },
              {
                id: 'dall-e-3',
                object: 'model',
                created: 1698785189,
                owned_by: 'openai-internal',
                deleted: false
              },
              {
                id: 'whisper-1',
                object: 'model',
                created: 1677649963,
                owned_by: 'openai-internal',
                deleted: false
              },
              {
                id: 'text-embedding-ada-002',
                object: 'model',
                created: 1671217299,
                owned_by: 'openai-dev',
                deleted: false
              }
            ]
          })
        });
      }

      if (url.includes('/models/gpt-4-turbo')) {
        // Get single model
        if (!hasValidAuth) {
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            headers: new Map([['content-type', 'application/json']]),
            json: () => Promise.resolve({
              error: {
                message: 'Incorrect API key provided',
                type: 'invalid_request_error',
                param: null,
                code: 'invalid_api_key'
              }
            })
          });
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({
            id: 'gpt-4-turbo',
            object: 'model',
            created: 1704067200,
            owned_by: 'openai-dev',
            context_window: 128000,
            deleted: false
          })
        });
      }

      if (url.includes('/models/dall-e-3')) {
        // Get dall-e model (should be filtered)
        if (!hasValidAuth) {
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            headers: new Map([['content-type', 'application/json']]),
            json: () => Promise.resolve({
              error: {
                message: 'Incorrect API key provided',
                type: 'invalid_request_error',
                param: null,
                code: 'invalid_api_key'
              }
            })
          });
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({
            id: 'dall-e-3',
            object: 'model',
            created: 1698785189,
            owned_by: 'openai-internal',
            deleted: false
          })
        });
      }

      if (url.includes('/models/whisper-1')) {
        // Get whisper model (should be filtered)
        if (!hasValidAuth) {
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            headers: new Map([['content-type', 'application/json']]),
            json: () => Promise.resolve({
              error: {
                message: 'Incorrect API key provided',
                type: 'invalid_request_error',
                param: null,
                code: 'invalid_api_key'
              }
            })
          });
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({
            id: 'whisper-1',
            object: 'model',
            created: 1677649963,
            owned_by: 'openai-internal',
            deleted: false
          })
        });
      }

      if (url.includes('/models/nonexistent')) {
        // 404 response
        if (!hasValidAuth) {
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            headers: new Map([['content-type', 'application/json']]),
            json: () => Promise.resolve({
              error: {
                message: 'Incorrect API key provided',
                type: 'invalid_request_error',
                param: null,
                code: 'invalid_api_key'
              }
            })
          });
        }

        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({
            error: {
              message: 'The model `nonexistent` does not exist',
              type: 'invalid_request_error',
              param: 'model',
              code: 'model_not_found'
            }
          })
        });
      }

      // Default 401 for missing auth
      return Promise.resolve({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({
          error: {
            message: 'Incorrect API key provided',
            type: 'invalid_request_error',
            param: null,
            code: 'invalid_api_key'
          }
        })
      });
    });

    // Set environment variable for API key
    process.env.OPENAI_API_KEY = 'sk-test-key-12345';

    adapter = new OpenAIAdapter({
      fetchImpl: mockFetch
    });
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  describe('constructor', () => {
    test('should initialize with correct provider ID', () => {
      expect(adapter.providerId).toBe('openai');
    });

    test('should set bearer auth type', () => {
      expect(adapter.config.authType).toBe('bearer');
    });

    test('should set OPENAI_API_KEY as env key', () => {
      expect(adapter.config.envKey).toBe('OPENAI_API_KEY');
    });

    test('should set OpenAI endpoint', () => {
      expect(adapter.config.endpoint).toBe('https://api.openai.com/v1');
    });

    test('should allow custom endpoint', () => {
      const custom = new OpenAIAdapter({
        endpoint: 'https://custom.openai.com/v1',
        fetchImpl: mockFetch
      });
      expect(custom.config.endpoint).toBe('https://custom.openai.com/v1');
    });
  });

  describe('list()', () => {
    test('should fetch and normalize models', async () => {
      const models = await adapter.list();

      expect(models).toBeArray();
      expect(models.length).toBeGreaterThan(0);
    });

    test('should filter out dall-e models', async () => {
      const models = await adapter.list();
      const dallEModels = models.filter((m: Record<string, unknown>) => m.id.startsWith('dall-e'));
      expect(dallEModels.length).toBe(0);
    });

    test('should filter out whisper models', async () => {
      const models = await adapter.list();
      const whisperModels = models.filter((m: Record<string, unknown>) => m.id.startsWith('whisper'));
      expect(whisperModels.length).toBe(0);
    });

    test('should include text models', async () => {
      const models = await adapter.list();
      const textModels = models.filter((m: Record<string, unknown>) =>
        m.id.includes('gpt') || m.id.includes('text-embedding')
      );
      expect(textModels.length).toBeGreaterThan(0);
    });

    test('should normalize model fields', async () => {
      const models = await adapter.list();
      const gpt4 = models.find((m: Record<string, unknown>) => m.id === 'gpt-4-turbo');

      expect(gpt4).toBeDefined();
      expect(gpt4.id).toBe('gpt-4-turbo');
      expect(gpt4.contextTokens).toBe(128000);
      expect(gpt4.deprecated).toBe(false);
      expect(gpt4.object).toBe('model');
      expect(gpt4.ownedBy).toBe('openai-dev');
    });

    test('should extract context tokens from context_window field', async () => {
      const models = await adapter.list();
      const gpt4Turbo = models.find((m: Record<string, unknown>) => m.id === 'gpt-4-turbo');
      expect(gpt4Turbo.contextTokens).toBe(128000);
    });

    test('should extract context tokens from max_tokens field', async () => {
      const models = await adapter.list();
      const gpt4 = models.find((m: Record<string, unknown>) => m.id === 'gpt-4');
      expect(gpt4.contextTokens).toBe(8192);
    });

    test('should set outputTokens to null', async () => {
      const models = await adapter.list();
      expect(models[0].outputTokens).toBeNull();
    });

    test('should handle deprecated models', async () => {
      const models = await adapter.list();
      const model = models[0];
      expect(model.deprecated).toBeDefined();
      expect(typeof model.deprecated).toBe('boolean');
    });
  });

  describe('get()', () => {
    test('should fetch and normalize a single model', async () => {
      const model = await adapter.get('gpt-4-turbo');

      expect(model).toBeDefined();
      expect(model.id).toBe('gpt-4-turbo');
      expect(model.contextTokens).toBe(128000);
      expect(model.deprecated).toBe(false);
    });

    test('should return null for non-existent models', async () => {
      const model = await adapter.get('nonexistent');
      expect(model).toBeNull();
    });

    test('should filter out dall-e models', async () => {
      const model = await adapter.get('dall-e-3');
      expect(model).toBeNull();
    });

    test('should filter out whisper models', async () => {
      const model = await adapter.get('whisper-1');
      expect(model).toBeNull();
    });

    test('should throw on invalid model ID', async () => {
      try {
        await adapter.get('');
        expect.unreachable();
      } catch (error: unknown) {
        expect(error.code).toBe('INVALID_MODEL_ID');
      }
    });
  });

  describe('normalize()', () => {
    test('should normalize valid model payload', () => {
      const raw = {
        id: 'gpt-4-turbo',
        object: 'model',
        created: 1704067200,
        owned_by: 'openai-dev',
        context_window: 128000,
        deleted: false
      };

      const normalized = adapter.normalize(raw);

      expect(normalized.id).toBe('gpt-4-turbo');
      expect(normalized.contextTokens).toBe(128000);
      expect(normalized.deprecated).toBe(false);
      expect(normalized.object).toBe('model');
      expect(normalized.ownedBy).toBe('openai-dev');
    });

    test('should return null for dall-e models', () => {
      const raw = {
        id: 'dall-e-3',
        object: 'model',
        created: 1698785189,
        owned_by: 'openai-internal'
      };

      const normalized = adapter.normalize(raw);
      expect(normalized).toBeNull();
    });

    test('should return null for whisper models', () => {
      const raw = {
        id: 'whisper-1',
        object: 'model',
        created: 1677649963,
        owned_by: 'openai-internal'
      };

      const normalized = adapter.normalize(raw);
      expect(normalized).toBeNull();
    });

    test('should handle missing context_window', () => {
      const raw = {
        id: 'gpt-4',
        object: 'model',
        created: 1687882411,
        owned_by: 'openai'
      };

      const normalized = adapter.normalize(raw);
      // Should infer from model ID
      expect(normalized.contextTokens).toBe(8192);
    });

    test('should throw on invalid payload', () => {
      try {
        adapter.normalize(null);
        expect.unreachable();
      } catch (error: unknown) {
        expect(error.code).toBe('INVALID_MODEL_PAYLOAD');
      }
    });

    test('should throw on non-object payload', () => {
      try {
        adapter.normalize('not an object');
        expect.unreachable();
      } catch (error: unknown) {
        expect(error.code).toBe('INVALID_MODEL_PAYLOAD');
      }
    });
  });

  describe('_extractContextTokens()', () => {
    test('should extract from context_window field', () => {
      const raw = { context_window: 128000 };
      const tokens = adapter._extractContextTokens(raw);
      expect(tokens).toBe(128000);
    });

    test('should extract from max_tokens field', () => {
      const raw = { max_tokens: 4096 };
      const tokens = adapter._extractContextTokens(raw);
      expect(tokens).toBe(4096);
    });

    test('should prefer context_window over max_tokens', () => {
      const raw = { context_window: 128000, max_tokens: 4096 };
      const tokens = adapter._extractContextTokens(raw);
      expect(tokens).toBe(128000);
    });

    test('should infer from gpt-4-turbo model ID', () => {
      const raw = { id: 'gpt-4-turbo' };
      const tokens = adapter._extractContextTokens(raw);
      expect(tokens).toBe(128000);
    });

    test('should infer from gpt-4 model ID', () => {
      const raw = { id: 'gpt-4' };
      const tokens = adapter._extractContextTokens(raw);
      expect(tokens).toBe(8192);
    });

    test('should infer from gpt-3.5-turbo model ID', () => {
      const raw = { id: 'gpt-3.5-turbo' };
      const tokens = adapter._extractContextTokens(raw);
      expect(tokens).toBe(4096);
    });

    test('should return null for unknown models', () => {
      const raw = { id: 'unknown-model' };
      const tokens = adapter._extractContextTokens(raw);
      expect(tokens).toBeNull();
    });
  });

  describe('error handling', () => {
    test('should handle missing API key', async () => {
      delete process.env.OPENAI_API_KEY;
      const noKeyAdapter = new OpenAIAdapter({ fetchImpl: mockFetch });

      try {
        await noKeyAdapter.list();
        expect.unreachable();
      } catch (error: unknown) {
        expect(error.code).toBe('API_KEY_MISSING');
      }
    });

    test('should handle 401 unauthorized', async () => {
      const badKeyAdapter = new OpenAIAdapter({
        envKey: 'OPENAI_API_KEY',
        fetchImpl: mockFetch
      });
      process.env.OPENAI_API_KEY = 'sk-invalid-key';

      try {
        await badKeyAdapter.list();
        expect.unreachable();
      } catch (error: unknown) {
        expect(error.code).toBe('AUTH_ERROR');
        expect(error.statusCode).toBe(401);
      }
    });

    test('should handle 404 not found', async () => {
      try {
        await adapter.get('nonexistent');
        // Should return null, not throw
        expect(true).toBe(true);
      } catch (error: unknown) {
        expect.unreachable();
      }
    });
  });

  describe('auth header injection', () => {
    test('should include Bearer token in Authorization header', async () => {
      await adapter.list();

      const calls = mockFetch.mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      const lastCall = calls[calls.length - 1];
      const options = lastCall[1];
      expect(options.headers.Authorization).toMatch(/^Bearer sk-/);
    });
  });

  describe('retry behavior', () => {
    test('should have default retry configuration', () => {
      expect(adapter.config.retry.maxAttempts).toBe(3);
      expect(adapter.config.retry.baseDelayMs).toBe(250);
      expect(adapter.config.retry.maxDelayMs).toBe(2000);
    });

    test('should allow custom retry configuration', () => {
      const custom = new OpenAIAdapter({
        retry: {
          maxAttempts: 5,
          baseDelayMs: 100,
          maxDelayMs: 5000
        },
        fetchImpl: mockFetch
      });

      expect(custom.config.retry.maxAttempts).toBe(5);
      expect(custom.config.retry.baseDelayMs).toBe(100);
      expect(custom.config.retry.maxDelayMs).toBe(5000);
    });
  });
});
