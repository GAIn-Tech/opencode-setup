import { NextResponse } from 'next/server';
import { errorResponse } from '../_lib/error-response';
import { getMetricsCollector } from '../../../lib/metrics-singleton';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const windowMs = parseInt(searchParams.get('window') || '86400000', 10);
    const stats = getMetricsCollector().getErrorTrends(windowMs);
    return NextResponse.json(stats);
  } catch (error: unknown) {
    return errorResponse('Failed to fetch error trend metrics', 500, error instanceof Error ? error.message : String(error));
  }
}
