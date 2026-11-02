import { ZodError } from 'zod';

import type { BudgetErrorCode, BudgetPortError } from '../../ports/budget';

interface ContextGovernorAdapterErrorOptions {
  readonly cause?: unknown;
}

export interface ContextGovernorAdapterErrorInit {
  readonly code: BudgetErrorCode;
  readonly message: string;
  readonly retriable?: boolean;
  readonly details?: Record<string, unknown>;
}

export class ContextGovernorAdapterError extends Error {
  public readonly code: BudgetErrorCode;
  public readonly retriable: boolean;
  public readonly details?: Record<string, unknown>;

  public constructor(
    payload: ContextGovernorAdapterErrorInit,
    options: ContextGovernorAdapterErrorOptions = {}
  ) {
    if (options.cause !== undefined) {
      super(payload.message, { cause: options.cause });
    } else {
      super(payload.message);
    }

    this.name = 'ContextGovernorAdapterError';
    this.code = payload.code;
    this.retriable = payload.retriable ?? false;
    this.details = payload.details;
  }

  public toPortError(): BudgetPortError {
    return {
      code: this.code,
      message: this.message,
      retriable: this.retriable,
      details: this.details
    };
  }
}

export function createContextGovernorAdapterError(
  payload: ContextGovernorAdapterErrorInit,
  options: ContextGovernorAdapterErrorOptions = {}
): ContextGovernorAdapterError {
  return new ContextGovernorAdapterError(payload, options);
}

export function normalizeContextGovernorAdapterError(
  error: unknown,
  fallback: ContextGovernorAdapterErrorInit
): ContextGovernorAdapterError {
  if (error instanceof ContextGovernorAdapterError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ContextGovernorAdapterError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed in context governor adapter',
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

  return new ContextGovernorAdapterError(
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
