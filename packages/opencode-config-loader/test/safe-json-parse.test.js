'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { safeJsonParse } = require('../src/safe-json-parse');

test('safeJsonParse returns parsed object on valid JSON', () => {
  assert.deepEqual(safeJsonParse('{"a":1}', null), { a: 1 });
});

test('safeJsonParse returns fallback on broken JSON', () => {
  assert.equal(safeJsonParse('{ broken <<< }', null), null);
});

test('safeJsonParse returns fallback on empty string', () => {
  assert.deepEqual(safeJsonParse('', {}), {});
});

test('safeJsonParse returns fallback on non-string input', () => {
  assert.equal(safeJsonParse(null, 'default'), 'default');
});
