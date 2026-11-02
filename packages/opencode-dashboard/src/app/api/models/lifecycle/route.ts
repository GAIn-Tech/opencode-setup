import { NextResponse } from 'next/server';
import { StateMachine } from 'opencode-model-manager/lifecycle';
import * as path from 'path';
import * as os from 'os';

export const dynamic = 'force-dynamic';

const OPENCODE_DIRNAME = '.opencode';

function resolveDataHome(): string {
  if (process.env.OPENCODE_DATA_HOME) return process.env.OPENCODE_DATA_HOME;
  if (process.env.XDG_DATA_HOME) return path.join(process.env.XDG_DATA_HOME, 'opencode');
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(homeDir, OPENCODE_DIRNAME);
}

// Initialize state machine with default database path
const getStateMachine = () => {
  const dbPath = path.join(resolveDataHome(), 'model-manager', 'lifecycle.db');
  return new StateMachine({ dbPath });
};

export async function GET(request: Request) {
  let stateMachine: StateMachine | null = null;
  try {
    const { searchParams } = new URL(request.url);
    const modelId = searchParams.get('modelId');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    stateMachine = getStateMachine();

    if (modelId) {
      // Get specific model lifecycle state
      const state = await stateMachine.getState(modelId);
      const history = await stateMachine.getHistory(modelId, { limit, offset });

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
  } catch (error: unknown) {
    console.error('Error fetching lifecycle state:', error);
    return NextResponse.json({
      error: 'Failed to fetch lifecycle state',
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  } finally {
    stateMachine?.close();
  }
}
