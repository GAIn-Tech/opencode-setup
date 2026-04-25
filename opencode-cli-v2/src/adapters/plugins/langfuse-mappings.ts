import { z } from 'zod';

export const LangfuseHookNameSchema = z.enum([
  'langfuse.create-trace',
  'langfuse.create-span',
  'langfuse.log-llm-call',
  'langfuse.score'
]);
export type LangfuseHookName = z.infer<typeof LangfuseHookNameSchema>;

export const LangfuseCreateTracePayloadSchema = z
  .object({
    traceId: z.string().min(1).optional(),
    name: z.string().min(1),
    sessionId: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();
export type LangfuseCreateTracePayload = z.infer<typeof LangfuseCreateTracePayloadSchema>;

export const LangfuseCreateSpanPayloadSchema = z
  .object({
    traceId: z.string().min(1),
    spanId: z.string().min(1).optional(),
    name: z.string().min(1),
    parentSpanId: z.string().min(1).optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    latencyMs: z.number().nonnegative().optional(),
    status: z.enum(['ok', 'error']).default('ok'),
    level: z.enum(['default', 'debug', 'warning', 'error']).default('default'),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();
export type LangfuseCreateSpanPayload = z.infer<typeof LangfuseCreateSpanPayloadSchema>;

export const LangfuseLogLlmCallPayloadSchema = z
  .object({
    traceId: z.string().min(1),
    spanId: z.string().min(1).optional(),
    callId: z.string().min(1).optional(),
    model: z.string().min(1),
    provider: z.string().min(1).optional(),
    prompt: z.unknown(),
    response: z.unknown().optional(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
    latencyMs: z.number().nonnegative().optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    usage: z.record(z.string(), z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();
export type LangfuseLogLlmCallPayload = z.infer<typeof LangfuseLogLlmCallPayloadSchema>;

export const LangfuseScorePayloadSchema = z
  .object({
    traceId: z.string().min(1),
    spanId: z.string().min(1).optional(),
    scoreId: z.string().min(1).optional(),
    name: z.string().min(1),
    value: z.number(),
    comment: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();
export type LangfuseScorePayload = z.infer<typeof LangfuseScorePayloadSchema>;

export const LangfuseTraceSchema = z
  .object({
    traceId: z.string().min(1),
    name: z.string().min(1),
    sessionId: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    metadata: z.record(z.string(), z.unknown()),
    spansCount: z.number().int().nonnegative(),
    llmCallsCount: z.number().int().nonnegative(),
    scoresCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime()
  })
  .passthrough();
export type LangfuseTrace = z.infer<typeof LangfuseTraceSchema>;

export const LangfuseSpanSchema = z
  .object({
    spanId: z.string().min(1),
    traceId: z.string().min(1),
    name: z.string().min(1),
    parentSpanId: z.string().min(1).optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    latencyMs: z.number().nonnegative().optional(),
    status: z.enum(['ok', 'error']),
    level: z.enum(['default', 'debug', 'warning', 'error']),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: z.string().datetime()
  })
  .passthrough();
export type LangfuseSpan = z.infer<typeof LangfuseSpanSchema>;

export const LangfuseLlmCallSchema = z
  .object({
    callId: z.string().min(1),
    traceId: z.string().min(1),
    spanId: z.string().min(1).optional(),
    model: z.string().min(1),
    provider: z.string().min(1).optional(),
    prompt: z.unknown(),
    response: z.unknown().optional(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative(),
    latencyMs: z.number().nonnegative().optional(),
    usage: z.record(z.string(), z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()),
    loggedAt: z.string().datetime()
  })
  .passthrough();
export type LangfuseLlmCall = z.infer<typeof LangfuseLlmCallSchema>;

export const LangfuseScoreSchema = z
  .object({
    scoreId: z.string().min(1),
    traceId: z.string().min(1),
    spanId: z.string().min(1).optional(),
    name: z.string().min(1),
    value: z.number(),
    comment: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: z.string().datetime()
  })
  .passthrough();
export type LangfuseScore = z.infer<typeof LangfuseScoreSchema>;

export function resolveLangfuseHookName(name: string): LangfuseHookName | undefined {
  const parsed = LangfuseHookNameSchema.safeParse(name);
  return parsed.success ? parsed.data : undefined;
}

export function createTraceRecord(payload: LangfuseCreateTracePayload): LangfuseTrace {
  return LangfuseTraceSchema.parse({
    traceId: payload.traceId ?? crypto.randomUUID(),
    name: payload.name,
    sessionId: payload.sessionId,
    userId: payload.userId,
    tags: payload.tags ?? [],
    input: payload.input,
    output: payload.output,
    metadata: payload.metadata ?? {},
    spansCount: 0,
    llmCallsCount: 0,
    scoresCount: 0,
    createdAt: new Date().toISOString()
  });
}

export function createSpanRecord(payload: LangfuseCreateSpanPayload): LangfuseSpan {
  return LangfuseSpanSchema.parse({
    spanId: payload.spanId ?? crypto.randomUUID(),
    traceId: payload.traceId,
    name: payload.name,
    parentSpanId: payload.parentSpanId,
    startTime: payload.startTime,
    endTime: payload.endTime,
    latencyMs: resolveLatencyMs(payload),
    status: payload.status,
    level: payload.level,
    metadata: payload.metadata ?? {},
    createdAt: new Date().toISOString()
  });
}

export function createLlmCallRecord(payload: LangfuseLogLlmCallPayload): LangfuseLlmCall {
  const usage = normalizeTokenUsage(payload);

  return LangfuseLlmCallSchema.parse({
    callId: payload.callId ?? crypto.randomUUID(),
    traceId: payload.traceId,
    spanId: payload.spanId,
    model: payload.model,
    provider: payload.provider,
    prompt: payload.prompt,
    response: payload.response,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    latencyMs: resolveLatencyMs(payload),
    usage: payload.usage,
    metadata: payload.metadata ?? {},
    loggedAt: new Date().toISOString()
  });
}

export function createScoreRecord(payload: LangfuseScorePayload): LangfuseScore {
  return LangfuseScoreSchema.parse({
    scoreId: payload.scoreId ?? crypto.randomUUID(),
    traceId: payload.traceId,
    spanId: payload.spanId,
    name: payload.name,
    value: payload.value,
    comment: payload.comment,
    source: payload.source,
    metadata: payload.metadata ?? {},
    createdAt: new Date().toISOString()
  });
}

export function incrementTraceCounters(
  trace: LangfuseTrace,
  counter: 'spansCount' | 'llmCallsCount' | 'scoresCount'
): LangfuseTrace {
  return LangfuseTraceSchema.parse({
    ...trace,
    [counter]: trace[counter] + 1
  });
}

function normalizeTokenUsage(
  payload: Pick<LangfuseLogLlmCallPayload, 'inputTokens' | 'outputTokens' | 'totalTokens'>
): { inputTokens?: number; outputTokens?: number; totalTokens: number } {
  const inputTokens = payload.inputTokens;
  const outputTokens = payload.outputTokens;
  const totalTokens =
    payload.totalTokens ?? (typeof inputTokens === 'number' ? inputTokens : 0) + (typeof outputTokens === 'number' ? outputTokens : 0);

  return {
    inputTokens,
    outputTokens,
    totalTokens
  };
}

function resolveLatencyMs(
  payload: Pick<
    LangfuseCreateSpanPayload | LangfuseLogLlmCallPayload,
    'latencyMs' | 'startTime' | 'endTime'
  >
): number | undefined {
  if (typeof payload.latencyMs === 'number') {
    return payload.latencyMs;
  }

  if (payload.startTime && payload.endTime) {
    const start = Date.parse(payload.startTime);
    const end = Date.parse(payload.endTime);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      return end - start;
    }
  }

  return undefined;
}
