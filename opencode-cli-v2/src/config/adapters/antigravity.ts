import type { UnifiedConfig } from '../schema';

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export function adaptAntigravityConfig(raw: unknown): Partial<UnifiedConfig> {
  const source = asRecord(raw);

  return {
    antigravity: source,
    legacy: {
      sources: ['antigravity.json'],
      raw: {
        antigravity: source
      }
    }
  };
}
