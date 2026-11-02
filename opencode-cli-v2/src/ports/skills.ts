import { z } from 'zod';

/**
 * Skills port defines loading, discovery, and execution contracts for skills.
 */

export const SkillVisibilitySchema = z.enum(['public', 'private', 'internal']);
export type SkillVisibility = z.infer<typeof SkillVisibilitySchema>;

export const SkillMetadataSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  visibility: SkillVisibilitySchema.default('public'),
  entrypoint: z.string().min(1),
  supportsArguments: z.boolean().default(false)
});
export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;

export const SkillLoadRequestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  preload: z.boolean().default(false)
});
export type SkillLoadRequest = z.infer<typeof SkillLoadRequestSchema>;

export const SkillLoadResultSchema = z.object({
  loaded: z.boolean(),
  metadata: SkillMetadataSchema.optional(),
  reason: z.string().optional()
});
export type SkillLoadResult = z.infer<typeof SkillLoadResultSchema>;

export const SkillExecutionRequestSchema = z.object({
  name: z.string().min(1),
  args: z.record(z.string(), z.unknown()).default({}),
  context: z.record(z.string(), z.unknown()).optional(),
  timeoutMs: z.number().int().positive().optional()
});
export type SkillExecutionRequest = z.infer<typeof SkillExecutionRequestSchema>;

export const SkillExecutionResultSchema = z.object({
  success: z.boolean(),
  output: z.unknown().optional(),
  logs: z.array(z.string()).default([]),
  durationMs: z.number().nonnegative().optional(),
  error: z.string().optional()
});
export type SkillExecutionResult = z.infer<typeof SkillExecutionResultSchema>;

export const SkillErrorCodeSchema = z.enum([
  'SKILL_NOT_FOUND',
  'SKILL_LOAD_FAILED',
  'SKILL_UNLOAD_FAILED',
  'SKILL_EXECUTION_FAILED',
  'SKILL_VALIDATION_FAILED',
  'VALIDATION_ERROR',
  'UNKNOWN'
]);
export type SkillErrorCode = z.infer<typeof SkillErrorCodeSchema>;

export const SkillsPortErrorSchema = z.object({
  code: SkillErrorCodeSchema,
  message: z.string().min(1),
  retriable: z.boolean().default(false),
  details: z.record(z.string(), z.unknown()).optional()
});
export type SkillsPortError = z.infer<typeof SkillsPortErrorSchema>;

export interface SkillsPort {
  /** Lists all discoverable skills. */
  listSkills(): Promise<SkillMetadata[]>;
  /** Fetches skill metadata by name. */
  getSkill(name: string): Promise<SkillMetadata | null>;
  /** Loads a skill into runtime memory. */
  loadSkill(request: SkillLoadRequest): Promise<SkillLoadResult>;
  /** Unloads a skill from runtime memory. */
  unloadSkill(name: string): Promise<void>;
  /** Executes a loaded skill with typed arguments. */
  executeSkill(request: SkillExecutionRequest): Promise<SkillExecutionResult>;
}
