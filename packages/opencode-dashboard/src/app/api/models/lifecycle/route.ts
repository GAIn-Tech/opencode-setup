import { NextResponse } from 'next/server';
import { StateMachine } from 'opencode-model-manager/lifecycle';
import * as path from 'path';
import * as os from 'os';

export const dynamic = 'force-dynamic';

// Initialize state machine with default database path
const getStateMachine = () => {
  const homeDir = os.homedir();
  const dbPath = path.join(homeDir, '.opencode', 'model-manager', 'lifecycle.db');
  return new StateMachine({ dbPath });
};

export async function GET(request: Request) {
  let stateMachine: StateMachine | null = null;
  try {
    const { searchParams } = new URL(request.url);
    const modelId = searchParams.get('modelId');
    
    stateMachine = getStateMachine();
    
    if (modelId) {
      // Get specific model lifecycle state
      const state = await stateMachine.getState(modelId);
      const history = await stateMachine.getHistory(modelId);
      
      return NextResponse.json({
        modelId,
        state,
        history
      });
    } else {
      // Get all models with lifecycle states
      // Note: This would require a method to list all models in the state machine
      // For now, return a message indicating the need for a modelId parameter
      return NextResponse.json({
        error: 'modelId parameter required',
        message: 'Use ?modelId=<model-id> to get lifecycle state for a specific model'
      }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error fetching lifecycle state:', error);
    return NextResponse.json({
      error: 'Failed to fetch lifecycle state',
      message: error.message
    }, { status: 500 });
  } finally {
    stateMachine?.close();
  }
}
