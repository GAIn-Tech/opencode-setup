'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SessionTracker } = require('../src/session-tracker');

test('SessionTracker caps sessions at maxSessions', () => {
  const tracker = new SessionTracker({ maxSessions: 5 });
  for (let i = 0; i < 10; i++) {
    tracker.consumeTokens(`ses_${i}`, 'anthropic/claude-opus-4-6', 100);
  }
  const sessions = tracker.getAllSessions();
  assert.ok(Object.keys(sessions).length <= 5, `Expected ≤5 sessions, got ${Object.keys(sessions).length}`);
});

test('SessionTracker evicts oldest sessions first', () => {
  const tracker = new SessionTracker({ maxSessions: 3 });
  tracker.consumeTokens('ses_old', 'anthropic/claude-opus-4-6', 100);
  tracker.consumeTokens('ses_mid', 'anthropic/claude-opus-4-6', 100);
  tracker.consumeTokens('ses_new', 'anthropic/claude-opus-4-6', 100);
  tracker.consumeTokens('ses_newest', 'anthropic/claude-opus-4-6', 100);
  const sessions = tracker.getAllSessions();
  assert.ok(!Object.keys(sessions).includes('ses_old'), 'ses_old should have been evicted');
  assert.ok(Object.keys(sessions).includes('ses_newest'), 'ses_newest should be present');
});
