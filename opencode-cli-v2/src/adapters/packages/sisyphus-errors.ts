import { ZodError } from 'zod';

import type { OrchestrationErrorCode, OrchestrationPortError } from '../../ports/orchestration';

interface SisyphusAdapterErrorOptions {
  readonly cause?: unknown;
}

export interface SisyphusAdapterErrorInit {
  readonly code: OrchestrationErrorCode;
  readonly message: string;
  readonly retriable?: boolean;
  readonly details?: Record<string, unknown>;
}

export class SisyphusAdapterError extends Error {
  public readonly code: OrchestrationErrorCode;
  public readonly retriable: boolean;
  public readonly details?: Record<string, unknown>;

  public constructor(
    payload: SisyphusAdapterErrorInit,
    options: SisyphusAdapterErrorOptions = {}
  ) {
    if (options.cause !== undefined) {
      super(payload.message, { cause: options.cause });
    } else {
      super(payload.message);
    }

    this.name = 'SisyphusAdapterError';
    this.code = payload.code;
    this.retriable = payload.retriable ?? false;
    this.details = payload.details;
  }

  public toPortError(): OrchestrationPortError {
    return {
      code: this.code,
      message: this.message,
      retriable: this.retriable,
      details: this.details
    };
  }
}

export function createSisyphusAdapterError(
  payload: SisyphusAdapterErrorInit,
  options: SisyphusAdapterErrorOptions = {}
): SisyphusAdapterError {
  return new SisyphusAdapterError(payload, options);
}

export function normalizeSisyphusAdapterError(
  error: unknown,
  fallback: SisyphusAdapterErrorInit
): SisyphusAdapterError {
  if (error instanceof SisyphusAdapterError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new SisyphusAdapterError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed in Sisyphus adapter',
        retriable: false,
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

  return new SisyphusAdapterError(
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
