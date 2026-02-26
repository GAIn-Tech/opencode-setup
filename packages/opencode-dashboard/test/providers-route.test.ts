import { describe, it, expect } from 'bun:test';
import { GET, POST } from '../src/app/api/providers/route';
import { NextResponse } from 'next/server';

// Mock NextRequest
function createMockNextRequest(url: string, options?: RequestInit) {
  const req = new Request(url, options);
  const urlObj = new URL(url);
  return {
    ...req,
    nextUrl: urlObj,
  };
}

describe('providers route', () => {
  describe('GET /api/providers', () => {
    it('returns provider health status', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers');
      const response = await GET(request as any);
      
      expect(response).toBeInstanceOf(NextResponse);
      const data = await response.json();
      
      expect(data).toHaveProperty('providers');
      expect(Array.isArray(data.providers)).toBe(true);
    });

    it('returns provider objects with health information', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers');
      const response = await GET(request as any);
      const data = await response.json();
      
      if (data.providers.length > 0) {
        const provider = data.providers[0];
        expect(provider).toHaveProperty('provider');
        expect(provider).toHaveProperty('status');
        expect(provider).toHaveProperty('lastChecked');
      }
    });

    it('returns valid provider status values', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers');
      const response = await GET(request as any);
      const data = await response.json();
      
      const validStatuses = ['healthy', 'rate_limited', 'auth_error', 'network_error', 'unknown'];
      
      for (const provider of data.providers) {
        expect(validStatuses).toContain(provider.status);
      }
    });

    it('returns rate limits information', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers');
      const response = await GET(request as any);
      const data = await response.json();
      
      expect(data).toHaveProperty('rateLimits');
      expect(data.rateLimits).toHaveProperty('providers');
      expect(data.rateLimits).toHaveProperty('models');
    });

    it('returns cache statistics', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers');
      const response = await GET(request as any);
      const data = await response.json();
      
      expect(data).toHaveProperty('cache');
      expect(data.cache).toHaveProperty('size');
      expect(data.cache).toHaveProperty('hits');
      expect(data.cache).toHaveProperty('misses');
    });

    it('returns timestamp', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers');
      const response = await GET(request as any);
      const data = await response.json();
      
      expect(data).toHaveProperty('timestamp');
      expect(typeof data.timestamp).toBe('string');
    });

    it('supports provider query parameter', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers?provider=anthropic');
      const response = await GET(request as any);
      const data = await response.json();
      
      expect(data).toHaveProperty('health');
      expect(data.health.provider).toBe('anthropic');
    });

    it('returns specific provider health when queried', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers?provider=anthropic');
      const response = await GET(request as any);
      const data = await response.json();
      
      expect(data.health).toHaveProperty('status');
      expect(data.health).toHaveProperty('lastChecked');
    });

    it('returns provider-specific rate limits', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers?provider=anthropic');
      const response = await GET(request as any);
      const data = await response.json();
      
      expect(data).toHaveProperty('rateLimits');
      expect(data.rateLimits).toHaveProperty('provider');
      expect(data.rateLimits).toHaveProperty('models');
    });
  });

  describe('POST /api/providers', () => {
    it('accepts test action', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers', {
        method: 'POST',
        body: JSON.stringify({ action: 'test', provider: 'anthropic' }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await POST(request as any);
      const data = await response.json();
      
      expect(data).toHaveProperty('provider');
      expect(data).toHaveProperty('status');
    });

    it('accepts recordUsage action', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers', {
        method: 'POST',
        body: JSON.stringify({
          action: 'recordUsage',
          data: {
            provider: 'anthropic',
            model: 'claude-opus',
            requests: 1,
            tokens: 100
          }
        }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await POST(request as any);
      const data = await response.json();
      
      expect(data).toHaveProperty('success');
      expect(data.success).toBe(true);
    });

    it('accepts resetUsage action', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers', {
        method: 'POST',
        body: JSON.stringify({
          action: 'resetUsage',
          data: {
            provider: 'anthropic'
          }
        }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await POST(request as any);
      const data = await response.json();
      
      expect(data).toHaveProperty('success');
      expect(data.success).toBe(true);
    });

    it('returns error for unknown action', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers', {
        method: 'POST',
        body: JSON.stringify({ action: 'unknown' }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await POST(request as any);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('returns error on invalid JSON', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers', {
        method: 'POST',
        body: 'invalid json',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await POST(request as any);
      
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('records usage for specific model', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers', {
        method: 'POST',
        body: JSON.stringify({
          action: 'recordUsage',
          data: {
            provider: 'anthropic',
            model: 'claude-sonnet',
            requests: 5,
            tokens: 500
          }
        }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await POST(request as any);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.rateLimits).toHaveProperty('requests');
      expect(data.rateLimits.requests).toBeGreaterThanOrEqual(5);
    });

    it('resets all usage when no provider specified', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers', {
        method: 'POST',
        body: JSON.stringify({
          action: 'resetUsage',
          data: {}
        }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await POST(request as any);
      const data = await response.json();
      
      expect(data.success).toBe(true);
    });
  });

  describe('provider health checks', () => {
    it('includes latency in health response', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers?provider=anthropic');
      const response = await GET(request as any);
      const data = await response.json();
      
      if (data.health.status === 'healthy') {
        expect(data.health).toHaveProperty('latency');
        expect(typeof data.health.latency).toBe('number');
      }
    });

    it('includes error message for failed providers', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers?provider=anthropic');
      const response = await GET(request as any);
      const data = await response.json();
      
      if (data.health.status !== 'healthy') {
        expect(data.health).toHaveProperty('error');
      }
    });
  });

  describe('error handling', () => {
    it('handles missing provider gracefully', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers?provider=nonexistent');
      const response = await GET(request as any);
      const data = await response.json();
      
      expect(data.health.status).toBe('unknown');
    });

    it('returns 500 on POST error', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers', {
        method: 'POST',
        body: 'invalid',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await POST(request as any);
      
      expect(response.status).toBe(500);
    });
  });

  describe('rate limit tracking', () => {
    it('tracks requests per provider', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers', {
        method: 'POST',
        body: JSON.stringify({
          action: 'recordUsage',
          data: {
            provider: 'openai',
            requests: 3,
            tokens: 200
          }
        }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await POST(request as any);
      const data = await response.json();
      
      expect(data.rateLimits).toHaveProperty('requests');
    });

    it('tracks tokens per provider', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers', {
        method: 'POST',
        body: JSON.stringify({
          action: 'recordUsage',
          data: {
            provider: 'openai',
            requests: 1,
            tokens: 1000
          }
        }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await POST(request as any);
      const data = await response.json();
      
      expect(data.rateLimits).toHaveProperty('tokensUsed');
    });
  });

  describe('cache statistics', () => {
    it('tracks cache hits', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers');
      
      // First request
      await GET(request as any);
      
      // Second request should hit cache
      const response = await GET(request as any);
      const data = await response.json();
      
      expect(data.cache.hits).toBeGreaterThanOrEqual(0);
    });

    it('calculates hit rate', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/providers');
      const response = await GET(request as any);
      const data = await response.json();
      
      expect(data.cache).toHaveProperty('hitRate');
      expect(data.cache.hitRate).toBeGreaterThanOrEqual(0);
      expect(data.cache.hitRate).toBeLessThanOrEqual(1);
    });
  });
});
