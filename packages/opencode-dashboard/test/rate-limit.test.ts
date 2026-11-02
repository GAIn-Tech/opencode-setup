import { test, expect, describe, beforeEach } from 'bun:test';
import { rateLimit, RateLimitResult } from '../src/app/api/_lib/rate-limit';

describe('rateLimit', () => {
  beforeEach(() => {
    // Clear the in-memory store before each test
    // Note: We can't directly clear it, so we'll use unique keys per test
  });

  test('allows requests within limit', () => {
    const key = `test-key-${Date.now()}-1`;
    const result = rateLimit(key, 5, 60000);
    
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.limit).toBe(5);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });

  test('increments count on each request', () => {
    const key = `test-key-${Date.now()}-2`;
    
    const result1 = rateLimit(key, 5, 60000);
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(4);
    
    const result2 = rateLimit(key, 5, 60000);
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(3);
    
    const result3 = rateLimit(key, 5, 60000);
    expect(result3.allowed).toBe(true);
    expect(result3.remaining).toBe(2);
  });

  test('blocks requests exceeding limit', () => {
    const key = `test-key-${Date.now()}-3`;
    
    // Use up all 3 requests
    rateLimit(key, 3, 60000);
    rateLimit(key, 3, 60000);
    rateLimit(key, 3, 60000);
    
    // Fourth request should be blocked
    const result = rateLimit(key, 3, 60000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  test('resets counter after window expires', () => {
    const key = `test-key-${Date.now()}-4`;
    
    // First request
    const result1 = rateLimit(key, 2, 100); // 100ms window
    expect(result1.allowed).toBe(true);
    
    // Wait for window to expire
    const start = Date.now();
    while (Date.now() - start < 150) {
      // Busy wait
    }
    
    // Should reset and allow new request
    const result2 = rateLimit(key, 2, 100);
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(1);
  });

  test('returns correct resetAt timestamp', () => {
    const key = `test-key-${Date.now()}-5`;
    const windowMs = 60000;
    const beforeCall = Date.now();
    
    const result = rateLimit(key, 10, windowMs);
    
    const afterCall = Date.now();
    expect(result.resetAt).toBeGreaterThanOrEqual(beforeCall + windowMs);
    expect(result.resetAt).toBeLessThanOrEqual(afterCall + windowMs);
  });

  test('handles different limits correctly', () => {
    const key1 = `test-key-${Date.now()}-6a`;
    const key2 = `test-key-${Date.now()}-6b`;
    
    // Key1 with limit 2
    rateLimit(key1, 2, 60000);
    rateLimit(key1, 2, 60000);
    const result1 = rateLimit(key1, 2, 60000);
    expect(result1.allowed).toBe(false);
    
    // Key2 with limit 5 should still allow requests
    const result2 = rateLimit(key2, 5, 60000);
    expect(result2.allowed).toBe(true);
    expect(result2.limit).toBe(5);
  });

  test('uses default limit and window when not specified', () => {
    const key = `test-key-${Date.now()}-7`;
    
    // Call with defaults
    const result = rateLimit(key);
    
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });

  test('returns correct remaining count at limit boundary', () => {
    const key = `test-key-${Date.now()}-8`;
    const limit = 3;
    
    const r1 = rateLimit(key, limit, 60000);
    expect(r1.remaining).toBe(2);
    
    const r2 = rateLimit(key, limit, 60000);
    expect(r2.remaining).toBe(1);
    
    const r3 = rateLimit(key, limit, 60000);
    expect(r3.remaining).toBe(0);
    
    const r4 = rateLimit(key, limit, 60000);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  test('maintains separate counters for different keys', () => {
    const key1 = `test-key-${Date.now()}-9a`;
    const key2 = `test-key-${Date.now()}-9b`;
    
    rateLimit(key1, 2, 60000);
    rateLimit(key1, 2, 60000);
    
    // key2 should not be affected
    const result = rateLimit(key2, 2, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  test('returns RateLimitResult interface with all required fields', () => {
    const key = `test-key-${Date.now()}-10`;
    const result = rateLimit(key, 5, 60000);
    
    expect(result).toHaveProperty('allowed');
    expect(result).toHaveProperty('remaining');
    expect(result).toHaveProperty('resetAt');
    expect(result).toHaveProperty('limit');
    
    expect(typeof result.allowed).toBe('boolean');
    expect(typeof result.remaining).toBe('number');
    expect(typeof result.resetAt).toBe('number');
    expect(typeof result.limit).toBe('number');
  });
});
