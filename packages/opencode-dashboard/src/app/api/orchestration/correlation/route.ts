import { NextRequest, NextResponse } from 'next/server';
import { loadMetaAwarenessTracker, readMetaAwarenessEvents } from '@/lib/meta-awareness';

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
    if (tracker && typeof tracker.getCorrelation === 'function') {
      return NextResponse.json({
        ...tracker.getCorrelation({ sinceDays }),
        data_fidelity: 'live',
        fallback: false,
      });
    }

    const events = await readMetaAwarenessEvents(1000);
    const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    const filtered = events.filter((event: any) => new Date(event.timestamp || 0).getTime() >= cutoff);

    const model: Record<string, number> = {};
    const skill: Record<string, number> = {};
    const tool: Record<string, number> = {};
    const outcome: Record<string, number> = {};

    for (const event of filtered) {
      const m = String(event?.metadata?.model || event?.metadata?.model_id || 'unknown');
      const s = String(event?.metadata?.skill || 'unknown');
      const t = String(event?.metadata?.tool || 'unknown');
      const o = String(event?.outcome || 'unknown');
      model[m] = (model[m] || 0) + 1;
      skill[s] = (skill[s] || 0) + 1;
      tool[t] = (tool[t] || 0) + 1;
      outcome[o] = (outcome[o] || 0) + 1;
    }

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      since_days: sinceDays,
      totals: {
        events: filtered.length,
        models: Object.keys(model).length,
        skills: Object.keys(skill).length,
        tools: Object.keys(tool).length,
        outcomes: Object.keys(outcome).length,
      },
      distributions: { model, skill, tool, outcome },
      data_fidelity: filtered.length > 0 ? 'degraded' : 'demo',
      fallback: true,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
