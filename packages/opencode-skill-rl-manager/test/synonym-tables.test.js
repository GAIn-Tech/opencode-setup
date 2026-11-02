'use strict';

const { describe, test, expect } = require('bun:test');
const path = require('path');

const SEMANTIC_DIR = path.join(__dirname, '../../../opencode-config/skills/semantic-matching');

describe('synonym tables', () => {
  test('synonyms.json is valid and has debugging cluster', () => {
    const synonyms = require(path.join(SEMANTIC_DIR, 'synonyms.json'));
    expect(Array.isArray(synonyms.debugging)).toBe(true);
    expect(synonyms.debugging).toContain('fix');
    expect(synonyms.debugging).toContain('troubleshoot');
    expect(synonyms.debugging).toContain('diagnose');
  });

  test('synonyms.json has >= 8 clusters', () => {
    const synonyms = require(path.join(SEMANTIC_DIR, 'synonyms.json'));
    expect(Object.keys(synonyms).length).toBeGreaterThanOrEqual(8);
  });

  test('synonyms.json clusters have required entries', () => {
    const synonyms = require(path.join(SEMANTIC_DIR, 'synonyms.json'));

    // Each required cluster must exist and be a non-empty array
    const requiredClusters = [
      'debugging', 'testing', 'security', 'deployment',
      'refactoring', 'performance', 'documentation', 'architecture'
    ];
    for (const cluster of requiredClusters) {
      expect(Array.isArray(synonyms[cluster])).toBe(true);
      expect(synonyms[cluster].length).toBeGreaterThan(0);
    }
  });

  test('domain-signals.json covers all 14 registry categories', () => {
    const signals = require(path.join(SEMANTIC_DIR, 'domain-signals.json'));
    const categories = [
      'planning', 'implementation', 'debugging', 'testing',
      'review', 'git', 'browser', 'research',
      'analysis', 'memory', 'reasoning', 'meta',
      'observability', 'optimization'
    ];
    for (const cat of categories) {
      expect(signals[cat]).toBeDefined();
      expect(Array.isArray(signals[cat])).toBe(true);
      expect(signals[cat].length).toBeGreaterThanOrEqual(5);
    }
  });

  test('domain-signals.json values are all string arrays', () => {
    const signals = require(path.join(SEMANTIC_DIR, 'domain-signals.json'));
    for (const [key, val] of Object.entries(signals)) {
      expect(Array.isArray(val)).toBe(true);
      for (const item of val) {
        expect(typeof item).toBe('string');
      }
    }
  });
});
