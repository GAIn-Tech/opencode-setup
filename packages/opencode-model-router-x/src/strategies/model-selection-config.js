/**
 * Model Selection Strategy Configuration
 *
 * Configuration schema for model selection strategies.
 */

const { z } = require('zod');

/**
 * Intent categories for task classification
 */
const INTENT_CATEGORIES = [
  'research',
  'analysis',
  'ideation',
  'architecture',
  'implementation',
  'debugging',
  'verification',
  'documentation',
  'system',
  'orchestration'
];

/**
 * Granular signal types
 */
const SIGNAL_TYPES = [
  'context_length_budget',
  'complexity',
  'time_constraint',
  'budget_constraint',
  'tool_count',
  'response_length'
];

/**
 * Task classification schema
 */
const TaskSchema = z.object({
  intent: z.enum(INTENT_CATEGORIES),
  signals: z.object({
    context_length_budget: z.number().optional(),
    complexity: z.number().min(0).max(1).optional(),
    time_constraint: z.boolean().optional(),
    budget_constraint: z.string().optional(),
    tool_count: z.number().optional(),
    response_length: z.enum(['terse', 'concise', 'standard', 'detailed', 'comprehensive']).optional()
  }).optional()
});

/**
 * Model selection result schema
 */
const ModelSelectionResultSchema = z.object({
  model_id: z.string(),
  provider: z.string(),
  reasoning_effort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'max']).optional(),
  confidence: z.number().min(0).max(1),
  alternative_models: z.array(z.object({
    model_id: z.string(),
    provider: z.string(),
    reason: z.string()
  })).optional()
});

module.exports = {
  INTENT_CATEGORIES,
  SIGNAL_TYPES,
  TaskSchema,
  ModelSelectionResultSchema
};
