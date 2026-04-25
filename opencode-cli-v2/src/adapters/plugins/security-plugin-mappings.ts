import { z } from 'zod';

export const SecurityDecisionSchema = z.enum(['allow', 'sanitize', 'block']);
export type SecurityDecision = z.infer<typeof SecurityDecisionSchema>;

export const SecuritySeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type SecuritySeverity = z.infer<typeof SecuritySeveritySchema>;

export const SecurityCategorySchema = z.enum([
  'sql_injection',
  'xss',
  'command_injection',
  'secrets',
  'pii',
  'custom'
]);
export type SecurityCategory = z.infer<typeof SecurityCategorySchema>;

export const SecurityPatternSchema = z.object({
  id: z.string().min(1),
  category: SecurityCategorySchema.default('custom'),
  expression: z.string().min(1),
  flags: z.string().optional(),
  severity: SecuritySeveritySchema.default('medium'),
  action: SecurityDecisionSchema.default('block'),
  message: z.string().min(1).optional()
});

export const SecurityPolicySchema = z
  .object({
    maxInputLength: z.number().int().positive().default(20000),
    blockSqlInjection: z.boolean().default(true),
    blockXss: z.boolean().default(true),
    blockCommandInjection: z.boolean().default(true),
    blockSecrets: z.boolean().default(true),
    blockPii: z.boolean().default(true),
    sanitizeHtml: z.boolean().default(true),
    strictMode: z.boolean().default(true),
    auditEnabled: z.boolean().default(true),
    customPatterns: z.array(SecurityPatternSchema).default([])
  })
  .strict();

export type SecurityPolicy = z.infer<typeof SecurityPolicySchema>;

export const SecurityPluginConfigSchema = z
  .object({
    security: SecurityPolicySchema.optional(),
    securityPlugin: SecurityPolicySchema.optional(),
    plugin: z
      .object({
        security: SecurityPolicySchema.optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

export const ValidateInputHookPayloadSchema = z.object({
  input: z.unknown(),
  context: z.record(z.string(), z.unknown()).optional()
});

export const CheckPolicyHookPayloadSchema = z.object({
  content: z.unknown(),
  policyOverrides: SecurityPolicySchema.partial().optional(),
  context: z.record(z.string(), z.unknown()).optional()
});

export const SanitizeHookPayloadSchema = z.object({
  content: z.unknown(),
  aggressive: z.boolean().default(false)
});

export const AuditHookPayloadSchema = z.object({
  eventType: z.string().min(1),
  decision: SecurityDecisionSchema,
  reason: z.string().min(1).optional(),
  details: z.record(z.string(), z.unknown()).optional()
});

export const SecurityViolationSchema = z.object({
  id: z.string().min(1),
  category: SecurityCategorySchema,
  severity: SecuritySeveritySchema,
  action: SecurityDecisionSchema,
  message: z.string().min(1),
  match: z.string().min(1).optional()
});
export type SecurityViolation = z.infer<typeof SecurityViolationSchema>;

export const SecurityValidationResultSchema = z.object({
  decision: SecurityDecisionSchema,
  safe: z.boolean(),
  score: z.number().int().min(0).max(100),
  violations: z.array(SecurityViolationSchema),
  sanitizedContent: z.unknown().optional()
});
export type SecurityValidationResult = z.infer<typeof SecurityValidationResultSchema>;

export const SecuritySanitizeResultSchema = z.object({
  originalContent: z.unknown(),
  sanitizedContent: z.unknown(),
  changed: z.boolean(),
  appliedRules: z.array(z.string().min(1)).default([])
});
export type SecuritySanitizeResult = z.infer<typeof SecuritySanitizeResultSchema>;

const SQL_INJECTION_PATTERNS = [
  /(?:\bunion\b\s+\bselect\b)/i,
  /(?:\bor\b\s+1\s*=\s*1)/i,
  /(?:;\s*drop\s+table\b)/i
];

const XSS_PATTERNS = [/<script\b[^>]*>[\s\S]*<\/script>/i, /javascript\s*:/i, /on\w+\s*=\s*["']/i];

const COMMAND_INJECTION_PATTERNS = [/(?:&&|\|\||`|\$\(|;\s*\w+)/i];

const SECRET_PATTERNS = [
  /(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[a-z0-9_\-]{8,}/i,
  /\bAKIA[0-9A-Z]{16}\b/
];

const PII_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(?:\d[ -]*?){13,16}\b/
];

export function parseSecurityPluginConfig(value: unknown): SecurityPolicy {
  const source = SecurityPluginConfigSchema.parse(value);
  const pluginSection = source.plugin?.security;
  const candidate = pluginSection ?? source.securityPlugin ?? source.security ?? asRecord(value);
  return SecurityPolicySchema.parse(candidate);
}

export function mergePolicy(basePolicy: SecurityPolicy, overrides?: Partial<SecurityPolicy>): SecurityPolicy {
  if (!overrides) return basePolicy;
  return SecurityPolicySchema.parse({ ...basePolicy, ...overrides });
}

export function normalizeSecurityInput(input: unknown): string {
  if (typeof input === 'string') return input;
  if (typeof input === 'number' || typeof input === 'boolean' || input === null || input === undefined) {
    return String(input ?? '');
  }

  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

export function validateSecurityInput(input: unknown, policy: SecurityPolicy): SecurityValidationResult {
  const normalized = normalizeSecurityInput(input);
  const violations: SecurityViolation[] = [];

  if (normalized.length > policy.maxInputLength) {
    violations.push({
      id: 'max-length',
      category: 'custom',
      severity: 'high',
      action: 'block',
      message: `Input exceeds max allowed length (${policy.maxInputLength})`,
      match: String(normalized.length)
    });
  }

  if (policy.blockSqlInjection) {
    collectPatternViolations(violations, normalized, SQL_INJECTION_PATTERNS, {
      id: 'sql-injection',
      category: 'sql_injection',
      severity: 'critical',
      action: 'block',
      message: 'Potential SQL injection pattern detected'
    });
  }

  if (policy.blockXss) {
    collectPatternViolations(violations, normalized, XSS_PATTERNS, {
      id: 'xss',
      category: 'xss',
      severity: 'high',
      action: policy.sanitizeHtml ? 'sanitize' : 'block',
      message: 'Potential XSS payload detected'
    });
  }

  if (policy.blockCommandInjection) {
    collectPatternViolations(violations, normalized, COMMAND_INJECTION_PATTERNS, {
      id: 'command-injection',
      category: 'command_injection',
      severity: 'critical',
      action: 'block',
      message: 'Potential command injection pattern detected'
    });
  }

  if (policy.blockSecrets) {
    collectPatternViolations(violations, normalized, SECRET_PATTERNS, {
      id: 'secret-detection',
      category: 'secrets',
      severity: 'high',
      action: 'block',
      message: 'Potential secret-like value detected'
    });
  }

  if (policy.blockPii) {
    collectPatternViolations(violations, normalized, PII_PATTERNS, {
      id: 'pii-detection',
      category: 'pii',
      severity: 'medium',
      action: policy.strictMode ? 'block' : 'sanitize',
      message: 'Potential PII detected'
    });
  }

  for (const customPattern of policy.customPatterns) {
    const regexp = safeRegExp(customPattern.expression, customPattern.flags);
    if (!regexp) continue;

    const matched = regexp.exec(normalized);
    if (!matched?.[0]) continue;

    violations.push({
      id: customPattern.id,
      category: customPattern.category,
      severity: customPattern.severity,
      action: customPattern.action,
      message: customPattern.message ?? `Matched custom security pattern: ${customPattern.id}`,
      match: matched[0]
    });
  }

  const decision = resolveDecision(violations);
  const sanitized = decision === 'sanitize' ? sanitizeContent(input, false).sanitizedContent : undefined;

  return SecurityValidationResultSchema.parse({
    decision,
    safe: decision !== 'block',
    score: computeRiskScore(violations),
    violations,
    sanitizedContent: sanitized
  });
}

export function sanitizeContent(content: unknown, aggressive: boolean): SecuritySanitizeResult {
  const normalized = normalizeSecurityInput(content);
  let sanitized = normalized;
  const appliedRules: string[] = [];

  const stripScripts = sanitized.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  if (stripScripts !== sanitized) {
    sanitized = stripScripts;
    appliedRules.push('strip-script-tags');
  }

  const stripEventHandlers = sanitized.replace(/\son\w+\s*=\s*(["']).*?\1/gi, '');
  if (stripEventHandlers !== sanitized) {
    sanitized = stripEventHandlers;
    appliedRules.push('strip-inline-event-handlers');
  }

  const neutralizeJavascriptUrls = sanitized.replace(/javascript\s*:/gi, 'blocked:');
  if (neutralizeJavascriptUrls !== sanitized) {
    sanitized = neutralizeJavascriptUrls;
    appliedRules.push('neutralize-javascript-url');
  }

  const maskSecrets = sanitized.replace(
    /\b(api[_-]?key|secret|password|token)\s*[:=]\s*(["'])?([A-Za-z0-9_\-]{8,})\2?/gi,
    '$1=[REDACTED]'
  );
  if (maskSecrets !== sanitized) {
    sanitized = maskSecrets;
    appliedRules.push('mask-secret-values');
  }

  const maskEmails = sanitized.replace(/\b([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi, '[REDACTED_EMAIL]');
  if (maskEmails !== sanitized) {
    sanitized = maskEmails;
    appliedRules.push('mask-email-addresses');
  }

  if (aggressive) {
    const stripSqlMetacharacters = sanitized.replace(/['"`;]|--/g, '');
    if (stripSqlMetacharacters !== sanitized) {
      sanitized = stripSqlMetacharacters;
      appliedRules.push('strip-sql-metacharacters');
    }
  }

  return SecuritySanitizeResultSchema.parse({
    originalContent: content,
    sanitizedContent: sanitized,
    changed: sanitized !== normalized,
    appliedRules
  });
}

function collectPatternViolations(
  target: SecurityViolation[],
  content: string,
  patterns: readonly RegExp[],
  template: Omit<SecurityViolation, 'match'>
): void {
  for (const pattern of patterns) {
    const matched = pattern.exec(content);
    if (!matched?.[0]) continue;

    target.push({
      ...template,
      match: matched[0]
    });
  }
}

function resolveDecision(violations: readonly SecurityViolation[]): SecurityDecision {
  if (violations.some((violation) => violation.action === 'block')) {
    return 'block';
  }

  if (violations.some((violation) => violation.action === 'sanitize')) {
    return 'sanitize';
  }

  return 'allow';
}

function computeRiskScore(violations: readonly SecurityViolation[]): number {
  const weightBySeverity: Record<SecuritySeverity, number> = {
    low: 10,
    medium: 25,
    high: 50,
    critical: 75
  };

  const total = violations.reduce((score, violation) => score + weightBySeverity[violation.severity], 0);
  return Math.max(0, Math.min(100, total));
}

function safeRegExp(expression: string, flags?: string): RegExp | undefined {
  try {
    return new RegExp(expression, flags);
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
