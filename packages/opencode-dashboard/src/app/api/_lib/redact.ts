const SENSITIVE_KEYS = ['apikey', 'token', 'secret', 'password', 'authorization', 'key'];

/**
 * Deep-clone an object and replace values of keys matching sensitive patterns with '[REDACTED]'.
 * Non-object values pass through unchanged.
 */
export function redactSecrets<T>(obj: T): T {
  if (typeof obj !== 'object' || obj === null) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSecrets(item)) as T;
  }

  const redacted: Record<string, unknown> = {};
  const record = obj as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    const keyLower = key.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => keyLower.includes(s))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof record[key] === 'object' && record[key] !== null) {
      redacted[key] = redactSecrets(record[key]);
    } else {
      redacted[key] = record[key];
    }
  }

  return redacted as T;
}
