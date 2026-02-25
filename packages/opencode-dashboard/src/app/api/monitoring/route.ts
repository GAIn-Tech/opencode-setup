import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Lazy-load CJS modules from model-manager package
let monitoringModule: any = null;

function loadModules() {
  if (!monitoringModule) {
    monitoringModule = require('opencode-model-manager/monitoring');
  }
}

// Singleton instances - persist across requests
let metricsCollector: any = null;
let alertManager: any = null;

function getMetricsCollector() {
  if (!metricsCollector) {
    loadModules();
    metricsCollector = new monitoringModule.PipelineMetricsCollector({
      autoCleanup: true
    });
  }
  return metricsCollector;
}

function getAlertManager() {
  if (!alertManager) {
    loadModules();
    alertManager = new monitoringModule.AlertManager();
  }
  return alertManager;
}

/**
 * GET /api/monitoring
 *
 * Query params:
 * - format: 'json' (default) | 'prometheus'
 * - window: time window in ms (default: 86400000 = 24h)
 * - section: 'all' | 'discovery' | 'cache' | 'transitions' | 'pr' | 'alerts'
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

    let response: any;

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
    } else if (section === 'alerts') {
      response = {
        active: activeAlerts,
        history: alerts.getAlertHistory(50),
        summary: alertSummary
      };
    } else {
      return NextResponse.json(
        { error: `Unknown section "${section}". Use: all, discovery, cache, transitions, pr, alerts` },
        { status: 400 }
      );
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error fetching monitoring metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch monitoring metrics', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/monitoring
 *
 * Ingest metrics from external sources (discovery runs, CI pipelines, etc.)
 *
 * Body: { type: 'discovery'|'cache'|'transition'|'pr', data: {...} }
 */
export async function POST(request: Request) {
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
      default:
        return NextResponse.json(
          { error: `Unknown metric type "${type}". Use: discovery, cache, transition, pr` },
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
  } catch (error: any) {
    console.error('Error ingesting monitoring metrics:', error);
    return NextResponse.json(
      { error: 'Failed to ingest metrics', message: error.message },
      { status: 500 }
    );
  }
}
