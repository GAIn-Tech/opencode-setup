import type { UnifiedConfig } from '../schema';

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export function adaptLegacyConfigYaml(raw: unknown): Partial<UnifiedConfig> {
  const source = asRecord(raw);

  return {
    globalRules: asRecord(source.global_rules),
    delegation: asRecord(source.delegation),
    coordination: asRecord(source.coordination),
    development: asRecord(source.development),
    monitoring: asRecord(source.monitoring),
    legacy: {
      sources: ['config.yaml'],
      raw: {
        configYaml: source
      }
    }
  };
}
