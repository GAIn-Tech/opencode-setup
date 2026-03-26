/**
 * Shared PipelineMetricsCollector singleton for all dashboard observability routes.
 * Ensures compression, context7, error-trends, and discovery stats all share
 * the same in-memory instance instead of each route creating its own.
 *
 * Wave 3 T17: fix(dashboard): use shared MetricsCollector singleton across observability routes
 */

interface MetricsCollectorInstance {
  getCompressionStats: (windowMs?: number) => Record<string, unknown>;
  getContext7Stats: (windowMs?: number) => Record<string, unknown>;
  getErrorTrends: (windowMs?: number) => Record<string, unknown>;
  getSkillSelectionStats?: (windowMs?: number) => Record<string, unknown>;
  recordCompression?: (data: Record<string, unknown>) => Record<string, unknown>;
  recordContext7Lookup?: (data: Record<string, unknown>) => Record<string, unknown>;
  recordSkillSelection?: (data: Record<string, unknown>) => Record<string, unknown>;
}

interface MonitoringModule {
  PipelineMetricsCollector: new (opts: Record<string, unknown>) => MetricsCollectorInstance;
}

let monitoringModule: MonitoringModule | null = null;
let instance: MetricsCollectorInstance | null = null;

function loadModules() {
  if (!monitoringModule) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    monitoringModule = require('opencode-model-manager/monitoring');
  }
}

export function getMetricsCollector(): MetricsCollectorInstance {
  if (!instance) {
    loadModules();
    instance = new monitoringModule!.PipelineMetricsCollector({ autoCleanup: true });
  }
  return instance;
}
