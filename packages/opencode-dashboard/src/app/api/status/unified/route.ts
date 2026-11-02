import { NextRequest, NextResponse } from 'next/server';
import { getUnifiedStatus } from '@/lib/provider-status-store';

export const dynamic = 'force-dynamic';

function parseRefreshParam(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export async function GET(request: NextRequest) {
  try {
    const refresh = parseRefreshParam(request.nextUrl.searchParams.get('refresh'));
    const snapshot = await getUnifiedStatus({
      forceRefresh: refresh,
      origin: request.nextUrl.origin
    });

    return NextResponse.json(snapshot);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
