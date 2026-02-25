import { NextRequest, NextResponse } from 'next/server';
import { loadMetaAwarenessTracker, readMetaAwarenessEvents } from '@/lib/meta-awareness';

export const dynamic = 'force-dynamic';

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value || '200', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 200;
  return Math.max(1, Math.min(2000, parsed));
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId') || undefined;
    const limit = parseLimit(request.nextUrl.searchParams.get('limit'));

    const tracker = loadMetaAwarenessTracker();
    if (tracker && typeof tracker.getForensics === 'function') {
      return NextResponse.json({
        ...tracker.getForensics({ sessionId, limit }),
        data_fidelity: 'live',
        fallback: false,
      });
    }

    const events = await readMetaAwarenessEvents(limit);
    const filtered = sessionId ? events.filter((event: Record<string, unknown>) => event.session_id === sessionId) : events;
    return NextResponse.json({
      generated_at: new Date().toISOString(),
      count: filtered.length,
      events: filtered.slice(-limit),
      data_fidelity: filtered.length > 0 ? 'degraded' : 'demo',
      fallback: true,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
