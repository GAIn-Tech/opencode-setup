import { afterEach, describe, expect, test } from 'bun:test';

import {
  logInvocation,
  getInvocationLog,
  resetForTesting,
  resolveSessionKey,
  migrateSessionKeys,
} from '../packages/opencode-learning-engine/src/tool-usage-tracker.js';

afterEach(() => {
  resetForTesting();
});

describe('Session key contract — resolveSessionKey', () => {
  test('resolves context.session directly', () => {
    expect(resolveSessionKey({ session: 'abc' })).toBe('abc');
  });

  test('falls back to context.sessionId', () => {
    expect(resolveSessionKey({ sessionId: 'abc' })).toBe('abc');
  });

  test('falls back to context.session_id', () => {
    expect(resolveSessionKey({ session_id: 'abc' })).toBe('abc');
  });

  test('prefers session over sessionId over session_id', () => {
    expect(resolveSessionKey({ session: 'a', sessionId: 'b', session_id: 'c' })).toBe('a');
    expect(resolveSessionKey({ sessionId: 'b', session_id: 'c' })).toBe('b');
  });

  test('returns null for empty context object', () => {
    expect(resolveSessionKey({})).toBe(null);
  });

  test('returns null for null context', () => {
    expect(resolveSessionKey(null)).toBe(null);
  });

  test('returns null for undefined context', () => {
    expect(resolveSessionKey(undefined)).toBe(null);
  });

  test('returns null for non-object context', () => {
    expect(resolveSessionKey('string')).toBe(null);
    expect(resolveSessionKey(42)).toBe(null);
  });
});

describe('Session key contract — logInvocation preserves session', () => {
  test('session key is preserved in invocation context', async () => {
    await logInvocation('bash', {}, { success: true }, { session: 'ses_123' });

    const log = getInvocationLog();
    expect(log.length).toBe(1);
    expect(log[0].context.session).toBe('ses_123');
  });

  test('missing session defaults to "default"', async () => {
    await logInvocation('bash', {}, { success: true }, {});

    const log = getInvocationLog();
    expect(log[0].context.session).toBe('default');
  });

  test('session from context overrides default', async () => {
    await logInvocation('read', {}, { success: true }, { session: 'ses_custom' });

    const log = getInvocationLog();
    expect(log[0].context.session).toBe('ses_custom');
  });
});

describe('Session key contract — migrateSessionKeys', () => {
  test('migrates entries with sessionId in context', () => {
    const input = [{ context: { sessionId: 'x' }, tool: 'bash' }];
    const result = migrateSessionKeys(input);

    expect(result.length).toBe(1);
    expect(result[0].session).toBe('x');
    expect(result[0].tool).toBe('bash');
  });

  test('migrates entries with session_id in context', () => {
    const input = [{ context: { session_id: 'y' }, tool: 'read' }];
    const result = migrateSessionKeys(input);

    expect(result.length).toBe(1);
    expect(result[0].session).toBe('y');
  });

  test('preserves entries that already have session field', () => {
    const input = [{ session: 'existing', context: { sessionId: 'other' }, tool: 'write' }];
    const result = migrateSessionKeys(input);

    expect(result.length).toBe(1);
    expect(result[0].session).toBe('existing');
  });

  test('sets session to null when context has no session keys', () => {
    const input = [{ context: {}, tool: 'bash' }];
    const result = migrateSessionKeys(input);

    expect(result[0].session).toBe(null);
  });

  test('handles entries with no context', () => {
    const input = [{ tool: 'bash' }];
    const result = migrateSessionKeys(input);

    expect(result[0].session).toBe(null);
  });

  test('returns empty array for non-array input', () => {
    expect(migrateSessionKeys(null)).toEqual([]);
    expect(migrateSessionKeys(undefined)).toEqual([]);
    expect(migrateSessionKeys('not-array')).toEqual([]);
  });

  test('handles mixed entries (some with session, some without)', () => {
    const input = [
      { session: 'has_it', tool: 'bash' },
      { context: { sessionId: 'migrated' }, tool: 'read' },
      { context: {}, tool: 'write' },
    ];
    const result = migrateSessionKeys(input);

    expect(result[0].session).toBe('has_it');
    expect(result[1].session).toBe('migrated');
    expect(result[2].session).toBe(null);
  });
});
