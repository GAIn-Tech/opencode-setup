import { NextResponse } from 'next/server';
import { StateMachine, AuditLogger } from 'opencode-model-manager/lifecycle';
import { createHash } from 'node:crypto';
import * as path from 'path';
import * as os from 'os';
import { getWriteActor, requireWriteAccess } from '../../_lib/write-access';
import { appendWriteAuditEntry } from '../../_lib/write-audit';
import { rateLimited, badRequest, internalError } from '../../_lib/api-response';

export const dynamic = 'force-dynamic';

// Initialize state machine and audit logger
const getStateMachine = () => {
  const homeDir = os.homedir();
  const dbPath = path.join(homeDir, '.opencode', 'model-manager', 'lifecycle.db');
  return new StateMachine({ dbPath });
};

const getAuditLogger = () => {
  const homeDir = os.homedir();
  const dbPath = path.join(homeDir, '.opencode', 'model-manager', 'audit.db');
  return new AuditLogger({ dbPath });
};

export async function POST(request: Request) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? request.headers.get('x-real-ip') ?? 'unknown';
  const { rateLimit } = await import('../../_lib/rate-limit');
  const rateLimitResult = rateLimit(`write:${ip}`, 10, 60000);
  if (!rateLimitResult.allowed) {
    return rateLimited('Too many requests', {
      limit: rateLimitResult.limit,
      remaining: rateLimitResult.remaining,
      resetAt: rateLimitResult.resetAt
    });
  }

  const accessError = requireWriteAccess(request, 'models:transition');
  if (accessError) {
    return accessError;
  }

  let stateMachine: StateMachine | null = null;
  let auditLogger: AuditLogger | null = null;
  try {
    const body = await request.json();
    const { modelId, toState, actor, reason, metadata } = body;
    
     // Validate required fields
     if (!modelId || !toState) {
       return badRequest('Missing required fields: modelId and toState are required');
     }
    
    stateMachine = getStateMachine();
    auditLogger = getAuditLogger();
    
     // Check if transition is valid
     const canTransition = await stateMachine.canTransition(modelId, toState);
     if (!canTransition) {
       const currentState = await stateMachine.getState(modelId);
       return badRequest(`Cannot transition from ${currentState} to ${toState}`);
     }
    
     // Get current state for audit log
     const fromState = await stateMachine.getState(modelId);
     if (!fromState) {
       return badRequest(`Model ${modelId} does not have an initialized lifecycle state`);
     }

    const timestamp = Date.now();
    
    // Execute transition
    await stateMachine.transition(modelId, toState, {
      actor: actor || 'system',
      reason: reason || 'Manual transition via dashboard',
      ...metadata,
      timestamp
    });

    const diffHash = createHash('sha256')
      .update(JSON.stringify({ modelId, fromState, toState, actor, reason, metadata, timestamp }))
      .digest('hex');
    
    // Log to audit trail
    await auditLogger.log({
      modelId,
      fromState,
      toState,
      actor: actor || 'system',
      reason: reason || 'Manual transition via dashboard',
      diffHash,
      timestamp,
      metadata: metadata || {}
    });

    await appendWriteAuditEntry({
      route: '/api/models/transition',
      actor: getWriteActor(request),
      action: 'transition',
      metadata: {
        modelId,
        fromState,
        toState,
        reason: reason || 'Manual transition via dashboard'
      }
    });
    
     return NextResponse.json({
       success: true,
       modelId,
       fromState,
       toState,
       timestamp
     });
    } catch (error: unknown) {
      console.error('[Models Transition API] Error executing transition:', error);
      return errorResponse(error instanceof Error ? error.message : String(error));
    }
}
