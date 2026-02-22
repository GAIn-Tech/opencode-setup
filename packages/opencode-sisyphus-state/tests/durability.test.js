import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { WorkflowStore, WorkflowExecutor } from '../src/index.js';

function removeArtifacts(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${dbPath}${suffix}`;
    if (fs.existsSync(target)) {
      try {
        fs.unlinkSync(target);
      } catch (_) {
        // Ignore cleanup errors
      }
    }
  }
}

describe('Durability / crash-resume', () => {
  let dbPath;
  let markerPath;

  beforeEach(() => {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    dbPath = path.join(os.tmpdir(), `durability-${uniqueId}.db`);
    markerPath = path.join(os.tmpdir(), `durability-${uniqueId}.log`);
    removeArtifacts(dbPath);
    if (fs.existsSync(markerPath)) {
      fs.unlinkSync(markerPath);
    }
  });

  afterEach(() => {
    removeArtifacts(dbPath);
    if (fs.existsSync(markerPath)) {
      try {
        fs.unlinkSync(markerPath);
      } catch (_) {
        // Ignore cleanup errors
      }
    }
  });

  it('resumes from checkpoint after process crash without re-running completed steps', async () => {
    const runId = `durability-run-${Date.now()}`;
    const workerPath = path.join(__dirname, 'fixtures', 'crash-worker.js');

    const crashed = spawnSync(process.execPath, [workerPath, dbPath, runId, markerPath], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe'
    });

    expect(crashed.status).toBe(42);

    const postCrashStore = new WorkflowStore(dbPath);
    const postCrashState = postCrashStore.getRunState(runId);

    expect(postCrashState).not.toBeNull();
    expect(postCrashState.status).toBe('running');
    expect(postCrashState.steps.find((s) => s.step_id === 'step1')?.status).toBe('completed');

    const executor = new WorkflowExecutor(postCrashStore);
    const workflow = {
      name: 'durability-crash-test',
      steps: [
        { id: 'step1', type: 'write' },
        { id: 'step2', type: 'write' },
        { id: 'step3', type: 'write' }
      ]
    };

    executor.registerHandler('write', async (step) => {
      fs.appendFileSync(markerPath, `${step.id}\n`, 'utf8');
      return { [step.id]: true };
    });

    const resumed = await executor.resume(runId, workflow);
    expect(resumed.status).toBe('completed');

    const finalState = postCrashStore.getRunState(runId);
    expect(finalState.status).toBe('completed');
    expect(finalState.steps.find((s) => s.step_id === 'step1')?.status).toBe('completed');
    expect(finalState.steps.find((s) => s.step_id === 'step2')?.status).toBe('completed');
    expect(finalState.steps.find((s) => s.step_id === 'step3')?.status).toBe('completed');

    postCrashStore.close();

    const entries = fs.readFileSync(markerPath, 'utf8').trim().split('\n').filter(Boolean);
    const step1Executions = entries.filter((e) => e === 'step1').length;

    expect(step1Executions).toBe(1);
  });
});
