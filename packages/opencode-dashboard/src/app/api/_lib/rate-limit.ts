// Simple in-memory rate limiter (for production, use Redis)
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const MAX_ENTRIES = 10000;

export function rateLimit(key: string, limit: number = 100, windowMs: number = 60000): boolean {
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
    requestCounts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (record.count >= limit) {
    return false;
  }
  
  record.count++;
  return true;
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
