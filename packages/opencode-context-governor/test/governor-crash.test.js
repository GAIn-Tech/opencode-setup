'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Governor } = require('../src/index');

test('loadFromFile does not throw on corrupt JSON', () => {
  const tmpPath = path.join(os.tmpdir(), `budget-corrupt-${Date.now()}.json`);
  fs.writeFileSync(tmpPath, '{ broken json <<<', 'utf-8');
  const gov = new Governor({ persistPath: tmpPath, autoLoad: false });
  assert.doesNotThrow(() => gov.loadFromFile(tmpPath));
  fs.unlinkSync(tmpPath);
});

test('loadFromFile does not throw on empty file', () => {
  const tmpPath = path.join(os.tmpdir(), `budget-empty-${Date.now()}.json`);
  fs.writeFileSync(tmpPath, '', 'utf-8');
  const gov = new Governor({ persistPath: tmpPath, autoLoad: false });
  assert.doesNotThrow(() => gov.loadFromFile(tmpPath));
  fs.unlinkSync(tmpPath);
});

test('consumeTokens debounces saveToFile calls', async () => {
  const tmpPath = path.join(os.tmpdir(), `budget-debounce-${Date.now()}.json`);
  const gov = new Governor({ persistPath: tmpPath, autoLoad: false, saveDebounceMs: 50 });

  let writeCount = 0;
  const orig = gov.saveToFile.bind(gov);
  gov.saveToFile = (...args) => { writeCount++; return orig(...args); };

  for (let i = 0; i < 10; i++) {
    gov.consumeTokens('ses_test', 'anthropic/claude-opus-4-6', 100);
  }

  // Should be debounced — not yet written
  assert.ok(writeCount < 5, `Expected debounced writes, got ${writeCount} immediately`);

  // Wait for debounce to flush
  await new Promise(r => setTimeout(r, 150));
  assert.ok(writeCount >= 1, `Expected at least 1 write after debounce, got ${writeCount}`);
  assert.ok(writeCount <= 3, `Expected at most 3 writes, got ${writeCount}`);

  try { fs.unlinkSync(tmpPath); } catch {}
});
