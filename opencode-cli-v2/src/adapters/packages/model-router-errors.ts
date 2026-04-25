import { ZodError } from 'zod';

import type { RoutingErrorCode, RoutingPortError } from '../../ports/routing';

interface ModelRouterAdapterErrorOptions {
  readonly cause?: unknown;
}

export interface ModelRouterAdapterErrorInit {
  readonly code: RoutingErrorCode;
  readonly message: string;
  readonly retriable?: boolean;
  readonly details?: Record<string, unknown>;
}

export class ModelRouterAdapterError extends Error {
  public readonly code: RoutingErrorCode;
  public readonly retriable: boolean;
  public readonly details?: Record<string, unknown>;

  public constructor(
    payload: ModelRouterAdapterErrorInit,
    options: ModelRouterAdapterErrorOptions = {}
  ) {
    if (options.cause !== undefined) {
      super(payload.message, { cause: options.cause });
    } else {
      super(payload.message);
    }

    this.name = 'ModelRouterAdapterError';
    this.code = payload.code;
    this.retriable = payload.retriable ?? false;
    this.details = payload.details;
  }

  public toPortError(): RoutingPortError {
    return {
      code: this.code,
      message: this.message,
      retriable: this.retriable,
      details: this.details
    };
  }
}

export function createModelRouterAdapterError(
  payload: ModelRouterAdapterErrorInit,
  options: ModelRouterAdapterErrorOptions = {}
): ModelRouterAdapterError {
  return new ModelRouterAdapterError(payload, options);
}

export function normalizeModelRouterAdapterError(
  error: unknown,
  fallback: ModelRouterAdapterErrorInit
): ModelRouterAdapterError {
  if (error instanceof ModelRouterAdapterError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ModelRouterAdapterError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed in model router adapter',
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

  return new ModelRouterAdapterError(
    {
      code: fallback.code,
      message: fallback.message,
      retriable: fallback.retriable ?? false,
      details: {
        ...fallback.details,
        ...extractUnknownErrorDetails(error)
      }
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
