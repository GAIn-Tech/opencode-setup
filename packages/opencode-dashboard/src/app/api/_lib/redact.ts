const SENSITIVE_KEYS = ['apikey', 'token', 'secret', 'password', 'authorization', 'key'];

/**
 * Deep-clone an object and replace values of keys matching sensitive patterns with '[REDACTED]'.
 * Non-object values pass through unchanged.
 */
export function redactSecrets(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSecrets(item));
  }

  const redacted: Record<string, any> = {};

  for (const key of Object.keys(obj)) {
    const keyLower = key.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => keyLower.includes(s))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      redacted[key] = redactSecrets(obj[key]);
    } else {
      redacted[key] = obj[key];
    }
  }

  return redacted;
}
