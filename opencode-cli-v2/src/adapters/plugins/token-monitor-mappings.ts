import { z } from 'zod';

export const TokenMonitorConfigSchema = z.object({
  defaultSessionQuota: z.number().int().positive().default(100_000),
  modelQuotas: z.record(z.string(), z.number().int().positive()).default({}),
  patternDetection: z
    .object({
      spikeMultiplier: z.number().positive().default(2),
      minSamples: z.number().int().min(2).default(3)
    })
    .default({ spikeMultiplier: 2, minSamples: 3 })
});

export type TokenMonitorConfig = z.infer<typeof TokenMonitorConfigSchema>;

export const RecordTokensHookPayloadSchema = z
  .object({
    sessionId: z.string().min(1),
    model: z.string().min(1),
    inputTokens: z.number().int().nonnegative().default(0),
    outputTokens: z.number().int().nonnegative().default(0),
    tokensConsumed: z.number().int().positive().optional(),
    timestamp: z.string().datetime().optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export const GetUsageHookPayloadSchema = z.object({
  sessionId: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional()
});

export const GetReportHookPayloadSchema = z.object({
  sessionId: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  topN: z.number().int().positive().max(100).default(10)
});

export const CheckQuotaHookPayloadSchema = z.object({
  sessionId: z.string().min(1),
  model: z.string().min(1).optional(),
  quota: z.number().int().positive().optional()
});

export interface TokenUsageRecord {
  readonly sessionId: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly timestamp: string;
  readonly metadata: Record<string, unknown>;
}

export interface TokenUsageAggregate {
  readonly totalTokens: number;
  readonly totalCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly averageTokensPerCall: number;
  readonly firstRecordedAt?: string;
  readonly lastRecordedAt?: string;
}

export interface UsagePatternAlert {
  readonly type: 'spike' | 'anomaly';
  readonly severity: 'low' | 'medium' | 'high';
  readonly message: string;
  readonly baseline: number;
  readonly current: number;
  readonly ratio: number;
}

export interface QuotaStatus {
  readonly scope: 'session' | 'model' | 'custom';
  readonly limit: number;
  readonly used: number;
  readonly remaining: number;
  readonly exceeded: boolean;
  readonly utilization: number;
}

export function parseTokenMonitorConfig(value: unknown): TokenMonitorConfig {
  const source = asRecord(value);
  const nested = asRecord(source.tokenMonitor);
  const normalized = Object.keys(nested).length > 0 ? nested : source;
  return TokenMonitorConfigSchema.parse(normalized);
}

export function toTokenUsageRecord(payload: z.infer<typeof RecordTokensHookPayloadSchema>, nowIso: string): TokenUsageRecord {
  const computedTotal = payload.tokensConsumed ?? payload.inputTokens + payload.outputTokens;
  if (computedTotal <= 0) {
    throw new Error('Token record must include a positive token count');
  }

  return {
    sessionId: payload.sessionId,
    model: payload.model,
    inputTokens: payload.inputTokens,
    outputTokens: payload.outputTokens,
    totalTokens: computedTotal,
    timestamp: payload.timestamp ?? nowIso,
    metadata: payload.metadata ?? {}
  };
}

export function computeUsageAggregate(records: readonly TokenUsageRecord[]): TokenUsageAggregate {
  if (records.length === 0) {
    return {
      totalTokens: 0,
      totalCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      averageTokensPerCall: 0
    };
  }

  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for (const record of records) {
    totalTokens += record.totalTokens;
    inputTokens += record.inputTokens;
    outputTokens += record.outputTokens;
  }

  return {
    totalTokens,
    totalCalls: records.length,
    inputTokens,
    outputTokens,
    averageTokensPerCall: Math.round((totalTokens / records.length) * 100) / 100,
    firstRecordedAt: records[0]?.timestamp,
    lastRecordedAt: records[records.length - 1]?.timestamp
  };
}

export function filterUsageRecords(
  records: readonly TokenUsageRecord[],
  filter: z.infer<typeof GetUsageHookPayloadSchema> | z.infer<typeof GetReportHookPayloadSchema>
): TokenUsageRecord[] {
  const sinceMillis = toMillis(filter.since);
  const untilMillis = toMillis(filter.until);

  return records.filter((record) => {
    if (filter.sessionId && record.sessionId !== filter.sessionId) return false;
    if (filter.model && record.model !== filter.model) return false;

    const timestamp = Date.parse(record.timestamp);
    if (typeof sinceMillis === 'number' && timestamp < sinceMillis) return false;
    if (typeof untilMillis === 'number' && timestamp > untilMillis) return false;

    return true;
  });
}

export function detectUsagePattern(
  records: readonly TokenUsageRecord[],
  config: Pick<TokenMonitorConfig, 'patternDetection'>
): UsagePatternAlert | undefined {
  if (records.length < config.patternDetection.minSamples) return undefined;

  const latest = records[records.length - 1];
  if (!latest) return undefined;

  const previous = records.slice(0, -1);
  const baseline = previous.reduce((sum, entry) => sum + entry.totalTokens, 0) / previous.length;
  if (baseline <= 0) return undefined;

  const ratio = latest.totalTokens / baseline;
  if (ratio < config.patternDetection.spikeMultiplier) return undefined;

  return {
    type: ratio >= config.patternDetection.spikeMultiplier * 1.5 ? 'anomaly' : 'spike',
    severity: ratio >= config.patternDetection.spikeMultiplier * 2 ? 'high' : ratio >= 2 ? 'medium' : 'low',
    message: `Usage increase detected (x${ratio.toFixed(2)} vs baseline)`,
    baseline,
    current: latest.totalTokens,
    ratio
  };
}

export function evaluateQuotaStatus(input: {
  readonly scope: QuotaStatus['scope'];
  readonly used: number;
  readonly limit: number;
}): QuotaStatus {
  const remaining = Math.max(0, input.limit - input.used);
  const utilization = input.limit > 0 ? input.used / input.limit : 0;

  return {
    scope: input.scope,
    used: input.used,
    limit: input.limit,
    remaining,
    exceeded: input.used > input.limit,
    utilization
  };
}

export function buildUsageKey(sessionId: string, model: string): string {
  return `${sessionId}::${model}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toMillis(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}
