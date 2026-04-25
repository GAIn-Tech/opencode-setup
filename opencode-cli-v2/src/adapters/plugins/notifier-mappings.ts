import { z } from 'zod';

export const NotificationPlatformSchema = z.enum(['win32', 'darwin', 'linux', 'unknown']);
export type NotificationPlatform = z.infer<typeof NotificationPlatformSchema>;

export const NotificationLevelSchema = z.enum(['info', 'success', 'warning', 'error']);
export type NotificationLevel = z.infer<typeof NotificationLevelSchema>;

export const NotificationRuleSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().default(true),
  event: z.string().min(1).default('*'),
  levels: z.array(NotificationLevelSchema).optional()
});
export type NotificationRule = z.infer<typeof NotificationRuleSchema>;

export const NotifierConfigSchema = z.object({
  defaultTitle: z.string().min(1).default('OpenCode'),
  historyLimit: z.number().int().positive().default(100),
  rules: z.array(NotificationRuleSchema).default([])
});
export type NotifierConfig = z.infer<typeof NotifierConfigSchema>;

export const NotifySendPayloadSchema = z.object({
  event: z.string().min(1),
  title: z.string().min(1).optional(),
  message: z.string().min(1),
  level: NotificationLevelSchema.default('info'),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const NotifyConfigurePayloadSchema = z.object({
  defaultTitle: z.string().min(1).optional(),
  historyLimit: z.number().int().positive().optional(),
  rules: z.array(NotificationRuleSchema).optional()
});

export const NotifyGetHistoryPayloadSchema = z.object({
  limit: z.number().int().positive().optional(),
  event: z.string().min(1).optional()
});

export const NotifyClearHistoryPayloadSchema = z.object({
  event: z.string().min(1).optional()
});

export interface NotificationRecord {
  readonly id: string;
  readonly event: string;
  readonly title: string;
  readonly message: string;
  readonly level: NotificationLevel;
  readonly platform: NotificationPlatform;
  readonly metadata?: Record<string, unknown>;
  readonly dispatched: boolean;
  readonly reason?: string;
  readonly ruleId?: string;
  readonly createdAt: string;
}

export function parseNotifierConfig(value: unknown): NotifierConfig {
  const source = asRecord(value);
  const nested = asRecord(source.notifier);
  const normalized = Object.keys(nested).length > 0 ? nested : source;
  return NotifierConfigSchema.parse(normalized);
}

export function normalizePlatform(value: string): NotificationPlatform {
  if (value === 'win32' || value === 'darwin' || value === 'linux') return value;
  return 'unknown';
}

export function shouldDispatchNotification(input: {
  readonly event: string;
  readonly level: NotificationLevel;
  readonly rules: readonly NotificationRule[];
}): { readonly dispatch: boolean; readonly ruleId?: string; readonly reason?: string } {
  const matched = input.rules.filter((rule) => matchesRule(rule, input.event, input.level));
  const blocked = matched.find((rule) => !rule.enabled);
  if (blocked) {
    return { dispatch: false, ruleId: blocked.id, reason: 'blocked_by_rule' };
  }

  return { dispatch: true };
}

export function mergeNotifierConfig(
  current: NotifierConfig,
  update: z.infer<typeof NotifyConfigurePayloadSchema>
): NotifierConfig {
  return NotifierConfigSchema.parse({
    ...current,
    ...(update.defaultTitle ? { defaultTitle: update.defaultTitle } : {}),
    ...(typeof update.historyLimit === 'number' ? { historyLimit: update.historyLimit } : {}),
    ...(update.rules ? { rules: update.rules } : {})
  });
}

export function trimHistory(history: readonly NotificationRecord[], limit: number): NotificationRecord[] {
  if (history.length <= limit) return [...history];
  return history.slice(history.length - limit);
}

function matchesRule(rule: NotificationRule, event: string, level: NotificationLevel): boolean {
  const eventMatches = rule.event === '*' || rule.event === event;
  if (!eventMatches) return false;
  if (!rule.levels || rule.levels.length === 0) return true;
  return rule.levels.includes(level);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
