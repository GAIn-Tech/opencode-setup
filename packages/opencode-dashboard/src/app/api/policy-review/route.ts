import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const dynamic = 'force-dynamic';

function getQueuePath() {
  if (process.env.OPENCODE_POLICY_REVIEW_QUEUE_PATH) {
    return process.env.OPENCODE_POLICY_REVIEW_QUEUE_PATH;
  }
  return path.join(os.homedir(), '.opencode', 'policy-review-queue.json');
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx] || 0;
}

export async function GET() {
  try {
    const queuePath = getQueuePath();
    const p95AgeSloHours = Number.isFinite(Number(process.env.OPENCODE_POLICY_REVIEW_P95_SLO_HOURS || '24'))
      ? Number(process.env.OPENCODE_POLICY_REVIEW_P95_SLO_HOURS || '24')
      : 24;

    const queue = fs.existsSync(queuePath)
      ? JSON.parse(fs.readFileSync(queuePath, 'utf-8'))
      : { version: '1.0.0', updated_at: new Date().toISOString(), items: [] };

    const items = Array.isArray(queue.items) ? queue.items : [];
    const now = Date.now();
    const pendingItems = items.filter((item: any) => String(item?.status || 'pending') === 'pending');
    const pendingAgesHours = pendingItems
      .map((item: any) => {
        const created = Date.parse(String(item?.created_at || ''));
        if (Number.isNaN(created)) return 0;
        return (now - created) / (1000 * 60 * 60);
      })
      .filter((value: number) => Number.isFinite(value) && value >= 0);

    const p95AgeHours = percentile(pendingAgesHours, 95);
    const p50AgeHours = percentile(pendingAgesHours, 50);
    const maxAgeHours = pendingAgesHours.length > 0 ? Math.max(...pendingAgesHours) : 0;

    const byStatus = items.reduce((acc: Record<string, number>, item: any) => {
      const status = String(item?.status || 'pending');
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      queue_path: queuePath,
      total_items: items.length,
      pending_items: pendingItems.length,
      status_counts: byStatus,
      slo: {
        p95_age_hours: Number(p95AgeHours.toFixed(2)),
        p50_age_hours: Number(p50AgeHours.toFixed(2)),
        max_age_hours: Number(maxAgeHours.toFixed(2)),
        target_p95_hours: p95AgeSloHours,
        pass: p95AgeHours <= p95AgeSloHours,
      },
      sample_pending: pendingItems.slice(0, 20),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to read policy review queue',
        message: String(error),
      },
      { status: 500 }
    );
  }
}
