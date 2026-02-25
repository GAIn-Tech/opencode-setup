import { test, expect, describe } from 'bun:test';
import { withCorrelationId, getCorrelationId } from '../src/context.js';

// ─── getCorrelationId ───────────────────────────────────────────────

describe('getCorrelationId', () => {
  test('returns undefined outside of context', () => {
    expect(getCorrelationId()).toBeUndefined();
  });
});

// ─── withCorrelationId ──────────────────────────────────────────────

describe('withCorrelationId', () => {
  test('provides correlation ID inside callback', () => {
    let captured;
    withCorrelationId(() => {
      captured = getCorrelationId();
    }, 'test-id-123');
    expect(captured).toBe('test-id-123');
  });

  test('generates an ID when none provided', () => {
    let captured;
    withCorrelationId(() => {
      captured = getCorrelationId();
    });
    expect(captured).toBeDefined();
    expect(typeof captured).toBe('string');
    expect(captured.length).toBeGreaterThan(0);
  });

  test('returns the result of the callback', () => {
    const result = withCorrelationId(() => 42, 'test-id');
    expect(result).toBe(42);
  });

  test('ID is not available after callback completes', () => {
    withCorrelationId(() => {}, 'temp-id');
    expect(getCorrelationId()).toBeUndefined();
  });
});

// ─── Async propagation ──────────────────────────────────────────────

describe('async propagation', () => {
  test('propagates through async/await', async () => {
    let captured;
    await withCorrelationId(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      captured = getCorrelationId();
    }, 'async-id-456');
    expect(captured).toBe('async-id-456');
  });

  test('propagates through nested promises', async () => {
    const results = [];
    await withCorrelationId(async () => {
      results.push(getCorrelationId());
      await Promise.resolve().then(() => {
        results.push(getCorrelationId());
      });
      await new Promise((resolve) => {
        setTimeout(() => {
          results.push(getCorrelationId());
          resolve();
        }, 5);
      });
    }, 'nested-id');
    expect(results).toEqual(['nested-id', 'nested-id', 'nested-id']);
  });

  test('isolates concurrent contexts', async () => {
    const results = { a: [], b: [] };
    await Promise.all([
      withCorrelationId(async () => {
        results.a.push(getCorrelationId());
        await new Promise((r) => setTimeout(r, 20));
        results.a.push(getCorrelationId());
      }, 'context-a'),
      withCorrelationId(async () => {
        results.b.push(getCorrelationId());
        await new Promise((r) => setTimeout(r, 10));
        results.b.push(getCorrelationId());
      }, 'context-b'),
    ]);
    expect(results.a).toEqual(['context-a', 'context-a']);
    expect(results.b).toEqual(['context-b', 'context-b']);
  });
});

// ─── Nested contexts ────────────────────────────────────────────────

describe('nested contexts', () => {
  test('inner context overrides outer', () => {
    let inner, outer;
    withCorrelationId(() => {
      outer = getCorrelationId();
      withCorrelationId(() => {
        inner = getCorrelationId();
      }, 'inner-id');
    }, 'outer-id');
    expect(outer).toBe('outer-id');
    expect(inner).toBe('inner-id');
  });

  test('outer context restored after inner completes', () => {
    let afterInner;
    withCorrelationId(() => {
      withCorrelationId(() => {}, 'inner-id');
      afterInner = getCorrelationId();
    }, 'outer-id');
    expect(afterInner).toBe('outer-id');
  });
});
