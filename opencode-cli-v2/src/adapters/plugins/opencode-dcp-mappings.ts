import { z } from 'zod';

export const COMPRESSION_RECOMMEND_THRESHOLD_PCT = 0.65;
export const COMPRESSION_WARNING_THRESHOLD_PCT = 0.75;
export const COMPRESSION_CRITICAL_THRESHOLD_PCT = 0.8;

export const CompressionModeSchema = z.enum(['none', 'compress', 'compress_urgent']);
export type CompressionMode = z.infer<typeof CompressionModeSchema>;

export const CompressionSeveritySchema = z.enum(['healthy', 'recommend', 'warning', 'critical']);
export type CompressionSeverity = z.infer<typeof CompressionSeveritySchema>;

export const DcpHookNameSchema = z.enum([
  'context.compress.evaluate',
  'context.compress.execute',
  'context.messages.transform',
  'experimental.chat.messages.transform',
  'experimental.chat.system.transform',
  'command.execute.before',
  'tool.compress'
]);
export type DcpHookName = z.infer<typeof DcpHookNameSchema>;

export const DcpMessageSchema = z
  .object({
    role: z.string().min(1),
    content: z.unknown(),
    pinned: z.boolean().optional(),
    relevanceScore: z.number().min(0).max(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();
export type DcpMessage = z.infer<typeof DcpMessageSchema>;

export const DcpEvaluatePayloadSchema = z
  .object({
    sessionId: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    usedPct: z.number().min(0).max(1).optional(),
    usedTokens: z.number().int().nonnegative().optional(),
    maxTokens: z.number().int().positive().optional(),
    proposedTokens: z.number().int().positive().optional()
  })
  .passthrough();
export type DcpEvaluatePayload = z.infer<typeof DcpEvaluatePayloadSchema>;

export const DcpExecutePayloadSchema = z
  .object({
    sessionId: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    mode: CompressionModeSchema.optional(),
    usedPct: z.number().min(0).max(1).optional(),
    usedTokens: z.number().int().nonnegative().optional(),
    maxTokens: z.number().int().positive().optional(),
    messages: z.array(DcpMessageSchema),
    compressionCostTokens: z.number().int().nonnegative().optional()
  })
  .passthrough();
export type DcpExecutePayload = z.infer<typeof DcpExecutePayloadSchema>;

export const DcpTransformPayloadSchema = z
  .object({
    mode: CompressionModeSchema.optional(),
    usedPct: z.number().min(0).max(1).optional(),
    usedTokens: z.number().int().nonnegative().optional(),
    maxTokens: z.number().int().positive().optional(),
    messages: z.array(DcpMessageSchema).optional(),
    system: z.unknown().optional()
  })
  .passthrough();
export type DcpTransformPayload = z.infer<typeof DcpTransformPayloadSchema>;

export const DcpEvaluationSchema = z.object({
  usedPct: z.number().min(0).max(1),
  severity: CompressionSeveritySchema,
  mode: CompressionModeSchema,
  shouldCompress: z.boolean(),
  thresholds: z.object({
    recommend: z.number().min(0).max(1),
    warning: z.number().min(0).max(1),
    critical: z.number().min(0).max(1)
  })
});
export type DcpEvaluation = z.infer<typeof DcpEvaluationSchema>;

export const DcpPruneResultSchema = z.object({
  mode: CompressionModeSchema,
  originalCount: z.number().int().nonnegative(),
  retainedCount: z.number().int().nonnegative(),
  prunedCount: z.number().int().nonnegative(),
  tokensEstimatedSaved: z.number().int().nonnegative(),
  messages: z.array(DcpMessageSchema)
});
export type DcpPruneResult = z.infer<typeof DcpPruneResultSchema>;

const SESSION_SUMMARY_SIGNAL_THRESHOLD = 0.55;
const SESSION_SUMMARY_MIXED_SIGNAL_THRESHOLD = 0.3;
const SESSION_SUMMARY_PRUNED_RATIO_THRESHOLD = 0.5;
const CRITICAL_CONTEXT_PATTERNS: readonly RegExp[] = [
  /\b(decision|decided|choose|chosen|must|critical|blocker|constraint|requirement)\b/i,
  /\b(todo|action item|next step|follow-up|follow up|pending|remaining|implement|fix)\b/i,
  /\b(error|exception|failed|failure|bug|incident|rollback|mitigation)\b/i,
  /\b(pr|issue|ticket|deadline|owner|acceptance criteria)\b/i
];

type CanonicalDcpHookName =
  | 'context.compress.evaluate'
  | 'context.compress.execute'
  | 'context.messages.transform';

const DCP_HOOK_ALIASES: Record<DcpHookName, CanonicalDcpHookName> = {
  'context.compress.evaluate': 'context.compress.evaluate',
  'command.execute.before': 'context.compress.evaluate',
  'context.compress.execute': 'context.compress.execute',
  'tool.compress': 'context.compress.execute',
  'context.messages.transform': 'context.messages.transform',
  'experimental.chat.messages.transform': 'context.messages.transform',
  'experimental.chat.system.transform': 'context.messages.transform'
};

export function resolveDcpHookName(name: string): CanonicalDcpHookName | undefined {
  const parsed = DcpHookNameSchema.safeParse(name);
  if (!parsed.success) {
    return undefined;
  }

  return DCP_HOOK_ALIASES[parsed.data];
}

export function evaluateCompressionPolicy(usedPct: number): CompressionMode {
  const normalized = normalizePct(usedPct);
  if (normalized >= COMPRESSION_CRITICAL_THRESHOLD_PCT) {
    return 'compress_urgent';
  }

  if (normalized >= COMPRESSION_RECOMMEND_THRESHOLD_PCT) {
    return 'compress';
  }

  return 'none';
}

export function deriveUsedPctFromPayload(
  payload: Pick<DcpEvaluatePayload | DcpExecutePayload | DcpTransformPayload, 'usedPct' | 'usedTokens' | 'maxTokens'>
): number {
  if (typeof payload.usedPct === 'number') {
    return normalizePct(payload.usedPct);
  }

  if (typeof payload.usedTokens === 'number' && typeof payload.maxTokens === 'number' && payload.maxTokens > 0) {
    return normalizePct(payload.usedTokens / payload.maxTokens);
  }

  return 0;
}

export function pruneContextMessages(messages: readonly DcpMessage[], mode: CompressionMode): DcpPruneResult {
  const parsedMessages = z.array(DcpMessageSchema).parse(messages);
  if (mode === 'none') {
    return DcpPruneResultSchema.parse({
      mode,
      originalCount: parsedMessages.length,
      retainedCount: parsedMessages.length,
      prunedCount: 0,
      tokensEstimatedSaved: 0,
      messages: parsedMessages
    });
  }

  const preserveIndexes = new Set<number>();
  const candidates: { index: number; message: DcpMessage; score: number }[] = [];

  for (let index = 0; index < parsedMessages.length; index += 1) {
    const message = parsedMessages[index];
    if (!message) continue;

    if (message.role === 'system' || message.pinned === true) {
      preserveIndexes.add(index);
      continue;
    }

    candidates.push({
      index,
      message,
      score: typeof message.relevanceScore === 'number' ? message.relevanceScore : 0
    });
  }

  const keepRatio = mode === 'compress_urgent' ? 0.3 : 0.6;
  const keepCount = Math.min(candidates.length, Math.max(1, Math.ceil(candidates.length * keepRatio)));
  const selected = [...candidates]
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.index - right.index;
    })
    .slice(0, keepCount);

  for (const candidate of selected) {
    preserveIndexes.add(candidate.index);
  }

  const retained = parsedMessages.filter((_, index) => preserveIndexes.has(index));
  const pruned = parsedMessages.filter((_, index) => !preserveIndexes.has(index));

  const prunedCount = pruned.length;

  return DcpPruneResultSchema.parse({
    mode,
    originalCount: parsedMessages.length,
    retainedCount: retained.length,
    prunedCount,
    tokensEstimatedSaved: prunedCount * 40,
    messages: retained
  });
}

export function buildSessionContextInjection(
  originalMessages: readonly DcpMessage[],
  retainedMessages: readonly DcpMessage[],
  mode: CompressionMode
): DcpMessage | undefined {
  if (mode === 'none') {
    return undefined;
  }

  const removedMessages = deriveRemovedMessages(originalMessages, retainedMessages);
  if (removedMessages.length === 0) {
    return undefined;
  }

  const removedRatio = removedMessages.length / Math.max(1, originalMessages.length);
  const highestRemovedScore = removedMessages.reduce((max, message) => {
    const score = typeof message.relevanceScore === 'number' ? message.relevanceScore : 0;
    return Math.max(max, score);
  }, 0);
  const semanticLoss = detectSemanticLoss(removedMessages, retainedMessages);
  const shouldInjectForMixedSignal =
    removedRatio >= SESSION_SUMMARY_PRUNED_RATIO_THRESHOLD && highestRemovedScore >= SESSION_SUMMARY_MIXED_SIGNAL_THRESHOLD;
  const shouldInject =
    mode === 'compress_urgent' ||
    highestRemovedScore >= SESSION_SUMMARY_SIGNAL_THRESHOLD ||
    shouldInjectForMixedSignal ||
    semanticLoss.hasCriticalLoss ||
    semanticLoss.hasLostIdentifiers;

  if (!shouldInject) {
    return undefined;
  }

  const triggerReasons = [
    mode === 'compress_urgent' ? 'urgent-compression' : undefined,
    highestRemovedScore >= SESSION_SUMMARY_SIGNAL_THRESHOLD ? 'high-relevance-pruned' : undefined,
    shouldInjectForMixedSignal ? 'mixed-signal-noise-compression' : undefined,
    semanticLoss.hasCriticalLoss ? 'critical-context-loss' : undefined,
    semanticLoss.hasLostIdentifiers ? 'identifier-loss' : undefined
  ].filter((reason): reason is string => typeof reason === 'string');

  return buildCompressionSummaryMessage(removedMessages, mode, {
    originalCount: originalMessages.length,
    retainedCount: retainedMessages.length,
    removedRatio,
    highestRemovedScore,
    triggerReasons,
    criticalMarkers: semanticLoss.criticalMarkers,
    lostIdentifiers: semanticLoss.lostIdentifiers
  });
}

function deriveRemovedMessages(originalMessages: readonly DcpMessage[], retainedMessages: readonly DcpMessage[]): DcpMessage[] {
  const remainingRetainedByKey = new Map<string, number>();
  for (const message of retainedMessages) {
    const key = messageFingerprint(message);
    remainingRetainedByKey.set(key, (remainingRetainedByKey.get(key) ?? 0) + 1);
  }

  const removed: DcpMessage[] = [];
  for (const message of originalMessages) {
    const key = messageFingerprint(message);
    const count = remainingRetainedByKey.get(key) ?? 0;
    if (count > 0) {
      remainingRetainedByKey.set(key, count - 1);
      continue;
    }

    removed.push(message);
  }

  return removed;
}

function buildCompressionSummaryMessage(
  prunedMessages: readonly DcpMessage[],
  mode: CompressionMode,
  stats: {
    readonly originalCount: number;
    readonly retainedCount: number;
    readonly removedRatio: number;
    readonly highestRemovedScore: number;
    readonly triggerReasons: readonly string[];
    readonly criticalMarkers: readonly string[];
    readonly lostIdentifiers: readonly string[];
  }
): DcpMessage {
  const roleCounts = prunedMessages.reduce<Record<string, number>>((accumulator, message) => {
    accumulator[message.role] = (accumulator[message.role] ?? 0) + 1;
    return accumulator;
  }, {});

  const roleSummary = Object.entries(roleCounts)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([role, count]) => `${role}:${count}`)
    .join(', ');

  const excerpts = prunedMessages
    .slice(0, 3)
    .map((message, index) => `- ${index + 1}. (${message.role}) ${summarizeContent(message.content)}`)
    .join('\n');

  return DcpMessageSchema.parse({
    role: 'system',
    pinned: true,
    relevanceScore: 1,
    metadata: {
      dcp: {
        syntheticSessionContext: true,
        mode,
        prunedCount: prunedMessages.length,
        roleCounts,
        originalCount: stats.originalCount,
        retainedCount: stats.retainedCount,
        removedRatio: Number(stats.removedRatio.toFixed(3)),
        highestRemovedScore: Number(stats.highestRemovedScore.toFixed(3)),
        triggerReasons: stats.triggerReasons,
        criticalMarkers: stats.criticalMarkers,
        lostIdentifiers: stats.lostIdentifiers
      }
    },
    content: [
      `Context preservation note (${mode}): ${prunedMessages.length} message(s) were compressed out of active context.`,
      stats.triggerReasons.length > 0 ? `Injection triggers: ${stats.triggerReasons.join(', ')}.` : undefined,
      roleSummary.length > 0 ? `Roles removed: ${roleSummary}.` : undefined,
      stats.criticalMarkers.length > 0 ? `Critical markers preserved: ${stats.criticalMarkers.join(', ')}.` : undefined,
      stats.lostIdentifiers.length > 0
        ? `Identifiers preserved: ${stats.lostIdentifiers.slice(0, 6).join(', ')}.`
        : undefined,
      excerpts.length > 0 ? 'Compressed-signal excerpts to preserve intent:\n' + excerpts : undefined
    ]
      .filter((line): line is string => typeof line === 'string' && line.length > 0)
      .join('\n')
  });
}

function detectSemanticLoss(
  removedMessages: readonly DcpMessage[],
  retainedMessages: readonly DcpMessage[]
): {
  readonly hasCriticalLoss: boolean;
  readonly hasLostIdentifiers: boolean;
  readonly criticalMarkers: readonly string[];
  readonly lostIdentifiers: readonly string[];
} {
  const removedText = removedMessages.map((message) => summarizeContent(message.content)).join('\n');
  const retainedText = retainedMessages.map((message) => summarizeContent(message.content)).join('\n');
  const retainedLower = retainedText.toLowerCase();

  const criticalMarkers = CRITICAL_CONTEXT_PATTERNS.map((pattern) => pattern.source)
    .filter((patternSource) => {
      const matcher = new RegExp(patternSource, 'i');
      return matcher.test(removedText) && !matcher.test(retainedText);
    })
    .map((source) => source.replace(/^\\b|\\b$/g, ''));

  const removedIdentifiers = extractIdentifiers(removedText);
  const retainedIdentifiers = extractIdentifiers(retainedText);
  const lostIdentifiers = [...removedIdentifiers].filter(
    (identifier) => !retainedIdentifiers.has(identifier) && !retainedLower.includes(identifier.toLowerCase())
  );

  return {
    hasCriticalLoss: criticalMarkers.length > 0,
    hasLostIdentifiers: lostIdentifiers.length >= 2,
    criticalMarkers,
    lostIdentifiers
  };
}

function extractIdentifiers(text: string): Set<string> {
  const matches = text.match(/[A-Za-z_][A-Za-z0-9_./:-]{4,}/g) ?? [];
  const ignored = new Set([
    'assistant',
    'system',
    'user',
    'context',
    'message',
    'messages',
    'compression',
    'preservation',
    'implementation'
  ]);

  const identifiers = new Set<string>();
  for (const raw of matches) {
    const normalized = raw.trim();
    if (ignored.has(normalized.toLowerCase())) {
      continue;
    }

    const hasSignalCharacters = /[0-9_.:/-]/.test(normalized) || /[A-Z]/.test(normalized.slice(1));
    if (!hasSignalCharacters) {
      continue;
    }

    identifiers.add(normalized);
  }

  return identifiers;
}

function messageFingerprint(message: DcpMessage): string {
  return JSON.stringify([
    message.role,
    message.pinned ?? false,
    typeof message.relevanceScore === 'number' ? Number(message.relevanceScore.toFixed(6)) : null,
    normalizeForFingerprint(message.content)
  ]);
}

function normalizeForFingerprint(value: unknown): unknown {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForFingerprint(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([key, nested]) => [key, normalizeForFingerprint(nested)])
  );
}

function summarizeContent(content: unknown): string {
  if (typeof content === 'string') {
    return truncateForSummary(content);
  }

  if (Array.isArray(content)) {
    return truncateForSummary(
      content
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          if (typeof entry === 'object' && entry !== null && 'text' in entry) {
            const textValue = (entry as Record<string, unknown>).text;
            return typeof textValue === 'string' ? textValue : JSON.stringify(entry);
          }
          return JSON.stringify(entry);
        })
        .join(' ')
    );
  }

  if (content && typeof content === 'object') {
    return truncateForSummary(JSON.stringify(content));
  }

  return truncateForSummary(String(content ?? ''));
}

function truncateForSummary(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 120) {
    return normalized;
  }

  return `${normalized.slice(0, 117)}...`;
}

export function extractTransformMessages(payload: DcpTransformPayload): DcpMessage[] {
  const parsed = DcpTransformPayloadSchema.parse(payload);
  const messages = parsed.messages ? z.array(DcpMessageSchema).parse(parsed.messages) : [];

  if (parsed.system === undefined) {
    return messages;
  }

  const systemMessage = DcpMessageSchema.parse({
    role: 'system',
    content: parsed.system,
    pinned: true,
    relevanceScore: 1
  });

  return [systemMessage, ...messages];
}

export function evaluateCompressionSeverity(usedPct: number): CompressionSeverity {
  const normalized = normalizePct(usedPct);
  if (normalized >= COMPRESSION_CRITICAL_THRESHOLD_PCT) {
    return 'critical';
  }

  if (normalized >= COMPRESSION_WARNING_THRESHOLD_PCT) {
    return 'warning';
  }

  if (normalized >= COMPRESSION_RECOMMEND_THRESHOLD_PCT) {
    return 'recommend';
  }

  return 'healthy';
}

function normalizePct(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}
