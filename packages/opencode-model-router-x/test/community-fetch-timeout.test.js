// @ts-nocheck
'use strict';

const { describe, test, expect, beforeEach } = require('bun:test');
const path = require('path');
const fs = require('fs');

/**
 * Tests that model-discovery community fetch has an explicit timeout.
 * 
 * Strategy: 
 * 1. Verify source code uses AbortController for community fetch
 * 2. Verify COMMUNITY_FETCH_TIMEOUT_MS is exported
 * 3. Verify _fetchFromCommunity clears timeout on success
 */
describe('Model discovery community fetch timeout', () => {
  const srcPath = path.join(__dirname, '..', 'src', 'model-discovery.js');
  const src = fs.readFileSync(srcPath, 'utf-8');

  test('exports COMMUNITY_FETCH_TIMEOUT_MS constant', () => {
    const ModelDiscovery = require('../src/model-discovery');
    expect(ModelDiscovery.COMMUNITY_FETCH_TIMEOUT_MS).toBeDefined();
    expect(typeof ModelDiscovery.COMMUNITY_FETCH_TIMEOUT_MS).toBe('number');
    expect(ModelDiscovery.COMMUNITY_FETCH_TIMEOUT_MS).toBeGreaterThan(0);
    expect(ModelDiscovery.COMMUNITY_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(60000);
  });

  test('_fetchFromCommunity uses AbortController', () => {
    // The community fetch should use AbortController for timeout
    const communityFetchSection = src.slice(src.indexOf('_fetchFromCommunity'));
    expect(communityFetchSection).toContain('AbortController');
    expect(communityFetchSection).toContain('signal');
    expect(communityFetchSection).toContain('clearTimeout');
  });

  test('_fetchFromCommunity returns empty array on timeout', async () => {
    const ModelDiscovery = require('../src/model-discovery');
    const discovery = new ModelDiscovery({ communitySourcesEnabled: true });
    
    // Override fetch to simulate timeout
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      // Simulate a request that takes too long - abort immediately
      if (opts?.signal) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      throw new Error('No signal provided - timeout not implemented');
    };

    try {
      const result = await discovery._fetchFromCommunity('openai');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('_fetchFromCommunity clears timeout on success', async () => {
    const ModelDiscovery = require('../src/model-discovery');
    const discovery = new ModelDiscovery({ communitySourcesEnabled: true });

    // Override fetch to return valid data
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      // Should have signal
      expect(opts?.signal).toBeDefined();
      return {
        ok: true,
        json: async () => ({
          'openai/gpt-4': { max_context_length: 128000 }
        })
      };
    };

    try {
      const result = await discovery._fetchFromCommunity('openai');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
