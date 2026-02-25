'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { DOMAIN_KEYS, evaluateMetaAwarenessEvent } = require('../src/meta-awareness-rules');
const { boundedDelta, detectAnomaly, selectiveReassessmentWeight } = require('../src/meta-awareness-stability');
const { initializeRollups, calculateComposite } = require('../src/meta-awareness-rollups');
const { MetaAwarenessTracker } = require('../src/meta-awareness-tracker');

test('rules: delegation + verification deltas are emitted', () => {
  const delegationEvent = {
    event_type: 'orchestration.delegation_decision',
    complexity: 'complex',
    metadata: { should_delegate: true, delegated: false },
  };
  const verificationEvent = {
    event_type: 'orchestration.verification_executed',
    metadata: { has_evidence: true },
  };

  const d1 = evaluateMetaAwarenessEvent(delegationEvent);
  const d2 = evaluateMetaAwarenessEvent(verificationEvent);

  assert.ok(Array.isArray(d1[DOMAIN_KEYS.DELEGATION]));
  assert.ok(d1[DOMAIN_KEYS.DELEGATION][0].delta < 0);
  assert.ok(Array.isArray(d2[DOMAIN_KEYS.VERIFICATION]));
  assert.ok(d2[DOMAIN_KEYS.VERIFICATION][0].delta > 0);
});

test('stability: bounded delta caps updates', () => {
  assert.equal(boundedDelta(12, 5), 5);
  assert.equal(boundedDelta(-20, 4), -4);
  assert.equal(boundedDelta(2, 5), 2);
});

test('stability: anomaly detection returns anomaly on large z-score', () => {
  const history = [10, 11, 9, 10, 11, 9, 10, 11, 9];
  const result = detectAnomaly({ value: 50, history, zThreshold: 2 });
  assert.equal(result.isAnomaly, true);
  assert.ok(Math.abs(result.zScore) > 2);
});

test('stability: selective reassessment lowers weight on drift', () => {
  assert.equal(selectiveReassessmentWeight({
    eventTaskType: 'debug',
    baselineTaskType: 'debug',
    eventComplexity: 'moderate',
    baselineComplexity: 'moderate',
  }), 1.0);

  assert.equal(selectiveReassessmentWeight({
    eventTaskType: 'feature',
    baselineTaskType: 'debug',
    eventComplexity: 'complex',
    baselineComplexity: 'moderate',
  }), 0.75);
});

test('rollups: composite score respects weights', () => {
  const rollups = initializeRollups();
  rollups.domains[DOMAIN_KEYS.VERIFICATION].score_mean = 90;
  rollups.domains[DOMAIN_KEYS.DELEGATION].score_mean = 60;
  rollups.domains[DOMAIN_KEYS.VERIFICATION].score_ci_low = 85;
  rollups.domains[DOMAIN_KEYS.DELEGATION].score_ci_low = 55;
  rollups.domains[DOMAIN_KEYS.VERIFICATION].score_ci_high = 95;
  rollups.domains[DOMAIN_KEYS.DELEGATION].score_ci_high = 65;

  const composite = calculateComposite({
    [DOMAIN_KEYS.VERIFICATION]: rollups.domains[DOMAIN_KEYS.VERIFICATION],
    [DOMAIN_KEYS.DELEGATION]: rollups.domains[DOMAIN_KEYS.DELEGATION],
  }, {
    [DOMAIN_KEYS.VERIFICATION]: 2,
    [DOMAIN_KEYS.DELEGATION]: 1,
  });

  assert.ok(composite.score_mean > 75);
  assert.ok(composite.score_mean < 90);
});

test('tracker: writes events and updates rollups', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-awareness-test-'));
  const tracker = new MetaAwarenessTracker({
    telemetryDir: tempDir,
    eventsPath: path.join(tempDir, 'events.jsonl'),
    rollupsPath: path.join(tempDir, 'rollups.json'),
    maxUpdateDelta: 3,
    minSamplesForSignal: 1,
  });

  tracker.trackEvent({
    session_id: 's1',
    event_type: 'orchestration.verification_executed',
    task_type: 'bugfix',
    complexity: 'moderate',
    metadata: { has_evidence: true },
  });

  const overview = tracker.getOverview();
  assert.ok(overview.composite.score_mean >= 0);
  assert.ok(overview.domains[DOMAIN_KEYS.VERIFICATION].sample_count >= 1);

  const forensics = tracker.getForensics({ sessionId: 's1', limit: 10 });
  assert.equal(forensics.count, 1);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('MetaAwarenessTracker debounces rollup writes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mat-'));
  const tracker = new MetaAwarenessTracker({
    telemetryDir: dir,
    flushDebounceMs: 50,
  });

  let writeCount = 0;
  const orig = tracker._writeRollups.bind(tracker);
  // Patch to intercept actual disk flushes
  tracker._flushNow = () => { writeCount++; return orig(tracker._rollupCache); };

  for (let i = 0; i < 20; i++) {
    tracker.trackEvent({ event_type: 'orchestration.delegation_decision', metadata: { should_delegate: true, delegated: true } });
  }

  // Should not have flushed to disk yet (debounced)
  assert.ok(writeCount < 20, `Expected debounced writes, got ${writeCount} immediately`);

  // After debounce delay
  await new Promise(r => setTimeout(r, 150));
  assert.ok(writeCount >= 1, `Expected at least 1 flush, got ${writeCount}`);
  assert.ok(writeCount <= 3, `Expected at most 3 flushes, got ${writeCount}`);

  fs.rmSync(dir, { recursive: true, force: true });
});
