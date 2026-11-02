'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { PatternExtractor } = require('../src/pattern-extractor');

test('PatternExtractor _applyConfidence adds confidence using severity and numeric signals', () => {
  const extractor = new PatternExtractor();

  const scored = extractor._applyConfidence({
    type: 'failed_debug',
    severity: 'high',
    context: {
      occurrences: 8,
      consecutive_failures: 4,
    },
  }, 120);

  assert.equal(typeof scored.confidence, 'number');
  assert.ok(scored.confidence >= 0.8);
  assert.ok(scored.confidence <= 0.99);
});

test('PatternExtractor _applyConfidence defaults to medium baseline without numeric signals', () => {
  const extractor = new PatternExtractor();

  const scored = extractor._applyConfidence({
    type: 'good_delegation',
    severity: 'medium',
    context: { note: 'qualitative only' },
  }, 0);

  assert.equal(scored.confidence, 0.65);
});

test('PatternExtractor extractFromAllSessions applies confidence to cross-session patterns', () => {
  const extractor = new PatternExtractor();

  extractor._listSessionDirs = () => ['s1'];
  extractor.extractFromSession = () => ({
    session_id: 's1',
    anti_patterns: [],
    positive_patterns: [],
  });
  extractor._detectRepeatedMistakes = () => [{
    type: 'repeated_mistake',
    severity: 'critical',
    context: { affected_sessions: 3 },
  }];

  const result = extractor.extractFromAllSessions();
  assert.equal(result.cross_session_anti_patterns.length, 1);
  assert.equal(typeof result.cross_session_anti_patterns[0].confidence, 'number');
  assert.ok(result.cross_session_anti_patterns[0].confidence >= 0.95);
});
