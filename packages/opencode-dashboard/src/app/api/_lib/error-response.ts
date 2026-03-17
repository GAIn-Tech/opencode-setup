import { NextResponse } from 'next/server';
import type { ErrorCode } from './api-response';

export function errorResponse(message: string, status: number = 500, details?: unknown, code?: ErrorCode) {
  const body: any = {
    error: message,
    timestamp: new Date().toISOString()
  };
  if (details) body.details = details;
  if (code) body.code = code;
  return NextResponse.json(body, { status });
}

export function successResponse<T>(data: T) {
  return NextResponse.json({
    success: true,
    data,
    timestamp: new Date().toISOString()
  });
}