import { dirname, relative } from 'node:path';

import { z } from 'zod';

import { SkillExecutionRequestSchema, SkillMetadataSchema, type SkillMetadata } from '../../ports/skills';
import { parseSkillMarkdown } from './skills-document-parser';

export const LegacySkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  when_to_use: z.array(z.string().min(1)).default([]),
  steps: z.array(z.string().min(1)).default([])
});
export type LegacySkill = z.infer<typeof LegacySkillSchema>;

const LegacyFrontmatterSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
    visibility: z.enum(['public', 'private', 'internal']).optional(),
    entrypoint: z.string().min(1).optional(),
    supportsArguments: z.boolean().optional(),
    when_to_use: z.array(z.string().min(1)).optional(),
    steps: z.array(z.string().min(1)).optional(),
    triggers: z.array(z.string().min(1)).optional()
  })
  .passthrough();

export interface LegacySkillDocument {
  readonly id: string;
  readonly filePath: string;
  readonly legacy: LegacySkill;
  readonly metadata: SkillMetadata;
}

export interface LegacySkillsRuntime {
  listSkills?: () => unknown;
  loadSkill?: (name: string, options?: Record<string, unknown>) => unknown;
  unloadSkill?: (name: string) => unknown;
  executeSkill?: (name: string, args?: Record<string, unknown>, context?: Record<string, unknown>) => unknown;
  selectSkillsForContext?: (context: Record<string, unknown>) => unknown;
  validateSkill?: (name: string) => unknown;
}

const LegacySkillsRuntimeSchema = z
  .object({
    listSkills: z.function().optional(),
    loadSkill: z.function().optional(),
    unloadSkill: z.function().optional(),
    executeSkill: z.function().optional(),
    selectSkillsForContext: z.function().optional(),
    validateSkill: z.function().optional()
  })
  .passthrough();

export function parseLegacySkillDocument(skillId: string, filePath: string, content: string): LegacySkillDocument {
  const parsed = parseSkillMarkdown(content);
  const { frontmatter } = parsed;
  const parsedFrontmatter = LegacyFrontmatterSchema.parse(frontmatter);
  const name = parsedFrontmatter.name ?? skillId;
  const description = parsedFrontmatter.description ?? parsed.description;
  const whenToUse = parsedFrontmatter.when_to_use ?? parsed.whenToUse;
  const steps = parsedFrontmatter.steps ?? parsed.steps;

  const legacy = LegacySkillSchema.parse({
    name,
    description,
    when_to_use: whenToUse,
    steps
  });

  return {
    id: skillId,
    filePath,
    legacy,
    metadata: mapLegacySkillToMetadata(skillId, filePath, legacy, parsedFrontmatter)
  };
}

export function parseLegacySkillsRuntime(moduleValue: unknown): LegacySkillsRuntime {
  const namespace = asRecord(moduleValue);
  const candidate = asRecord(namespace.default);
  const resolved = Object.keys(candidate).length > 0 ? candidate : namespace;
  return LegacySkillsRuntimeSchema.parse(resolved) as LegacySkillsRuntime;
}

export function mapLegacySkillToMetadata(
  skillId: string,
  filePath: string,
  legacy: LegacySkill,
  frontmatter: Record<string, unknown> = {}
): SkillMetadata {
  const tags = uniqueStrings([
    ...legacy.when_to_use.flatMap((value) => tokenize(value)),
    ...toStringArray(frontmatter.tags)
  ]).slice(0, 16);

  return SkillMetadataSchema.parse({
    name: legacy.name,
    version: toOptionalString(frontmatter.version) ?? '1.0.0',
    description: legacy.description,
    tags,
    visibility: toOptionalString(frontmatter.visibility) ?? 'public',
    entrypoint: toOptionalString(frontmatter.entrypoint) ?? filePath,
    supportsArguments: toOptionalBoolean(frontmatter.supportsArguments) ?? true,
    id: skillId
  });
}

export function normalizeSkillIdFromPath(skillsDir: string, skillFilePath: string): string {
  const relativeDir = relative(skillsDir, dirname(skillFilePath));
  return relativeDir.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function toLegacyExecutionPayload(request: unknown): { name: string; args: Record<string, unknown>; context: Record<string, unknown> } {
  const parsed = SkillExecutionRequestSchema.parse(request);
  return {
    name: parsed.name,
    args: parsed.args,
    context: asRecord(parsed.context)
  };
}


function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
