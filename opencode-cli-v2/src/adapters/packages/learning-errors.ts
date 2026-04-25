import { ZodError } from 'zod';

import type { LearningErrorCode, LearningPortError } from '../../ports/learning';

interface LearningAdapterErrorOptions {
  readonly cause?: unknown;
}

export interface LearningAdapterErrorInit {
  readonly code: LearningErrorCode;
  readonly message: string;
  readonly retriable?: boolean;
  readonly details?: Record<string, unknown>;
}

export class LearningAdapterError extends Error {
  public readonly code: LearningErrorCode;
  public readonly retriable: boolean;
  public readonly details?: Record<string, unknown>;

  public constructor(payload: LearningAdapterErrorInit, options: LearningAdapterErrorOptions = {}) {
    if (options.cause !== undefined) {
      super(payload.message, { cause: options.cause });
    } else {
      super(payload.message);
    }

    this.name = 'LearningAdapterError';
    this.code = payload.code;
    this.retriable = payload.retriable ?? false;
    this.details = payload.details;
  }

  public toPortError(): LearningPortError {
    return {
      code: this.code,
      message: this.message,
      retriable: this.retriable,
      details: this.details
    };
  }
}

export function createLearningAdapterError(
  payload: LearningAdapterErrorInit,
  options: LearningAdapterErrorOptions = {}
): LearningAdapterError {
  return new LearningAdapterError(payload, options);
}

export function normalizeLearningAdapterError(
  error: unknown,
  fallback: LearningAdapterErrorInit
): LearningAdapterError {
  if (error instanceof LearningAdapterError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new LearningAdapterError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed in learning adapter',
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

  return new LearningAdapterError(
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
