import { NextRequest, NextResponse } from 'next/server';
import { loadMetaAwarenessTrackerWithStatus, readMetaAwarenessRollups } from '@/lib/meta-awareness';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const trackerStatus = await loadMetaAwarenessTrackerWithStatus();
    const tracker = trackerStatus.tracker;
    if (tracker && typeof tracker.getStability === 'function') {
      const liveStability = await tracker.getStability();
      return NextResponse.json({
        ...liveStability,
        data_fidelity: 'live',
        fallback: false,
      });
    }

    const fallbackReason = tracker ? 'live_tracker_method_unavailable' : trackerStatus.statusReason;

    const rollups = await readMetaAwarenessRollups();
    const stability = rollups?.stability || {
      bounded_update_count: 0,
      anomaly_count: 0,
      last_anomalies: [],
      confidence_gate: { accepted: 0, rejected: 0, acceptance_rate: 0 },
    };

    const accepted = Number(stability.confidence_accepted_count || 0);
    const rejected = Number(stability.confidence_rejected_count || 0);
    const total = accepted + rejected;

    return NextResponse.json({
      generated_at: rollups?.generated_at || new Date().toISOString(),
      bounded_update_count: Number(stability.bounded_update_count || 0),
      anomaly_count: Number(stability.anomaly_count || 0),
      last_anomalies: Array.isArray(stability.last_anomalies) ? stability.last_anomalies : [],
      confidence_gate: {
        accepted,
        rejected,
        acceptance_rate: total > 0 ? Number((accepted / total).toFixed(3)) : 0,
      },
      data_fidelity: rollups ? 'degraded' : 'demo',
      fallback: true,
      status_reason: rollups ? 'file_fallback' : 'missing_state',
      fallback_reason: fallbackReason,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
