import { z } from 'zod';

import {
  LearningPatternSchema,
  LearningQuerySchema,
  LearningStateSchema,
  RecommendationContextSchema,
  RecommendationSchema,
  type AdaptationDecision,
  type LearningPattern,
  type LearningQuery,
  type LearningSignal,
  type LearningState,
  type Recommendation,
  type RecommendationContext
} from '../../ports/learning';

export interface LegacyLearningEngineInstance {
  ingestEvent?(event: unknown): unknown;
  advise?(context: Record<string, unknown>): unknown;
  learnFromOutcome?(adviceId: string, outcome: Record<string, unknown>): unknown;
  getReport?(): unknown;
  save?(): unknown;
  antiPatterns?: {
    patterns?: unknown;
  };
  positivePatterns?: {
    patterns?: unknown;
  };
}

export type LegacyLearningEngineConstructor = new (options?: Record<string, unknown>) => LegacyLearningEngineInstance;

export interface LegacyLearningModule {
  readonly LearningEngine: LegacyLearningEngineConstructor;
  readonly PatternRecognizer?: unknown;
  readonly RecommendationEngine?: unknown;
  readonly AdaptiveBehavior?: unknown;
}

export const LegacyLearningModuleSchema = z
  .object({
    LearningEngine: z.custom<LegacyLearningEngineConstructor>((value) => typeof value === 'function'),
    PatternRecognizer: z.unknown().optional(),
    RecommendationEngine: z.unknown().optional(),
    AdaptiveBehavior: z.unknown().optional()
  })
  .passthrough();

export const LegacyIngestResultSchema = z
  .object({
    success: z.boolean(),
    reason: z.string().optional()
  })
  .passthrough();
export type LegacyIngestResult = z.infer<typeof LegacyIngestResultSchema>;

const LegacyPatternEntrySchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    description: z.string().min(1),
    timestamp: z.string().datetime().optional(),
    last_seen: z.string().datetime().optional(),
    occurrences: z.number().int().positive().optional(),
    success_rate: z.number().min(0).max(1).optional(),
    weight: z.number().nonnegative().optional(),
    context: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();
export type LegacyPatternEntry = z.infer<typeof LegacyPatternEntrySchema>;

const LegacyAdviceSchema = z
  .object({
    advice_id: z.string().min(1).optional(),
    warnings: z.array(z.record(z.string(), z.unknown())).optional(),
    suggestions: z.array(z.record(z.string(), z.unknown())).optional(),
    recommendations: z.array(z.record(z.string(), z.unknown())).optional(),
    routing: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();
export type LegacyAdvice = z.infer<typeof LegacyAdviceSchema>;

const LegacyReportSchema = z
  .object({
    engine_version: z.string().min(1).optional(),
    generated_at: z.string().datetime().optional(),
    anti_patterns: z.object({ total: z.number().int().nonnegative().optional() }).partial().optional(),
    positive_patterns: z.object({ total: z.number().int().nonnegative().optional() }).partial().optional()
  })
  .passthrough();
export type LegacyReport = z.infer<typeof LegacyReportSchema>;

export interface LegacyPatternCollection {
  readonly antiPatterns: LegacyPatternEntry[];
  readonly positivePatterns: LegacyPatternEntry[];
}

export function mapSignalToLegacyEvent(signal: LearningSignal): Record<string, unknown> {
  if (signal.success === false) {
    return {
      type: 'anti-pattern',
      payload: {
        type: mapCategoryToLegacyAntiType(signal.category),
        description: `Observed ${signal.category} failure: ${signal.id}`,
        severity: mapFailureSeverity(signal.category),
        context: {
          signal_id: signal.id,
          session_id: signal.sessionId,
          category: signal.category,
          output: signal.output,
          ...signal.input
        }
      }
    };
  }

  if (signal.success === true) {
    return {
      type: 'positive-pattern',
      payload: {
        type: mapCategoryToLegacyPositiveType(signal.category),
        description: `Observed successful ${signal.category} pattern: ${signal.id}`,
        success_rate: 1,
        context: {
          signal_id: signal.id,
          session_id: signal.sessionId,
          category: signal.category,
          output: signal.output,
          ...signal.input
        }
      }
    };
  }

  return {
    type: 'tool-usage',
    payload: {
      tool: normalizeToolName(signal.input.tool),
      success: true,
      tokens_used: coerceNumber(signal.input.tokens),
      context: {
        sessionId: signal.sessionId,
        taskType: signal.category,
        signalId: signal.id,
        ...signal.input
      }
    }
  };
}

export function toLegacyRecommendationContext(context: RecommendationContext): Record<string, unknown> {
  const parsed = RecommendationContextSchema.parse(context);
  return {
    task_type: parsed.taskType,
    session_id: parsed.sessionId,
    sessionId: parsed.sessionId,
    description: parseOptionalString(parsed.metadata?.description),
    complexity: parseOptionalString(parsed.metadata?.complexity),
    files: parseOptionalStringArray(parsed.metadata?.files),
    attempt_number: parseOptionalPositiveInt(parsed.metadata?.attemptNumber),
    tool: parseOptionalString(parsed.metadata?.tool)
  };
}

export function mapLegacyAdviceToRecommendations(advice: unknown): Recommendation[] {
  const parsed = LegacyAdviceSchema.parse(asRecord(advice));
  const recommendations: Recommendation[] = [];

  for (const warning of parsed.warnings ?? []) {
    recommendations.push(
      RecommendationSchema.parse({
        id: `warning:${recommendations.length + 1}`,
        title: parseOptionalString(warning.type) ?? 'Anti-pattern warning',
        rationale: parseOptionalString(warning.description) ?? 'Legacy learning engine warning',
        confidence: severityToConfidence(parseOptionalString(warning.severity)),
        actions: [
          parseOptionalString(warning.action),
          parseOptionalString(warning.advice)
        ].filter((value): value is string => typeof value === 'string' && value.length > 0)
      })
    );
  }

  for (const suggestion of parsed.suggestions ?? []) {
    recommendations.push(
      RecommendationSchema.parse({
        id: `suggestion:${recommendations.length + 1}`,
        title: parseOptionalString(suggestion.type) ?? 'Positive recommendation',
        rationale: parseOptionalString(suggestion.description) ?? 'Legacy learning engine suggestion',
        confidence: clamp01(coerceNumber(suggestion.success_rate) ?? coerceNumber(suggestion.relevance) ?? 0.6),
        actions: [parseOptionalString(suggestion.action)].filter(
          (value): value is string => typeof value === 'string' && value.length > 0
        )
      })
    );
  }

  for (const item of parsed.recommendations ?? []) {
    recommendations.push(
      RecommendationSchema.parse({
        id: `recommendation:${recommendations.length + 1}`,
        title: parseOptionalString(item.type) ?? 'Recommendation',
        rationale: parseOptionalString(item.description) ?? 'Legacy recommendation',
        confidence: clamp01(coerceNumber(item.confidence) ?? 0.7),
        actions: [parseOptionalString(item.action)].filter(
          (value): value is string => typeof value === 'string' && value.length > 0
        )
      })
    );
  }

  const unique = new Map<string, Recommendation>();
  for (const recommendation of recommendations) {
    if (!unique.has(recommendation.id)) {
      unique.set(recommendation.id, recommendation);
    }
  }

  return [...unique.values()];
}

export function mapAdaptationDecisionToLegacyOutcome(decision: AdaptationDecision): {
  readonly adviceId: string;
  readonly outcome: Record<string, unknown>;
} {
  const changeSet = asRecord(decision.changeSet);
  const adviceId =
    parseOptionalString(changeSet.adviceId) ?? parseOptionalString(changeSet.advice_id) ?? decision.id;

  const success =
    coerceBoolean(changeSet.success) ??
    coerceBoolean(changeSet.applied) ??
    coerceBoolean(changeSet.accepted) ??
    true;

  return {
    adviceId,
    outcome: {
      success,
      description: decision.reason,
      adaptation_target: decision.target,
      change_set: changeSet,
      time_taken_ms: coerceNumber(changeSet.latencyMs)
    }
  };
}

export function parseLegacyPatternCollection(engine: LegacyLearningEngineInstance): LegacyPatternCollection {
  const antiRaw = asRecord(engine).antiPatterns;
  const positiveRaw = asRecord(engine).positivePatterns;

  return {
    antiPatterns: parsePatternEntries(asRecord(antiRaw).patterns),
    positivePatterns: parsePatternEntries(asRecord(positiveRaw).patterns)
  };
}

export function mapLegacyPatternsToLearningPatterns(
  collection: LegacyPatternCollection,
  query?: LearningQuery
): LearningPattern[] {
  const parsedQuery = query ? LearningQuerySchema.parse(query) : LearningQuerySchema.parse({});
  const combined = [
    ...collection.antiPatterns.map((pattern) => mapLegacyPatternEntry(pattern, 'anti-pattern')),
    ...collection.positivePatterns.map((pattern) => mapLegacyPatternEntry(pattern, 'positive-pattern'))
  ];

  const filtered = combined
    .filter((pattern) => {
      if (parsedQuery.category && pattern.category !== parsedQuery.category) {
        return false;
      }

      if (parsedQuery.minConfidence !== undefined && pattern.confidence < parsedQuery.minConfidence) {
        return false;
      }

      return true;
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, parsedQuery.limit);

  return filtered;
}

export function mapLegacyReportToLearningState(
  report: unknown,
  signalCount: number,
  lastIngestedAt?: string,
  fallbackPatternCount = 0
): LearningState {
  const parsed = LegacyReportSchema.parse(asRecord(report));
  const antiCount = parsed.anti_patterns?.total ?? 0;
  const positiveCount = parsed.positive_patterns?.total ?? 0;
  const patternCount = antiCount + positiveCount || fallbackPatternCount;

  return LearningStateSchema.parse({
    patternCount,
    signalCount,
    lastIngestedAt,
    version: parsed.engine_version ?? 'legacy-unknown'
  });
}

function mapLegacyPatternEntry(entry: LegacyPatternEntry, source: 'anti-pattern' | 'positive-pattern'): LearningPattern {
  const timestamp =
    entry.last_seen ?? entry.timestamp ?? new Date().toISOString();
  const examples = extractExamples(entry.context);
  const confidence = source === 'anti-pattern'
    ? clamp01((entry.weight ?? 4) / 10)
    : clamp01(entry.success_rate ?? 0.75);

  return LearningPatternSchema.parse({
    id: entry.id,
    category: normalizePatternCategory(entry.type, source),
    confidence,
    description: entry.description,
    examples,
    lastUpdatedAt: timestamp
  });
}

function parsePatternEntries(value: unknown): LegacyPatternEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed: LegacyPatternEntry[] = [];
  for (const item of value) {
    const result = LegacyPatternEntrySchema.safeParse(item);
    if (result.success) {
      parsed.push(result.data);
    }
  }

  return parsed;
}

function normalizePatternCategory(type: string, source: 'anti-pattern' | 'positive-pattern'): string {
  const normalized = type.trim().toLowerCase();
  if (normalized.includes('crash')) {
    return 'crash';
  }

  if (normalized.includes('performance') || normalized.includes('latency')) {
    return 'performance';
  }

  if (source === 'anti-pattern') {
    return 'failure';
  }

  return 'success';
}

function extractExamples(context: Record<string, unknown> | undefined): string[] {
  if (!context) {
    return [];
  }

  const examples: string[] = [];
  if (typeof context.session_id === 'string' && context.session_id.length > 0) {
    examples.push(`session:${context.session_id}`);
  }

  if (typeof context.error_type === 'string' && context.error_type.length > 0) {
    examples.push(`error:${context.error_type}`);
  }

  if (typeof context.tool === 'string' && context.tool.length > 0) {
    examples.push(`tool:${context.tool}`);
  }

  return examples;
}

function mapCategoryToLegacyAntiType(category: string): string {
  const normalized = category.trim().toLowerCase();
  if (normalized.includes('crash')) {
    return 'broken_state';
  }

  if (normalized.includes('performance')) {
    return 'inefficient_solution';
  }

  if (normalized.includes('tool')) {
    return 'wrong_tool';
  }

  return 'failed_debug';
}

function mapCategoryToLegacyPositiveType(category: string): string {
  const normalized = category.trim().toLowerCase();
  if (normalized.includes('performance')) {
    return 'fast_resolution';
  }

  if (normalized.includes('refactor')) {
    return 'clean_refactor';
  }

  if (normalized.includes('delegat')) {
    return 'good_delegation';
  }

  return 'efficient_debug';
}

function mapFailureSeverity(category: string): 'critical' | 'high' | 'medium' {
  const normalized = category.trim().toLowerCase();
  if (normalized.includes('crash')) {
    return 'critical';
  }

  if (normalized.includes('failure')) {
    return 'high';
  }

  return 'medium';
}

function severityToConfidence(severity?: string): number {
  const normalized = severity?.toLowerCase();
  if (normalized === 'critical') {
    return 0.95;
  }

  if (normalized === 'high') {
    return 0.85;
  }

  if (normalized === 'low' || normalized === 'info') {
    return 0.55;
  }

  return 0.7;
}

function normalizeToolName(value: unknown): string {
  const normalized = parseOptionalString(value);
  return normalized ?? 'unknown';
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function parseOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parsed = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return parsed.length > 0 ? parsed : undefined;
}

function parseOptionalPositiveInt(value: unknown): number | undefined {
  const number = coerceNumber(value);
  if (number === undefined) {
    return undefined;
  }

  const parsed = Math.ceil(number);
  return parsed > 0 ? parsed : undefined;
}

function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes' || normalized === '1') {
      return true;
    }

    if (normalized === 'false' || normalized === 'no' || normalized === '0') {
      return false;
    }
  }

  return undefined;
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}
