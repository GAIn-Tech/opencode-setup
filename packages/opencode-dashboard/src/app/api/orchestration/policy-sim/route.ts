import crypto from 'crypto';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type SigningMode = 'off' | 'allow-unsigned' | 'require-signed' | 'require-valid-signature';

type SimEvent = {
  timestamp?: string;
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string;
  model?: string;
  skill?: string;
  tool?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  iteration_index?: number;
  termination_reason?: string;
  latency_ms?: number;
  provenance?: {
    signature?: string;
    source?: string;
  };
};

type PolicySimRequest = {
  events: SimEvent[];
  policy?: {
    signing_mode?: SigningMode;
    replay_seed_enabled?: boolean;
    require_trace_ids?: boolean;
    minimum_fidelity?: 'demo' | 'degraded' | 'live';
    max_p95_latency_ms?: number;
    max_p99_latency_ms?: number;
  };
};

function n(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const parsed = Number(v);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(obj[key])}`).join(',')}}`;
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function hmacSha256(input: string, key: string): string {
  return crypto.createHmac('sha256', key).update(input).digest('hex');
}

function normalizeSigningMode(mode: unknown): SigningMode {
  const defaultMode: SigningMode = process.env.NODE_ENV === 'production' ? 'require-valid-signature' : 'allow-unsigned';
  const raw = String(mode || '').trim().toLowerCase();
  if (raw === 'off' || raw === 'allow-unsigned' || raw === 'require-signed' || raw === 'require-valid-signature') {
    return raw;
  }
  return defaultMode;
}

function fidelityRank(value: 'demo' | 'degraded' | 'live'): number {
  if (value === 'live') return 3;
  if (value === 'degraded') return 2;
  return 1;
}

function estimateFidelity(events: SimEvent[]): 'demo' | 'degraded' | 'live' {
  if (events.length === 0) return 'demo';
  const withTokens = events.filter((event) => n(event.total_tokens, n(event.input_tokens, 0) + n(event.output_tokens, 0)) > 0).length;
  const withTraces = events.filter((event) => Boolean(event.trace_id)).length;
  if (withTokens === events.length && withTraces === events.length) return 'live';
  if (withTokens > 0 || withTraces > 0) return 'degraded';
  return 'demo';
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx] || 0;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as PolicySimRequest;
    const events = Array.isArray(payload?.events) ? payload.events : [];

    if (events.length === 0) {
      return NextResponse.json({ message: 'No events submitted for simulation', accepted: 0 }, { status: 400 });
    }

    const signingMode = normalizeSigningMode(payload?.policy?.signing_mode);
    const signingKey = process.env.OPENCODE_EVENT_SIGNING_KEY || '';
    const requireTraceIds = Boolean(payload?.policy?.require_trace_ids);
    const replaySeedEnabled = Boolean(payload?.policy?.replay_seed_enabled ?? process.env.OPENCODE_REPLAY_SEED);
    const minimumFidelity = (payload?.policy?.minimum_fidelity || 'degraded') as 'demo' | 'degraded' | 'live';
    const maxP95LatencyMs = Number.isFinite(payload?.policy?.max_p95_latency_ms as number)
      ? Number(payload?.policy?.max_p95_latency_ms)
      : 2200;
    const maxP99LatencyMs = Number.isFinite(payload?.policy?.max_p99_latency_ms as number)
      ? Number(payload?.policy?.max_p99_latency_ms)
      : 3500;

    let accepted = 0;
    let rejected = 0;
    let rejectedUnsigned = 0;
    let rejectedInvalidSignature = 0;
    let rejectedMissingTrace = 0;
    let signedCount = 0;
    let validSignedCount = 0;
    const acceptedEvents: SimEvent[] = [];
    const acceptedLatencies: number[] = [];

    const sampleRejections: Array<{ index: number; reason: string }> = [];

    events.forEach((event, index) => {
      const normalized = {
        timestamp: event.timestamp || new Date().toISOString(),
        trace_id: event.trace_id,
        span_id: event.span_id,
        parent_span_id: event.parent_span_id,
        model: event.model,
        skill: event.skill,
        tool: event.tool,
        input_tokens: n(event.input_tokens, 0),
        output_tokens: n(event.output_tokens, 0),
        total_tokens: n(event.total_tokens, n(event.input_tokens, 0) + n(event.output_tokens, 0)),
        iteration_index: n(event.iteration_index, 0),
        termination_reason: event.termination_reason,
      };

      const eventHash = sha256(canonicalStringify(normalized));
      const incomingSignature = String(event?.provenance?.signature || '').trim();
      const computedSignature = signingKey ? hmacSha256(eventHash, signingKey) : '';
      const hasSignature = Boolean(incomingSignature);
      const signatureValid = signingKey ? hasSignature && incomingSignature === computedSignature : hasSignature;

      if (hasSignature) signedCount += 1;
      if (signatureValid) validSignedCount += 1;

      if (requireTraceIds && !event.trace_id) {
        rejected += 1;
        rejectedMissingTrace += 1;
        if (sampleRejections.length < 10) sampleRejections.push({ index, reason: 'missing_trace_id' });
        return;
      }

      if (signingMode === 'require-signed' && !hasSignature) {
        rejected += 1;
        rejectedUnsigned += 1;
        if (sampleRejections.length < 10) sampleRejections.push({ index, reason: 'unsigned_event' });
        return;
      }

      if (signingMode === 'require-valid-signature' && (!hasSignature || !signatureValid)) {
        rejected += 1;
        if (!hasSignature) rejectedUnsigned += 1;
        else rejectedInvalidSignature += 1;
        if (sampleRejections.length < 10) sampleRejections.push({ index, reason: hasSignature ? 'invalid_signature' : 'unsigned_event' });
        return;
      }

      accepted += 1;
      acceptedEvents.push(event);
      const latency = n((event as any).latency_ms, NaN);
      if (Number.isFinite(latency) && latency >= 0) {
        acceptedLatencies.push(latency);
      }
    });

    const projectedFidelity = estimateFidelity(acceptedEvents);
    const fidelityPass = fidelityRank(projectedFidelity) >= fidelityRank(minimumFidelity);
    const projectedP95 = percentile(acceptedLatencies, 95);
    const projectedP99 = percentile(acceptedLatencies, 99);
    const latencyPass =
      acceptedLatencies.length === 0 ? true : projectedP95 <= maxP95LatencyMs && projectedP99 <= maxP99LatencyMs;

    return NextResponse.json({
      policy: {
        signing_mode: signingMode,
        require_trace_ids: requireTraceIds,
        replay_seed_enabled: replaySeedEnabled,
        minimum_fidelity: minimumFidelity,
        max_p95_latency_ms: maxP95LatencyMs,
        max_p99_latency_ms: maxP99LatencyMs,
      },
      summary: {
        total: events.length,
        accepted,
        rejected,
        acceptance_ratio: Number(((accepted / events.length) * 100).toFixed(2)),
      },
      rejection_breakdown: {
        unsigned: rejectedUnsigned,
        invalid_signature: rejectedInvalidSignature,
        missing_trace_id: rejectedMissingTrace,
      },
      provenance: {
        signing_key_configured: Boolean(signingKey),
        signed_events_ratio: Number(((signedCount / events.length) * 100).toFixed(2)),
        valid_signed_events_ratio: signedCount > 0 ? Number(((validSignedCount / signedCount) * 100).toFixed(2)) : 0,
      },
      fidelity_projection: {
        projected: projectedFidelity,
        minimum_required: minimumFidelity,
        pass: fidelityPass,
      },
      latency_projection: {
        samples: acceptedLatencies.length,
        p95_ms: Number(projectedP95.toFixed(2)),
        p99_ms: Number(projectedP99.toFixed(2)),
        max_p95_ms: maxP95LatencyMs,
        max_p99_ms: maxP99LatencyMs,
        pass: latencyPass,
      },
      risk_summary: {
        high: rejected > 0 || !fidelityPass || !latencyPass,
        replay_determinism_missing: !replaySeedEnabled,
        signing_policy_strict: signingMode === 'require-valid-signature',
      },
      sample_rejections: sampleRejections,
    });
  } catch (error) {
    return NextResponse.json({ message: 'Policy simulation failed', error: String(error) }, { status: 500 });
  }
}
