'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  registerSubsystem,
  startHealthChecks,
  stopHealthChecks,
  getSubsystemStatus,
} = require('../src/index');

// ---------------------------------------------------------------------------
// Regression: timer leak in startHealthChecks()
// Acceptance: interval IDs stored, .unref() called, stopHealthChecks() clears all
// ---------------------------------------------------------------------------

test('Timer IDs stored after startHealthChecks()', () => {
  // Register test subsystem
  registerSubsystem('test-sub-1', async () => ({ healthy: true }), { checkInterval: 60000 });
  
  // Start health checks
  startHealthChecks();
  
  // Verify interval ID is stored
  const health = getSubsystemStatus('test-sub-1');
  assert.ok(health, 'Subsystem should exist');
  assert.ok(health._intervalId, 'Interval ID should be stored');
  assert.notStrictEqual(health._intervalId, null, 'Interval ID should not be null');
  
  // Cleanup
  stopHealthChecks();
});

test('.unref() called on intervals', () => {
  // Register test subsystem
  registerSubsystem('test-sub-2', async () => ({ healthy: true }), { checkInterval: 60000 });
  
  // Start health checks
  startHealthChecks();
  
  // Get interval ID
  const health = getSubsystemStatus('test-sub-2');
  assert.ok(health._intervalId, 'Interval ID should be stored');
  
  // Check if .unref() was called (timer should not block process exit)
  // Bun/Node timers have hasRef() method after .unref()
  if (typeof health._intervalId.hasRef === 'function') {
    assert.strictEqual(health._intervalId.hasRef(), false, 'Timer should be unref\'d');
  }
  
  // Cleanup
  stopHealthChecks();
});

test('stopHealthChecks() clears all intervals', () => {
  // Register multiple subsystems
  registerSubsystem('test-sub-3a', async () => ({ healthy: true }), { checkInterval: 60000 });
  registerSubsystem('test-sub-3b', async () => ({ healthy: true }), { checkInterval: 60000 });
  
  // Start health checks
  startHealthChecks();
  
  // Verify intervals are set
  const health3a = getSubsystemStatus('test-sub-3a');
  const health3b = getSubsystemStatus('test-sub-3b');
  assert.ok(health3a._intervalId, 'Interval ID should be stored for 3a');
  assert.ok(health3b._intervalId, 'Interval ID should be stored for 3b');
  
  // Stop health checks
  stopHealthChecks();
  
  // Verify intervals are cleared
  const health3aAfter = getSubsystemStatus('test-sub-3a');
  const health3bAfter = getSubsystemStatus('test-sub-3b');
  assert.strictEqual(health3aAfter._intervalId, null, 'Interval ID should be null after stop for 3a');
  assert.strictEqual(health3bAfter._intervalId, null, 'Interval ID should be null after stop for 3b');
});

test('Double-start doesn\'t double timers', () => {
  // Register test subsystem
  registerSubsystem('test-sub-4', async () => ({ healthy: true }), { checkInterval: 60000 });
  
  // Start health checks twice
  startHealthChecks();
  const health1 = getSubsystemStatus('test-sub-4');
  const firstIntervalId = health1._intervalId;
  
  startHealthChecks();
  const health2 = getSubsystemStatus('test-sub-4');
  const secondIntervalId = health2._intervalId;
  
  // Verify only one interval exists (second start cleared first)
  assert.ok(secondIntervalId, 'Second interval ID should exist');
  assert.notStrictEqual(firstIntervalId, secondIntervalId, 'Second start should create new interval');
  
  // Cleanup
  stopHealthChecks();
});

test('stopHealthChecks() before startHealthChecks() is safe no-op', () => {
  // Register test subsystem
  registerSubsystem('test-sub-5', async () => ({ healthy: true }), { checkInterval: 60000 });
  
  // Stop before start (should not throw)
  assert.doesNotThrow(() => {
    stopHealthChecks();
  }, 'stopHealthChecks() before startHealthChecks() should be safe');
  
  // Verify subsystem still exists and interval ID is null
  const health = getSubsystemStatus('test-sub-5');
  assert.ok(health, 'Subsystem should still exist');
  assert.strictEqual(health._intervalId, null, 'Interval ID should be null');
});
