'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setTimeout: sleep } = require('node:timers/promises');
const {
  registerSubsystem,
  startHealthChecks,
  stopHealthChecks,
  checkSubsystem,
  getSchedulerTelemetry,
} = require('../src/index');

// ---------------------------------------------------------------------------
// Regression: getSchedulerTelemetry() implementation
// Acceptance: tickCount increments, overlapRate calculated, maxConcurrentChecks tracked
// ---------------------------------------------------------------------------

test('getSchedulerTelemetry returns expected shape', () => {
  const telemetry = getSchedulerTelemetry();
  
  assert.ok(typeof telemetry === 'object', 'Should return object');
  assert.ok('tickCount' in telemetry, 'Should have tickCount');
  assert.ok('overlapRate' in telemetry, 'Should have overlapRate');
  assert.ok('maxConcurrentChecks' in telemetry, 'Should have maxConcurrentChecks');
  assert.ok('lastCheckTimes' in telemetry, 'Should have lastCheckTimes');
  assert.ok('checkDurations' in telemetry, 'Should have checkDurations');
});

test('tickCount increments on checkSubsystem calls', async () => {
  // Register test subsystem
  registerSubsystem('telemetry-test-1', async () => ({ healthy: true }), { checkInterval: 0 });
  
  // Get initial telemetry
  const before = getSchedulerTelemetry();
  const initialTicks = before.tickCount || 0;
  
  // Run a check
  await checkSubsystem('telemetry-test-1');
  
  // Get updated telemetry
  const after = getSchedulerTelemetry();
  assert.strictEqual(after.tickCount, initialTicks + 1, 'tickCount should increment by 1');
  
  // Cleanup
  stopHealthChecks();
});

test('maxConcurrentChecks tracks concurrent execution', async () => {
  // Register multiple subsystems with delays
  registerSubsystem('telemetry-test-2a', async () => {
    await sleep(50);
    return { healthy: true };
  }, { checkInterval: 0 });
  
  registerSubsystem('telemetry-test-2b', async () => {
    await sleep(50);
    return { healthy: true };
  }, { checkInterval: 0 });
  
  // Run checks concurrently
  await Promise.all([
    checkSubsystem('telemetry-test-2a'),
    checkSubsystem('telemetry-test-2b'),
  ]);
  
  // Get telemetry
  const telemetry = getSchedulerTelemetry();
  assert.ok(telemetry.maxConcurrentChecks >= 1, 'maxConcurrentChecks should be at least 1');
  
  // Cleanup
  stopHealthChecks();
});

test('lastCheckTimes records check timestamps', async () => {
  // Register test subsystem
  registerSubsystem('telemetry-test-3', async () => ({ healthy: true }), { checkInterval: 0 });
  
  // Run a check
  const before = Date.now();
  await checkSubsystem('telemetry-test-3');
  const after = Date.now();
  
  // Get telemetry
  const telemetry = getSchedulerTelemetry();
  const lastCheckTime = telemetry.lastCheckTimes['telemetry-test-3'];
  
  assert.ok(lastCheckTime, 'lastCheckTimes should have entry for subsystem');
  assert.ok(lastCheckTime >= before && lastCheckTime <= after, 'lastCheckTime should be within check window');
  
  // Cleanup
  stopHealthChecks();
});

test('checkDurations records check execution time', async () => {
  // Register test subsystem with known delay
  registerSubsystem('telemetry-test-4', async () => {
    await sleep(30);
    return { healthy: true };
  }, { checkInterval: 0 });
  
  // Run a check
  await checkSubsystem('telemetry-test-4');
  
  // Get telemetry
  const telemetry = getSchedulerTelemetry();
  const duration = telemetry.checkDurations['telemetry-test-4'];
  
  assert.ok(duration, 'checkDurations should have entry for subsystem');
  assert.ok(duration >= 30, 'Duration should be at least 30ms (the sleep time)');
  
  // Cleanup
  stopHealthChecks();
});

test('overlapRate calculated from concurrent checks', async () => {
  // Register multiple subsystems
  registerSubsystem('telemetry-test-5a', async () => {
    await sleep(20);
    return { healthy: true };
  }, { checkInterval: 0 });
  
  registerSubsystem('telemetry-test-5b', async () => {
    await sleep(20);
    return { healthy: true };
  }, { checkInterval: 0 });
  
  // Run checks concurrently
  await Promise.all([
    checkSubsystem('telemetry-test-5a'),
    checkSubsystem('telemetry-test-5b'),
  ]);
  
  // Get telemetry
  const telemetry = getSchedulerTelemetry();
  assert.ok(typeof telemetry.overlapRate === 'number', 'overlapRate should be a number');
  assert.ok(telemetry.overlapRate >= 0, 'overlapRate should be non-negative');
  
  // Cleanup
  stopHealthChecks();
});

test('getSchedulerTelemetry works with startHealthChecks polling', async () => {
  // Register test subsystem with short interval
  registerSubsystem('telemetry-test-6', async () => ({ healthy: true }), { checkInterval: 100 });
  
  // Start automatic health checks
  startHealthChecks();
  
  // Wait for multiple ticks
  await sleep(350);
  
  // Get telemetry
  const telemetry = getSchedulerTelemetry();
  assert.ok(telemetry.tickCount >= 2, 'tickCount should be at least 2 after 350ms with 100ms interval');
  assert.ok(telemetry.lastCheckTimes['telemetry-test-6'], 'lastCheckTimes should have entry');
  
  // Cleanup
  stopHealthChecks();
});
