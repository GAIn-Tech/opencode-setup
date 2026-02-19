import { NextRequest, NextResponse } from 'next/server';
import { ingestUsageEvent, UsageEvent } from '@/lib/provider-status-store';

export const dynamic = 'force-dynamic';

function validateEvent(payload: unknown): { ok: true; event: UsageEvent } | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Body must be a JSON object' };
  }

  const candidate = payload as Partial<UsageEvent>;
  if (!candidate.provider_id || typeof candidate.provider_id !== 'string') {
    return { ok: false, error: 'provider_id is required' };
  }
  if (!candidate.model_id || typeof candidate.model_id !== 'string') {
    return { ok: false, error: 'model_id is required' };
  }
  if (!candidate.request_id || typeof candidate.request_id !== 'string') {
    return { ok: false, error: 'request_id is required' };
  }
  if (typeof candidate.success !== 'boolean') {
    return { ok: false, error: 'success must be a boolean' };
  }
  if (typeof candidate.latency_ms !== 'number' || Number.isNaN(candidate.latency_ms) || candidate.latency_ms < 0) {
    return { ok: false, error: 'latency_ms must be a non-negative number' };
  }

  // Validate token fields if provided
  if (candidate.input_tokens !== undefined && (typeof candidate.input_tokens !== 'number' || candidate.input_tokens < 0 || Number.isNaN(candidate.input_tokens))) {
    return { ok: false, error: 'input_tokens must be a non-negative number' };
  }
  if (candidate.output_tokens !== undefined && (typeof candidate.output_tokens !== 'number' || candidate.output_tokens < 0 || Number.isNaN(candidate.output_tokens))) {
    return { ok: false, error: 'output_tokens must be a non-negative number' };
  }
  if (candidate.total_tokens !== undefined && (typeof candidate.total_tokens !== 'number' || candidate.total_tokens < 0 || Number.isNaN(candidate.total_tokens))) {
    return { ok: false, error: 'total_tokens must be a non-negative number' };
  }

  // Validate request_type if provided
  if (candidate.request_type !== undefined && !['main', 'subagent', 'tool'].includes(candidate.request_type)) {
    return { ok: false, error: 'request_type must be "main", "subagent", or "tool"' };
  }

  const timestamp =
    typeof candidate.timestamp === 'string' && Number.isFinite(Date.parse(candidate.timestamp))
      ? candidate.timestamp
      : new Date().toISOString();

  return {
    ok: true,
    event: {
      provider_id: candidate.provider_id,
      model_id: candidate.model_id,
      request_id: candidate.request_id,
      success: candidate.success,
      latency_ms: candidate.latency_ms,
      timestamp,
      input_tokens: candidate.input_tokens,
      output_tokens: candidate.output_tokens,
      total_tokens: candidate.total_tokens,
      request_type: candidate.request_type,
      session_id: candidate.session_id,
      parent_session_id: candidate.parent_session_id
    }
  };
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const validation = validateEvent(payload);
    if (!validation.ok) {
      return NextResponse.json({ error: 'error' in validation ? validation.error : 'Invalid usage event' }, { status: 400 });
    }

    const { snapshot, storedEvent } = ingestUsageEvent(validation.event);
    return NextResponse.json({
      success: true,
      event: storedEvent,
      summary: snapshot.summary,
      timestamp: snapshot.timestamp
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
