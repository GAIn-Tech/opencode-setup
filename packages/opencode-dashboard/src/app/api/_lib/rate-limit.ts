// Simple in-memory rate limiter (for production, use Redis)
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const MAX_ENTRIES = 10000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export function rateLimit(key: string, limit: number = 100, windowMs: number = 60000): RateLimitResult {
  const now = Date.now();
  const record = requestCounts.get(key);
  
  if (!record || record.resetAt < now) {
    // Check if we need to evict oldest entries
    if (requestCounts.size >= MAX_ENTRIES) {
      const oldestKey = requestCounts.keys().next().value;
      if (oldestKey) {
        requestCounts.delete(oldestKey);
      }
    }
    const resetAt = now + windowMs;
    requestCounts.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt,
      limit
    };
  }
  
  const allowed = record.count < limit;
  const remaining = Math.max(0, limit - record.count);
  
  if (allowed) {
    record.count++;
  }
  
  return {
    allowed,
    remaining: allowed ? remaining - 1 : 0,
    resetAt: record.resetAt,
    limit
  };
}

// Cleanup old entries periodically
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of requestCounts.entries()) {
    if (record.resetAt < now) {
      requestCounts.delete(key);
    }
  }
}, 60000); // Cleanup every minute

cleanupInterval.unref();
