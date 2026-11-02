import { describe, it, expect } from 'bun:test';
import { GET as getCompression } from '../src/app/api/compression/route';
import { GET as getContext7Stats } from '../src/app/api/context7-stats/route';
import { NextResponse } from 'next/server';

function createMockNextRequest(url: string, options?: RequestInit) {
  return new Request(url, options);
}

describe('compression and Context7 routes', () => {
  describe('GET /api/compression', () => {
    it('returns compression stats payload', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/compression');
      const response = await getCompression(request);

      expect(response).toBeInstanceOf(NextResponse);
      const data = await response.json();

      expect(data).toHaveProperty('totalEvents');
      expect(data).toHaveProperty('totalTokensSaved');
      expect(data).toHaveProperty('avgCompressionRatio');
    });
  });

  describe('GET /api/context7-stats', () => {
    it('returns Context7 stats payload', async () => {
      const request = createMockNextRequest('http://localhost:3000/api/context7-stats');
      const response = await getContext7Stats(request);

      expect(response).toBeInstanceOf(NextResponse);
      const data = await response.json();

      expect(data).toHaveProperty('totalLookups');
      expect(data).toHaveProperty('resolved');
      expect(data).toHaveProperty('failed');
      expect(data).toHaveProperty('resolutionRate');
    });
  });
});
