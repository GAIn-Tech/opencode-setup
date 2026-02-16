import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { CircuitBreaker } from '../../opencode-circuit-breaker/src/index.js';
import { MockProvider } from '../src/index.js';

describe('CircuitBreaker', () => {
  let breaker;
  
  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000 // 1 second for testing
    });
  });
  
  afterEach(() => {
    breaker.destroy();
  });

  test('starts in closed state', () => {
    expect(breaker.state).toBe('CLOSED');
  });

  test('opens after failure threshold', async () => {
    const provider = new MockProvider('test', { shouldFail: true });
    
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(() => provider.call('test'));
      } catch (e) {
        // Expected to fail
      }
    }
    
    expect(breaker.state).toBe('OPEN');
  });

  test('resets on success', async () => {
    const provider = new MockProvider('test');
    
    // Fail twice
    for (let i = 0; i < 2; i++) {
      try {
        await breaker.execute(() => { throw new Error('fail'); });
      } catch (e) {
        // Expected
      }
    }
    
    // Should be half-open
    expect(breaker.state).toBe('HALF_OPEN');
    
    // Succeed twice
    await breaker.execute(() => provider.call('test'));
    await breaker.execute(() => provider.call('test'));
    
    // Should be closed again
    expect(breaker.state).toBe('CLOSED');
  });

  test('executes function and returns result', async () => {
    const result = await breaker.execute(() => 'success');
    expect(result).toBe('success');
  });

  test('throws when open', async () => {
    // Force open
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(() => { throw new Error('fail'); });
      } catch (e) {
        // Expected
      }
    }
    
    expect(breaker.state).toBe('OPEN');
    
    await expect(
      breaker.execute(() => 'success')
    ).rejects.toThrow('Circuit breaker OPEN');
  });
});

describe('MockProvider', () => {
  test('returns response on success', async () => {
    const provider = new MockProvider('test');
    const result = await provider.call('hello');
    expect(result.text).toBe('Response from test');
  });

  test('throws on failure', async () => {
    const provider = new MockProvider('test', { shouldFail: true });
    await expect(provider.call('hello')).rejects.toThrow('test simulated failure');
  });

  test('respects failAt parameter', async () => {
    const provider = new MockProvider('test', { failAt: 2 });
    
    await provider.call('1');
    await provider.call('2');
    await expect(provider.call('3')).rejects.toThrow();
  });
});
