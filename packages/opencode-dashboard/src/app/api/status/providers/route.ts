import { NextRequest, NextResponse } from 'next/server';
import { getProviderDetails, getProviderHistory, getUnifiedStatus } from '@/lib/provider-status-store';

export const dynamic = 'force-dynamic';

function parseRefreshParam(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const providerId = params.get('provider_id');
    const refresh = parseRefreshParam(params.get('refresh'));

    if (providerId) {
      const provider = await getProviderDetails(providerId, {
        forceRefresh: refresh,
        origin: request.nextUrl.origin
      });

      if (!provider) {
        return NextResponse.json({ error: `Provider '${providerId}' not found` }, { status: 404 });
      }

      return NextResponse.json({
        provider,
        history: getProviderHistory(providerId)
      });
    }

    const snapshot = await getUnifiedStatus({
      forceRefresh: refresh,
      origin: request.nextUrl.origin
    });

    return NextResponse.json({
      version: snapshot.version,
      timestamp: snapshot.timestamp,
      providers: snapshot.providers
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
