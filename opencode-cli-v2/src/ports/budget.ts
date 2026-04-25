import { z } from 'zod';

/**
 * Budget port defines context/token budget management contracts.
 */

export const BudgetScopeSchema = z.enum(['session', 'model', 'task']);
export type BudgetScope = z.infer<typeof BudgetScopeSchema>;

export const BudgetAllocationSchema = z.object({
  sessionId: z.string().min(1),
  model: z.string().min(1),
  scope: BudgetScopeSchema.default('session'),
  maxTokens: z.number().int().positive(),
  warningThreshold: z.number().int().positive().optional(),
  criticalThreshold: z.number().int().positive().optional()
});
export type BudgetAllocation = z.infer<typeof BudgetAllocationSchema>;

export const BudgetConsumptionSchema = z.object({
  sessionId: z.string().min(1),
  model: z.string().min(1),
  tokens: z.number().int().positive(),
  reason: z.string().min(1).optional(),
  taskId: z.string().min(1).optional()
});
export type BudgetConsumption = z.infer<typeof BudgetConsumptionSchema>;

export const BudgetCheckRequestSchema = z.object({
  sessionId: z.string().min(1),
  model: z.string().min(1),
  proposedTokens: z.number().int().positive()
});
export type BudgetCheckRequest = z.infer<typeof BudgetCheckRequestSchema>;

export const BudgetCheckResultSchema = z.object({
  allowed: z.boolean(),
  remainingTokens: z.number().int().nonnegative(),
  usedTokens: z.number().int().nonnegative(),
  maxTokens: z.number().int().positive(),
  status: z.enum(['healthy', 'warning', 'critical', 'exhausted'])
});
export type BudgetCheckResult = z.infer<typeof BudgetCheckResultSchema>;

export const BudgetStatusSchema = z.object({
  sessionId: z.string().min(1),
  model: z.string().min(1),
  usedTokens: z.number().int().nonnegative(),
  remainingTokens: z.number().int().nonnegative(),
  maxTokens: z.number().int().positive(),
  warningThreshold: z.number().int().positive(),
  criticalThreshold: z.number().int().positive(),
  status: z.enum(['healthy', 'warning', 'critical', 'exhausted']),
  updatedAt: z.string().datetime()
});
export type BudgetStatus = z.infer<typeof BudgetStatusSchema>;

export const BudgetSessionSummarySchema = z.object({
  sessionId: z.string().min(1),
  models: z.array(BudgetStatusSchema),
  totalUsedTokens: z.number().int().nonnegative(),
  totalRemainingTokens: z.number().int().nonnegative()
});
export type BudgetSessionSummary = z.infer<typeof BudgetSessionSummarySchema>;

export const BudgetErrorCodeSchema = z.enum([
  'BUDGET_NOT_FOUND',
  'BUDGET_EXCEEDED',
  'INVALID_BUDGET_ALLOCATION',
  'BUDGET_STORAGE_FAILURE',
  'VALIDATION_ERROR',
  'UNKNOWN'
]);
export type BudgetErrorCode = z.infer<typeof BudgetErrorCodeSchema>;

export const BudgetPortErrorSchema = z.object({
  code: BudgetErrorCodeSchema,
  message: z.string().min(1),
  retriable: z.boolean().default(false),
  details: z.record(z.string(), z.unknown()).optional()
});
export type BudgetPortError = z.infer<typeof BudgetPortErrorSchema>;

export interface BudgetPort {
  /** Creates or updates a token budget allocation for a session/model pair. */
  upsertAllocation(allocation: BudgetAllocation): Promise<void>;
  /** Records token usage against an existing allocation. */
  consumeTokens(consumption: BudgetConsumption): Promise<BudgetStatus>;
  /** Validates whether a proposed token use fits current budget constraints. */
  checkBudget(request: BudgetCheckRequest): Promise<BudgetCheckResult>;
  /** Returns a point-in-time budget status for a session/model pair. */
  getStatus(sessionId: string, model: string): Promise<BudgetStatus>;
  /** Lists all tracked session summaries. */
  listSessions(): Promise<BudgetSessionSummary[]>;
  /** Resets tracked budget usage for the given session and optional model. */
  reset(sessionId: string, model?: string): Promise<void>;
}
