// @ts-nocheck
const { describe, test, expect, beforeEach, afterEach, mock } = require('bun:test');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { performance } = require('perf_hooks');

const {
  CacheLayer,
  createCacheKey
} = require('../../src/cache/cache-layer');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('CacheLayer', () => {
  let tempDir;
  let cacheFilePath;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'model-manager-cache-'));
    cacheFilePath = path.join(tempDir, 'cache.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('generates deterministic cache keys from provider, endpoint, and params hash', () => {
    const paramsA = {
      limit: 25,
      region: 'us-east-1',
      filters: {
        mode: 'fast',
        includeDeprecated: false
      }
    };

    const paramsB = {
      filters: {
        includeDeprecated: false,
        mode: 'fast'
      },
      region: 'us-east-1',
      limit: 25
    };

    const keyA = createCacheKey('openai', 'https://api.openai.com/v1/models', paramsA);
    const keyB = createCacheKey('openai', 'https://api.openai.com/v1/models', paramsB);
    const keyC = CacheLayer.buildKey('openai', 'https://api.openai.com/v1/models', paramsB);

    expect(keyA).toBe(keyB);
    expect(keyB).toBe(keyC);
    expect(keyA).toMatch(/^openai:https:\/\/api\.openai\.com\/v1\/models:[a-f0-9]{64}$/);
  });

  test('handles L1 cache miss then hit without re-fetching', async () => {
    const cache = new CacheLayer({
      l1Ttl: 300000,
      l2Ttl: 3600000,
      l2Path: cacheFilePath
    });

    const fetchFn = mock(async () => ({ models: ['gpt-5'] }));
    const key = 'openai:/models:abc';

    const missValue = await cache.get(key, fetchFn);
    const hitValue = await cache.get(key, fetchFn);

    expect(missValue).toEqual({ models: ['gpt-5'] });
    expect(hitValue).toEqual({ models: ['gpt-5'] });
    expect(fetchFn.mock.calls).toHaveLength(1);
  });

  test('serves L1 hits with sub-millisecond average latency', async () => {
    const cache = new CacheLayer({
      l1Ttl: 300000,
      l2Ttl: 3600000,
      l2Path: cacheFilePath
    });

    const key = 'openai:/models:perf';
    const fetchFn = mock(async () => ({ ok: true }));
    await cache.get(key, fetchFn);

    const iterations = 1000;
    const startedAt = performance.now();

    for (let i = 0; i < iterations; i += 1) {
      const value = await cache.get(key, fetchFn);
      expect(value.ok).toBe(true);
    }

    const elapsedMs = performance.now() - startedAt;
    const averageMs = elapsedMs / iterations;

    expect(fetchFn.mock.calls).toHaveLength(1);
    expect(averageMs).toBeLessThan(1);
  });

  test('serves from L2 cache after L1 clear and after instance restart', async () => {
    const key = 'anthropic:/models:restart';
    const initialCache = new CacheLayer({
      l1Ttl: 300000,
      l2Ttl: 3600000,
      l2Path: cacheFilePath
    });

    await initialCache.set(key, { models: ['claude-sonnet-4-5'] });
    await initialCache.clearL1();

    const localFetch = mock(async () => ({ models: ['should-not-be-used'] }));
    const localValue = await initialCache.get(key, localFetch);
    expect(localValue).toEqual({ models: ['claude-sonnet-4-5'] });
    expect(localFetch.mock.calls).toHaveLength(0);

    const restartedCache = new CacheLayer({
      l1Ttl: 300000,
      l2Ttl: 3600000,
      l2Path: cacheFilePath
    });

    const restartFetch = mock(async () => ({ models: ['should-not-be-used'] }));
    const restartedValue = await restartedCache.get(key, restartFetch);

    expect(restartedValue).toEqual({ models: ['claude-sonnet-4-5'] });
    expect(restartFetch.mock.calls).toHaveLength(0);
  });

  test('serves stale entries immediately and refreshes asynchronously', async () => {
    const cache = new CacheLayer({
      l1Ttl: 20,
      l2Ttl: 200,
      l2Path: cacheFilePath
    });

    const key = 'google:/models:stale';
    let version = 0;

    await cache.get(key, async () => {
      version += 1;
      return { version };
    });

    await wait(30);

    const staleStarted = performance.now();
    const staleValue = await cache.get(key, async () => {
      version += 1;
      await wait(40);
      return { version };
    });
    const staleElapsedMs = performance.now() - staleStarted;

    expect(staleValue).toEqual({ version: 1 });
    expect(staleElapsedMs).toBeLessThan(15);

    await wait(80);

    const refreshedValue = await cache.get(key, async () => ({ version: 999 }));
    expect(refreshedValue).toEqual({ version: 2 });
  });

  test('deduplicates background refresh calls while stale value is served', async () => {
    const cache = new CacheLayer({
      l1Ttl: 20,
      l2Ttl: 200,
      l2Path: cacheFilePath
    });

    const key = 'groq:/models:refresh-dedupe';
    await cache.set(key, { version: 1 });
    await wait(30);

    const refreshFn = mock(async () => {
      await wait(50);
      return { version: 2 };
    });

    const staleValueA = await cache.get(key, refreshFn);
    const staleValueB = await cache.get(key, refreshFn);

    expect(staleValueA).toEqual({ version: 1 });
    expect(staleValueB).toEqual({ version: 1 });
    expect(refreshFn.mock.calls).toHaveLength(1);

    await wait(90);

    const refreshed = await cache.get(key, async () => ({ version: 999 }));
    expect(refreshed).toEqual({ version: 2 });
  });

  test('enforces TTL expiration and refetches when L2 is expired', async () => {
    const cache = new CacheLayer({
      l1Ttl: 15,
      l2Ttl: 40,
      l2Path: cacheFilePath
    });

    const key = 'nvidia:/models:ttl';
    let fetchCount = 0;
    const fetchFn = mock(async () => {
      fetchCount += 1;
      return { version: fetchCount };
    });

    const first = await cache.get(key, fetchFn);
    expect(first).toEqual({ version: 1 });

    await wait(50);

    const second = await cache.get(key, fetchFn);
    expect(second).toEqual({ version: 2 });
    expect(fetchFn.mock.calls).toHaveLength(2);
  });

  test('clear removes both L1 and L2 persisted entries', async () => {
    const key = 'cerebras:/models:clear';
    const cache = new CacheLayer({
      l1Ttl: 300000,
      l2Ttl: 3600000,
      l2Path: cacheFilePath
    });

    await cache.set(key, { value: 'cached' });
    await cache.clear();

    const restarted = new CacheLayer({
      l1Ttl: 300000,
      l2Ttl: 3600000,
      l2Path: cacheFilePath
    });

    const fetchFn = mock(async () => ({ value: 'fresh' }));
    const value = await restarted.get(key, fetchFn);

    expect(value).toEqual({ value: 'fresh' });
    expect(fetchFn.mock.calls).toHaveLength(1);
  });
});
