'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Governor } = require('../src/index');

// ---------------------------------------------------------------------------
// Regression: debounce behavior in consumeTokens()
// Acceptance: 10 rapid consumeTokens() → ≤3 disk writes, state persists
// ---------------------------------------------------------------------------

test('10 rapid consumeTokens() calls produce ≤3 disk writes (200ms debounce)', async () => {
  const tmpPath = path.join(os.tmpdir(), `debounce-reg-${Date.now()}.json`);
  const gov = new Governor({ persistPath: tmpPath, autoLoad: false, saveDebounceMs: 200 });

  let writeCount = 0;
  const origSave = gov.saveToFile.bind(gov);
  gov.saveToFile = (...args) => { writeCount++; return origSave(...args); };

  // 10 rapid calls — should coalesce into 1 write
  for (let i = 0; i < 10; i++) {
    gov.consumeTokens('ses_debounce', 'anthropic/claude-opus-4-6', 100);
  }

  // Immediately: zero writes (all debounced)
  assert.strictEqual(writeCount, 0, `Expected 0 immediate writes, got ${writeCount}`);

  // Wait for debounce window to flush (200ms + margin)
  await new Promise(r => setTimeout(r, 350));
  assert.ok(writeCount >= 1, `Expected ≥1 write after debounce, got ${writeCount}`);
  assert.ok(writeCount <= 3, `Expected ≤3 writes, got ${writeCount}`);

  try { fs.unlinkSync(tmpPath); } catch {}
});

test('consumeTokens() does not block — 10 calls complete in <100ms', () => {
  const tmpPath = path.join(os.tmpdir(), `debounce-timing-${Date.now()}.json`);
  const gov = new Governor({ persistPath: tmpPath, autoLoad: false, saveDebounceMs: 200 });

  const start = performance.now();
  for (let i = 0; i < 10; i++) {
    gov.consumeTokens('ses_timing', 'anthropic/claude-opus-4-6', 100);
  }
  const elapsed = performance.now() - start;

  assert.ok(elapsed < 100, `10 consumeTokens() took ${elapsed.toFixed(1)}ms — should be <100ms (non-blocking)`);

  // Cleanup: cancel pending timer
  if (gov._saveTimer) clearTimeout(gov._saveTimer);
  try { fs.unlinkSync(tmpPath); } catch {}
});

test('state persists to disk after debounce window', async () => {
  const tmpPath = path.join(os.tmpdir(), `debounce-persist-${Date.now()}.json`);
  const gov = new Governor({ persistPath: tmpPath, autoLoad: false, saveDebounceMs: 50 });

  gov.consumeTokens('ses_persist', 'anthropic/claude-opus-4-6', 5000);

  // Before debounce: file should NOT exist yet
  assert.strictEqual(fs.existsSync(tmpPath), false, 'File should not exist before debounce fires');

  // Wait for debounce to flush
  await new Promise(r => setTimeout(r, 150));

  // After debounce: file MUST exist with correct state
  assert.ok(fs.existsSync(tmpPath), 'File should exist after debounce fires');
  const data = JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
  assert.ok(data.savedAt, 'Persisted state should have savedAt timestamp');
  assert.ok(data.sessions || data.entries, 'Persisted state should contain session data');

  try { fs.unlinkSync(tmpPath); } catch {}
});

test('debounce timer uses .unref() to not block process exit', () => {
  const tmpPath = path.join(os.tmpdir(), `debounce-unref-${Date.now()}.json`);
  const gov = new Governor({ persistPath: tmpPath, autoLoad: false, saveDebounceMs: 200 });

  // Trigger a save to create the timer
  gov.consumeTokens('ses_unref', 'anthropic/claude-opus-4-6', 100);

  // Timer should exist and have been unref'd
  assert.ok(gov._saveTimer, 'Timer should be set after consumeTokens()');
  // Bun/Node timers have _destroyed=false and hasRef()===false after .unref()
  if (typeof gov._saveTimer.hasRef === 'function') {
    assert.strictEqual(gov._saveTimer.hasRef(), false, 'Timer should be unref\'d');
  }

  // Cleanup
  clearTimeout(gov._saveTimer);
  gov._saveTimer = null;
});

test('second batch of consumeTokens() after debounce triggers new write', async () => {
  const tmpPath = path.join(os.tmpdir(), `debounce-batch-${Date.now()}.json`);
  const gov = new Governor({ persistPath: tmpPath, autoLoad: false, saveDebounceMs: 50 });

  let writeCount = 0;
  const origSave = gov.saveToFile.bind(gov);
  gov.saveToFile = (...args) => { writeCount++; return origSave(...args); };

  // First batch
  for (let i = 0; i < 5; i++) {
    gov.consumeTokens('ses_batch', 'anthropic/claude-opus-4-6', 100);
  }

  // Wait for first debounce to flush
  await new Promise(r => setTimeout(r, 120));
  assert.strictEqual(writeCount, 1, `First batch: expected 1 write, got ${writeCount}`);

  // Second batch — should trigger new debounce
  for (let i = 0; i < 5; i++) {
    gov.consumeTokens('ses_batch', 'anthropic/claude-opus-4-6', 100);
  }

  await new Promise(r => setTimeout(r, 120));
  assert.strictEqual(writeCount, 2, `Two batches: expected 2 writes, got ${writeCount}`);

  try { fs.unlinkSync(tmpPath); } catch {}
});
