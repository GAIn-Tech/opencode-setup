const { describe, it, expect } = require('bun:test');
const ThompsonSamplingRouter = require('../src/thompson-sampling-router');
const path = require('path');
const fs = require('fs');

describe('Thompson Sampling - Iteration Cap', () => {
  it('should add iteration cap to _sampleGamma', () => {
    const router = new ThompsonSamplingRouter();
    
    // Test that _sampleGamma doesn't hang with extreme parameters
    // This would previously hang in an unbounded while(true) loop
    const startTime = Date.now();
    const sample = router._sampleGamma(0.1, 1);
    const elapsed = Date.now() - startTime;
    
    // Should complete quickly (< 5 seconds) even with difficult parameters
    expect(elapsed).toBeLessThan(5000);
    expect(typeof sample).toBe('number');
    expect(sample).toBeGreaterThan(0);
  });

  it('should gracefully degrade when max iterations exceeded', () => {
    const router = new ThompsonSamplingRouter();
    
    // Test with parameters that might cause many iterations
    const sample = router._sampleGamma(100, 2);
    
    // Should return a valid number (either sampled or fallback)
    expect(typeof sample).toBe('number');
    expect(sample).toBeGreaterThan(0);
  });

  it('should maintain Thompson Sampling behavior with iteration cap', () => {
    const router = new ThompsonSamplingRouter();
    
    // Test normal sampling workflow
    router.update('test-category', 'model-1', true);
    router.update('test-category', 'model-1', true);
    router.update('test-category', 'model-2', false);
    
    const selected = router.select('test-category');
    // Should select one of the available models (from fallback list)
    expect(typeof selected).toBe('string');
    expect(selected.length).toBeGreaterThan(0);
  });

  it('should have MAX_ITERATIONS constant defined', () => {
    const filePath = path.join(__dirname, '../src/thompson-sampling-router.js');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    expect(content).toContain('const MAX_ITERATIONS = 10000');
    expect(content).toContain('if (iterations++ > MAX_ITERATIONS)');
  });
});
