/**
 * Learning Engine Type Definitions
 * Provides type safety for the orchestration advisor and model performance tracking
 */

/**
 * Model performance metrics
 */
export interface ModelPerformance {
  model_id: string;
  provider: string;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  average_latency_ms: number;
  last_used: number; // timestamp
  error_types: Record<string, number>; // error_type -> count
}

/**
 * Provider performance metrics
 */
export interface ProviderPerformance {
  provider: string;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  rate_limited_count: number;
  average_latency_ms: number;
  last_used: number;
  models_used: string[];
}

/**
 * Learning entry from catalog
 */
export interface LearningEntry {
  timestamp: number;
  model_id: string;
  provider: string;
  task_type: string;
  success: boolean;
  latency_ms: number;
  error_type?: string;
  context?: Record<string, unknown>;
}

/**
 * Orchestration decision
 */
export interface OrchestrationDecision {
  timestamp: number;
  task_type: string;
  selected_model: string;
  selected_provider: string;
  fallback_model?: string;
  fallback_provider?: string;
  quota_risk: number;
  reasons: string[];
}

/**
 * Evidence capture for high-impact decisions
 */
export interface EvidenceRecord {
  id: string;
  timestamp: number;
  decision: OrchestrationDecision;
  outcome?: {
    success: boolean;
    latency_ms: number;
    error?: string;
  };
  context: Record<string, unknown>;
}
