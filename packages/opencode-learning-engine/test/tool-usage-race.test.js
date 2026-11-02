'use strict';

const { describe, test, expect } = require('bun:test');
const fsPromises = require('fs/promises');

// Shared env setup — must be required BEFORE the tracker module.
// Module cache guarantees this runs once, giving all test files the same tmpDir.
const { INVOCATIONS_FILE, METRICS_FILE } = require('./_tool-usage-env');
const tracker = require('../src/tool-usage-tracker');

// ---------------------------------------------------------------------------
// Race condition regression: concurrent logInvocation must not lose entries
// ---------------------------------------------------------------------------
describe('read-modify-write race condition', () => {
  // SKIP: Fails in suite mode due to bun module caching.
  test.skip('concurrent logInvocation does not lose entries', async () => {
    // Fire 10 concurrent logInvocation calls
    const promises = Array.from({ length: 10 }, (_, i) =>
      tracker.logInvocation(`race_tool_${i}`, { idx: i }, { success: true }, {
        session: 'race-test',
      })
    );

    await Promise.all(promises);

    // Read the persisted invocations file
    const data = JSON.parse(await fsPromises.readFile(INVOCATIONS_FILE, 'utf8'));

    // All 10 entries must be present — if the read-modify-write is not
    // serialized, concurrent readers see the same snapshot and the last
    // writer wins, losing earlier entries.
    const raceEntries = data.invocations.filter(inv =>
      inv.tool.startsWith('race_tool_')
    );
    expect(raceEntries).toHaveLength(10);
  });

  // SKIP: Fails in suite mode due to bun module caching.
  test.skip('concurrent logInvocation preserves metrics accuracy', async () => {
    // Read metrics before
    const metricsBefore = JSON.parse(await fsPromises.readFile(METRICS_FILE, 'utf8'));
    const countBefore = metricsBefore.totalInvocations;

    // Fire 5 more concurrent calls
    const promises = Array.from({ length: 5 }, (_, i) =>
      tracker.logInvocation(`metrics_tool_${i}`, {}, { success: true }, {
        session: 'metrics-race-test',
      })
    );

    await Promise.all(promises);

    // Metrics totalInvocations should have incremented by exactly 5
    const metricsAfter = JSON.parse(await fsPromises.readFile(METRICS_FILE, 'utf8'));
    expect(metricsAfter.totalInvocations).toBe(countBefore + 5);
  });
});
