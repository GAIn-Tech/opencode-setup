import { NextResponse } from 'next/server';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export const dynamic = 'force-dynamic';

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function round(n: number, decimals = 4): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

/**
 * GET /api/package-execution
 *
 * Reads ~/.opencode/package-execution/events.json (written by both
 * IntegrationLayer.delegate() instrumentation and runtime-tool-telemetry.mjs
 * PostToolUse hook). Aggregates metrics by package, method, session, and task type.
 *
 * Query params:
 * - window: time window in ms (default: 86400000 = 24h)
 * - package: filter by specific package name
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const windowMs = parseInt(searchParams.get('window') || '86400000', 10);
    const filterPackage = searchParams.get('package');

    const eventsPath = path.join(os.homedir(), '.opencode', 'package-execution', 'events.json');
    let events: unknown[] = [];

    if (fs.existsSync(eventsPath)) {
      const raw = fs.readFileSync(eventsPath, 'utf8');
      events = safeJsonParse<unknown[]>(raw, []);
      if (!Array.isArray(events)) events = [];
    }

    const cutoff = Date.now() - windowMs;
    const recent = (events as unknown[]).filter((e) => {
      if (!e || typeof e !== 'object') return false;
      const obj = e as Record<string, unknown>;
      if (!obj.timestamp) return false;
      const ts = typeof obj.timestamp === 'number' ? obj.timestamp : 0;
      return ts >= cutoff;
    }) as unknown[];

    // Aggregate by package
    const byPackage: Record<string, {
      total: number;
      successes: number;
      failures: number;
      rate: number;
      avgDurationMs: number;
      methods: Record<string, { total: number; successes: number; failures: number; rate: number; avgDurationMs: number }>;
    }> = {};

    // Aggregate by session
    const bySession: Record<string, { total: number; successes: number; failures: number }> = {};

    // Aggregate by task type
    const byTaskType: Record<string, { total: number; successes: number; failures: number }> = {};

    for (const ev of recent) {
      if (!ev || typeof ev !== 'object') continue;
      const obj = ev as Record<string, unknown>;
      if (!obj.package) continue;
      if (filterPackage && obj.package !== filterPackage) continue;

      const pkg = String(obj.package);
      const method = String(obj.method || 'unknown');
      const sessionId = String(obj.sessionId || 'unknown');
      const taskType = String(obj.taskType || obj.task_type || 'unknown');
      const success = obj.success === true;
      const durationMs = Math.max(0, Number(obj.durationMs) || 0);

      if (!byPackage[pkg]) {
        byPackage[pkg] = { total: 0, successes: 0, failures: 0, rate: 0, avgDurationMs: 0, methods: {} };
      }
      byPackage[pkg].total++;
      if (success) byPackage[pkg].successes++;
      else byPackage[pkg].failures++;

      if (!byPackage[pkg].methods[method]) {
        byPackage[pkg].methods[method] = { total: 0, successes: 0, failures: 0, rate: 0, avgDurationMs: 0 };
      }
      byPackage[pkg].methods[method].total++;
      if (success) byPackage[pkg].methods[method].successes++;
      else byPackage[pkg].methods[method].failures++;

      if (sessionId !== 'unknown') {
        if (!bySession[sessionId]) bySession[sessionId] = { total: 0, successes: 0, failures: 0 };
        bySession[sessionId].total++;
        if (success) bySession[sessionId].successes++;
        else bySession[sessionId].failures++;
      }

      if (taskType !== 'unknown') {
        if (!byTaskType[taskType]) byTaskType[taskType] = { total: 0, successes: 0, failures: 0 };
        byTaskType[taskType].total++;
        if (success) byTaskType[taskType].successes++;
        else byTaskType[taskType].failures++;
      }
    }

    // Compute rates and avg duration
    const packages = Object.entries(byPackage).map(([name, data]) => {
      const methods = Object.entries(data.methods).map(([m, mData]) => ({
        method: m,
        total: mData.total,
        successes: mData.successes,
        failures: mData.failures,
        rate: mData.total > 0 ? round(mData.successes / mData.total) : 0,
      }));

      return {
        package: name,
        total: data.total,
        successes: data.successes,
        failures: data.failures,
        rate: data.total > 0 ? round(data.successes / data.total) : 0,
        methods,
      };
    });

    const totalCalls = recent.length;
    const totalSuccesses = recent.filter((e) => {
      if (!e || typeof e !== 'object') return false;
      const obj = e as Record<string, unknown>;
      return obj.success === true;
    }).length;
    const totalFailures = totalCalls - totalSuccesses;
    const totalDurationMs = (recent as unknown[]).reduce((sum: number, e) => {
      if (!e || typeof e !== 'object') return sum;
      const obj = e as Record<string, unknown>;
      return sum + Math.max(0, Number(obj.durationMs) || 0);
    }, 0);
    const avgDurationMs = totalCalls > 0 ? round(totalDurationMs / totalCalls) : 0;

    const topPackages = packages
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const recentEvents = (recent as unknown[])
      .filter((e) => {
        if (!e || typeof e !== 'object') return false;
        const obj = e as Record<string, unknown>;
        return obj.package && !obj.success;
      })
      .sort((a, b) => {
        if (!a || typeof a !== 'object' || !b || typeof b !== 'object') return 0;
        const aObj = a as Record<string, unknown>;
        const bObj = b as Record<string, unknown>;
        return (Number(bObj.timestamp) || 0) - (Number(aObj.timestamp) || 0);
      })
      .slice(0, 20)
      .map((e) => {
        const obj = e as Record<string, unknown>;
        return {
          package: obj.package,
          method: obj.method,
          timestamp: obj.timestamp ? new Date(String(obj.timestamp)).toISOString() : null,
          sessionId: obj.sessionId,
          taskType: obj.taskType || obj.task_type,
          error: obj.error,
          durationMs: obj.durationMs,
        };
      });

    const oldestEntry = recent.length > 0
      ? new Date(Math.min(...(recent as unknown[]).map((e) => {
          if (!e || typeof e !== 'object') return 0;
          const obj = e as Record<string, unknown>;
          return Number(obj.timestamp) || 0;
        }))).toISOString()
      : null;
    const newestEntry = recent.length > 0
      ? new Date(Math.max(...(recent as unknown[]).map((e) => {
          if (!e || typeof e !== 'object') return 0;
          const obj = e as Record<string, unknown>;
          return Number(obj.timestamp) || 0;
        }))).toISOString()
      : null;

    return NextResponse.json({
      total: totalCalls,
      windowMs,
      successes: totalSuccesses,
      failures: totalFailures,
      rate: totalCalls > 0 ? round(totalSuccesses / totalCalls) : 0,
      avgDurationMs,
      uniquePackages: packages.length,
      packages: topPackages,
      bySession: Object.entries(bySession)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 20)
        .map(([sessionId, data]) => ({
          sessionId,
          total: data.total,
          successes: data.successes,
          failures: data.failures,
          rate: data.total > 0 ? round(data.successes / data.total) : 0,
        })),
      byTaskType: Object.entries(byTaskType)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 20)
        .map(([taskType, data]) => ({
          taskType,
          total: data.total,
          successes: data.successes,
          failures: data.failures,
          rate: data.total > 0 ? round(data.successes / data.total) : 0,
        })),
      recentFailures: recentEvents,
      oldestEntry,
      newestEntry,
    });
  } catch (error: unknown) {
    console.error('Error fetching package execution metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch package execution metrics', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
