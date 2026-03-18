import { NextResponse } from 'next/server';
import { errorResponse } from '../_lib/error-response';

export const dynamic = 'force-dynamic';

interface MetricsCollectorInstance {
  getErrorTrends: (windowMs?: number) => Record<string, unknown>;
}

interface MonitoringModule {
  PipelineMetricsCollector: new (opts: Record<string, unknown>) => MetricsCollectorInstance;
}

let monitoringModule: MonitoringModule | null = null;
let metricsCollector: MetricsCollectorInstance | null = null;

function loadModules() {
  if (!monitoringModule) {
    monitoringModule = require('opencode-model-manager/monitoring');
  }
}

function getMetricsCollector() {
  if (!metricsCollector) {
    loadModules();
    metricsCollector = new monitoringModule!.PipelineMetricsCollector({ autoCleanup: true });
  }
  return metricsCollector;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const windowMs = parseInt(searchParams.get('window') || '86400000', 10);
    const stats = getMetricsCollector().getErrorTrends(windowMs);
    return NextResponse.json(stats);
  } catch (error: unknown) {
    return errorResponse('Failed to fetch error trend metrics', 500, error instanceof Error ? error.message : String(error));
  }
}
