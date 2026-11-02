import type { UnifiedConfig } from '../schema';

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function adaptCompoundEngineeringConfig(raw: unknown): Partial<UnifiedConfig> {
  const source = asRecord(raw);
  const skills = asRecord(source.skills);
  const integration = asRecord(source.integration);

  return {
    skills: {
      preload: toStringArray(skills.enabled),
      categories: asRecord(skills.categories) as Record<string, string[]>,
      registry: typeof integration.skills_directory === 'string' ? integration.skills_directory : undefined
    },
    compound: source,
    legacy: {
      sources: ['compound-engineering.json'],
      raw: {
        compoundEngineering: source
      }
    }
  };
}
