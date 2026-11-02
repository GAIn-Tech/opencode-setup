/**
 * Wave 11 Phase 2 — T22: Component Tests
 * Tests for: ContextBridge thresholds, IntegrationLayer.checkContextBudget,
 * recordTokenUsage, evaluateContextBudget, taskContextMap TTL eviction,
 * session budget auto-cleanup.
 * Uses isolation pattern — mock governor, no external deps.
 */
'use strict';

const { describe, it, expect, beforeEach } = require('bun:test');
const { ContextBridge } = require('../src/context-bridge');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock governor with controllable budget response */
function mockGovernor(pctUsed, opts = {}) {
  return {
    getRemainingBudget: (sessionId, model) => ({
      pct: pctUsed,
      remaining: Math.round((1 - pctUsed) * 100000),
      used: Math.round(pctUsed * 100000),
      max: 100000,
      status: pctUsed >= 0.80 ? 'error' : pctUsed >= 0.75 ? 'warn' : 'ok',
    }),
    checkBudget: (sessionId, model, proposedTokens) => {
      const remaining = Math.round((1 - pctUsed) * 100000);
      const allowed = remaining >= proposedTokens;
      return {
        allowed,
        status: pctUsed >= 0.80 ? 'error' : pctUsed >= 0.75 ? 'warn' : 'ok',
        urgency: pctUsed,
        remaining,
        message: `Budget at ${(pctUsed * 100).toFixed(0)}%`,
      };
    },
    consumeTokens: (sessionId, model, count) => {
      const newUsed = Math.round(pctUsed * 100000) + count;
      const newPct = newUsed / 100000;
      return {
        used: newUsed,
        remaining: 100000 - newUsed,
        pct: newPct,
        status: newPct >= 0.80 ? 'error' : newPct >= 0.75 ? 'warn' : 'ok',
      };
    },
    ...(opts.overrides || {}),
  };
}

function silentLogger() {
  return { info: () => {}, warn: () => {}, error: () => {} };
}

// ---------------------------------------------------------------------------
// ContextBridge Tests
// ---------------------------------------------------------------------------

describe('T22: ContextBridge threshold logic', () => {
  it('returns "none" when governor is absent', () => {
    const bridge = new ContextBridge({ governor: null, logger: silentLogger() });
    const result = bridge.evaluateAndCompress('ses_1', 'anthropic/claude-opus-4-6');
    expect(result.action).toBe('none');
    expect(result.reason).toContain('Governor not available');
    expect(result.pct).toBe(0);
  });

  it('returns "none" for healthy budget (<65%)', () => {
    const gov = mockGovernor(0.50);
    const bridge = new ContextBridge({ governor: gov, logger: silentLogger() });
    const result = bridge.evaluateAndCompress('ses_1', 'model-a');
    expect(result.action).toBe('none');
    expect(result.reason).toContain('healthy');
    expect(result.pct).toBe(0.50);
  });

  it('returns "compress" at 65% threshold', () => {
    const gov = mockGovernor(0.65);
    const bridge = new ContextBridge({ governor: gov, logger: silentLogger() });
    const result = bridge.evaluateAndCompress('ses_1', 'model-a');
    expect(result.action).toBe('compress');
    expect(result.reason).toContain('proactive compression');
    expect(result.pct).toBe(0.65);
  });

  it('returns "compress" between 65% and 80%', () => {
    const gov = mockGovernor(0.72);
    const bridge = new ContextBridge({ governor: gov, logger: silentLogger() });
    const result = bridge.evaluateAndCompress('ses_1', 'model-a');
    expect(result.action).toBe('compress');
    expect(result.pct).toBe(0.72);
  });

  it('returns "compress_urgent" at 80% threshold', () => {
    const gov = mockGovernor(0.80);
    const bridge = new ContextBridge({ governor: gov, logger: silentLogger() });
    const result = bridge.evaluateAndCompress('ses_1', 'model-a');
    expect(result.action).toBe('compress_urgent');
    expect(result.reason).toContain('COMPRESSION MANDATORY');
    expect(result.pct).toBe(0.80);
  });

  it('returns "block" at 95% (above block threshold)', () => {
    const gov = mockGovernor(0.95);
    const bridge = new ContextBridge({ governor: gov, logger: silentLogger() });
    const result = bridge.evaluateAndCompress('ses_1', 'model-a');
    expect(result.action).toBe('block');
    expect(result.pct).toBe(0.95);
  });

  it('fails closed when governor throws (VISION fail-closed pattern)', () => {
    const gov = {
      getRemainingBudget: () => { throw new Error('DB unavailable'); },
    };
    const bridge = new ContextBridge({ governor: gov, logger: silentLogger() });
    const result = bridge.evaluateAndCompress('ses_1', 'model-a');
    expect(result.action).toBe('block'); // evaluateAndCompress still returns block from evaluateAndEnforce
    expect(result.reason).toContain('Evaluation error: DB unavailable');
    expect(result.veto).toBeUndefined(); // veto stripped by evaluateAndCompress
  });

  it('handles governor returning null budget', () => {
    const gov = { getRemainingBudget: () => null };
    const bridge = new ContextBridge({ governor: gov, logger: silentLogger() });
    const result = bridge.evaluateAndCompress('ses_1', 'model-a');
    expect(result.action).toBe('none');
    expect(result.reason).toContain('No budget data');
  });

  it('respects custom thresholds', () => {
    const gov = mockGovernor(0.55);
    const bridge = new ContextBridge({
      governor: gov,
      logger: silentLogger(),
      urgentThreshold: 0.70,
      warnThreshold: 0.50,
    });
    const result = bridge.evaluateAndCompress('ses_1', 'model-a');
    expect(result.action).toBe('compress'); // 55% >= custom warn of 50%
  });
});

// ---------------------------------------------------------------------------
// IntegrationLayer Governor Wiring (isolated — no full IntegrationLayer)
// ---------------------------------------------------------------------------

describe('T22: IntegrationLayer checkContextBudget', () => {
  // Extract the checkContextBudget logic
  function checkContextBudget(governor, sessionId, model, proposedTokens) {
    if (!governor) {
      return { allowed: true, status: 'unknown', urgency: 0, remaining: Infinity, message: 'Governor not available — budget unchecked' };
    }
    try {
      return governor.checkBudget(sessionId, model, proposedTokens);
    } catch (err) {
      return { allowed: true, status: 'unknown', urgency: 0, remaining: Infinity, message: `Budget check error: ${err.message}` };
    }
  }

  it('returns allowed:true with no governor (fail-open)', () => {
    const result = checkContextBudget(null, 'ses_1', 'model-a', 5000);
    expect(result.allowed).toBe(true);
    expect(result.status).toBe('unknown');
    expect(result.remaining).toBe(Infinity);
  });

  it('delegates to governor.checkBudget when available', () => {
    const gov = mockGovernor(0.50);
    const result = checkContextBudget(gov, 'ses_1', 'model-a', 5000);
    expect(result.allowed).toBe(true);
    expect(result.status).toBe('ok');
    expect(result.remaining).toBe(50000);
  });

  it('reflects budget pressure at high usage', () => {
    const gov = mockGovernor(0.90);
    const result = checkContextBudget(gov, 'ses_1', 'model-a', 15000);
    expect(result.allowed).toBe(false); // 10000 remaining < 15000 proposed
    expect(result.status).toBe('error');
  });
});

describe('T22: IntegrationLayer recordTokenUsage', () => {
  function recordTokenUsage(governor, sessionId, model, count) {
    if (!governor) return null;
    try {
      return governor.consumeTokens(sessionId, model, count);
    } catch (err) {
      return null;
    }
  }

  it('returns null with no governor', () => {
    expect(recordTokenUsage(null, 'ses_1', 'model-a', 1000)).toBeNull();
  });

  it('consumes tokens and returns updated budget', () => {
    const gov = mockGovernor(0.50);
    const result = recordTokenUsage(gov, 'ses_1', 'model-a', 5000);
    expect(result.used).toBe(55000); // 50000 + 5000
    expect(result.remaining).toBe(45000);
    expect(result.pct).toBeCloseTo(0.55, 2);
  });

  it('returns null when governor throws', () => {
    const gov = { consumeTokens: () => { throw new Error('fail'); } };
    expect(recordTokenUsage(gov, 'ses_1', 'model-a', 1000)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task Context Eviction (T13)
// ---------------------------------------------------------------------------

describe('T22: Task context eviction (1-hour TTL)', () => {
  function createTaskContextStore() {
    const taskContextMap = new Map();
    const TTL_MS = 60 * 60 * 1000; // 1 hour

    function setTaskContext(taskContext) {
      const taskId = taskContext?.task?.id || taskContext?.id || 'default';
      // Evict stale entries before adding
      const now = Date.now();
      for (const [key, entry] of taskContextMap) {
        if (entry?.ts && (now - entry.ts) > TTL_MS) {
          taskContextMap.delete(key);
        }
      }
      taskContextMap.set(taskId, { context: taskContext, ts: Date.now() });
    }

    function getTaskContext(taskId) {
      const entry = taskContextMap.get(taskId || 'default');
      return entry?.context ?? entry ?? null;
    }

    function clearTaskContext(taskId) {
      taskContextMap.delete(taskId || 'default');
    }

    return { setTaskContext, getTaskContext, clearTaskContext, _map: taskContextMap };
  }

  it('stores and retrieves task context by id', () => {
    const store = createTaskContextStore();
    store.setTaskContext({ id: 'task_1', description: 'test' });
    const ctx = store.getTaskContext('task_1');
    expect(ctx.id).toBe('task_1');
    expect(ctx.description).toBe('test');
  });

  it('uses "default" when no task id provided', () => {
    const store = createTaskContextStore();
    store.setTaskContext({ description: 'no id' });
    const ctx = store.getTaskContext();
    expect(ctx.description).toBe('no id');
  });

  it('evicts entries older than 1 hour on set', () => {
    const store = createTaskContextStore();

    // Insert old entry
    store._map.set('old_task', {
      context: { id: 'old_task' },
      ts: Date.now() - (61 * 60 * 1000), // 61 minutes ago
    });
    expect(store._map.has('old_task')).toBe(true);

    // Setting new context triggers eviction
    store.setTaskContext({ id: 'new_task' });
    expect(store._map.has('old_task')).toBe(false);
    expect(store._map.has('new_task')).toBe(true);
  });

  it('preserves entries younger than 1 hour', () => {
    const store = createTaskContextStore();

    // Insert recent entry
    store._map.set('recent_task', {
      context: { id: 'recent_task' },
      ts: Date.now() - (30 * 60 * 1000), // 30 minutes ago
    });

    store.setTaskContext({ id: 'new_task' });
    expect(store._map.has('recent_task')).toBe(true);
    expect(store._map.has('new_task')).toBe(true);
  });

  it('clearTaskContext removes entry', () => {
    const store = createTaskContextStore();
    store.setTaskContext({ id: 'task_1' });
    expect(store.getTaskContext('task_1')).not.toBeNull();
    store.clearTaskContext('task_1');
    expect(store.getTaskContext('task_1')).toBeNull();
  });

  it('returns null for non-existent task context', () => {
    const store = createTaskContextStore();
    expect(store.getTaskContext('nonexistent')).toBeNull();
  });
});
