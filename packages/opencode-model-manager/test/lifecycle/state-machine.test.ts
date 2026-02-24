// @ts-nocheck
const { afterEach, beforeEach, describe, expect, mock, test } = require('bun:test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const {
  StateMachine,
  LIFECYCLE_STATES
} = require('../../src/lifecycle/state-machine');

function deferred() {
  let resolve;
  let reject;

  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function createAssessmentResults(overrides = {}) {
  return {
    benchmarks: {
      humaneval: { score: 0.82 },
      mbpp: { score: 0.79 }
    },
    ...overrides
  };
}

describe('StateMachine', () => {
  let tempDir;
  let dbPath;
  let machine;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'model-lifecycle-'));
    dbPath = path.join(tempDir, 'lifecycle.db');
  });

  afterEach(async () => {
    if (machine) {
      machine.close();
      machine = null;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('executes full lifecycle transitions in order with side effects', async () => {
    const updateCatalog = mock(async () => ({ version: 2 }));
    const addToUiModelList = mock(async () => ({ visible: true }));
    const updateDefaultModelConfig = mock(async () => ({ intent: 'coding', category: 'chat' }));

    machine = new StateMachine({
      dbPath,
      updateCatalog,
      addToUiModelList,
      updateDefaultModelConfig
    });

    const modelId = 'gpt-5';
    await machine.setState(modelId, LIFECYCLE_STATES.DETECTED);

    await machine.transition(modelId, LIFECYCLE_STATES.ASSESSED, {
      assessmentResults: createAssessmentResults()
    });
    await machine.transition(modelId, LIFECYCLE_STATES.APPROVED, {
      approvedBy: 'reviewer-1'
    });
    await machine.transition(modelId, LIFECYCLE_STATES.SELECTABLE, {});
    await machine.transition(modelId, LIFECYCLE_STATES.DEFAULT, {
      intent: 'coding',
      category: 'chat'
    });

    const state = await machine.getState(modelId);
    const history = await machine.getHistory(modelId);

    expect(state).toBe(LIFECYCLE_STATES.DEFAULT);
    expect(updateCatalog.mock.calls).toHaveLength(1);
    expect(addToUiModelList.mock.calls).toHaveLength(1);
    expect(updateDefaultModelConfig.mock.calls).toHaveLength(1);
    expect(history.map((entry) => entry.toState)).toEqual([
      LIFECYCLE_STATES.DETECTED,
      LIFECYCLE_STATES.ASSESSED,
      LIFECYCLE_STATES.APPROVED,
      LIFECYCLE_STATES.SELECTABLE,
      LIFECYCLE_STATES.DEFAULT
    ]);
  });

  test('blocks invalid order and guard failures', async () => {
    machine = new StateMachine({ dbPath });
    const modelId = 'claude-sonnet-4-5';
    await machine.setState(modelId, LIFECYCLE_STATES.DETECTED);

    await expect(
      machine.transition(modelId, LIFECYCLE_STATES.DEFAULT, {
        intent: 'coding',
        category: 'chat'
      })
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

    await expect(
      machine.transition(modelId, LIFECYCLE_STATES.ASSESSED, {})
    ).rejects.toMatchObject({ code: 'TRANSITION_GUARD_FAILED' });

    await machine.transition(modelId, LIFECYCLE_STATES.ASSESSED, {
      assessmentResults: createAssessmentResults()
    });

    await expect(
      machine.transition(modelId, LIFECYCLE_STATES.APPROVED, {})
    ).rejects.toMatchObject({ code: 'TRANSITION_GUARD_FAILED' });
  });

  test('canTransition reflects order and guard requirements', async () => {
    machine = new StateMachine({ dbPath });
    const modelId = 'gpt-5-mini';
    await machine.setState(modelId, LIFECYCLE_STATES.DETECTED);

    expect(await machine.canTransition(modelId, LIFECYCLE_STATES.ASSESSED)).toBe(false);
    expect(
      await machine.canTransition(modelId, LIFECYCLE_STATES.ASSESSED, {
        assessmentResults: createAssessmentResults()
      })
    ).toBe(true);

    await machine.transition(modelId, LIFECYCLE_STATES.ASSESSED, {
      assessmentResults: createAssessmentResults()
    });

    expect(await machine.canTransition(modelId, LIFECYCLE_STATES.DEFAULT)).toBe(false);
  });

  test('persists lifecycle state and history across restarts', async () => {
    machine = new StateMachine({ dbPath });
    const modelId = 'persisted-model';

    await machine.setState(modelId, LIFECYCLE_STATES.DETECTED);
    await machine.transition(modelId, LIFECYCLE_STATES.ASSESSED, {
      assessmentResults: createAssessmentResults({ score: 0.9 })
    });

    machine.close();
    machine = new StateMachine({ dbPath });

    const stateAfterRestart = await machine.getState(modelId);
    const historyAfterRestart = await machine.getHistory(modelId);

    expect(stateAfterRestart).toBe(LIFECYCLE_STATES.ASSESSED);
    expect(historyAfterRestart).toHaveLength(2);
    expect(historyAfterRestart[1].toState).toBe(LIFECYCLE_STATES.ASSESSED);
  });

  test('does not persist state change when side effect fails', async () => {
    machine = new StateMachine({
      dbPath,
      updateCatalog: mock(async () => {
        throw new Error('catalog write failed');
      })
    });

    const modelId = 'side-effect-failure';

    await machine.setState(modelId, LIFECYCLE_STATES.DETECTED);
    await machine.transition(modelId, LIFECYCLE_STATES.ASSESSED, {
      assessmentResults: createAssessmentResults()
    });

    await expect(
      machine.transition(modelId, LIFECYCLE_STATES.APPROVED, {
        approvedBy: 'reviewer-2'
      })
    ).rejects.toThrow('catalog write failed');

    expect(await machine.getState(modelId)).toBe(LIFECYCLE_STATES.ASSESSED);
    expect(await machine.getHistory(modelId)).toHaveLength(2);
  });

  test('serializes concurrent transitions with per-model locking', async () => {
    const gate = deferred();
    const updateCatalog = mock(async () => {
      await gate.promise;
      return { ok: true };
    });

    machine = new StateMachine({ dbPath, updateCatalog });
    const modelId = 'concurrent-model';

    await machine.setState(modelId, LIFECYCLE_STATES.DETECTED);
    await machine.transition(modelId, LIFECYCLE_STATES.ASSESSED, {
      assessmentResults: createAssessmentResults()
    });

    const firstTransition = machine.transition(modelId, LIFECYCLE_STATES.APPROVED, {
      approvedBy: 'reviewer-3'
    });

    await Promise.resolve();

    const secondTransition = machine.transition(modelId, LIFECYCLE_STATES.APPROVED, {
      approvedBy: 'reviewer-4'
    });

    gate.resolve();

    const [firstResult, secondResult] = await Promise.allSettled([
      firstTransition,
      secondTransition
    ]);

    expect(firstResult.status).toBe('fulfilled');
    expect(secondResult.status).toBe('rejected');
    expect(secondResult.reason).toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(updateCatalog.mock.calls).toHaveLength(1);
    expect(await machine.getState(modelId)).toBe(LIFECYCLE_STATES.APPROVED);
  });
});
