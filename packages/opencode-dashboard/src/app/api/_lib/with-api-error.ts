import { NextResponse } from 'next/server';
import { createErrorResponse, type ApiErrorResponse, type ErrorCode } from './api-response';

type MaybePromise<T> = T | Promise<T>;

export type ApiRouteHandler<TArgs extends unknown[], TResult extends Response> = (
  ...args: TArgs
) => MaybePromise<TResult>;

export type ApiErrorDetailsResolver = (error: unknown) => unknown;

export type ApiErrorCleanupContext = {
  error: unknown;
  source: string;
  args: readonly unknown[];
};

export type WithApiErrorOptions = {
  source: string;
  message?: string;
  status?: number;
  code?: ErrorCode;
  details?: unknown | ApiErrorDetailsResolver;
  logError?: boolean;
  logger?: Pick<Console, 'error' | 'warn'>;
  onFinally?: (context: ApiErrorCleanupContext) => MaybePromise<void>;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveErrorDetails(
  details: unknown | ApiErrorDetailsResolver | undefined,
  error: unknown,
): unknown {
  if (typeof details === 'function') {
    return details(error);
  }
  if (details !== undefined) {
    return details;
  }
  return toErrorMessage(error);
}

/**
 * Wrap a Next.js API route handler with standardized error handling.
 *
 * - Removes repetitive try/catch boilerplate in route handlers.
 * - Logs route failures with a consistent source tag.
 * - Returns typed API errors via createErrorResponse.
 * - Supports optional custom message/status/code/details.
 * - Runs optional cleanup logic in a finally-style callback.
 */
export function withApiError<TArgs extends unknown[], TResult extends Response>(
  handler: ApiRouteHandler<TArgs, TResult>,
  options: WithApiErrorOptions,
): (...args: TArgs) => Promise<TResult | NextResponse<ApiErrorResponse>> {
  const {
    source,
    message = 'Internal server error',
    status = 500,
    code,
    details,
    logError = true,
    logger = console,
    onFinally,
  } = options;

  return async (...args: TArgs): Promise<TResult | NextResponse<ApiErrorResponse>> => {
    let capturedError: unknown = null;
    let response: TResult | NextResponse<ApiErrorResponse>;

    try {
      response = await handler(...args);
    } catch (error: unknown) {
      capturedError = error;

      if (logError) {
        logger.error(`[${source}] ${message}:`, error);
      }

      const effectiveCode = code ?? (status >= 500 ? 'INTERNAL_ERROR' : undefined);
      response = createErrorResponse(message, status, {
        code: effectiveCode,
        details: resolveErrorDetails(details, error),
      });
    } finally {
      if (onFinally) {
        try {
          await onFinally({
            error: capturedError,
            source,
            args,
          });
        } catch (cleanupError: unknown) {
          logger.warn(`[${source}] finally cleanup failed:`, cleanupError);
        }
      }
    }

    return response;
  };
}
