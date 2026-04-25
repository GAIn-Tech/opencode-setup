import { z } from 'zod';

const DictionarySchema = z.record(z.string(), z.unknown());

const ProviderSchema = z
  .object({
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional()
  })
  .passthrough();

const ModelsSchema = z
  .object({
    default: z.string().optional(),
    providers: z.record(z.string(), ProviderSchema).default({}),
    catalog: DictionarySchema.optional()
  })
  .passthrough()
  .default({
    providers: {}
  });

const AgentSchema = z
  .object({
    type: z.string().optional(),
    model: z.string().optional(),
    skills: z.array(z.string()).optional(),
    enabled: z.boolean().optional()
  })
  .passthrough();

const ContextSchema = z
  .object({
    budget: z
      .object({
        warning: z.number().min(0).max(1).default(0.75),
        critical: z.number().min(0).max(1).default(0.8)
      })
      .passthrough()
      .default({
        warning: 0.75,
        critical: 0.8
      }),
    compression: z
      .object({
        enabled: z.boolean().default(true),
        threshold: z.number().min(0).max(1).default(0.65)
      })
      .passthrough()
      .default({
        enabled: true,
        threshold: 0.65
      })
  })
  .passthrough()
  .default({
    budget: {
      warning: 0.75,
      critical: 0.8
    },
    compression: {
      enabled: true,
      threshold: 0.65
    }
  });

const SkillsSchema = z
  .object({
    registry: z.string().optional(),
    preload: z.array(z.string()).default([]),
    categories: z.record(z.string(), z.array(z.string())).optional()
  })
  .passthrough()
  .default({
    preload: []
  });

const McpServerSchema = z
  .object({
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    enabled: z.boolean().optional()
  })
  .passthrough();

const McpSchema = z
  .object({
    servers: z.record(z.string(), McpServerSchema).default({})
  })
  .passthrough()
  .default({
    servers: {}
  });

const LegacySchema = z
  .object({
    sources: z.array(z.string()).default([]),
    raw: DictionarySchema.default({})
  })
  .passthrough()
  .default({
    sources: [],
    raw: {}
  });

export const UnifiedConfigSchema = z
  .object({
    version: z.string().default('2.0'),
    models: ModelsSchema,
    agents: z.record(z.string(), AgentSchema).default({}),
    context: ContextSchema,
    skills: SkillsSchema,
    plugins: z.array(z.string()).default([]),
    mcp: McpSchema,
    antigravity: DictionarySchema.optional(),
    globalRules: DictionarySchema.optional(),
    delegation: DictionarySchema.optional(),
    coordination: DictionarySchema.optional(),
    development: DictionarySchema.optional(),
    monitoring: DictionarySchema.optional(),
    runtime: DictionarySchema.optional(),
    performance: DictionarySchema.optional(),
    database: DictionarySchema.optional(),
    logging: DictionarySchema.optional(),
    sessions: DictionarySchema.optional(),
    dashboard: DictionarySchema.optional(),
    features: DictionarySchema.optional(),
    paths: DictionarySchema.optional(),
    compound: DictionarySchema.optional(),
    legacy: LegacySchema
  })
  .passthrough();

export type UnifiedConfig = z.infer<typeof UnifiedConfigSchema>;

export function createDefaultConfig(): UnifiedConfig {
  return UnifiedConfigSchema.parse({});
}
