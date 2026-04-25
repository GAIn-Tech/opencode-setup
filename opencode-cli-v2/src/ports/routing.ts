import { z } from 'zod';

/**
 * Routing port defines model discovery, selection, and routing telemetry contracts.
 */

export const RoutingRequestSchema = z.object({
  taskType: z.string().min(1),
  prompt: z.string().min(1),
  maxTokens: z.number().int().positive().optional(),
  preferredModel: z.string().min(1).optional(),
  requiredCapabilities: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).optional()
});
export type RoutingRequest = z.infer<typeof RoutingRequestSchema>;

export const ModelDescriptorSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  family: z.string().min(1),
  maxContextTokens: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive().optional(),
  latencyTier: z.enum(['low', 'medium', 'high']).default('medium'),
  costTier: z.enum(['low', 'medium', 'high']).default('medium'),
  capabilities: z.array(z.string().min(1)).default([]),
  active: z.boolean().default(true)
});
export type ModelDescriptor = z.infer<typeof ModelDescriptorSchema>;

export const RoutingDecisionSchema = z.object({
  modelId: z.string().min(1),
  reason: z.string().min(1),
  score: z.number().min(0).max(1),
  alternatives: z.array(z.string().min(1)).default([]),
  estimatedInputCost: z.number().nonnegative().optional(),
  estimatedOutputCost: z.number().nonnegative().optional(),
  expectedLatencyMs: z.number().nonnegative().optional()
});
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

export const ModelHealthSchema = z.object({
  modelId: z.string().min(1),
  status: z.enum(['healthy', 'degraded', 'unavailable']),
  checkedAt: z.string().datetime(),
  details: z.string().optional()
});
export type ModelHealth = z.infer<typeof ModelHealthSchema>;

export const RoutingOutcomeEventSchema = z.object({
  modelId: z.string().min(1),
  taskType: z.string().min(1),
  success: z.boolean(),
  latencyMs: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
  recordedAt: z.string().datetime()
});
export type RoutingOutcomeEvent = z.infer<typeof RoutingOutcomeEventSchema>;

export const RoutingStatsSchema = z.object({
  totalRoutes: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  averageLatencyMs: z.number().nonnegative(),
  modelSelectionCounts: z.record(z.string(), z.number().int().nonnegative())
});
export type RoutingStats = z.infer<typeof RoutingStatsSchema>;

export const RoutingErrorCodeSchema = z.enum([
  'MODEL_NOT_FOUND',
  'NO_ROUTE_AVAILABLE',
  'ROUTING_POLICY_VIOLATION',
  'ROUTING_METRICS_WRITE_FAILED',
  'VALIDATION_ERROR',
  'UNKNOWN'
]);
export type RoutingErrorCode = z.infer<typeof RoutingErrorCodeSchema>;

export const RoutingPortErrorSchema = z.object({
  code: RoutingErrorCodeSchema,
  message: z.string().min(1),
  retriable: z.boolean().default(false),
  details: z.record(z.string(), z.unknown()).optional()
});
export type RoutingPortError = z.infer<typeof RoutingPortErrorSchema>;

export interface RoutingPort {
  /** Returns available models currently eligible for routing. */
  listModels(): Promise<ModelDescriptor[]>;
  /** Selects a model for a specific request. */
  selectModel(request: RoutingRequest): Promise<RoutingDecision>;
  /** Provides model-level health signal. */
  getModelHealth(modelId: string): Promise<ModelHealth>;
  /** Records routing execution outcome for future selection quality. */
  recordOutcome(event: RoutingOutcomeEvent): Promise<void>;
  /** Returns aggregate routing quality metrics. */
  getStats(): Promise<RoutingStats>;
}
