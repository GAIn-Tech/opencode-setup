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

test('checkBudget returns urgency field with correct numeric values', () => {
  const gov = new Governor({ autoLoad: false });
  const session = 'ses_urgency_test';
  const model = 'anthropic/claude-opus-4-6';
  // Max tokens: 180000, warn: 75%, error: 90%

  // Test ok status (urgency 0)
  let result = gov.checkBudget(session, model, 1000);
  assert.strictEqual(result.urgency, 0, 'ok status should have urgency 0');
  assert.strictEqual(result.status, 'ok');

  // Consume tokens to reach warn threshold (75% = 135000 tokens)
  gov.consumeTokens(session, model, 135000);

  // Test warn status (urgency 1)
  result = gov.checkBudget(session, model, 1000);
  assert.strictEqual(result.urgency, 1, 'warn status should have urgency 1');
  assert.strictEqual(result.status, 'warn');

  // Consume more to reach error threshold (90% = 162000 tokens total)
  gov.consumeTokens(session, model, 27000);

  // Test error status (urgency 2)
  result = gov.checkBudget(session, model, 1000);
  assert.strictEqual(result.urgency, 2, 'error status should have urgency 2');
  assert.strictEqual(result.status, 'error');

  // Consume more to exceed budget (180000 tokens)
  gov.consumeTokens(session, model, 18000);

  // Test exceeded status (urgency 3)
  result = gov.checkBudget(session, model, 1000);
  assert.strictEqual(result.urgency, 3, 'exceeded status should have urgency 3');
  assert.strictEqual(result.status, 'exceeded');
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
