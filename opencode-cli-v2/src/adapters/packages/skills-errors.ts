import { ZodError } from 'zod';

import type { SkillErrorCode, SkillsPortError } from '../../ports/skills';

interface SkillsAdapterErrorOptions {
  readonly cause?: unknown;
}

export interface SkillsAdapterErrorInit {
  readonly code: SkillErrorCode;
  readonly message: string;
  readonly retriable?: boolean;
  readonly details?: Record<string, unknown>;
}

export class SkillsAdapterError extends Error {
  public readonly code: SkillErrorCode;
  public readonly retriable: boolean;
  public readonly details?: Record<string, unknown>;

  public constructor(payload: SkillsAdapterErrorInit, options: SkillsAdapterErrorOptions = {}) {
    if (options.cause !== undefined) {
      super(payload.message, { cause: options.cause });
    } else {
      super(payload.message);
    }

    this.name = 'SkillsAdapterError';
    this.code = payload.code;
    this.retriable = payload.retriable ?? false;
    this.details = payload.details;
  }

  public toPortError(): SkillsPortError {
    return {
      code: this.code,
      message: this.message,
      retriable: this.retriable,
      details: this.details
    };
  }
}

export function createSkillsAdapterError(
  payload: SkillsAdapterErrorInit,
  options: SkillsAdapterErrorOptions = {}
): SkillsAdapterError {
  return new SkillsAdapterError(payload, options);
}

export function normalizeSkillsAdapterError(
  error: unknown,
  fallback: SkillsAdapterErrorInit
): SkillsAdapterError {
  if (error instanceof SkillsAdapterError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new SkillsAdapterError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed in skills adapter',
        details: {
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.') || '(root)',
            message: issue.message,
            code: issue.code
          }))
        }
      },
      { cause: error }
    );
  }

  const details = {
    ...fallback.details,
    ...extractUnknownErrorDetails(error)
  };

  return new SkillsAdapterError(
    {
      code: fallback.code,
      message: fallback.message,
      retriable: fallback.retriable ?? false,
      details: Object.keys(details).length > 0 ? details : undefined
    },
    { cause: error }
  );
}

function extractUnknownErrorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message
    };
  }

  if (typeof error === 'string') {
    return {
      errorMessage: error
    };
  }

  if (typeof error === 'object' && error !== null) {
    return {
      errorValue: error
    };
  }

  return {
    errorValue: String(error)
  };
}
