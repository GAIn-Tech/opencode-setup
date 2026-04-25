import { z } from 'zod';

export const AccountSelectionStrategySchema = z.enum(['round_robin', 'least_used', 'hybrid']);

export const AntigravityAccountSchema = z.object({
  id: z.string().min(1),
  quotaLimit: z.number().positive(),
  quotaUsed: z.number().nonnegative().default(0),
  disabled: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const AntigravityAuthConfigSchema = z.object({
  account_selection_strategy: AccountSelectionStrategySchema.default('hybrid'),
  soft_quota_threshold_percent: z.number().min(1).max(100).default(90),
  max_rate_limit_wait_seconds: z.number().int().nonnegative().default(300),
  switch_on_first_rate_limit: z.boolean().default(true),
  session_recovery: z.boolean().default(true),
  accounts: z.array(AntigravityAccountSchema).min(1)
});

export type AntigravityAuthConfig = z.infer<typeof AntigravityAuthConfigSchema>;

export interface AntigravityAccountState extends z.infer<typeof AntigravityAccountSchema> {
  readonly softQuotaThreshold: number;
  readonly pressure: number;
  readonly remainingQuota: number;
  readonly rateLimitedUntil?: number;
  readonly requestCount: number;
}

export const GetAccountHookPayloadSchema = z.object({
  sessionId: z.string().min(1).optional(),
  requestedQuota: z.number().nonnegative().default(0),
  forceRotate: z.boolean().default(false)
});

export const RotateAccountHookPayloadSchema = z.object({
  sessionId: z.string().min(1).optional(),
  currentAccountId: z.string().min(1).optional(),
  reason: z.string().min(1).optional()
});

export const RateLimitHookPayloadSchema = z.object({
  sessionId: z.string().min(1).optional(),
  accountId: z.string().min(1),
  retryAfterSeconds: z.number().int().nonnegative().optional(),
  waitSeconds: z.number().int().nonnegative().optional()
});

export const SessionRecoveryHookPayloadSchema = z.object({
  sessionId: z.string().min(1),
  previousAccountId: z.string().min(1).optional(),
  preferredAccountId: z.string().min(1).optional()
});

export function parseAntigravityAuthConfig(value: unknown): AntigravityAuthConfig {
  const source = asRecord(value);
  const candidate = asRecord(source.antigravity);
  const normalized = Object.keys(candidate).length > 0 ? candidate : source;
  return AntigravityAuthConfigSchema.parse(normalized);
}

export function createAccountStates(config: AntigravityAuthConfig): AntigravityAccountState[] {
  return config.accounts.map((account) => toAccountState(account, config.soft_quota_threshold_percent));
}

export function isAccountAvailable(account: AntigravityAccountState, now = Date.now()): boolean {
  if (account.disabled) return false;
  if (account.remainingQuota <= 0) return false;
  if (typeof account.rateLimitedUntil === 'number' && account.rateLimitedUntil > now) return false;
  return true;
}

export function findAccountById(
  accounts: readonly AntigravityAccountState[],
  accountId?: string
): AntigravityAccountState | undefined {
  if (!accountId) return undefined;
  return accounts.find((account) => account.id === accountId);
}

export function selectAccount(
  accounts: readonly AntigravityAccountState[],
  strategy: AntigravityAuthConfig['account_selection_strategy'],
  rotationCursor: number
): { account?: AntigravityAccountState; nextCursor: number } {
  const available = accounts.filter((account) => isAccountAvailable(account));
  if (available.length === 0) {
    return { account: undefined, nextCursor: rotationCursor };
  }

  if (strategy === 'least_used') {
    const account = pickLeastUsed(available);
    return { account, nextCursor: rotationCursor };
  }

  if (strategy === 'hybrid') {
    const account = pickHybrid(available);
    return { account, nextCursor: rotationCursor };
  }

  const nextIndex = normalizeCursor(rotationCursor, available.length);
  const account = available[nextIndex];
  return {
    account,
    nextCursor: (nextIndex + 1) % available.length
  };
}

export function consumeQuota(
  accounts: readonly AntigravityAccountState[],
  accountId: string,
  amount: number
): AntigravityAccountState[] {
  return accounts.map((account) => {
    if (account.id !== accountId) return account;
    const nextQuotaUsed = Math.min(account.quotaLimit, account.quotaUsed + Math.max(0, amount));
    return updateDerived({
      ...account,
      quotaUsed: nextQuotaUsed,
      requestCount: account.requestCount + 1
    });
  });
}

export function markRateLimited(
  accounts: readonly AntigravityAccountState[],
  accountId: string,
  cooldownSeconds: number,
  now = Date.now()
): AntigravityAccountState[] {
  const rateLimitedUntil = now + Math.max(0, cooldownSeconds) * 1000;
  return accounts.map((account) =>
    account.id === accountId
      ? {
          ...account,
          rateLimitedUntil,
          requestCount: account.requestCount + 1
        }
      : account
  );
}

export function resolveCooldownSeconds(
  payload: z.infer<typeof RateLimitHookPayloadSchema>,
  config: AntigravityAuthConfig
): number {
  const candidate = payload.retryAfterSeconds ?? payload.waitSeconds ?? config.max_rate_limit_wait_seconds;
  return Math.max(0, Math.min(candidate, config.max_rate_limit_wait_seconds));
}

export function getRemainingQuota(account: Pick<AntigravityAccountState, 'quotaLimit' | 'quotaUsed'>): number {
  return Math.max(0, account.quotaLimit - account.quotaUsed);
}

function pickLeastUsed(accounts: readonly AntigravityAccountState[]): AntigravityAccountState {
  return [...accounts].sort((left, right) => {
    if (left.pressure !== right.pressure) return left.pressure - right.pressure;
    return left.requestCount - right.requestCount;
  })[0]!;
}

function pickHybrid(accounts: readonly AntigravityAccountState[]): AntigravityAccountState {
  const maxRequestCount = Math.max(1, ...accounts.map((account) => account.requestCount));
  return [...accounts].sort((left, right) => {
    const leftScore = left.pressure * 0.7 + (left.requestCount / maxRequestCount) * 0.3;
    const rightScore = right.pressure * 0.7 + (right.requestCount / maxRequestCount) * 0.3;

    if (leftScore !== rightScore) return leftScore - rightScore;
    return left.requestCount - right.requestCount;
  })[0]!;
}

function normalizeCursor(cursor: number, size: number): number {
  if (size <= 0) return 0;
  const normalized = cursor % size;
  return normalized >= 0 ? normalized : normalized + size;
}

function toAccountState(
  account: z.infer<typeof AntigravityAccountSchema>,
  softQuotaThresholdPercent: number
): AntigravityAccountState {
  const softQuotaThreshold = account.quotaLimit * (softQuotaThresholdPercent / 100);
  return updateDerived({
    ...account,
    softQuotaThreshold,
    requestCount: 0
  });
}

function updateDerived(account: Omit<AntigravityAccountState, 'pressure' | 'remainingQuota'>): AntigravityAccountState {
  const remainingQuota = getRemainingQuota(account);
  const pressure = account.quotaLimit <= 0 ? 1 : account.quotaUsed / account.quotaLimit;
  return {
    ...account,
    pressure,
    remainingQuota
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
