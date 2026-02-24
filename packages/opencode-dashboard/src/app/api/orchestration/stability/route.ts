import { NextRequest, NextResponse } from 'next/server';
import { loadMetaAwarenessTracker, readMetaAwarenessRollups } from '@/lib/meta-awareness';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const tracker = loadMetaAwarenessTracker();
    if (tracker && typeof tracker.getStability === 'function') {
      return NextResponse.json({
        ...tracker.getStability(),
        data_fidelity: 'live',
        fallback: false,
      });
    }

    const rollups = readMetaAwarenessRollups();
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
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
