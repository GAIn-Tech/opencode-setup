import { NextRequest, NextResponse } from 'next/server';
import { loadMetaAwarenessTrackerWithStatus, readMetaAwarenessRollups } from '@/lib/meta-awareness';

export const dynamic = 'force-dynamic';

function parseSinceDays(value: string | null): number {
  const parsed = Number.parseInt(value || '30', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 30;
  return Math.max(1, Math.min(365, parsed));
}

export async function GET(request: NextRequest) {
  try {
    const sinceDays = parseSinceDays(request.nextUrl.searchParams.get('sinceDays'));
    const trackerStatus = loadMetaAwarenessTrackerWithStatus();
    const tracker = trackerStatus.tracker;
    if (tracker && typeof tracker.getTimeline === 'function') {
      const livePoints = await tracker.getTimeline({ sinceDays });
      return NextResponse.json({
        generated_at: new Date().toISOString(),
        since_days: sinceDays,
        points: livePoints,
        data_fidelity: 'live',
        fallback: false,
      });
    }

    const fallbackReason = tracker ? 'live_tracker_method_unavailable' : trackerStatus.statusReason;

    const rollups = await readMetaAwarenessRollups();
    const points = Array.isArray(rollups?.timeline?.points) ? rollups.timeline.points : [];
    const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    const filteredPoints = points.filter((point: Record<string, unknown>) => new Date(String(point.timestamp || 0)).getTime() >= cutoff);
    return NextResponse.json({
      generated_at: new Date().toISOString(),
      since_days: sinceDays,
      points: filteredPoints,
      data_fidelity: rollups ? 'degraded' : 'demo',
      fallback: true,
      status_reason: filteredPoints.length > 0 ? 'file_fallback' : 'missing_state',
      fallback_reason: fallbackReason,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
