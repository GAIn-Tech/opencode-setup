import { NextRequest, NextResponse } from 'next/server';
import { loadMetaAwarenessTracker, readMetaAwarenessRollups } from '@/lib/meta-awareness';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const tracker = loadMetaAwarenessTracker();
    if (tracker && typeof tracker.getOverview === 'function') {
      return NextResponse.json({
        ...tracker.getOverview(),
        data_fidelity: 'live',
        fallback: false,
      });
    }

    const rollups = readMetaAwarenessRollups();
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
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
