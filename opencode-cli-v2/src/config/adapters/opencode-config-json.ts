import type { UnifiedConfig } from '../schema';

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export function adaptOpencodeConfigJson(raw: unknown): Partial<UnifiedConfig> {
  const source = asRecord(raw);

  return {
    runtime: asRecord(source.runtime),
    performance: asRecord(source.performance),
    database: asRecord(source.database),
    logging: asRecord(source.logging),
    sessions: asRecord(source.sessions),
    dashboard: asRecord(source.dashboard),
    features: asRecord(source.features),
    paths: asRecord(source.paths),
    legacy: {
      sources: ['.opencode.config.json'],
      raw: {
        opencodeConfigJson: source
      }
    }
  };
}
