// @ts-nocheck
const { describe, test, expect, beforeEach, afterEach, mock } = require('bun:test');
const { CerebrasAdapter } = require('../../src/adapters/cerebras');

describe('CerebrasAdapter', () => {
  let adapter: InstanceType<typeof CerebrasAdapter>;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock((url: string, options: Record<string, unknown>) => {
      // Check for valid auth header
      const hasValidAuth = options.headers?.Authorization === 'Bearer test-cerebras-key';
      
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
                id: 'cse-2',
                object: 'model',
                created: 1704067200,
                owned_by: 'cerebras-dev',
                context_window: 200000,
                deleted: false
              },
              {
                id: 'cse-1',
                object: 'model',
                created: 1687882411,
                owned_by: 'cerebras',
                max_tokens: 100000,
                deleted: false
              },
              {
                id: 'cse-1',
                object: 'model',
                created: 1677649963,
                owned_by: 'cerebras-internal',
                max_tokens: 100000,
                deleted: false
              },
              {
                id: 'REMOVED',
                object: 'model',
                created: 1698785189,
                owned_by: 'cerebras-internal',
                deleted: false
              },
              {
                id: 'REMOVED',
                object: 'model',
                created: 1677649963,
                owned_by: 'cerebras-internal',
                deleted: false
              },
              {
                id: 'REMOVED',
                object: 'model',
                created: 1671217299,
                owned_by: 'cerebras-dev',
                deleted: false
              }
            ]
          })
        });
      }

      if (url.includes('/models/cse-2')) {
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
            id: 'cse-2',
            object: 'model',
            created: 1704067200,
            owned_by: 'cerebras-dev',
            context_window: 200000,
            deleted: false
          })
        });
      }

      if (url.includes('/models/REMOVED')) {
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
            id: 'REMOVED',
            object: 'model',
            created: 1698785189,
            owned_by: 'cerebras-internal',
            deleted: false
          })
        });
      }

      if (url.includes('/models/REMOVED')) {
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
            id: 'REMOVED',
            object: 'model',
            created: 1677649963,
            owned_by: 'cerebras-internal',
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
    process.env.CEREBRAS_API_KEY = 'test-cerebras-key';

    adapter = new CerebrasAdapter({
      fetchImpl: mockFetch
    });
  });

  afterEach(() => {
    delete process.env.CEREBRAS_API_KEY;
  });

  describe('constructor', () => {
    test('should initialize with correct provider ID', () => {
      expect(adapter.providerId).toBe('cerebras');
    });

    test('should set bearer auth type', () => {
      expect(adapter.config.authType).toBe('bearer');
    });

    test('should set CEREBRAS_API_KEY as env key', () => {
      expect(adapter.config.envKey).toBe('CEREBRAS_API_KEY');
    });

    test('should set Cerebras endpoint', () => {
      expect(adapter.config.endpoint).toBe('https://api.cerebras.ai/v1');
    });

    test('should allow custom endpoint', () => {
      const custom = new CerebrasAdapter({
        endpoint: 'https://custom.cerebras.com/v1',
        fetchImpl: mockFetch
      });
      expect(custom.config.endpoint).toBe('https://custom.cerebras.com/v1');
    });
  });

  describe('list()', () => {
    test('should fetch and normalize models', async () => {
      const models = await adapter.list();

      expect(models).toBeArray();
      expect(models.length).toBeGreaterThan(0);
    });



    test('should include cerebras models', async () => {
      const models = await adapter.list();
      const textModels = models.filter((m: Record<string, unknown>) =>
        m.id.includes('cse')
      );
      expect(textModels.length).toBeGreaterThan(0);
    });

    test('should normalize model fields', async () => {
      const models = await adapter.list();
      const gpt4 = models.find((m: Record<string, unknown>) => m.id === 'cse-2');

      expect(gpt4).toBeDefined();
      expect(gpt4.id).toBe('cse-2');
      expect(gpt4.contextTokens).toBe(200000);
      expect(gpt4.deprecated).toBe(false);
      expect(gpt4.object).toBe('model');
      expect(gpt4.ownedBy).toBe('cerebras-dev');
    });

    test('should extract context tokens from context_window field', async () => {
      const models = await adapter.list();
      const gpt4Turbo = models.find((m: Record<string, unknown>) => m.id === 'cse-2');
      expect(gpt4Turbo.contextTokens).toBe(200000);
    });

    test('should extract context tokens from max_tokens field', async () => {
      const models = await adapter.list();
      const gpt4 = models.find((m: Record<string, unknown>) => m.id === 'cse-1');
      expect(gpt4.contextTokens).toBe(100000);
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
      const model = await adapter.get('cse-2');

      expect(model).toBeDefined();
      expect(model.id).toBe('cse-2');
      expect(model.contextTokens).toBe(200000);
      expect(model.deprecated).toBe(false);
    });

    test('should return null for non-existent models', async () => {
      const model = await adapter.get('nonexistent');
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
        id: 'cse-2',
        object: 'model',
        created: 1704067200,
        owned_by: 'cerebras-dev',
        context_window: 200000,
        deleted: false
      };

      const normalized = adapter.normalize(raw);

      expect(normalized.id).toBe('cse-2');
      expect(normalized.contextTokens).toBe(200000);
      expect(normalized.deprecated).toBe(false);
      expect(normalized.object).toBe('model');
      expect(normalized.ownedBy).toBe('cerebras-dev');
    });



    test('should handle missing context_window', () => {
      const raw = {
        id: 'cse-1',
        object: 'model',
        created: 1687882411,
        owned_by: 'cerebras'
      };

      const normalized = adapter.normalize(raw);
      // Should infer from model ID
      expect(normalized.contextTokens).toBe(100000);
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
      const raw = { context_window: 200000 };
      const tokens = adapter._extractContextTokens(raw);
      expect(tokens).toBe(200000);
    });

    test('should extract from max_tokens field', () => {
      const raw = { max_tokens: 100000 };
      const tokens = adapter._extractContextTokens(raw);
      expect(tokens).toBe(100000);
    });

    test('should prefer context_window over max_tokens', () => {
      const raw = { context_window: 200000, max_tokens: 100000 };
      const tokens = adapter._extractContextTokens(raw);
      expect(tokens).toBe(200000);
    });

    test('should infer from cse-2 model ID', () => {
      const raw = { id: 'cse-2' };
      const tokens = adapter._extractContextTokens(raw);
      expect(tokens).toBe(200000);
    });

    test('should infer from cse-1 model ID', () => {
      const raw = { id: 'cse-1' };
      const tokens = adapter._extractContextTokens(raw);
      expect(tokens).toBe(100000);
    });

    test('should infer from cse-1 model ID', () => {
      const raw = { id: 'cse-1' };
      const tokens = adapter._extractContextTokens(raw);
      expect(tokens).toBe(100000);
    });

    test('should return null for unknown models', () => {
      const raw = { id: 'unknown-model' };
      const tokens = adapter._extractContextTokens(raw);
      expect(tokens).toBeNull();
    });
  });

  describe('error handling', () => {
    test('should handle missing API key', async () => {
      delete process.env.CEREBRAS_API_KEY;
      const noKeyAdapter = new CerebrasAdapter({ fetchImpl: mockFetch });

      try {
        await noKeyAdapter.list();
        expect.unreachable();
      } catch (error: unknown) {
        expect(error.code).toBe('API_KEY_MISSING');
      }
    });

    test('should handle 401 unauthorized', async () => {
      const badKeyAdapter = new CerebrasAdapter({
        envKey: 'CEREBRAS_API_KEY',
        fetchImpl: mockFetch
      });
      process.env.CEREBRAS_API_KEY = 'sk-invalid-key';

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
      expect(options.headers.Authorization).toMatch(/^Bearer test-/);
    });
  });

  describe('retry behavior', () => {
    test('should have default retry configuration', () => {
      expect(adapter.config.retry.maxAttempts).toBe(3);
      expect(adapter.config.retry.baseDelayMs).toBe(250);
      expect(adapter.config.retry.maxDelayMs).toBe(2000);
    });

    test('should allow custom retry configuration', () => {
      const custom = new CerebrasAdapter({
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
