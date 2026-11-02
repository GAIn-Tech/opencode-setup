import { NextResponse } from 'next/server';

export type ErrorCode = 
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'VALIDATION_ERROR';

export type ApiErrorResponse = {
  error: string;
  code?: ErrorCode;
  details?: unknown;
  timestamp?: string;
};

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  timestamp?: string;
};

export function createErrorResponse(
  message: string,
  status: number,
  options?: {
    code?: ErrorCode;
    details?: unknown;
  }
): NextResponse<ApiErrorResponse> {
  const response: ApiErrorResponse = {
    error: message,
    timestamp: new Date().toISOString()
  };

  if (options?.code) {
    response.code = options.code;
  }

  if (options?.details) {
    response.details = options.details;
  }

  return NextResponse.json(response, { status });
}

/**
 * Backward-compatible alias used by older routes.
 * Prefer createErrorResponse(...) for new code.
 */
export function errorResponse(
  message: string,
  status: number = 500,
  details?: unknown,
  code?: ErrorCode,
): NextResponse<ApiErrorResponse> {
  return createErrorResponse(message, status, { code, details });
}

export function badRequest(message: string, details?: unknown): NextResponse<ApiErrorResponse> {
  return createErrorResponse(message, 400, { code: 'BAD_REQUEST', details });
}

export function unauthorized(message: string = 'Unauthorized'): NextResponse<ApiErrorResponse> {
  return createErrorResponse(message, 401, { code: 'UNAUTHORIZED' });
}

export function forbidden(message: string = 'Forbidden'): NextResponse<ApiErrorResponse> {
  return createErrorResponse(message, 403, { code: 'FORBIDDEN' });
}

export function notFound(message: string = 'Resource not found'): NextResponse<ApiErrorResponse> {
  return createErrorResponse(message, 404, { code: 'NOT_FOUND' });
}

export function rateLimited(message: string = 'Rate limit exceeded', options?: {
  limit?: number;
  remaining?: number;
  resetAt?: number;
}): NextResponse<ApiErrorResponse> {
  const response = createErrorResponse(message, 429, { code: 'RATE_LIMITED' });
  
  if (options?.limit !== undefined) {
    response.headers.set('X-RateLimit-Limit', String(options.limit));
  }
  if (options?.remaining !== undefined) {
    response.headers.set('X-RateLimit-Remaining', String(options.remaining));
  }
  if (options?.resetAt !== undefined) {
    response.headers.set('X-RateLimit-Reset', String(Math.ceil(options.resetAt / 1000)));
  }
  
  return response;
}

export function internalError(message: string = 'Internal server error', details?: unknown): NextResponse<ApiErrorResponse> {
  return createErrorResponse(message, 500, { code: 'INTERNAL_ERROR', details });
}

export function validationError(message: string, details?: unknown): NextResponse<ApiErrorResponse> {
  return createErrorResponse(message, 422, { code: 'VALIDATION_ERROR', details });
}

export function successResponse<T>(data: T): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json({
    success: true,
    data,
    timestamp: new Date().toISOString()
  });
}
