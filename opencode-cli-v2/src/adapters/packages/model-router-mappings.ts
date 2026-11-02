import { z } from 'zod';

import {
  ModelDescriptorSchema,
  RoutingDecisionSchema,
  RoutingRequestSchema,
  type ModelDescriptor,
  type RoutingDecision,
  type RoutingRequest
} from '../../ports/routing';

export const LEGACY_COMPLEXITY_VALUES = ['simple', 'moderate', 'high', 'critical'] as const;

export const LegacyModelSchema = z
  .object({
    id: z.string().min(1),
    provider: z.string().min(1),
    tier: z.string().min(1).optional(),
    max_context: z.number().int().positive().optional(),
    max_output: z.number().int().positive().optional(),
    cost_per_1k_tokens: z.number().nonnegative().optional(),
    strengths: z.array(z.string().min(1)).optional(),
    active: z.boolean().optional(),
    disabled: z.boolean().optional()
  })
  .passthrough();
export type LegacyModel = z.infer<typeof LegacyModelSchema>;

const LegacySelectionModelRefSchema = z.union([LegacyModelSchema, z.string().min(1)]);

export const LegacySelectionSchema = z
  .object({
    modelId: z.string().min(1).optional(),
    model: LegacySelectionModelRefSchema.optional(),
    reason: z.string().min(1).optional(),
    score: z.number().optional(),
    fallbacks: z.array(z.string().min(1)).optional(),
    candidates: z.array(z.string().min(1)).optional()
  })
  .passthrough();
export type LegacySelection = z.infer<typeof LegacySelectionSchema>;

export const LegacyRouterStatsEntrySchema = z.object({
  calls: z.number().int().nonnegative().default(0),
  successes: z.number().int().nonnegative().default(0),
  failures: z.number().int().nonnegative().default(0),
  total_latency_ms: z.number().nonnegative().default(0)
});
export type LegacyRouterStatsEntry = z.infer<typeof LegacyRouterStatsEntrySchema>;

export const LegacyRouterStatsSchema = z.record(z.string().min(1), LegacyRouterStatsEntrySchema);
export type LegacyRouterStats = z.infer<typeof LegacyRouterStatsSchema>;

export type LegacyRouteContext = Record<string, unknown>;

export function mapRoutingRequestToLegacyContext(request: RoutingRequest): LegacyRouteContext {
  const parsed = RoutingRequestSchema.parse(request);
  const metadata = asRecord(parsed.metadata);
  const complexity = normalizeLegacyComplexity(metadata.complexity);

  return {
    taskType: parsed.taskType,
    task: parsed.prompt,
    prompt: parsed.prompt,
    complexity,
    required_strengths: parsed.requiredCapabilities,
    availableTokens: parsed.maxTokens ?? parseOptionalPositiveInt(metadata.availableTokens),
    maxBudget: parseOptionalNumber(metadata.maxBudget),
    maxLatency: parseOptionalPositiveInt(metadata.maxLatency),
    category: parseOptionalString(metadata.category),
    sessionId: parseOptionalString(metadata.sessionId),
    overrideModelId: parsed.preferredModel,
    modelId: parsed.preferredModel
  };
}

export function mapLegacyModelToDescriptor(model: LegacyModel): ModelDescriptor {
  const parsed = LegacyModelSchema.parse(model);
  const latencyTier = mapLegacyTierToLatencyTier(parsed.tier);
  const costTier = mapLegacyModelToCostTier(parsed);

  return ModelDescriptorSchema.parse({
    id: parsed.id,
    provider: parsed.provider,
    family: parsed.tier ?? parsed.provider,
    maxContextTokens: parsed.max_context ?? 8_192,
    maxOutputTokens: parsed.max_output,
    latencyTier,
    costTier,
    capabilities: parsed.strengths ?? [],
    active: parsed.active ?? !(parsed.disabled ?? false)
  });
}

export function mapLegacySelectionToDecision(selection: LegacySelection): RoutingDecision {
  const parsed = LegacySelectionSchema.parse(selection);
  const modelId = resolveLegacySelectionModelId(parsed);
  const alternatives = parsed.fallbacks ?? parsed.candidates ?? [];

  return RoutingDecisionSchema.parse({
    modelId,
    reason: parsed.reason ?? 'legacy-router-selection',
    score: clampScore(parsed.score),
    alternatives,
    expectedLatencyMs: extractExpectedLatencyMs(parsed),
    estimatedInputCost: extractEstimatedInputCost(parsed)
  });
}

export function parseLegacyRouterStats(value: unknown): LegacyRouterStats {
  return LegacyRouterStatsSchema.parse(asRecord(value));
}

function resolveLegacySelectionModelId(selection: LegacySelection): string {
  if (selection.modelId && selection.modelId.length > 0) {
    return selection.modelId;
  }

  if (typeof selection.model === 'string') {
    return selection.model;
  }

  if (selection.model && typeof selection.model.id === 'string' && selection.model.id.length > 0) {
    return selection.model.id;
  }

  throw new Error('Legacy model selection did not include modelId');
}

function clampScore(value: unknown): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const score = Number(value);
  if (score < 0) {
    return 0;
  }

  if (score > 1) {
    return 1;
  }

  return score;
}

function extractExpectedLatencyMs(selection: LegacySelection): number | undefined {
  const model = typeof selection.model === 'string' ? undefined : selection.model;
  const latency = model && typeof model.avg_latency_ms === 'number' ? Number(model.avg_latency_ms) : NaN;

  if (!Number.isFinite(latency) || latency < 0) {
    return undefined;
  }

  return latency;
}

function extractEstimatedInputCost(selection: LegacySelection): number | undefined {
  const model = typeof selection.model === 'string' ? undefined : selection.model;
  const cost = typeof model?.cost_per_1k_tokens === 'number' ? Number(model.cost_per_1k_tokens) : NaN;

  if (!Number.isFinite(cost) || cost < 0) {
    return undefined;
  }

  return cost;
}

function mapLegacyTierToLatencyTier(tier: unknown): ModelDescriptor['latencyTier'] {
  if (typeof tier !== 'string') {
    return 'medium';
  }

  const normalized = tier.toLowerCase();
  if (normalized === 'speed') {
    return 'low';
  }

  if (normalized === 'flagship') {
    return 'high';
  }

  return 'medium';
}

function mapLegacyModelToCostTier(model: LegacyModel): ModelDescriptor['costTier'] {
  const cost = typeof model.cost_per_1k_tokens === 'number' ? Number(model.cost_per_1k_tokens) : NaN;
  if (!Number.isFinite(cost)) {
    return model.tier === 'flagship' ? 'high' : model.tier === 'speed' ? 'low' : 'medium';
  }

  if (cost <= 0.01) {
    return 'low';
  }

  if (cost >= 0.04) {
    return 'high';
  }

  return 'medium';
}

function normalizeLegacyComplexity(value: unknown): (typeof LEGACY_COMPLEXITY_VALUES)[number] {
  if (typeof value !== 'string') {
    return 'moderate';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'low' || normalized === 'simple') {
    return 'simple';
  }

  if (normalized === 'medium' || normalized === 'moderate') {
    return 'moderate';
  }

  if (normalized === 'high') {
    return 'high';
  }

  if (normalized === 'critical') {
    return 'critical';
  }

  return 'moderate';
}

function parseOptionalPositiveInt(value: unknown): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }

  const parsed = Math.ceil(Number(value));
  return parsed > 0 ? parsed : undefined;
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }

  return Number(value);
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}
