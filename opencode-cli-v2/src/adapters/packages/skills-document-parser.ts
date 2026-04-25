import YAML from 'yaml';

export interface ParsedSkillMarkdown {
  readonly frontmatter: Record<string, unknown>;
  readonly description: string;
  readonly whenToUse: string[];
  readonly steps: string[];
}

export function parseSkillMarkdown(content: string): ParsedSkillMarkdown {
  const { frontmatter, body } = splitFrontmatter(content);
  return {
    frontmatter,
    description: extractDescription(body),
    whenToUse: extractSectionItems(body, ['When to Use']),
    steps: extractSectionItems(body, ['Workflow', 'Quick Start'])
  };
}

function splitFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { frontmatter: {}, body: normalized };
  }

  const closingIndex = normalized.indexOf('\n---\n', 4);
  if (closingIndex < 0) {
    return { frontmatter: {}, body: normalized };
  }

  const frontmatterText = normalized.slice(4, closingIndex);
  const body = normalized.slice(closingIndex + 5);
  const parsed = YAML.parse(frontmatterText);
  return { frontmatter: asRecord(parsed), body };
}

function extractDescription(body: string): string {
  const lines = body.split('\n').map((line) => line.trim());
  const filtered = lines.filter((line) => line.length > 0 && !line.startsWith('#'));
  return filtered[0] ?? 'Legacy skill loaded from filesystem';
}

function extractSectionItems(body: string, sectionNames: readonly string[]): string[] {
  for (const sectionName of sectionNames) {
    const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`, 'im');
    const match = body.match(regex);
    if (!match?.[1]) {
      continue;
    }

    const items = match[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^([-*]|\d+\.)\s+/.test(line))
      .map((line) => line.replace(/^([-*]|\d+\.)\s+/, '').trim())
      .filter((line) => line.length > 0);

    if (items.length > 0) {
      return items;
    }
  }

  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
