import type { UnifiedConfig } from '../schema';

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export function adaptOpencodeJson(raw: unknown): Partial<UnifiedConfig> {
  const source = asRecord(raw);
  const provider = asRecord(source.provider);
  const model = asRecord(source.model);

  return {
    models: {
      default: typeof model.default === 'string' ? model.default : undefined,
      providers: provider as UnifiedConfig['models']['providers'],
      catalog: asRecord(source.models)
    },
    plugins: Array.isArray(source.plugin) ? source.plugin.filter((entry): entry is string => typeof entry === 'string') : [],
    mcp: {
      servers: asRecord(source.mcp) as UnifiedConfig['mcp']['servers']
    },
    legacy: {
      sources: ['opencode.json'],
      raw: {
        opencode: source
      }
    }
  };
}
