import { ZodError } from 'zod';

import { UnifiedConfigSchema, type UnifiedConfig } from './schema';

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly code: string;
}

export class ConfigValidationError extends Error {
  public readonly issues: readonly ValidationIssue[];

  public constructor(issues: readonly ValidationIssue[]) {
    super('Configuration validation failed');
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

function toIssueList(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
    code: issue.code
  }));
}

export function validateConfig(input: unknown): UnifiedConfig {
  try {
    return UnifiedConfigSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ConfigValidationError(toIssueList(error));
    }

    throw error;
  }
}

export function safeValidateConfig(
  input: unknown
):
  | {
      readonly success: true;
      readonly data: UnifiedConfig;
    }
  | {
      readonly success: false;
      readonly issues: readonly ValidationIssue[];
    } {
  const result = UnifiedConfigSchema.safeParse(input);
  if (result.success) {
    return {
      success: true,
      data: result.data
    };
  }

  return {
    success: false,
    issues: toIssueList(result.error)
  };
}
