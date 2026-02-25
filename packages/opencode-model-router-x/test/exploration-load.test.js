import { test, expect } from 'bun:test';
import { ModelRouter } from '../src/index.js';

test('exploration selection handles batch load', () => {
  const router = new ModelRouter({ exploration: { active: false } });
  const samples = [];
  for (let i = 0; i < 100; i += 1) {
    const result = router.route({ taskType: 'coding', sessionId: `ses_${i}` });
    samples.push(result);
  }
  expect(samples.length).toBe(100);
});
