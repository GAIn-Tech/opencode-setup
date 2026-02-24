import { NextRequest, NextResponse } from 'next/server';
import { loadMetaAwarenessTracker, readMetaAwarenessRollups } from '@/lib/meta-awareness';

export const dynamic = 'force-dynamic';

function parseSinceDays(value: string | null): number {
  const parsed = Number.parseInt(value || '30', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 30;
  return Math.max(1, Math.min(365, parsed));
}

export async function GET(request: NextRequest) {
  try {
    const sinceDays = parseSinceDays(request.nextUrl.searchParams.get('sinceDays'));
    const tracker = loadMetaAwarenessTracker();
    if (tracker && typeof tracker.getTimeline === 'function') {
      return NextResponse.json({
        generated_at: new Date().toISOString(),
        since_days: sinceDays,
        points: tracker.getTimeline({ sinceDays }),
        data_fidelity: 'live',
        fallback: false,
      });
    }

    const rollups = readMetaAwarenessRollups();
    const points = Array.isArray(rollups?.timeline?.points) ? rollups.timeline.points : [];
    const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    return NextResponse.json({
      generated_at: new Date().toISOString(),
      since_days: sinceDays,
      points: points.filter((point: any) => new Date(point.timestamp || 0).getTime() >= cutoff),
      data_fidelity: rollups ? 'degraded' : 'demo',
      fallback: true,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
