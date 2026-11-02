import { z } from 'zod';

import {
  BudgetAllocationSchema,
  BudgetCheckResultSchema,
  BudgetSessionSummarySchema,
  BudgetStatusSchema,
  type BudgetAllocation,
  type BudgetCheckResult,
  type BudgetSessionSummary,
  type BudgetStatus
} from '../../ports/budget';

export const LEGACY_WARN_THRESHOLD_PCT = 0.75;
export const LEGACY_CRITICAL_THRESHOLD_PCT = 0.8;
export const COMPRESSION_RECOMMEND_THRESHOLD_PCT = 0.65;
export const EMERGENCY_THRESHOLD_PCT = 0.95;

export type LegacyBudgetStatus = 'ok' | 'warn' | 'error' | 'exceeded';

export const LegacyBudgetStatusSchema = z.enum(['ok', 'warn', 'error', 'exceeded']);

export const LegacyGovernorCheckResultSchema = z
  .object({
    allowed: z.boolean(),
    status: LegacyBudgetStatusSchema,
    remaining: z.number().int().nonnegative(),
    message: z.string().optional(),
    urgency: z.number().int().nonnegative().optional()
  })
  .passthrough();
export type LegacyGovernorCheckResult = z.infer<typeof LegacyGovernorCheckResultSchema>;

export const LegacyGovernorUsageSchema = z
  .object({
    used: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    max: z.number().int().positive().optional(),
    pct: z.number().min(0).max(1),
    status: LegacyBudgetStatusSchema
  })
  .passthrough();
export type LegacyGovernorUsage = z.infer<typeof LegacyGovernorUsageSchema>;

export const LegacyGovernorSessionSummarySchema = z.record(
  z.string().min(1),
  z.record(z.string().min(1), LegacyGovernorUsageSchema)
);
export type LegacyGovernorSessionSummary = z.infer<typeof LegacyGovernorSessionSummarySchema>;

export interface LegacyGovernorInstance {
  checkBudget(sessionId: string, model: string, proposedTokens: number): unknown;
  consumeTokens(sessionId: string, model: string, tokens: number): unknown;
  getRemainingBudget(sessionId: string, model: string): unknown;
  getAllSessions(): unknown;
  resetSession(sessionId: string, model?: string): unknown;
  onErrorThreshold?(callback: (payload: Record<string, unknown>) => void): unknown;
  shutdown?(): unknown;
}

export type LegacyGovernorConstructor = new (options?: Record<string, unknown>) => LegacyGovernorInstance;

export interface LegacyContextGovernorModule {
  readonly Governor: LegacyGovernorConstructor;
}

export const LegacyContextGovernorModuleSchema = z.object({
  Governor: z.custom<LegacyGovernorConstructor>((value) => typeof value === 'function')
});

export const LegacyBudgetConfigSchema = z.object({
  maxTokens: z.number().int().positive(),
  thresholds: z.object({
    warning: z.number().int().positive(),
    critical: z.number().int().positive()
  })
});
export type LegacyBudgetConfig = z.infer<typeof LegacyBudgetConfigSchema>;

export const CompressionLevelSchema = z.enum(['none', 'compress', 'compress_urgent', 'compress_emergency']);
export type CompressionLevel = z.infer<typeof CompressionLevelSchema>;

export const CompressionRecommendationSchema = z.object({
  level: CompressionLevelSchema,
  usedPct: z.number().min(0).max(1),
  reason: z.string().min(1)
});
export type CompressionRecommendation = z.infer<typeof CompressionRecommendationSchema>;

export interface RuntimeBudgetConfig {
  readonly sessionId: string;
  readonly model: string;
  readonly maxTokens: number;
  readonly warningThreshold: number;
  readonly criticalThreshold: number;
}

export function mapBudgetAllocationToLegacyConfig(allocation: BudgetAllocation): LegacyBudgetConfig {
  const parsed = BudgetAllocationSchema.parse(allocation);
  const warningThreshold = parsed.warningThreshold ?? Math.floor(parsed.maxTokens * LEGACY_WARN_THRESHOLD_PCT);
  const criticalThreshold = parsed.criticalThreshold ?? Math.floor(parsed.maxTokens * LEGACY_CRITICAL_THRESHOLD_PCT);

  if (warningThreshold >= criticalThreshold) {
    throw new Error('Budget allocation warning threshold must be lower than critical threshold');
  }

  return LegacyBudgetConfigSchema.parse({
    maxTokens: parsed.maxTokens,
    thresholds: {
      warning: warningThreshold,
      critical: criticalThreshold
    }
  });
}

export function toRuntimeBudgetConfig(allocation: BudgetAllocation): RuntimeBudgetConfig {
  const parsed = BudgetAllocationSchema.parse(allocation);
  const legacy = mapBudgetAllocationToLegacyConfig(parsed);

  return {
    sessionId: parsed.sessionId,
    model: parsed.model,
    maxTokens: legacy.maxTokens,
    warningThreshold: legacy.thresholds.warning,
    criticalThreshold: legacy.thresholds.critical
  };
}

export function mapLegacyBudgetStatus(status: LegacyBudgetStatus): BudgetStatus['status'] {
  switch (status) {
    case 'ok':
      return 'healthy';
    case 'warn':
      return 'warning';
    case 'error':
      return 'critical';
    case 'exceeded':
      return 'exhausted';
    default:
      return 'healthy';
  }
}

export function deriveStatusFromUsage(usedTokens: number, config: RuntimeBudgetConfig): BudgetStatus['status'] {
  if (usedTokens >= config.maxTokens) {
    return 'exhausted';
  }

  if (usedTokens >= config.criticalThreshold) {
    return 'critical';
  }

  if (usedTokens >= config.warningThreshold) {
    return 'warning';
  }

  return 'healthy';
}

export function mapToBudgetStatus(
  sessionId: string,
  model: string,
  usedTokens: number,
  config: RuntimeBudgetConfig,
  updatedAt: string
): BudgetStatus {
  return BudgetStatusSchema.parse({
    sessionId,
    model,
    usedTokens,
    remainingTokens: Math.max(0, config.maxTokens - usedTokens),
    maxTokens: config.maxTokens,
    warningThreshold: config.warningThreshold,
    criticalThreshold: config.criticalThreshold,
    status: deriveStatusFromUsage(usedTokens, config),
    updatedAt
  });
}

export function mapToBudgetCheckResult(
  usedTokens: number,
  proposedTokens: number,
  config: RuntimeBudgetConfig
): BudgetCheckResult {
  const nextUsedTokens = usedTokens + proposedTokens;
  const status = deriveStatusFromUsage(nextUsedTokens, config);

  return BudgetCheckResultSchema.parse({
    allowed: nextUsedTokens <= config.maxTokens,
    remainingTokens: Math.max(0, config.maxTokens - nextUsedTokens),
    usedTokens: nextUsedTokens,
    maxTokens: config.maxTokens,
    status
  });
}

export function mapToSessionSummary(sessionId: string, statuses: BudgetStatus[]): BudgetSessionSummary {
  const totalUsedTokens = statuses.reduce((acc, item) => acc + item.usedTokens, 0);
  const totalRemainingTokens = statuses.reduce((acc, item) => acc + item.remainingTokens, 0);

  return BudgetSessionSummarySchema.parse({
    sessionId,
    models: statuses,
    totalUsedTokens,
    totalRemainingTokens
  });
}

export function getCompressionRecommendation(status: BudgetStatus): CompressionRecommendation {
  const usedPct = status.maxTokens > 0 ? status.usedTokens / status.maxTokens : 0;

  if (usedPct >= EMERGENCY_THRESHOLD_PCT) {
    return CompressionRecommendationSchema.parse({
      level: 'compress_emergency',
      usedPct,
      reason: `Budget at ${(usedPct * 100).toFixed(1)}% (>=95%): emergency compression required`
    });
  }

  if (usedPct >= LEGACY_CRITICAL_THRESHOLD_PCT) {
    return CompressionRecommendationSchema.parse({
      level: 'compress_urgent',
      usedPct,
      reason: `Budget at ${(usedPct * 100).toFixed(1)}% (>=80%): urgent compression required`
    });
  }

  if (usedPct >= COMPRESSION_RECOMMEND_THRESHOLD_PCT) {
    return CompressionRecommendationSchema.parse({
      level: 'compress',
      usedPct,
      reason: `Budget at ${(usedPct * 100).toFixed(1)}% (>=65%): compression recommended`
    });
  }

  return CompressionRecommendationSchema.parse({
    level: 'none',
    usedPct,
    reason: `Budget healthy at ${(usedPct * 100).toFixed(1)}%`
  });
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}
