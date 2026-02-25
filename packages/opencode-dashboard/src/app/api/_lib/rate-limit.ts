// Simple in-memory rate limiter (for production, use Redis)
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number = 100, windowMs: number = 60000): boolean {
  const now = Date.now();
  const record = requestCounts.get(key);
  
  if (!record || record.resetAt < now) {
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
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of requestCounts.entries()) {
    if (record.resetAt < now) {
      requestCounts.delete(key);
    }
  }
}, 60000); // Cleanup every minute
