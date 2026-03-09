/**
 * Wave 11 Phase 1 — T6: Advice Cache Tests
 * Tests the _adviceCache in LearningEngine.advise() — 5-min TTL, 500-entry max,
 * session-signal bypass, learnFromOutcome invalidation.
 * Uses isolation pattern with autoLoad: false, autoSave: false.
 */
'use strict';

const { describe, it, expect, beforeEach } = require('bun:test');
const { LearningEngine } = require('../src/index');

// Helper: Create engine without filesystem deps
function makeEngine() {
  const engine = new LearningEngine({ autoLoad: false, autoSave: false });
  // Clear any persisted patterns so tests are deterministic
  engine.antiPatterns.patterns = [];
  engine.antiPatterns.index = { byType: {}, bySession: {}, bySeverity: {} };
  return engine;
}

describe('T6: Advice Cache', () => {
  it('initializes _adviceCache as empty Map with correct TTL and max', () => {
    const engine = makeEngine();
    expect(engine._adviceCache).toBeInstanceOf(Map);
    expect(engine._adviceCache.size).toBe(0);
    expect(engine._adviceCacheTTL).toBe(300000); // 5 minutes
    expect(engine._adviceCacheMax).toBe(500);
  });

  it('caches advise() results for same taskType+complexity', async () => {
    const engine = makeEngine();
    const ctx = { task_type: 'debug', complexity: 'moderate' };

    const r1 = await engine.advise(ctx);
    expect(engine._adviceCache.size).toBe(1);
    const cacheKey = 'debug:moderate';
    expect(engine._adviceCache.has(cacheKey)).toBe(true);

    const r2 = await engine.advise(ctx);
    // Both should have same advice_id (returned from cache — shallow copy)
    expect(r2.advice_id).toBe(r1.advice_id);
  });

  it('returns shallow copy from cache (not reference)', async () => {
    const engine = makeEngine();
    const ctx = { task_type: 'refactor', complexity: 'simple' };

    const r1 = await engine.advise(ctx);
    const r2 = await engine.advise(ctx);

    // Should be equal but not the same object
    expect(r2.advice_id).toBe(r1.advice_id);
    expect(r2).not.toBe(r1); // Different references (shallow copy)
  });

  it('uses taskType defaults when not provided', async () => {
    const engine = makeEngine();

    await engine.advise({});
    // Default key should be 'general:moderate'
    expect(engine._adviceCache.has('general:moderate')).toBe(true);
  });

  it('bypasses cache when quotaSignal is present', async () => {
    const engine = makeEngine();
    const ctx = { task_type: 'debug', complexity: 'moderate' };

    // Prime the cache
    const r1 = await engine.advise(ctx);
    expect(engine._adviceCache.size).toBe(1);

    // With quotaSignal — should bypass cache and get fresh result
    const ctxWithSignal = { ...ctx, quotaSignal: { remaining: 100 } };
    const r2 = await engine.advise(ctxWithSignal);
    // Fresh result has a NEW advice_id (advisor generates new one each time)
    expect(r2.advice_id).not.toBe(r1.advice_id);
  });

  it('bypasses cache when quota_signal is present', async () => {
    const engine = makeEngine();
    const ctx = { task_type: 'feature', complexity: 'high' };

    const r1 = await engine.advise(ctx);
    const ctxWithSignal = { ...ctx, quota_signal: true };
    const r2 = await engine.advise(ctxWithSignal);
    expect(r2.advice_id).not.toBe(r1.advice_id);
  });

  it('bypasses cache when rotator_risk is present', async () => {
    const engine = makeEngine();
    const ctx = { task_type: 'test', complexity: 'simple' };

    const r1 = await engine.advise(ctx);
    const ctxWithRisk = { ...ctx, rotator_risk: 'high' };
    const r2 = await engine.advise(ctxWithRisk);
    expect(r2.advice_id).not.toBe(r1.advice_id);
  });

  it('learnFromOutcome() clears the entire advice cache', async () => {
    const engine = makeEngine();

    // Prime cache with multiple entries
    await engine.advise({ task_type: 'debug', complexity: 'moderate' });
    await engine.advise({ task_type: 'refactor', complexity: 'high' });
    expect(engine._adviceCache.size).toBe(2);

    // Get an advice_id for learnFromOutcome
    const advice = await engine.advise({ task_type: 'fix', complexity: 'simple' });
    expect(engine._adviceCache.size).toBe(3);

    engine.learnFromOutcome(advice.advice_id, { success: true });
    expect(engine._adviceCache.size).toBe(0);
  });

  it('invalidateAdviceCache() clears all entries', async () => {
    const engine = makeEngine();

    await engine.advise({ task_type: 'debug', complexity: 'moderate' });
    await engine.advise({ task_type: 'test', complexity: 'high' });
    expect(engine._adviceCache.size).toBe(2);

    engine.invalidateAdviceCache();
    expect(engine._adviceCache.size).toBe(0);
  });

  it('evicts oldest entry when cache reaches max (500)', async () => {
    const engine = makeEngine();

    // Manually fill cache to max
    for (let i = 0; i < 500; i++) {
      engine._adviceCache.set(`type_${i}:moderate`, {
        value: { advice_id: `adv_${i}` },
        ts: Date.now() - (500 - i), // Oldest first
      });
    }
    expect(engine._adviceCache.size).toBe(500);

    // The next advise() should evict the oldest entry (type_0:moderate)
    await engine.advise({ task_type: 'new_task', complexity: 'high' });
    expect(engine._adviceCache.size).toBe(500); // Still at max, not 501
    expect(engine._adviceCache.has('type_0:moderate')).toBe(false); // Oldest evicted
    expect(engine._adviceCache.has('new_task:high')).toBe(true); // New one added
  });

  it('expired entries (>5 min TTL) are refreshed', async () => {
    const engine = makeEngine();
    const ctx = { task_type: 'debug', complexity: 'moderate' };

    // Prime cache
    const r1 = await engine.advise(ctx);
    expect(engine._adviceCache.size).toBe(1);

    // Manually expire the entry
    const entry = engine._adviceCache.get('debug:moderate');
    entry.ts = Date.now() - 400000; // 6.67 minutes ago (> 5 min TTL)

    // Should get fresh advice (new advice_id)
    const r2 = await engine.advise(ctx);
    expect(r2.advice_id).not.toBe(r1.advice_id);
  });
});
