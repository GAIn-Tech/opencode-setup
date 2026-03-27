import { NextRequest, NextResponse } from 'next/server';
import { loadMetaAwarenessTrackerWithStatus, readMetaAwarenessRollups } from '@/lib/meta-awareness';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const trackerStatus = loadMetaAwarenessTrackerWithStatus();
    const tracker = trackerStatus.tracker;
    if (tracker && typeof tracker.getOverview === 'function') {
      const liveOverview = await tracker.getOverview();
      return NextResponse.json({
        ...liveOverview,
        data_fidelity: 'live',
        fallback: false,
      });
    }

    const fallbackReason = tracker ? 'live_tracker_method_unavailable' : trackerStatus.statusReason;

    const rollups = await readMetaAwarenessRollups();
    if (rollups) {
      return NextResponse.json({
        generated_at: rollups.generated_at,
        composite: rollups.composite,
        domains: rollups.domains,
        stability: rollups.stability,
        rl_signal: {
          accepted: false,
          confidence: 0,
          max_influence: 0.15,
          confidence_threshold: 0.85,
        },
        data_fidelity: 'degraded',
        fallback: true,
        status_reason: 'file_fallback',
        fallback_reason: fallbackReason,
      });
    }

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      composite: { score_mean: 50, score_ci_low: 50, score_ci_high: 50, sample_count: 0 },
      domains: {},
      stability: {
        bounded_update_count: 0,
        anomaly_count: 0,
        confidence_gate: { accepted: 0, rejected: 0, acceptance_rate: 0 },
      },
      rl_signal: {
        accepted: false,
        confidence: 0,
        max_influence: 0.15,
        confidence_threshold: 0.85,
      },
      data_fidelity: 'demo',
      fallback: true,
      status_reason: 'missing_state',
      fallback_reason: fallbackReason,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
