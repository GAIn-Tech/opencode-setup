import { describe, expect, test } from 'bun:test';

import { KernelState } from '../../src/kernel/state';
import { createCapability } from './helpers';

describe('KernelState', () => {
  test('starts in idle strict mode', () => {
    const state = new KernelState();

    expect(state.getSnapshot()).toEqual({
      phase: 'idle',
      mode: 'strict',
      activeCapabilities: [],
      missingRequiredCapabilities: [],
      missingOptionalCapabilities: [],
      lastError: undefined
    });
  });

  test('tracks runtime capabilities and marks running when healthy', () => {
    const state = new KernelState();
    const orchestration = createCapability('orchestration');

    state.beginBootstrap('strict');
    state.setRuntime(
      new Map([['orchestration', orchestration]]),
      [],
      ['plugins']
    );
    state.markReady('healthy');

    expect(state.getSnapshot()).toEqual({
      phase: 'running',
      mode: 'strict',
      activeCapabilities: ['orchestration'],
      missingRequiredCapabilities: [],
      missingOptionalCapabilities: ['plugins'],
      lastError: undefined
    });
  });

  test('marks degraded when health is not healthy', () => {
    const state = new KernelState();

    state.beginBootstrap('degraded');
    state.markReady('degraded');

    expect(state.getSnapshot().phase).toBe('degraded');

    state.markReady('unhealthy');

    expect(state.getSnapshot().phase).toBe('degraded');
  });

  test('captures failures and last error message', () => {
    const state = new KernelState();

    state.beginBootstrap('strict');
    state.fail(new Error('boom'));

    expect(state.getSnapshot()).toEqual({
      phase: 'failed',
      mode: 'strict',
      activeCapabilities: [],
      missingRequiredCapabilities: [],
      missingOptionalCapabilities: [],
      lastError: 'boom'
    });
  });

  test('exposes direct getter accessors for runtime data', () => {
    const state = new KernelState();
    const orchestration = createCapability('orchestration');

    state.beginBootstrap('strict');
    state.setRuntime(new Map([['orchestration', orchestration]]), ['routing'], ['plugins']);

    expect([...state.getCapabilities().keys()]).toEqual(['orchestration']);
    expect(state.getMissingRequiredCapabilities()).toEqual(['routing']);
    expect(state.getMissingOptionalCapabilities()).toEqual(['plugins']);
  });
});
