import { z } from 'zod';

export const SafetyRiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);
export type SafetyRiskLevel = z.infer<typeof SafetyRiskLevelSchema>;

export const SafetyDecisionSchema = z.enum(['allowed', 'blocked', 'confirmation_required', 'bypassed']);
export type SafetyDecision = z.infer<typeof SafetyDecisionSchema>;

export const SafetyHookNameSchema = z.enum([
  'safety.validate-command',
  'safety.check-risk',
  'safety.confirm',
  'safety.audit'
]);
export type SafetyHookName = z.infer<typeof SafetyHookNameSchema>;

export const SafetyPatternMatcherSchema = z.enum(['regex', 'glob', 'substring']);
export type SafetyPatternMatcher = z.infer<typeof SafetyPatternMatcherSchema>;

export const SafetyPatternRuleSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1),
  matcher: SafetyPatternMatcherSchema.default('regex'),
  risk: SafetyRiskLevelSchema,
  description: z.string().min(1).optional()
});
export type SafetyPatternRule = z.infer<typeof SafetyPatternRuleSchema>;

export const SafetyPolicySchema = z.object({
  allowlist: z.array(SafetyPatternRuleSchema).default([]),
  blocklist: z.array(SafetyPatternRuleSchema).default([])
});
export type SafetyPolicy = z.infer<typeof SafetyPolicySchema>;

export const SafetyValidateCommandPayloadSchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    confirmed: z.boolean().default(false),
    bypass: z.boolean().default(false),
    automation: z.boolean().default(false)
  })
  .passthrough();
export type SafetyValidateCommandPayload = z.infer<typeof SafetyValidateCommandPayloadSchema>;

export const SafetyCheckRiskPayloadSchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()).optional()
  })
  .passthrough();
export type SafetyCheckRiskPayload = z.infer<typeof SafetyCheckRiskPayloadSchema>;

export const SafetyConfirmPayloadSchema = z
  .object({
    command: z.string().min(1),
    risk: SafetyRiskLevelSchema,
    confirmed: z.boolean().default(false),
    bypass: z.boolean().default(false),
    automation: z.boolean().default(false),
    reason: z.string().min(1).optional()
  })
  .passthrough();
export type SafetyConfirmPayload = z.infer<typeof SafetyConfirmPayloadSchema>;

export const SafetyAuditPayloadSchema = z
  .object({
    command: z.string().min(1),
    risk: SafetyRiskLevelSchema,
    decision: SafetyDecisionSchema,
    reason: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();
export type SafetyAuditPayload = z.infer<typeof SafetyAuditPayloadSchema>;

export const SafetyAuditRecordSchema = z.object({
  timestamp: z.string().datetime(),
  command: z.string().min(1),
  risk: SafetyRiskLevelSchema,
  decision: SafetyDecisionSchema,
  reason: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
export type SafetyAuditRecord = z.infer<typeof SafetyAuditRecordSchema>;

export const DEFAULT_SAFETY_POLICY: SafetyPolicy = SafetyPolicySchema.parse({
  allowlist: [
    {
      id: 'allow-node-modules-cleanup',
      pattern: 'rm -rf node_modules*',
      matcher: 'glob',
      risk: 'low',
      description: 'Workspace dependency cleanup'
    }
  ],
  blocklist: [
    {
      id: 'critical-rm-root',
      pattern: String.raw`\brm\s+-rf\s+/(\s|$)`,
      matcher: 'regex',
      risk: 'critical',
      description: 'Recursive root deletion'
    },
    {
      id: 'critical-rm-home',
      pattern: String.raw`\brm\s+-rf\s+~(/|\s|$)`,
      matcher: 'regex',
      risk: 'critical',
      description: 'Recursive home deletion'
    },
    {
      id: 'critical-drop-table',
      pattern: String.raw`\bdrop\s+table\b`,
      matcher: 'regex',
      risk: 'critical',
      description: 'Destructive SQL table drop'
    },
    {
      id: 'critical-drop-database',
      pattern: String.raw`\bdrop\s+database\b`,
      matcher: 'regex',
      risk: 'critical',
      description: 'Destructive SQL database drop'
    },
    {
      id: 'high-truncate-table',
      pattern: String.raw`\btruncate\s+table\b`,
      matcher: 'regex',
      risk: 'high',
      description: 'SQL table truncation'
    },
    {
      id: 'high-git-force-push',
      pattern: String.raw`\bgit\s+push\b.*\s--force(?:-with-lease)?\b`,
      matcher: 'regex',
      risk: 'high',
      description: 'Force push command'
    },
    {
      id: 'high-terraform-destroy',
      pattern: String.raw`\bterraform\s+destroy\b`,
      matcher: 'regex',
      risk: 'high',
      description: 'Terraform destroy'
    },
    {
      id: 'medium-delete-without-where',
      pattern: String.raw`\bdelete\s+from\s+\w+(?!.*\bwhere\b)`,
      matcher: 'regex',
      risk: 'medium',
      description: 'SQL delete without where clause'
    }
  ]
});

const RISK_WEIGHT: Record<SafetyRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
};

export interface SafetyRiskCheckResult {
  readonly command: string;
  readonly risk: SafetyRiskLevel;
  readonly matchedBy: 'allowlist' | 'blocklist' | 'heuristic' | 'none';
  readonly matchedRules: readonly string[];
}

export interface SafetyDecisionResult {
  readonly command: string;
  readonly risk: SafetyRiskLevel;
  readonly decision: SafetyDecision;
  readonly allowed: boolean;
  readonly blocked: boolean;
  readonly requiresConfirmation: boolean;
  readonly reason: string;
}

export function normalizeCommand(command: string, args?: readonly string[]): string {
  const base = command.trim();
  if (!args || args.length === 0) {
    return base;
  }

  return `${base} ${args.join(' ')}`.trim();
}

export function classifyCommandRisk(commandValue: string, policy: SafetyPolicy = DEFAULT_SAFETY_POLICY): SafetyRiskCheckResult {
  const command = commandValue.trim();
  const parsedPolicy = SafetyPolicySchema.parse(policy);

  const allowlistMatches = findMatchingRules(command, parsedPolicy.allowlist);
  if (allowlistMatches.length > 0) {
    return {
      command,
      risk: 'low',
      matchedBy: 'allowlist',
      matchedRules: allowlistMatches.map((rule) => rule.id)
    };
  }

  const blockMatches = findMatchingRules(command, parsedPolicy.blocklist);
  if (blockMatches.length > 0) {
    const risk = blockMatches.reduce<SafetyRiskLevel>(
      (highest, rule) => (RISK_WEIGHT[rule.risk] > RISK_WEIGHT[highest] ? rule.risk : highest),
      'low'
    );

    return {
      command,
      risk,
      matchedBy: 'blocklist',
      matchedRules: blockMatches.map((rule) => rule.id)
    };
  }

  const heuristicRisk = classifyHeuristicRisk(command);
  if (heuristicRisk !== 'low') {
    return {
      command,
      risk: heuristicRisk,
      matchedBy: 'heuristic',
      matchedRules: ['heuristic-risk-classifier']
    };
  }

  return {
    command,
    risk: 'low',
    matchedBy: 'none',
    matchedRules: []
  };
}

export function resolveSafetyDecision(input: {
  readonly command: string;
  readonly risk: SafetyRiskLevel;
  readonly confirmed?: boolean;
  readonly bypass?: boolean;
  readonly automation?: boolean;
}): SafetyDecisionResult {
  const confirmed = input.confirmed === true;
  const bypass = input.bypass === true || input.automation === true;

  if (input.risk === 'critical') {
    return {
      command: input.command,
      risk: input.risk,
      decision: 'blocked',
      allowed: false,
      blocked: true,
      requiresConfirmation: false,
      reason: 'critical commands are blocked by safety policy'
    };
  }

  if (input.risk === 'high') {
    if (bypass) {
      return {
        command: input.command,
        risk: input.risk,
        decision: 'bypassed',
        allowed: true,
        blocked: false,
        requiresConfirmation: false,
        reason: 'high-risk command bypassed for automation'
      };
    }

    if (!confirmed) {
      return {
        command: input.command,
        risk: input.risk,
        decision: 'confirmation_required',
        allowed: false,
        blocked: false,
        requiresConfirmation: true,
        reason: 'high-risk command requires explicit confirmation'
      };
    }

    return {
      command: input.command,
      risk: input.risk,
      decision: 'allowed',
      allowed: true,
      blocked: false,
      requiresConfirmation: false,
      reason: 'high-risk command confirmed'
    };
  }

  return {
    command: input.command,
    risk: input.risk,
    decision: 'allowed',
    allowed: true,
    blocked: false,
    requiresConfirmation: false,
    reason: `${input.risk} risk command allowed`
  };
}

function findMatchingRules(command: string, rules: readonly SafetyPatternRule[]): SafetyPatternRule[] {
  const matches: SafetyPatternRule[] = [];

  for (const rule of rules) {
    if (matchesRule(command, rule)) {
      matches.push(rule);
    }
  }

  return matches;
}

function matchesRule(command: string, rule: SafetyPatternRule): boolean {
  if (rule.matcher === 'substring') {
    return command.toLowerCase().includes(rule.pattern.toLowerCase());
  }

  if (rule.matcher === 'glob') {
    return globToRegExp(rule.pattern).test(command);
  }

  return new RegExp(rule.pattern, 'i').test(command);
}

function classifyHeuristicRisk(command: string): SafetyRiskLevel {
  const normalized = command.toLowerCase();

  if (
    /\bmkfs\b/.test(normalized) ||
    /\bdd\s+if=/.test(normalized) ||
    /\bshutdown\s+-h\s+now\b/.test(normalized)
  ) {
    return 'critical';
  }

  if (
    /\bgit\s+clean\s+-fdx\b/.test(normalized) ||
    /\bkubectl\s+delete\s+namespace\b/.test(normalized) ||
    /\bchmod\s+-r\s+777\b/.test(normalized)
  ) {
    return 'high';
  }

  if (/\bsudo\b/.test(normalized) || /\brm\s+-r\b/.test(normalized) || /\bdelete\s+from\b/.test(normalized)) {
    return 'medium';
  }

  return 'low';
}

function globToRegExp(globPattern: string): RegExp {
  const escaped = globPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  return new RegExp(`^${escaped}$`, 'i');
}
