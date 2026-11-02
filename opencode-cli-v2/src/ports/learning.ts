import { z } from 'zod';

/**
 * Learning port defines pattern capture, recommendations, and adaptation contracts.
 */

export const LearningSignalSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  category: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  output: z.record(z.string(), z.unknown()).optional(),
  success: z.boolean().optional(),
  timestamp: z.string().datetime()
});
export type LearningSignal = z.infer<typeof LearningSignalSchema>;

export const LearningPatternSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  confidence: z.number().min(0).max(1),
  description: z.string().min(1),
  examples: z.array(z.string().min(1)).default([]),
  lastUpdatedAt: z.string().datetime()
});
export type LearningPattern = z.infer<typeof LearningPatternSchema>;

export const LearningQuerySchema = z.object({
  category: z.string().min(1).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  limit: z.number().int().positive().max(500).default(50)
});
export type LearningQuery = z.infer<typeof LearningQuerySchema>;

export const RecommendationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1),
  actions: z.array(z.string().min(1)).default([])
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const RecommendationContextSchema = z.object({
  sessionId: z.string().min(1),
  taskType: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional()
});
export type RecommendationContext = z.infer<typeof RecommendationContextSchema>;

export const AdaptationDecisionSchema = z.object({
  id: z.string().min(1),
  target: z.enum(['routing', 'prompting', 'orchestration', 'skill-selection']),
  changeSet: z.record(z.string(), z.unknown()),
  reason: z.string().min(1),
  createdAt: z.string().datetime()
});
export type AdaptationDecision = z.infer<typeof AdaptationDecisionSchema>;

export const LearningStateSchema = z.object({
  patternCount: z.number().int().nonnegative(),
  signalCount: z.number().int().nonnegative(),
  lastIngestedAt: z.string().datetime().optional(),
  version: z.string().min(1)
});
export type LearningState = z.infer<typeof LearningStateSchema>;

export const LearningErrorCodeSchema = z.enum([
  'SIGNAL_INGEST_FAILED',
  'PATTERN_ANALYSIS_FAILED',
  'RECOMMENDATION_FAILED',
  'ADAPTATION_APPLY_FAILED',
  'VALIDATION_ERROR',
  'UNKNOWN'
]);
export type LearningErrorCode = z.infer<typeof LearningErrorCodeSchema>;

export const LearningPortErrorSchema = z.object({
  code: LearningErrorCodeSchema,
  message: z.string().min(1),
  retriable: z.boolean().default(false),
  details: z.record(z.string(), z.unknown()).optional()
});
export type LearningPortError = z.infer<typeof LearningPortErrorSchema>;

export interface LearningPort {
  /** Records raw runtime signal for downstream learning. */
  ingestSignal(signal: LearningSignal): Promise<void>;
  /** Runs pattern analysis over stored signals. */
  analyzePatterns(query?: LearningQuery): Promise<LearningPattern[]>;
  /** Returns recommendation set for current execution context. */
  recommend(context: RecommendationContext): Promise<Recommendation[]>;
  /** Applies an approved adaptation decision. */
  applyAdaptation(decision: AdaptationDecision): Promise<void>;
  /** Returns learning-engine state snapshot. */
  getState(): Promise<LearningState>;
}
