import { z } from 'zod';

export const AntigravityQuotaAccountSchema = z.object({
  id: z.string().min(1),
  quotaLimit: z.number().positive(),
  quotaUsed: z.number().nonnegative().default(0),
  disabled: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const QuotaThresholdSchema = z
  .object({
    warningPercent: z.number().min(1).max(100).default(75),
    criticalPercent: z.number().min(1).max(100).default(90)
  })
  .transform((thresholds) => ({
    warningPercent: Math.min(thresholds.warningPercent, thresholds.criticalPercent),
    criticalPercent: Math.max(thresholds.warningPercent, thresholds.criticalPercent)
  }));

export const AntigravityQuotaConfigSchema = z.object({
  thresholds: QuotaThresholdSchema.default({ warningPercent: 75, criticalPercent: 90 }),
  historyLimit: z.number().int().positive().default(200),
  accounts: z.array(AntigravityQuotaAccountSchema).min(1)
});

export type AntigravityQuotaConfig = z.infer<typeof AntigravityQuotaConfigSchema>;

export interface AntigravityQuotaAccountState extends z.infer<typeof AntigravityQuotaAccountSchema> {
  readonly remainingQuota: number;
  readonly utilizationPercent: number;
}

export interface QuotaUsageHistoryEntry {
  readonly timestamp: string;
  readonly accountId: string;
  readonly deltaQuota: number;
  readonly quotaUsed: number;
  readonly utilizationPercent: number;
  readonly source?: string;
}

export const GetQuotaStatusHookPayloadSchema = z.object({
  accountId: z.string().min(1).optional(),
  includeDistribution: z.boolean().default(true),
  includeAggregate: z.boolean().default(true),
  reportedUsage: z
    .object({
      amount: z.number().nonnegative(),
      source: z.string().min(1).optional()
    })
    .optional()
});

export const ListQuotaAccountsHookPayloadSchema = z.object({
  includeDisabled: z.boolean().default(false),
  sortBy: z.enum(['id', 'usage', 'remaining']).default('id')
});

export const GetQuotaHistoryHookPayloadSchema = z.object({
  accountId: z.string().min(1).optional(),
  limit: z.number().int().positive().max(1000).default(50)
});

export const CheckQuotaThresholdsHookPayloadSchema = z.object({
  accountId: z.string().min(1).optional(),
  warningPercent: z.number().min(1).max(100).optional(),
  criticalPercent: z.number().min(1).max(100).optional()
});

export interface QuotaThresholdAlert {
  readonly accountId: string;
  readonly level: 'warning' | 'critical';
  readonly utilizationPercent: number;
  readonly warningPercent: number;
  readonly criticalPercent: number;
}

export function parseAntigravityQuotaConfig(value: unknown): AntigravityQuotaConfig {
  const source = asRecord(value);
  const candidates = [
    asRecord(source.antigravity_quota),
    asRecord(source.antigravityQuota),
    asRecord(asRecord(source.antigravity).quota),
    source
  ];

  const candidate =
    candidates.find((entry) => Array.isArray(entry.accounts) && entry.accounts.length > 0) ??
    candidates.find((entry) => Object.keys(entry).length > 0) ??
    {};

  return AntigravityQuotaConfigSchema.parse(candidate);
}

export function createQuotaAccountStates(config: AntigravityQuotaConfig): AntigravityQuotaAccountState[] {
  return config.accounts.map((account) => toQuotaState(account));
}

export function findQuotaAccountById(
  accounts: readonly AntigravityQuotaAccountState[],
  accountId?: string
): AntigravityQuotaAccountState | undefined {
  if (!accountId) return undefined;
  return accounts.find((account) => account.id === accountId);
}

export function recordQuotaUsage(
  accounts: readonly AntigravityQuotaAccountState[],
  accountId: string,
  amount: number,
  source?: string,
  now = new Date()
): { accounts: AntigravityQuotaAccountState[]; entry: QuotaUsageHistoryEntry } {
  let matched = false;

  const nextAccounts = accounts.map((account) => {
    if (account.id !== accountId) return account;
    matched = true;
    const nextQuotaUsed = Math.min(account.quotaLimit, account.quotaUsed + Math.max(0, amount));
    return toQuotaState({
      ...account,
      quotaUsed: nextQuotaUsed
    });
  });

  if (!matched) {
    throw new Error(`Unknown account: ${accountId}`);
  }

  const updated = findQuotaAccountById(nextAccounts, accountId);
  if (!updated) {
    throw new Error(`Unknown account: ${accountId}`);
  }

  return {
    accounts: nextAccounts,
    entry: {
      timestamp: now.toISOString(),
      accountId: updated.id,
      deltaQuota: Math.max(0, amount),
      quotaUsed: updated.quotaUsed,
      utilizationPercent: updated.utilizationPercent,
      source
    }
  };
}

export function appendUsageHistory(
  history: readonly QuotaUsageHistoryEntry[],
  entry: QuotaUsageHistoryEntry,
  limit: number
): QuotaUsageHistoryEntry[] {
  const normalizedLimit = Math.max(1, limit);
  const next = [...history, entry];
  return next.length > normalizedLimit ? next.slice(next.length - normalizedLimit) : next;
}

export function aggregateQuota(accounts: readonly AntigravityQuotaAccountState[]): {
  totalLimit: number;
  totalUsed: number;
  totalRemaining: number;
  utilizationPercent: number;
} {
  const totalLimit = accounts.reduce((sum, account) => sum + account.quotaLimit, 0);
  const totalUsed = accounts.reduce((sum, account) => sum + account.quotaUsed, 0);
  const totalRemaining = Math.max(0, totalLimit - totalUsed);
  const utilizationPercent = totalLimit <= 0 ? 0 : (totalUsed / totalLimit) * 100;

  return {
    totalLimit,
    totalUsed,
    totalRemaining,
    utilizationPercent
  };
}

export function buildQuotaDistribution(accounts: readonly AntigravityQuotaAccountState[]):
  {
    accountId: string;
    quotaLimit: number;
    quotaUsed: number;
    remainingQuota: number;
    utilizationPercent: number;
    capacitySharePercent: number;
  }[] {
  const totalLimit = Math.max(0, accounts.reduce((sum, account) => sum + account.quotaLimit, 0));

  return accounts.map((account) => ({
    accountId: account.id,
    quotaLimit: account.quotaLimit,
    quotaUsed: account.quotaUsed,
    remainingQuota: account.remainingQuota,
    utilizationPercent: account.utilizationPercent,
    capacitySharePercent: totalLimit <= 0 ? 0 : (account.quotaLimit / totalLimit) * 100
  }));
}

export function buildQuotaThresholdAlerts(
  accounts: readonly AntigravityQuotaAccountState[],
  warningPercent: number,
  criticalPercent: number
): QuotaThresholdAlert[] {
  const normalized = normalizeThresholds(warningPercent, criticalPercent);

  const alerts: QuotaThresholdAlert[] = [];
  for (const account of accounts) {
    if (account.disabled) continue;
    if (account.utilizationPercent >= normalized.criticalPercent) {
      alerts.push({
        accountId: account.id,
        level: 'critical',
        utilizationPercent: account.utilizationPercent,
        warningPercent: normalized.warningPercent,
        criticalPercent: normalized.criticalPercent
      });
      continue;
    }

    if (account.utilizationPercent >= normalized.warningPercent) {
      alerts.push({
        accountId: account.id,
        level: 'warning',
        utilizationPercent: account.utilizationPercent,
        warningPercent: normalized.warningPercent,
        criticalPercent: normalized.criticalPercent
      });
    }
  }

  return alerts;
}

export function getQuotaHistory(
  history: readonly QuotaUsageHistoryEntry[],
  options: { accountId?: string; limit: number }
): QuotaUsageHistoryEntry[] {
  const filtered = options.accountId ? history.filter((entry) => entry.accountId === options.accountId) : [...history];
  const sliced = filtered.slice(Math.max(0, filtered.length - options.limit));
  return sliced.reverse();
}

export function normalizeThresholds(
  warningPercent: number,
  criticalPercent: number
): { warningPercent: number; criticalPercent: number } {
  const warning = Math.max(1, Math.min(warningPercent, 100));
  const critical = Math.max(1, Math.min(criticalPercent, 100));

  return {
    warningPercent: Math.min(warning, critical),
    criticalPercent: Math.max(warning, critical)
  };
}

function toQuotaState(account: z.infer<typeof AntigravityQuotaAccountSchema>): AntigravityQuotaAccountState {
  const remainingQuota = Math.max(0, account.quotaLimit - account.quotaUsed);
  const utilizationPercent = account.quotaLimit <= 0 ? 0 : (account.quotaUsed / account.quotaLimit) * 100;
  return {
    ...account,
    remainingQuota,
    utilizationPercent
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
