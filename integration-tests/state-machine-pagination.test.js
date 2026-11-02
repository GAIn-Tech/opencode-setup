import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { StateMachine } from '../packages/opencode-model-manager/src/lifecycle/state-machine.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('StateMachine Pagination', () => {
  let stateMachine;
  let testDbPath;

  beforeEach(() => {
    // Create temporary database
    testDbPath = path.join(os.tmpdir(), `test-state-machine-${Date.now()}.db`);
    stateMachine = new StateMachine({ dbPath: testDbPath });
  });

  afterEach(() => {
    if (stateMachine) {
      stateMachine.close();
    }
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('should return all history without pagination', async () => {
    const modelId = 'test-model-1';
    
    // Create multiple history entries with proper context
    await stateMachine.setState(modelId, 'detected');
    await stateMachine.transition(modelId, 'assessed', { 
      actor: 'test',
      assessmentResults: { score: 85, benchmarks: {} }
    });
    await stateMachine.transition(modelId, 'approved', { 
      actor: 'test',
      approved: true,
      approvedBy: 'test'
    });
    await stateMachine.transition(modelId, 'selectable', { 
      actor: 'test',
      catalogUpdated: true
    });
    
    const history = await stateMachine.getHistory(modelId);
    
    expect(history.length).toBe(4);
    expect(history[0].toState).toBe('detected');
    expect(history[1].toState).toBe('assessed');
    expect(history[2].toState).toBe('approved');
    expect(history[3].toState).toBe('selectable');
  });

  test('should paginate history with limit', async () => {
    const modelId = 'test-model-2';
    
    // Create multiple history entries with proper context
    await stateMachine.setState(modelId, 'detected');
    await stateMachine.transition(modelId, 'assessed', { 
      actor: 'test',
      assessmentResults: { score: 85, benchmarks: {} }
    });
    await stateMachine.transition(modelId, 'approved', { 
      actor: 'test',
      approved: true,
      approvedBy: 'test'
    });
    await stateMachine.transition(modelId, 'selectable', { 
      actor: 'test',
      catalogUpdated: true
    });
    
    const history = await stateMachine.getHistory(modelId, { limit: 2 });
    
    expect(history.length).toBe(2);
    expect(history[0].toState).toBe('detected');
    expect(history[1].toState).toBe('assessed');
  });

  test('should paginate history with limit and offset', async () => {
    const modelId = 'test-model-3';
    
    // Create multiple history entries with proper context
    await stateMachine.setState(modelId, 'detected');
    await stateMachine.transition(modelId, 'assessed', { 
      actor: 'test',
      assessmentResults: { score: 85, benchmarks: {} }
    });
    await stateMachine.transition(modelId, 'approved', { 
      actor: 'test',
      approved: true,
      approvedBy: 'test'
    });
    await stateMachine.transition(modelId, 'selectable', { 
      actor: 'test',
      catalogUpdated: true
    });
    
    const history = await stateMachine.getHistory(modelId, { limit: 2, offset: 2 });
    
    expect(history.length).toBe(2);
    expect(history[0].toState).toBe('approved');
    expect(history[1].toState).toBe('selectable');
  });

  test('should handle offset beyond available records', async () => {
    const modelId = 'test-model-4';
    
    await stateMachine.setState(modelId, 'detected');
    await stateMachine.transition(modelId, 'assessed', { 
      actor: 'test',
      assessmentResults: { score: 85, benchmarks: {} }
    });
    
    const history = await stateMachine.getHistory(modelId, { limit: 10, offset: 10 });
    
    expect(history.length).toBe(0);
  });

  test('should ignore invalid pagination parameters', async () => {
    const modelId = 'test-model-5';
    
    await stateMachine.setState(modelId, 'detected');
    await stateMachine.transition(modelId, 'assessed', { 
      actor: 'test',
      assessmentResults: { score: 85, benchmarks: {} }
    });
    
    // Invalid limit (negative)
    const history1 = await stateMachine.getHistory(modelId, { limit: -1 });
    expect(history1.length).toBe(2); // Returns all
    
    // Invalid limit (non-integer)
    const history2 = await stateMachine.getHistory(modelId, { limit: 1.5 });
    expect(history2.length).toBe(2); // Returns all
    
    // Invalid offset (negative)
    const history3 = await stateMachine.getHistory(modelId, { limit: 10, offset: -1 });
    expect(history3.length).toBe(2); // Ignores offset
  });
});
