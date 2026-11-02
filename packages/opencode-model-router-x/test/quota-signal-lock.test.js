'use strict';

const assert = require('assert');
const { IntelligentRotator } = require('../src/key-rotator.js');

async function testQuotaSignalPropagationLock() {
  const rotator = new IntelligentRotator('test-provider', ['k1', 'k2'], {
    strategy: 'round-robin',
    cooldownMs: 1000,
  });

  assert.strictEqual(typeof rotator.applyQuotaSignal, 'function', 'applyQuotaSignal should exist');

  const key = rotator.keys[0];
  await Promise.all([
    rotator.applyQuotaSignal(key.id, {
      headers: {
        'x-ratelimit-remaining-requests': '0',
        'x-ratelimit-reset': '1',
      },
    }),
    rotator.applyQuotaSignal(key.id, {
      failure: { message: 'HTTP 429 Too Many Requests' },
    }),
  ]);

  assert(key.remainingRequests <= 0, 'header signal should be applied');
  assert(key.failureCount >= 1, 'failure signal should be applied');
  assert(key.status === 'cooldown' || key.status === 'dead', 'key should enter cooldown/degraded state');
}

async function run() {
  await testQuotaSignalPropagationLock();
  console.log('quota-signal-lock.test.js: PASS');
}

run().catch((err) => {
  console.error('quota-signal-lock.test.js: FAIL');
  console.error(err);
  process.exit(1);
});
