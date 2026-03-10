import { NextResponse } from 'next/server';
import { requireWriteAccess } from '../_lib/write-access';

export const dynamic = 'force-dynamic';

interface MetricsCollectorInstance {
  toPrometheus: (windowMs: number) => string;
  getSnapshot: (windowMs: number) => Record<string, unknown>;
  recordDiscovery: (provider: string, success: boolean, data: Record<string, unknown>) => void;
  recordCacheAccess: (tier: string, result: string, key: string) => void;
  recordTransition: (modelId: string, fromState: string, toState: string) => void;
  recordPRCreation: (success: boolean, data: Record<string, unknown>) => void;
  recordCompression: (data: Record<string, unknown>) => void;
  recordContext7Lookup: (data: Record<string, unknown>) => void;
}

interface AlertManagerInstance {
  evaluate: (collector: MetricsCollectorInstance) => unknown[];
  getActiveAlerts: () => unknown[];
  getSummary: () => Record<string, unknown>;
  getAlertHistory: (limit: number) => unknown[];
}

interface MonitoringModule {
  PipelineMetricsCollector: new (opts: Record<string, unknown>) => MetricsCollectorInstance;
  AlertManager: new () => AlertManagerInstance;
}

// Lazy-load CJS modules from model-manager package
let monitoringModule: MonitoringModule | null = null;

function loadModules() {
  if (!monitoringModule) {
    monitoringModule = require('opencode-model-manager/monitoring');
  }
}

// Singleton instances - persist across requests
let metricsCollector: MetricsCollectorInstance | null = null;
let alertManager: AlertManagerInstance | null = null;

function getMetricsCollector() {
  if (!metricsCollector) {
    loadModules();
    metricsCollector = new monitoringModule!.PipelineMetricsCollector({
      autoCleanup: true
    });
  }
  return metricsCollector;
}

function getAlertManager() {
  if (!alertManager) {
    loadModules();
    alertManager = new monitoringModule!.AlertManager();
  }
  return alertManager;
}

/**
 * GET /api/monitoring
 *
 * Query params:
 * - format: 'json' (default) | 'prometheus'
 * - window: time window in ms (default: 86400000 = 24h)
 * - section: 'all' | 'discovery' | 'cache' | 'transitions' | 'pr' | 'compression' | 'context7' | 'alerts'
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';
    const windowMs = parseInt(searchParams.get('window') || '86400000', 10);
    const section = searchParams.get('section') || 'all';

    const collector = getMetricsCollector();
    const alerts = getAlertManager();

    // Evaluate alerts against current metrics
    alerts.evaluate(collector);

    if (format === 'prometheus') {
      const prometheusText = collector.toPrometheus(windowMs);
      return new Response(prometheusText, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
        }
      });
    }

    // JSON format
    const snapshot = collector.getSnapshot(windowMs);
    const activeAlerts = alerts.getActiveAlerts();
    const alertSummary = alerts.getSummary();

    let response: Record<string, unknown>;

    if (section === 'all') {
      response = {
        ...snapshot,
        alerts: {
          active: activeAlerts,
          summary: alertSummary
        }
      };
    } else if (section === 'discovery') {
      response = { discovery: snapshot.discovery };
    } else if (section === 'cache') {
      response = { cache: snapshot.cache };
    } else if (section === 'transitions') {
      response = { transitions: snapshot.transitions };
    } else if (section === 'pr') {
      response = { prCreation: snapshot.prCreation };
    } else if (section === 'compression') {
      response = { compression: snapshot.compression };
    } else if (section === 'context7') {
      response = { context7: snapshot.context7 };
    } else if (section === 'alerts') {
      response = {
        active: activeAlerts,
        history: alerts.getAlertHistory(50),
        summary: alertSummary
      };
    } else {
      return NextResponse.json(
        { error: `Unknown section "${section}". Use: all, discovery, cache, transitions, pr, compression, context7, alerts` },
        { status: 400 }
      );
    }

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('Error fetching monitoring metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch monitoring metrics', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/monitoring
 *
 * Ingest metrics from external sources (discovery runs, CI pipelines, etc.)
 *
 * Body: { type: 'discovery'|'cache'|'transition'|'pr'|'compression'|'context7', data: {...} }
 */
export async function POST(request: Request) {
  const authError = requireWriteAccess(request, 'metrics:ingest');
  if (authError) return authError;

  try {
    const body = await request.json();
    const { type, data } = body;

    if (!type || !data) {
      return NextResponse.json(
        { error: 'Missing required fields: type, data' },
        { status: 400 }
      );
    }

    const collector = getMetricsCollector();

    switch (type) {
      case 'discovery':
        collector.recordDiscovery(data.provider, data.success, data);
        break;
      case 'cache':
        collector.recordCacheAccess(data.tier, data.result, data.key);
        break;
      case 'transition':
        collector.recordTransition(data.modelId, data.fromState, data.toState);
        break;
      case 'pr':
        collector.recordPRCreation(data.success, data);
        break;
      case 'compression':
        collector.recordCompression(data);
        break;
      case 'context7':
        collector.recordContext7Lookup(data);
        break;
      default:
        return NextResponse.json(
          { error: `Unknown metric type "${type}". Use: discovery, cache, transition, pr, compression, context7` },
          { status: 400 }
        );
    }

    // Re-evaluate alerts after new data
    const alerts = getAlertManager();
    const newAlerts = alerts.evaluate(collector);

    return NextResponse.json({
      success: true,
      newAlerts: newAlerts.length > 0 ? newAlerts : undefined
    });
  } catch (error: unknown) {
    console.error('Error ingesting monitoring metrics:', error);
    return NextResponse.json(
      { error: 'Failed to ingest metrics', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
