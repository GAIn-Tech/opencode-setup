import type { LegacySkill } from './skills-mappings';

export function matchSkillForContext(skill: LegacySkill, context: Record<string, unknown>): number {
  const haystack = flattenContextStrings(context).join(' ').toLowerCase();
  if (!haystack) {
    return 0;
  }

  let score = 0;
  for (const trigger of skill.when_to_use) {
    const normalized = trigger.trim().toLowerCase();
    if (!normalized) {
      continue;
    }

    if (haystack.includes(normalized)) {
      score += 3;
      continue;
    }

    const words = tokenize(normalized);
    if (words.length > 0 && words.every((word) => haystack.includes(word.toLowerCase()))) {
      score += 1;
    }
  }

  return score;
}

function flattenContextStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenContextStrings(item));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap((item) => flattenContextStrings(item));
  }

  return [];
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}
