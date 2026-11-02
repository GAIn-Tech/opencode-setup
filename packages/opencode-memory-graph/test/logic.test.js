'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ═══════════════════════════════════════════════════════════════════════════
//  Taxonomy Tests
// ═══════════════════════════════════════════════════════════════════════════

const {
  classify,
  getAncestors,
  getChildren,
  TAXONOMY_TREE,
} = require('../src/taxonomy');

describe('Taxonomy', () => {
  describe('TAXONOMY_TREE', () => {
    it('should define a root "error" node', () => {
      assert.ok(TAXONOMY_TREE.error, 'Root error node must exist');
    });

    it('should contain runtime_error as child of error', () => {
      const children = getChildren('error');
      assert.ok(children.includes('runtime_error'), 'runtime_error should be child of error');
    });

    it('should contain type_error under runtime_error', () => {
      const children = getChildren('runtime_error');
      assert.ok(children.includes('type_error'), 'type_error should be child of runtime_error');
    });
  });

  describe('classify()', () => {
    it('should classify "TypeError: x is undefined" as type_error', () => {
      const result = classify({ message: 'TypeError: x is undefined' });
      assert.equal(result, 'type_error');
    });

    it('should classify "ReferenceError: y is not defined" as reference_error', () => {
      const result = classify({ message: 'ReferenceError: y is not defined' });
      assert.equal(result, 'reference_error');
    });

    it('should classify "SyntaxError: Unexpected token" as syntax_error', () => {
      const result = classify({ message: 'SyntaxError: Unexpected token' });
      assert.equal(result, 'syntax_error');
    });

    it('should classify ENOENT as fs_error', () => {
      const result = classify({ message: 'ENOENT: no such file or directory' });
      assert.equal(result, 'fs_error');
    });

    it('should classify ECONNREFUSED as network_error', () => {
      const result = classify({ message: 'connect ECONNREFUSED 127.0.0.1:3000' });
      assert.equal(result, 'network_error');
    });

    it('should classify ETIMEOUT as timeout_error', () => {
      const result = classify({ message: 'request timed out ETIMEOUT' });
      assert.equal(result, 'timeout_error');
    });

    it('should classify "module not found" as module_not_found', () => {
      const result = classify({ message: 'Cannot find module \'express\'' });
      assert.equal(result, 'module_not_found');
    });

    it('should classify "permission denied" as permission_error', () => {
      const result = classify({ message: 'EACCES: permission denied' });
      assert.equal(result, 'permission_error');
    });

    it('should classify "panic" as crash_error', () => {
      const result = classify({ message: 'panic: runtime error: index out of range' });
      assert.equal(result, 'crash_error');
    });

    it('should classify "command not found" as command_not_found', () => {
      const result = classify({ message: 'bash: node: command not found' });
      assert.equal(result, 'command_not_found');
    });

    it('should return "unknown_error" for unrecognizable messages', () => {
      const result = classify({ message: 'all good, no problems here' });
      assert.equal(result, 'unknown_error');
    });

    it('should use stack trace for classification when message is ambiguous', () => {
      const result = classify({
        message: 'something went wrong',
        stack: 'TypeError: Cannot read properties of null',
      });
      assert.equal(result, 'type_error');
    });

    it('should be case-insensitive', () => {
      const r1 = classify({ message: 'TYPEERROR: blah' });
      const r2 = classify({ message: 'typeerror: blah' });
      assert.equal(r1, 'type_error');
      assert.equal(r2, 'type_error');
    });

    it('should handle empty/null message gracefully', () => {
      assert.equal(classify({ message: '' }), 'unknown_error');
      assert.equal(classify({ message: null }), 'unknown_error');
      assert.equal(classify({}), 'unknown_error');
    });
  });

  describe('getAncestors()', () => {
    it('should return ancestors for type_error', () => {
      const ancestors = getAncestors('type_error');
      assert.deepEqual(ancestors, ['runtime_error', 'error']);
    });

    it('should return ancestors for fs_error', () => {
      const ancestors = getAncestors('fs_error');
      assert.deepEqual(ancestors, ['io_error', 'error']);
    });

    it('should return empty array for root "error"', () => {
      const ancestors = getAncestors('error');
      assert.deepEqual(ancestors, []);
    });

    it('should return empty array for unknown type', () => {
      const ancestors = getAncestors('nonexistent_error');
      assert.deepEqual(ancestors, []);
    });
  });

  describe('getChildren()', () => {
    it('should return children of runtime_error', () => {
      const children = getChildren('runtime_error');
      assert.ok(children.includes('type_error'));
      assert.ok(children.includes('reference_error'));
      assert.ok(children.includes('range_error'));
    });

    it('should return empty array for leaf nodes', () => {
      const children = getChildren('type_error');
      assert.deepEqual(children, []);
    });

    it('should return empty array for unknown type', () => {
      const children = getChildren('nonexistent');
      assert.deepEqual(children, []);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Severity Tests
// ═══════════════════════════════════════════════════════════════════════════

const { score, KEYWORD_SCORES } = require('../src/severity');

describe('Severity', () => {
  describe('KEYWORD_SCORES', () => {
    it('should have FATAL at max keyword severity (30)', () => {
      assert.equal(KEYWORD_SCORES.FATAL, 30);
    });

    it('should have ETIMEOUT at 10', () => {
      assert.equal(KEYWORD_SCORES.ETIMEOUT, 10);
    });
  });

  describe('score()', () => {
    it('should return a number between 0 and 100', () => {
      const s = score({ message: 'TypeError: x is null', error_type: 'type_error' }, {});
      assert.ok(s >= 0 && s <= 100, `Score ${s} out of range [0,100]`);
    });

    it('should score FATAL errors higher than Timeout', () => {
      const fatal = score({ message: 'FATAL: system crash', error_type: 'crash_error' }, {});
      const timeout = score({ message: 'ETIMEOUT on request', error_type: 'timeout_error' }, {});
      assert.ok(fatal > timeout, `FATAL (${fatal}) should > ETIMEOUT (${timeout})`);
    });

    it('should be deterministic — same input = same output', () => {
      const err = { message: 'TypeError: blah', error_type: 'type_error' };
      const ctx = { occurrencesLastHour: 5, sessionsAffected: 2, recurringSessions: 1, coOccurrences: 0 };
      const s1 = score(err, ctx);
      const s2 = score(err, ctx);
      assert.equal(s1, s2);
    });

    it('should increase score with higher frequency', () => {
      const err = { message: 'Error: something', error_type: 'runtime_error' };
      const low = score(err, { occurrencesLastHour: 1 });
      const high = score(err, { occurrencesLastHour: 50 });
      assert.ok(high > low, `High freq (${high}) should > low freq (${low})`);
    });

    it('should increase score with more sessions affected', () => {
      const err = { message: 'Error: something', error_type: 'runtime_error' };
      const one = score(err, { sessionsAffected: 1 });
      const many = score(err, { sessionsAffected: 10 });
      assert.ok(many > one, `Many sessions (${many}) should > one session (${one})`);
    });

    it('should increase score when recurring across sessions', () => {
      const err = { message: 'Error: something', error_type: 'runtime_error' };
      const noRecur = score(err, { recurringSessions: 0 });
      const recur = score(err, { recurringSessions: 5 });
      assert.ok(recur > noRecur, `Recurring (${recur}) should > not (${noRecur})`);
    });

    it('should increase score with co-occurrences', () => {
      const err = { message: 'Error: something', error_type: 'runtime_error' };
      const noCo = score(err, { coOccurrences: 0 });
      const co = score(err, { coOccurrences: 5 });
      assert.ok(co > noCo, `Co-occur (${co}) should > none (${noCo})`);
    });

    it('should handle missing context gracefully (defaults)', () => {
      const s = score({ message: 'Error: test' }, undefined);
      assert.ok(typeof s === 'number' && s >= 0 && s <= 100);
    });

    it('should cap at 100 even with all factors maxed', () => {
      const s = score(
        { message: 'FATAL panic crash ECONNREFUSED', error_type: 'crash_error' },
        { occurrencesLastHour: 1000, sessionsAffected: 100, recurringSessions: 50, coOccurrences: 100 }
      );
      assert.ok(s <= 100, `Score ${s} should not exceed 100`);
    });

    it('should score at least keyword baseline even with zero context', () => {
      const s = score(
        { message: 'FATAL error', error_type: 'crash_error' },
        { occurrencesLastHour: 0, sessionsAffected: 0, recurringSessions: 0, coOccurrences: 0 }
      );
      // Keyword "FATAL" = 30, blast_radius minimum = 5 → at least 35
      assert.ok(s >= 35, `Score ${s} should be >= 35 (keyword 30 + blast min 5)`);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Behavior Tests
// ═══════════════════════════════════════════════════════════════════════════

const {
  createTracker,
  track,
  analyze,
  detectRecovery,
  WINDOW_SIZE_MINUTES,
} = require('../src/behavior');

describe('Behavior', () => {
  describe('createTracker()', () => {
    it('should return an empty tracker state', () => {
      const state = createTracker();
      assert.ok(state);
      assert.ok(typeof state === 'object');
    });
  });

  describe('track()', () => {
    it('should add an event to tracker state', () => {
      let state = createTracker();
      state = track(state, 'err_001', Date.now());
      // State should have recorded this error
      const analysis = analyze(state, 'err_001');
      assert.ok(analysis, 'Should be able to analyze after tracking');
    });

    it('should track multiple events for same error', () => {
      let state = createTracker();
      const now = Date.now();
      state = track(state, 'err_001', now);
      state = track(state, 'err_001', now + 1000);
      state = track(state, 'err_001', now + 2000);
      const analysis = analyze(state, 'err_001');
      assert.ok(analysis);
    });

    it('should be immutable — return new state', () => {
      const state1 = createTracker();
      const state2 = track(state1, 'err_001', Date.now());
      assert.notEqual(state1, state2, 'track() should return new state object');
    });
  });

  describe('analyze()', () => {
    it('should return "transient" for single occurrence', () => {
      let state = createTracker();
      const now = Date.now();
      state = track(state, 'err_001', now);
      assert.equal(analyze(state, 'err_001'), 'transient');
    });

    it('should return "intermittent" for spaced occurrences', () => {
      let state = createTracker();
      const now = Date.now();
      // Spread events across multiple buckets (1-min buckets) with gaps
      state = track(state, 'err_002', now - 5 * 60000); // 5 min ago
      state = track(state, 'err_002', now - 3 * 60000); // 3 min ago
      state = track(state, 'err_002', now);              // now
      const result = analyze(state, 'err_002');
      assert.ok(
        result === 'intermittent' || result === 'persistent',
        `Expected intermittent or persistent, got: ${result}`
      );
    });

    it('should return "persistent" for continuous occurrences across many buckets', () => {
      let state = createTracker();
      const now = Date.now();
      // Fill most buckets in the 10-min window
      for (let i = 0; i < 8; i++) {
        state = track(state, 'err_003', now - i * 60000);
      }
      assert.equal(analyze(state, 'err_003'), 'persistent');
    });

    it('should return "resolved" for error not seen in lookback window', () => {
      let state = createTracker();
      const now = Date.now();
      // Track an event well outside the lookback window
      state = track(state, 'err_004', now - 20 * 60000); // 20 min ago, outside 10-min window
      assert.equal(analyze(state, 'err_004'), 'resolved');
    });

    it('should return "transient" for unknown error ID', () => {
      const state = createTracker();
      // Never tracked → no data → transient by default
      assert.equal(analyze(state, 'unknown_err'), 'transient');
    });
  });

  describe('detectRecovery()', () => {
    it('should return false when error is still occurring', () => {
      let state = createTracker();
      const now = Date.now();
      state = track(state, 'err_005', now);
      assert.equal(detectRecovery(state, 'err_005'), false);
    });

    it('should return true when error stopped occurring within window', () => {
      let state = createTracker();
      const now = Date.now();
      // Error happened near start of window but not recently
      state = track(state, 'err_006', now - 8 * 60000);
      state = track(state, 'err_006', now - 7 * 60000);
      // Nothing in last 5 minutes → recovery detected
      const recovered = detectRecovery(state, 'err_006');
      assert.equal(recovered, true);
    });

    it('should return false for never-seen errors', () => {
      const state = createTracker();
      assert.equal(detectRecovery(state, 'never_seen'), false);
    });
  });

  describe('WINDOW_SIZE_MINUTES', () => {
    it('should be 10', () => {
      assert.equal(WINDOW_SIZE_MINUTES, 10);
    });
  });
});
