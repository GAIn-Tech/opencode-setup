import { describe, it, expect } from 'bun:test';
import healthCheck from '../src/index.js';
import * as namedExports from '../src/index.js';

describe('Health Check API Alias', () => {
  it('should export getHealth as named export', () => {
    expect(namedExports.getHealth).toBeDefined();
    expect(typeof namedExports.getHealth).toBe('function');
  });

  it('should export getHealthStatus as named export', () => {
    expect(namedExports.getHealthStatus).toBeDefined();
    expect(typeof namedExports.getHealthStatus).toBe('function');
  });

  it('getHealth should be alias for getHealthStatus', () => {
    expect(namedExports.getHealth).toBe(namedExports.getHealthStatus);
  });

  it('both getHealth() and getHealthStatus() should return same result', () => {
    const result1 = namedExports.getHealth();
    const result2 = namedExports.getHealthStatus();
    
    expect(result1.overall).toBe(result2.overall);
    expect(result1.timestamp).toBeDefined();
    expect(result2.timestamp).toBeDefined();
  });

  it('should include getHealth in default export', () => {
    expect(healthCheck.getHealth).toBeDefined();
    expect(typeof healthCheck.getHealth).toBe('function');
  });

  it('default export getHealth should work', () => {
    const result = healthCheck.getHealth();
    expect(result.overall).toBeDefined();
    expect(result.subsystems).toBeDefined();
  });
});
