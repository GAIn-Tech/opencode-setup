import { z } from 'zod';

export const RateLimitFallbackConfigSchema = z.object({
  fallbackChains: z.record(z.string(), z.array(z.string().min(1))).default({}),
  rateLimitStatusCodes: z.array(z.number().int().min(100).max(599)).default([429, 503]),
  baseBackoffSeconds: z.number().int().positive().default(2),
  maxBackoffSeconds: z.number().int().positive().default(60),
  circuitBreakerThreshold: z.number().int().positive().default(3),
  circuitBreakerCooldownSeconds: z.number().int().positive().default(120)
});

export type RateLimitFallbackConfig = z.infer<typeof RateLimitFallbackConfigSchema>;

export interface RateLimitModelState {
  readonly model: string;
  readonly retryCount: number;
  readonly rateLimitedUntil?: number;
  readonly failureCount: number;
  readonly circuitOpenedUntil?: number;
}

export const OnRateLimitHookPayloadSchema = z
  .object({
    sessionId: z.string().min(1).optional(),
    model: z.string().min(1),
    statusCode: z.number().int().min(100).max(599).optional(),
    retryAfterSeconds: z.number().int().nonnegative().optional(),
    error: z
      .object({
        status: z.number().int().min(100).max(599).optional(),
        code: z.string().min(1).optional(),
        message: z.string().min(1).optional()
      })
      .passthrough()
      .optional(),
    response: z
      .object({
        status: z.number().int().min(100).max(599).optional()
      })
      .passthrough()
      .optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export const GetNextModelHookPayloadSchema = z.object({
  model: z.string().min(1),
  sessionId: z.string().min(1).optional()
});

export const CheckCircuitHookPayloadSchema = z.object({
  model: z.string().min(1)
});

export const ResetCircuitHookPayloadSchema = z.object({
  model: z.string().min(1)
});

export function parseRateLimitFallbackConfig(value: unknown): RateLimitFallbackConfig {
  const source = asRecord(value);
  const nested = asRecord(source.rateLimitFallback);
  const normalized = Object.keys(nested).length > 0 ? nested : source;
  return RateLimitFallbackConfigSchema.parse(normalized);
}

export function detectRateLimit(
  payload: z.infer<typeof OnRateLimitHookPayloadSchema>,
  config: Pick<RateLimitFallbackConfig, 'rateLimitStatusCodes'>
): { readonly isRateLimit: boolean; readonly statusCode?: number } {
  const explicitStatus =
    payload.statusCode ??
    payload.error?.status ??
    payload.response?.status ??
    extractStatusFromUnknown(payload.metadata?.status);

  if (typeof explicitStatus === 'number' && config.rateLimitStatusCodes.includes(explicitStatus)) {
    return { isRateLimit: true, statusCode: explicitStatus };
  }

  const code = `${payload.error?.code ?? ''}`.toLowerCase();
  const message = `${payload.error?.message ?? ''}`.toLowerCase();
  const text = `${code} ${message}`;

  if (text.includes('rate') && text.includes('limit')) {
    return { isRateLimit: true, statusCode: explicitStatus };
  }

  return { isRateLimit: false, statusCode: explicitStatus };
}

export function calculateBackoffSeconds(
  retryCount: number,
  config: Pick<RateLimitFallbackConfig, 'baseBackoffSeconds' | 'maxBackoffSeconds'>,
  retryAfterSeconds?: number
): number {
  if (typeof retryAfterSeconds === 'number') {
    return clamp(retryAfterSeconds, 0, config.maxBackoffSeconds);
  }

  const exponent = Math.max(0, retryCount - 1);
  const computed = config.baseBackoffSeconds * 2 ** exponent;
  return clamp(computed, config.baseBackoffSeconds, config.maxBackoffSeconds);
}

export function isModelRateLimited(model: RateLimitModelState | undefined, now = Date.now()): boolean {
  return typeof model?.rateLimitedUntil === 'number' && model.rateLimitedUntil > now;
}

export function isCircuitOpen(model: RateLimitModelState | undefined, now = Date.now()): boolean {
  return typeof model?.circuitOpenedUntil === 'number' && model.circuitOpenedUntil > now;
}

export function nextRateLimitedState(input: {
  readonly current?: RateLimitModelState;
  readonly model: string;
  readonly now: number;
  readonly backoffSeconds: number;
  readonly threshold: number;
  readonly circuitCooldownSeconds: number;
}): RateLimitModelState {
  const currentRetry = input.current?.retryCount ?? 0;
  const currentFailures = input.current?.failureCount ?? 0;

  const retryCount = currentRetry + 1;
  const failureCount = currentFailures + 1;
  const shouldOpenCircuit = failureCount >= input.threshold;

  return {
    model: input.model,
    retryCount,
    failureCount,
    rateLimitedUntil: input.now + Math.max(0, input.backoffSeconds) * 1000,
    circuitOpenedUntil: shouldOpenCircuit ? input.now + Math.max(0, input.circuitCooldownSeconds) * 1000 : undefined
  };
}

export function resetModelCircuitState(model: string): RateLimitModelState {
  return {
    model,
    retryCount: 0,
    failureCount: 0,
    rateLimitedUntil: undefined,
    circuitOpenedUntil: undefined
  };
}

export function resolveNextModel(params: {
  readonly currentModel: string;
  readonly fallbackChains: Readonly<Record<string, readonly string[]>>;
  readonly states: ReadonlyMap<string, RateLimitModelState>;
  readonly now: number;
}): string | undefined {
  const candidates = params.fallbackChains[params.currentModel] ?? [];
  for (const model of candidates) {
    const state = params.states.get(model);
    if (isModelRateLimited(state, params.now)) continue;
    if (isCircuitOpen(state, params.now)) continue;
    return model;
  }

  return undefined;
}

function extractStatusFromUnknown(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
