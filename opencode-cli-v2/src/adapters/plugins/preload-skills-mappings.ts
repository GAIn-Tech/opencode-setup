import { z } from 'zod';

export const SKILLS_PRELOAD_HOOK = 'skills.preload';
export const SKILLS_RECOMMEND_HOOK = 'skills.recommend';
export const SKILLS_ANALYZE_CONTEXT_HOOK = 'skills.analyze-context';
export const SKILLS_GET_LOADED_HOOK = 'skills.get-loaded';

export const SkillPreloadStrategySchema = z.enum(['eager', 'lazy']);
export type SkillPreloadStrategy = z.infer<typeof SkillPreloadStrategySchema>;

export const SkillTaskTypeSchema = z.enum([
  'general',
  'debugging',
  'testing',
  'frontend',
  'backend',
  'devops',
  'security',
  'planning'
]);
export type SkillTaskType = z.infer<typeof SkillTaskTypeSchema>;

export const SkillTriggerDefinitionSchema = z
  .object({
    id: z.string().min(1),
    keywords: z.array(z.string().min(1)).default([]),
    fileTypes: z.array(z.string().min(1)).default([]),
    patterns: z.array(z.string().min(1)).default([]),
    taskTypes: z.array(SkillTaskTypeSchema).default([]),
    dependencies: z.array(z.string().min(1)).default([]),
    priority: z.number().int().min(1).max(10).default(5),
    lazyEligible: z.boolean().default(true)
  })
  .passthrough();
export type SkillTriggerDefinition = z.infer<typeof SkillTriggerDefinitionSchema>;

export const SkillCatalogSchema = z.object({
  skills: z.array(SkillTriggerDefinitionSchema).default([])
});
export type SkillCatalog = z.infer<typeof SkillCatalogSchema>;

export const SkillContextSchema = z
  .object({
    task: z.string().min(1),
    files: z.array(z.string().min(1)).default([]),
    patterns: z.array(z.string().min(1)).default([])
  })
  .passthrough();
export type SkillContext = z.infer<typeof SkillContextSchema>;

export const SkillContextAnalysisSchema = z.object({
  taskType: SkillTaskTypeSchema,
  keywords: z.array(z.string().min(1)),
  fileTypes: z.array(z.string().min(1)),
  patternMatches: z.array(z.string().min(1))
});
export type SkillContextAnalysis = z.infer<typeof SkillContextAnalysisSchema>;

export const SkillRecommendationSchema = z.object({
  skillId: z.string().min(1),
  score: z.number().min(0),
  reasons: z.array(z.string().min(1)),
  dependencies: z.array(z.string().min(1))
});
export type SkillRecommendation = z.infer<typeof SkillRecommendationSchema>;

export const SkillsAnalyzeContextPayloadSchema = z.object({
  context: SkillContextSchema
});

export const SkillsRecommendPayloadSchema = z.object({
  context: SkillContextSchema,
  maxSkills: z.number().int().positive().max(50).default(8),
  includeLoaded: z.boolean().default(false)
});

export const SkillsPreloadPayloadSchema = z.object({
  context: SkillContextSchema,
  strategy: SkillPreloadStrategySchema.default('eager'),
  maxSkills: z.number().int().positive().max(50).default(8),
  forceReload: z.boolean().default(false)
});

export const SkillsGetLoadedPayloadSchema = z
  .object({
    includeMetadata: z.boolean().default(true)
  })
  .default({ includeMetadata: true });

export interface LoadedSkillRecord {
  readonly skillId: string;
  readonly loadedAt: string;
  readonly strategy: SkillPreloadStrategy;
}

export function parseSkillCatalog(value: unknown): SkillCatalog {
  const source = asRecord(value);
  const candidate = asRecord(source.preloadSkills);
  const normalized = Object.keys(candidate).length > 0 ? candidate : source;
  return SkillCatalogSchema.parse(normalized);
}

export function analyzeContext(context: SkillContext): SkillContextAnalysis {
  const parsed = SkillContextSchema.parse(context);
  const taskLower = parsed.task.toLowerCase();
  const keywords = uniqueStrings(tokenize(taskLower));
  const fileTypes = uniqueStrings(parsed.files.map((file) => normalizeFileType(file)).filter((value) => value.length > 0));
  const patternMatches = uniqueStrings(parsed.patterns.map((value) => value.toLowerCase()));

  return SkillContextAnalysisSchema.parse({
    taskType: detectTaskType(taskLower, fileTypes),
    keywords,
    fileTypes,
    patternMatches
  });
}

export function recommendSkills(
  catalog: SkillCatalog,
  analysis: SkillContextAnalysis
): SkillRecommendation[] {
  const parsedCatalog = SkillCatalogSchema.parse(catalog);
  const parsedAnalysis = SkillContextAnalysisSchema.parse(analysis);

  const recommendations = parsedCatalog.skills
    .map((skill) => scoreSkill(skill, parsedAnalysis))
    .filter((entry): entry is SkillRecommendation => entry !== null)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.skillId.localeCompare(right.skillId);
    });

  return recommendations;
}

export function resolveSkillLoadOrder(
  recommendations: readonly SkillRecommendation[],
  catalog: SkillCatalog,
  loadedSkillIds: readonly string[] = []
): string[] {
  const parsedCatalog = SkillCatalogSchema.parse(catalog);
  const byId = new Map(parsedCatalog.skills.map((skill) => [skill.id, skill]));
  const recommendationOrder = new Map(recommendations.map((item, index) => [item.skillId, index]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const ordered: string[] = [];
  const loaded = new Set(loadedSkillIds);

  const visit = (skillId: string): void => {
    if (visited.has(skillId) || loaded.has(skillId)) return;
    if (visiting.has(skillId)) return;
    visiting.add(skillId);

    const skill = byId.get(skillId);
    if (skill) {
      const dependencies = [...skill.dependencies].sort((left, right) => {
        const leftIdx = recommendationOrder.get(left) ?? Number.MAX_SAFE_INTEGER;
        const rightIdx = recommendationOrder.get(right) ?? Number.MAX_SAFE_INTEGER;
        if (leftIdx !== rightIdx) return leftIdx - rightIdx;
        return left.localeCompare(right);
      });

      for (const dependency of dependencies) {
        visit(dependency);
      }
    }

    visiting.delete(skillId);
    visited.add(skillId);
    ordered.push(skillId);
  };

  for (const recommendation of recommendations) {
    visit(recommendation.skillId);
  }

  return ordered;
}

export function selectSkillsForStrategy(
  strategy: SkillPreloadStrategy,
  orderedSkillIds: readonly string[],
  catalog: SkillCatalog
): string[] {
  if (strategy === 'eager') return [...orderedSkillIds];

  const parsedCatalog = SkillCatalogSchema.parse(catalog);
  const byId = new Map(parsedCatalog.skills.map((skill) => [skill.id, skill]));

  return orderedSkillIds.filter((skillId, index) => {
    if (index === 0) return true;
    const skill = byId.get(skillId);
    if (!skill) return true;
    return !skill.lazyEligible || skill.priority >= 8;
  });
}

export function createContextCacheKey(context: SkillContext): string {
  const parsed = SkillContextSchema.parse(context);
  return JSON.stringify({
    task: parsed.task.trim().toLowerCase(),
    files: [...parsed.files].sort(),
    patterns: [...parsed.patterns].map((value) => value.toLowerCase()).sort()
  });
}

export const DEFAULT_SKILL_CATALOG: SkillCatalog = SkillCatalogSchema.parse({
  skills: [
    {
      id: 'systematic-debugging',
      keywords: ['bug', 'debug', 'failing', 'failure', 'error', 'stacktrace', 'regression'],
      fileTypes: ['test.ts', 'test.tsx'],
      patterns: ['exception', 'trace', 'reproduce'],
      taskTypes: ['debugging', 'testing'],
      dependencies: ['verification-before-completion'],
      priority: 10,
      lazyEligible: false
    },
    {
      id: 'test-driven-development',
      keywords: ['test', 'coverage', 'spec', 'assertion', 'unit'],
      fileTypes: ['test.ts', 'test.tsx', 'spec.ts', 'spec.tsx'],
      patterns: ['describe(', 'expect('],
      taskTypes: ['testing'],
      dependencies: [],
      priority: 9,
      lazyEligible: false
    },
    {
      id: 'writing-plans',
      keywords: ['plan', 'roadmap', 'spec', 'requirements', 'strategy'],
      fileTypes: ['md'],
      patterns: ['milestone', 'phase'],
      taskTypes: ['planning'],
      dependencies: [],
      priority: 8,
      lazyEligible: false
    },
    {
      id: 'react-patterns',
      keywords: ['react', 'component', 'hook', 'useeffect', 'usestate', 'tsx'],
      fileTypes: ['tsx', 'jsx'],
      patterns: ['useState(', 'useEffect('],
      taskTypes: ['frontend'],
      dependencies: ['accessibility-testing'],
      priority: 7,
      lazyEligible: true
    },
    {
      id: 'api-security',
      keywords: ['auth', 'jwt', 'oauth', 'token', 'authorization', 'permission', 'security'],
      fileTypes: ['ts', 'js'],
      patterns: ['bearer', 'csrf', 'rate limit'],
      taskTypes: ['security', 'backend'],
      dependencies: [],
      priority: 8,
      lazyEligible: true
    },
    {
      id: 'github-actions',
      keywords: ['ci', 'workflow', 'pipeline', 'github actions', 'deployment'],
      fileTypes: ['yml', 'yaml'],
      patterns: ['.github/workflows', 'jobs:'],
      taskTypes: ['devops'],
      dependencies: [],
      priority: 7,
      lazyEligible: true
    },
    {
      id: 'docker-containerization',
      keywords: ['docker', 'container', 'compose', 'image', 'dockerfile'],
      fileTypes: ['dockerfile', 'yml', 'yaml'],
      patterns: ['FROM ', 'services:'],
      taskTypes: ['devops'],
      dependencies: [],
      priority: 7,
      lazyEligible: true
    },
    {
      id: 'verification-before-completion',
      keywords: ['verify', 'validation', 'confirm', 'done', 'complete'],
      fileTypes: [],
      patterns: ['passes', 'checks'],
      taskTypes: ['general'],
      dependencies: [],
      priority: 6,
      lazyEligible: true
    },
    {
      id: 'accessibility-testing',
      keywords: ['aria', 'a11y', 'accessibility', 'wcag', 'keyboard', 'screen reader'],
      fileTypes: ['tsx', 'jsx', 'html'],
      patterns: ['aria-', 'role='],
      taskTypes: ['frontend'],
      dependencies: [],
      priority: 7,
      lazyEligible: true
    }
  ]
});

function scoreSkill(skill: SkillTriggerDefinition, analysis: SkillContextAnalysis): SkillRecommendation | null {
  let score = 0;
  const reasons: string[] = [];

  for (const keyword of skill.keywords) {
    if (analysis.keywords.includes(keyword.toLowerCase())) {
      score += 2;
      reasons.push(`keyword:${keyword.toLowerCase()}`);
    }
  }

  for (const fileType of skill.fileTypes) {
    if (analysis.fileTypes.includes(fileType.toLowerCase())) {
      score += 3;
      reasons.push(`file:${fileType.toLowerCase()}`);
    }
  }

  for (const pattern of skill.patterns) {
    if (analysis.patternMatches.includes(pattern.toLowerCase())) {
      score += 2;
      reasons.push(`pattern:${pattern.toLowerCase()}`);
    }
  }

  if (skill.taskTypes.includes(analysis.taskType)) {
    score += 3;
    reasons.push(`task:${analysis.taskType}`);
  }

  if (score <= 0) {
    return null;
  }

  score += skill.priority * 0.1;

  return SkillRecommendationSchema.parse({
    skillId: skill.id,
    score,
    reasons: uniqueStrings(reasons),
    dependencies: skill.dependencies
  });
}

function detectTaskType(taskLower: string, fileTypes: readonly string[]): SkillTaskType {
  if (containsAny(taskLower, ['bug', 'debug', 'error', 'failure', 'regression'])) return 'debugging';
  if (containsAny(taskLower, ['test', 'spec', 'assertion', 'coverage'])) return 'testing';
  if (containsAny(taskLower, ['react', 'component', 'frontend', 'ui']) || hasAnyFileType(fileTypes, ['tsx', 'jsx', 'html'])) {
    return 'frontend';
  }
  if (containsAny(taskLower, ['api', 'endpoint', 'backend', 'database'])) return 'backend';
  if (containsAny(taskLower, ['docker', 'kubernetes', 'pipeline', 'workflow', 'deploy'])) return 'devops';
  if (containsAny(taskLower, ['security', 'auth', 'vulnerability', 'permission'])) return 'security';
  if (containsAny(taskLower, ['plan', 'strategy', 'roadmap', 'requirements'])) return 'planning';
  return 'general';
}

function normalizeFileType(filePath: string): string {
  const normalized = filePath.toLowerCase().trim();
  if (normalized.endsWith('dockerfile')) return 'dockerfile';
  const lastDot = normalized.lastIndexOf('.');
  if (lastDot <= -1) return '';
  return normalized.slice(lastDot + 1);
}

function tokenize(value: string): string[] {
  return value
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function containsAny(value: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => value.includes(candidate));
}

function hasAnyFileType(fileTypes: readonly string[], candidates: readonly string[]): boolean {
  const set = new Set(fileTypes);
  return candidates.some((candidate) => set.has(candidate));
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
