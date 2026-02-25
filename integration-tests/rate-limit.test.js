import { describe, test, expect } from 'bun:test';

describe('Rate Limiting', () => {
  test('should enforce rate limit on write routes', async () => {
    const { rateLimit } = await import('../packages/opencode-dashboard/src/app/api/_lib/rate-limit.ts');
    
    // Test basic rate limiting
    const key = 'test:127.0.0.1';
    const limit = 3;
    const windowMs = 1000;
    
    // First 3 requests should succeed
    expect(rateLimit(key, limit, windowMs)).toBe(true);
    expect(rateLimit(key, limit, windowMs)).toBe(true);
    expect(rateLimit(key, limit, windowMs)).toBe(true);
    
    // 4th request should be rate limited
    expect(rateLimit(key, limit, windowMs)).toBe(false);
    
    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    // Should work again after window expires
    expect(rateLimit(key, limit, windowMs)).toBe(true);
  });
  
  test('should use separate counters for different IPs', async () => {
    const { rateLimit } = await import('../packages/opencode-dashboard/src/app/api/_lib/rate-limit.ts');
    
    const limit = 2;
    const windowMs = 1000;
    
    // IP 1 uses its quota
    expect(rateLimit('test:192.168.1.1', limit, windowMs)).toBe(true);
    expect(rateLimit('test:192.168.1.1', limit, windowMs)).toBe(true);
    expect(rateLimit('test:192.168.1.1', limit, windowMs)).toBe(false);
    
    // IP 2 should have its own quota
    expect(rateLimit('test:192.168.1.2', limit, windowMs)).toBe(true);
    expect(rateLimit('test:192.168.1.2', limit, windowMs)).toBe(true);
    expect(rateLimit('test:192.168.1.2', limit, windowMs)).toBe(false);
  });
  
  test('should clean up expired entries', async () => {
    const { rateLimit } = await import('../packages/opencode-dashboard/src/app/api/_lib/rate-limit.ts');
    
    const key = 'test:cleanup';
    const limit = 1;
    const windowMs = 500;
    
    // Use quota
    expect(rateLimit(key, limit, windowMs)).toBe(true);
    expect(rateLimit(key, limit, windowMs)).toBe(false);
    
    // Wait for cleanup cycle (60s is too long for test, but entry should expire)
    await new Promise(resolve => setTimeout(resolve, 600));
    
    // Should work again
    expect(rateLimit(key, limit, windowMs)).toBe(true);
  });
});
