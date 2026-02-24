// @ts-nocheck
const { describe, test, expect, mock } = require('bun:test');

const {
  CircuitBreaker,
  CircuitBreakerOpenError
} = require('../../src/circuit-breaker/circuit-breaker');

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function openBreaker(breaker, failures = 5) {
  for (let i = 0; i < failures; i += 1) {
    await expect(
      breaker.execute(async () => {
        throw new Error(`failure-${i + 1}`);
      })
    ).rejects.toThrow(`failure-${i + 1}`);
  }
}

describe('CircuitBreaker', () => {
  test('starts in CLOSED state and executes successful operations', async () => {
    const breaker = new CircuitBreaker({ name: 'openai' });

    const result = await breaker.execute(async () => 'ok');

    expect(result).toBe('ok');
    expect(breaker.getState()).toBe('CLOSED');
  });

  test('opens after 5 consecutive failures and fails fast when OPEN', async () => {
    const breaker = new CircuitBreaker({ name: 'anthropic', threshold: 5, timeout: 60000 });

    await openBreaker(breaker, 5);

    expect(breaker.getState()).toBe('OPEN');

    const shouldNotRun = mock(async () => 'never');
    await expect(breaker.execute(shouldNotRun)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(shouldNotRun.mock.calls).toHaveLength(0);
  });

  test('transitions to HALF_OPEN after timeout and closes on successful probe', async () => {
    const breaker = new CircuitBreaker({ name: 'google', threshold: 2, timeout: 25 });
    const events = [];

    breaker.on('open', () => events.push('open'));
    breaker.on('half-open', () => events.push('half-open'));
    breaker.on('close', () => events.push('close'));

    await openBreaker(breaker, 2);
    expect(breaker.getState()).toBe('OPEN');

    await wait(35);

    const result = await breaker.execute(async () => 'recovered');

    expect(result).toBe('recovered');
    expect(breaker.getState()).toBe('CLOSED');
    expect(events).toEqual(['open', 'half-open', 'close']);
  });

  test('allows only one probe request while HALF_OPEN and reopens on probe failure', async () => {
    const breaker = new CircuitBreaker({ name: 'groq', threshold: 1, timeout: 20 });

    await openBreaker(breaker, 1);
    expect(breaker.getState()).toBe('OPEN');

    await wait(30);

    const probeGate = deferred();
    const firstProbe = breaker.execute(async () => {
      await probeGate.promise;
      throw new Error('probe failed');
    });

    await wait(5);

    const secondProbe = mock(async () => 'second-probe');
    await expect(breaker.execute(secondProbe)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(secondProbe.mock.calls).toHaveLength(0);

    probeGate.resolve();
    await expect(firstProbe).rejects.toThrow('probe failed');
    expect(breaker.getState()).toBe('OPEN');
  });

  test('resets consecutive failures after a success', async () => {
    const breaker = new CircuitBreaker({ name: 'nvidia', threshold: 5, timeout: 60000 });

    await openBreaker(breaker, 4);
    expect(breaker.getState()).toBe('CLOSED');

    await expect(breaker.execute(async () => 'success')).resolves.toBe('success');
    expect(breaker.getState()).toBe('CLOSED');

    await openBreaker(breaker, 4);
    expect(breaker.getState()).toBe('CLOSED');

    await expect(
      breaker.execute(async () => {
        throw new Error('threshold-reached');
      })
    ).rejects.toThrow('threshold-reached');

    expect(breaker.getState()).toBe('OPEN');
  });

  test('manual reset forces CLOSED state and clears open circuit', async () => {
    const breaker = new CircuitBreaker({ name: 'cerebras', threshold: 2, timeout: 60000 });

    await openBreaker(breaker, 2);
    expect(breaker.getState()).toBe('OPEN');

    breaker.reset();
    expect(breaker.getState()).toBe('CLOSED');

    await expect(breaker.execute(async () => 'after-reset')).resolves.toBe('after-reset');
    expect(breaker.getState()).toBe('CLOSED');
  });
});
