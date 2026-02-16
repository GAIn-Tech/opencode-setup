import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { CircuitBreaker } from '../src/index.js';

describe('CircuitBreaker', () => {
  let breaker;
  
  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 100,
    });
  });

  test('should start in closed state', () => {
    expect(breaker.state).toBe('CLOSED');
  });

  test('should execute function and return result', async () => {
    const result = await breaker.fire(() => Promise.resolve('success'));
    expect(result).toBe('success');
    expect(breaker.state).toBe('CLOSED');
  });

  test('should open circuit after failure threshold', async () => {
    const failingFn = () => Promise.reject(new Error('fail'));
    
    await expect(breaker.fire(failingFn)).rejects.toThrow();
    await expect(breaker.fire(failingFn)).rejects.toThrow();
    await expect(breaker.fire(failingFn)).rejects.toThrow();
    
    expect(breaker.state).toBe('OPEN');
  });

  test('should half-open after timeout', async () => {
    const failingFn = () => Promise.reject(new Error('fail'));
    
    // Trigger open
    await breaker.fire(failingFn).catch(() => {});
    await breaker.fire(failingFn).catch(() => {});
    await breaker.fire(failingFn).catch(() => {});
    
    expect(breaker.state).toBe('OPEN');
    
    // Wait for half-open
    await new Promise(r => setTimeout(r, 150));
    
    // One attempt should transition to half-open
    await breaker.fire(() => Promise.resolve('success')).catch(() => {});
    expect(breaker.state).toBe('HALF_OPEN');
  });

  test('should close circuit after success threshold in half-open', async () => {
    let attempts = 0;
    const recoverFn = () => {
      attempts++;
      if (attempts < 2) return Promise.reject(new Error('recovering'));
      return Promise.resolve('recovered');
    };
    
    // Open the circuit
    breaker.fire(() => Promise.reject(new Error('fail'))).catch(() => {});
    breaker.fire(() => Promise.reject(new Error('fail'))).catch(() => {});
    breaker.fire(() => Promise.reject(new Error('fail'))).catch(() => {});
    
    expect(breaker.state).toBe('OPEN');
    
    // Wait for half-open
    await new Promise(r => setTimeout(r, 150));
    
    // Attempt recovery
    await breaker.fire(recoverFn).catch(() => {});
    await breaker.fire(recoverFn);
    
    expect(breaker.state).toBe('CLOSED');
  });
});
