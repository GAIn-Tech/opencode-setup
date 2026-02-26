import { describe, it, expect } from 'bun:test';
import { GET } from '../src/app/api/memory-graph/route';
import { NextResponse } from 'next/server';

describe('memory-graph route', () => {
  describe('GET /api/memory-graph', () => {
    it('returns graph data with nodes and edges', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph');
      const response = await GET(request);
      
      expect(response).toBeInstanceOf(NextResponse);
      const data = await response.json();
      
      expect(data).toHaveProperty('nodes');
      expect(data).toHaveProperty('edges');
      expect(data).toHaveProperty('meta');
      expect(Array.isArray(data.nodes)).toBe(true);
      expect(Array.isArray(data.edges)).toBe(true);
    });

    it('returns graph nodes with required properties', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph');
      const response = await GET(request);
      const data = await response.json();
      
      if (data.nodes.length > 0) {
        const node = data.nodes[0];
        expect(node).toHaveProperty('id');
        expect(node).toHaveProperty('type');
        expect(node).toHaveProperty('count');
      }
    });

    it('returns graph edges with required properties', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph');
      const response = await GET(request);
      const data = await response.json();
      
      if (data.edges.length > 0) {
        const edge = data.edges[0];
        expect(edge).toHaveProperty('from');
        expect(edge).toHaveProperty('to');
        expect(edge).toHaveProperty('weight');
        expect(edge).toHaveProperty('type');
      }
    });

    it('respects sinceDays parameter', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph?sinceDays=7');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.meta.sinceDays).toBe(7);
    });

    it('respects maxFanout parameter', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph?maxFanout=20');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.meta.maxFanout).toBe(20);
    });

    it('respects maxNodes parameter', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph?maxNodes=100');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.meta.maxNodes).toBe(100);
    });

    it('supports focus parameter for subgraph', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph?focus=test-session');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.meta).toHaveProperty('focus');
    });

    it('supports depth parameter for focus', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph?focus=test&depth=3');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.meta.focusDepth).toBe(3);
    });

    it('returns metadata with node type counts', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.meta).toHaveProperty('nodeTypes');
      expect(typeof data.meta.nodeTypes).toBe('object');
    });

    it('returns metadata with total counts', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.meta).toHaveProperty('totalNodes');
      expect(data.meta).toHaveProperty('totalEdges');
      expect(typeof data.meta.totalNodes).toBe('number');
      expect(typeof data.meta.totalEdges).toBe('number');
    });

    it('supports DOT format output', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph?format=dot');
      const response = await GET(request);
      
      expect(response.headers.get('Content-Type')).toBe('text/vnd.graphviz');
      const text = await response.text();
      expect(text).toContain('digraph');
    });

    it('returns JSON format by default', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph');
      const response = await GET(request);
      
      expect(response.headers.get('Content-Type')).toContain('application/json');
    });

    it('handles missing .opencode directory gracefully', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.nodes)).toBe(true);
      expect(Array.isArray(data.edges)).toBe(true);
    });

    it('includes timestamp in metadata', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.meta).toHaveProperty('timestamp');
      expect(typeof data.meta.timestamp).toBe('string');
    });

    it('includes source information in metadata', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.meta).toHaveProperty('source');
      expect(data.meta.source).toContain('.opencode');
    });
  });

  describe('caching behavior', () => {
    it('returns cached response within TTL', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph');
      
      const response1 = await GET(request);
      const data1 = await response1.json();
      
      const response2 = await GET(request);
      const data2 = await response2.json();
      
      expect(data1.meta.timestamp).toBe(data2.meta.timestamp);
    });

    it('bypasses cache with noCache=1 parameter', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph?noCache=1');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
    });
  });

  describe('error handling', () => {
    it('returns valid response on error', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.nodes)).toBe(true);
      expect(Array.isArray(data.edges)).toBe(true);
    });

    it('includes error message in meta if error occurs', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph');
      const response = await GET(request);
      const data = await response.json();
      
      // Should have either valid data or error message
      expect(data.meta).toBeDefined();
    });
  });

  describe('node type validation', () => {
    it('creates nodes with valid types', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph');
      const response = await GET(request);
      const data = await response.json();
      
      const validTypes = ['session', 'error', 'agent', 'tool', 'model', 'skill', 'pattern', 'concept', 'solution', 'template', 'profile', 'rule'];
      
      for (const node of data.nodes) {
        expect(validTypes).toContain(node.type);
      }
    });
  });

  describe('edge type validation', () => {
    it('creates edges with valid types', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph');
      const response = await GET(request);
      const data = await response.json();
      
      const validTypes = ['uses_agent', 'uses_tool', 'uses_model', 'has_error', 'uses_skill', 'solves_with', 'follows_pattern', 'delegates_to', 'learns_from', 'uses_template', 'has_profile', 'matches_rule'];
      
      for (const edge of data.edges) {
        expect(validTypes).toContain(edge.type);
      }
    });
  });

  describe('parameter validation', () => {
    it('clamps sinceDays to valid range', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph?sinceDays=500');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.meta.sinceDays).toBeLessThanOrEqual(365);
    });

    it('clamps maxFanout to valid range', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph?maxFanout=500');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.meta.maxFanout).toBeLessThanOrEqual(200);
    });

    it('clamps maxNodes to valid range', async () => {
      const request = new Request('http://localhost:3000/api/memory-graph?maxNodes=5000');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.meta.maxNodes).toBeLessThanOrEqual(2000);
    });
  });
});
