import { NextResponse } from 'next/server';
import { AuditLogger } from 'opencode-model-manager/lifecycle';
import * as path from 'path';
import * as os from 'os';
import { requireReadAccess, getWriteActor } from '../../_lib/write-access';
import { forbidden, badRequest, internalError, rateLimited } from '../../_lib/api-response';

export const dynamic = 'force-dynamic';

// Initialize audit logger
const getAuditLogger = () => {
  const homeDir = os.homedir();
  const dbPath = path.join(homeDir, '.opencode', 'model-manager', 'audit.db');
  return new AuditLogger({ dbPath });
};

export async function GET(request: Request) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? request.headers.get('x-real-ip') ?? 'unknown';
  const { rateLimit } = await import('../../_lib/rate-limit');
  const rateLimitResult = rateLimit(`read:${ip}`, 100, 60000);
  if (!rateLimitResult.allowed) {
    return rateLimited('Too many requests', {
      limit: rateLimitResult.limit,
      remaining: rateLimitResult.remaining,
      resetAt: rateLimitResult.resetAt
    });
  }

  // RBAC: Require authenticated read access for sensitive audit logs
  // Uses 'audit:read' (not 'models:read') to enforce authentication — audit logs
  // contain sensitive model lifecycle data and should not be publicly accessible.
  const accessError = requireReadAccess(request, 'audit:read');
  if (accessError) {
    return accessError;
  }

  let auditLogger: AuditLogger | null = null;
  try {
    const { searchParams } = new URL(request.url);
    const modelId = searchParams.get('modelId');
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');
    const limit = searchParams.get('limit');
    
    auditLogger = getAuditLogger();
    
    let entries;
    
    if (modelId) {
      // Get audit log for specific model
      entries = await auditLogger.getByModel(modelId);
    } else if (startTime && endTime) {
      // Get audit log by time range
      entries = await auditLogger.getByTimeRange(
        parseInt(startTime),
        parseInt(endTime)
      );
    } else {
      return badRequest('Missing required parameters: provide either modelId or both startTime and endTime');
    }
    
    // Apply limit if specified
    if (limit) {
      const limitNum = parseInt(limit);
      entries = entries.slice(0, limitNum);
    }
    
    return NextResponse.json({
      entries,
      count: entries.length
    });
   } catch (error: unknown) {
     console.error('[Audit API] Error fetching audit log:', error);
     return errorResponse(error instanceof Error ? error.message : 'Failed to fetch audit log');
   } finally {
     auditLogger?.close();
   }
}
