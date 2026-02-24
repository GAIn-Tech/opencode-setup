import { NextResponse } from 'next/server';
import { StateMachine } from '../../../../../opencode-model-manager/src/lifecycle/state-machine';
import { AuditLogger } from '../../../../../opencode-model-manager/src/lifecycle/audit-logger';
import * as path from 'path';
import * as os from 'os';

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
  try {
    const body = await request.json();
    const { modelId, toState, actor, reason, metadata } = body;
    
    // Validate required fields
    if (!modelId || !toState) {
      return NextResponse.json({
        error: 'Missing required fields',
        message: 'modelId and toState are required'
      }, { status: 400 });
    }
    
    const stateMachine = getStateMachine();
    const auditLogger = getAuditLogger();
    
    // Check if transition is valid
    const canTransition = await stateMachine.canTransition(modelId, toState);
    if (!canTransition) {
      const currentState = await stateMachine.getState(modelId);
      return NextResponse.json({
        error: 'Invalid transition',
        message: `Cannot transition from ${currentState} to ${toState}`,
        currentState
      }, { status: 400 });
    }
    
    // Get current state for audit log
    const fromState = await stateMachine.getState(modelId);
    
    // Execute transition
    await stateMachine.transition(modelId, toState, {
      actor: actor || 'system',
      reason: reason || 'Manual transition via dashboard',
      ...metadata
    });
    
    // Log to audit trail
    await auditLogger.log({
      modelId,
      fromState,
      toState,
      actor: actor || 'system',
      reason: reason || 'Manual transition via dashboard',
      diffHash: '',
      metadata: metadata || {}
    });
    
    return NextResponse.json({
      success: true,
      modelId,
      fromState,
      toState,
      timestamp: Date.now()
    });
  } catch (error: any) {
    console.error('Error executing transition:', error);
    return NextResponse.json({
      error: 'Failed to execute transition',
      message: error.message
    }, { status: 500 });
  }
}
