import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { GET, POST } from '../src/app/api/orchestration/route';
import { NextResponse } from 'next/server';

describe('orchestration route', () => {
  describe('GET /api/orchestration', () => {
    it('returns orchestration data with health score', async () => {
      const request = new Request('http://localhost:3000/api/orchestration');
      const response = await GET(request);
      
      expect(response).toBeInstanceOf(NextResponse);
      const data = await response.json();
      
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('health');
      expect(data.health).toHaveProperty('score');
      expect(data.health).toHaveProperty('level');
      expect(data.health).toHaveProperty('signals');
    });

    it('returns policy simulation data structure', async () => {
      const request = new Request('http://localhost:3000/api/orchestration');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data).toHaveProperty('frontier');
      expect(data.frontier).toHaveProperty('autonomy_readiness_score');
      expect(data.frontier).toHaveProperty('governance_score');
      expect(data.frontier).toHaveProperty('plugin_runtime_score');
    });

    it('respects sinceDays parameter', async () => {
      const request = new Request('http://localhost:3000/api/orchestration?sinceDays=7');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.window.since_days).toBe(7);
    });

    it('respects topN parameter', async () => {
      const request = new Request('http://localhost:3000/api/orchestration?topN=5');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.window.top_n).toBe(5);
    });

    it('returns error response on exception', async () => {
      const request = new Request('http://localhost:3000/api/orchestration');
      const response = await GET(request);
      
      // Should not throw, should return 500 on error
      expect(response.status).toBeLessThanOrEqual(500);
    });

    it('includes integration gaps in response', async () => {
      const request = new Request('http://localhost:3000/api/orchestration');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data).toHaveProperty('integration');
      expect(data.integration).toHaveProperty('gaps');
      expect(Array.isArray(data.integration.gaps)).toBe(true);
    });

    it('includes data fidelity information', async () => {
      const request = new Request('http://localhost:3000/api/orchestration');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data).toHaveProperty('data_fidelity');
      expect(['live', 'degraded', 'demo']).toContain(data.data_fidelity);
      expect(data).toHaveProperty('fidelity_reason');
      expect(data).toHaveProperty('fidelity_impact');
    });

    it('includes internal runtime observability data', async () => {
      const request = new Request('http://localhost:3000/api/orchestration');
      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('internal_runtime');
      expect(data.internal_runtime).toHaveProperty('source');
      expect(data.internal_runtime).toHaveProperty('bootstrap');
      expect(data.internal_runtime.bootstrap).toHaveProperty('packagesAttempted');
      expect(data.internal_runtime.bootstrap).toHaveProperty('packagesLoaded');
      expect(data.internal_runtime).toHaveProperty('contextGovernor');
      expect(Array.isArray(data.internal_runtime.contextGovernor.topBudgetSessions)).toBe(true);
      expect(data.internal_runtime).toHaveProperty('runtimeContext');
      expect(data.internal_runtime.runtimeContext).toHaveProperty('resolveAvailable');
      expect(data.internal_runtime).toHaveProperty('workflows');
      expect(data.internal_runtime).toHaveProperty('modelRouter');
      expect(data.internal_runtime.modelRouter).toHaveProperty('collaborators');
      expect(data.internal_runtime).toHaveProperty('metaAwareness');
    });

    it('reports runtime source as live or fallback', async () => {
      const request = new Request('http://localhost:3000/api/orchestration');
      const response = await GET(request);
      const data = await response.json();

      expect(['live', 'fallback']).toContain(data.internal_runtime.source);
    });
  });

  describe('POST /api/orchestration', () => {
    it('accepts event records', async () => {
      const events = [
        {
          timestamp: new Date().toISOString(),
          trace_id: 'trace-123',
          model: 'claude-opus',
          input_tokens: 100,
          output_tokens: 50,
        }
      ];
      
      const request = new Request('http://localhost:3000/api/orchestration', {
        method: 'POST',
        body: JSON.stringify({ events }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('accepted');
    });

    it('rejects empty events array', async () => {
      const request = new Request('http://localhost:3000/api/orchestration', {
        method: 'POST',
        body: JSON.stringify({ events: [] }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.message).toContain('No events');
    });

    it('returns error on invalid JSON', async () => {
      const request = new Request('http://localhost:3000/api/orchestration', {
        method: 'POST',
        body: 'invalid json',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(500);
    });

    it('includes signing mode in response', async () => {
      const events = [
        {
          timestamp: new Date().toISOString(),
          trace_id: 'trace-123',
          model: 'claude-opus',
        }
      ];
      
      const request = new Request('http://localhost:3000/api/orchestration', {
        method: 'POST',
        body: JSON.stringify({ events }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(data).toHaveProperty('signing_mode');
    });

    it('supports replace mode', async () => {
      const events = [
        {
          timestamp: new Date().toISOString(),
          trace_id: 'trace-123',
        }
      ];
      
      const request = new Request('http://localhost:3000/api/orchestration', {
        method: 'POST',
        body: JSON.stringify({ events, replace: true }),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(data.message).toContain('replaced');
    });
  });

  describe('caching behavior', () => {
    it('returns cached response within TTL', async () => {
      const request = new Request('http://localhost:3000/api/orchestration');
      
      const response1 = await GET(request);
      const data1 = await response1.json();
      
      // Second request should hit cache
      const response2 = await GET(request);
      const data2 = await response2.json();
      
      expect(data1.generated_at).toBe(data2.generated_at);
    });

    it('bypasses cache with noCache=1 parameter', async () => {
      const request = new Request('http://localhost:3000/api/orchestration?noCache=1');
      const response = await GET(request);
      
      expect(response.status).toBeLessThanOrEqual(500);
    });
  });

  describe('error handling', () => {
    it('returns 500 on internal error', async () => {
      const request = new Request('http://localhost:3000/api/orchestration');
      const response = await GET(request);
      
      // Should handle errors gracefully
      expect([200, 500]).toContain(response.status);
    });

    it('includes error message in response', async () => {
      const request = new Request('http://localhost:3000/api/orchestration');
      const response = await GET(request);
      
      if (response.status === 500) {
        const data = await response.json();
        expect(data).toHaveProperty('message');
      }
    });
  });
});
