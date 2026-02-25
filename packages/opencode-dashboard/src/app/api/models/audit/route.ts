import { NextResponse } from 'next/server';
import { AuditLogger } from 'opencode-model-manager/lifecycle';
import * as path from 'path';
import * as os from 'os';
import { requireReadAccess } from '../../_lib/write-access';
import { forbidden, badRequest } from '../../_lib/api-response';

export const dynamic = 'force-dynamic';

// Initialize audit logger
const getAuditLogger = () => {
  const homeDir = os.homedir();
  const dbPath = path.join(homeDir, '.opencode', 'model-manager', 'audit.db');
  return new AuditLogger({ dbPath });
};

export async function GET(request: Request) {
  // RBAC: Require read access for audit logs
  const accessError = requireReadAccess(request, 'models:read');
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
      return NextResponse.json({
        error: 'Missing required parameters',
        message: 'Provide either modelId or both startTime and endTime'
      }, { status: 400 });
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
  } catch (error: any) {
    console.error('Error fetching audit log:', error);
    return NextResponse.json({
      error: 'Failed to fetch audit log',
      message: error.message
    }, { status: 500 });
  } finally {
    auditLogger?.close();
  }
}
