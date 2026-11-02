import { describe, test, expect } from 'bun:test';
import snapshotSchema from '../../src/snapshot/snapshot-schema.js';

const { validateSnapshot, normalizeSnapshot } = snapshotSchema;

describe('validateSnapshot', () => {
  test('passes a fully valid snapshot', () => {
    const result = validateSnapshot({
      id: 'snap-1',
      timestamp: Date.now(),
      models: [
        { id: 'gpt-5', provider: 'openai' },
        { name: 'gemini-2.5-pro', provider: 'google' },
      ],
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  test('rejects null and non-object inputs', () => {
    expect(validateSnapshot(null)).toEqual({
      valid: false,
      errors: ['snapshot must be a non-null object'],
    });
    expect(validateSnapshot('string')).toEqual({
      valid: false,
      errors: ['snapshot must be a non-null object'],
    });
    expect(validateSnapshot(undefined)).toEqual({
      valid: false,
      errors: ['snapshot must be a non-null object'],
    });
  });

  test('rejects missing or empty id', () => {
    const result = validateSnapshot({
      id: '',
      timestamp: 1000,
      models: [{ id: 'a', provider: 'p' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('snapshot.id must be a non-empty string');

    const result2 = validateSnapshot({
      id: 123,
      timestamp: 1000,
      models: [{ id: 'a', provider: 'p' }],
    });
    expect(result2.valid).toBe(false);
    expect(result2.errors).toContain('snapshot.id must be a non-empty string');
  });

  test('rejects invalid timestamps', () => {
    const cases = [
      { timestamp: 0, desc: 'zero' },
      { timestamp: -100, desc: 'negative' },
      { timestamp: NaN, desc: 'NaN' },
      { timestamp: Infinity, desc: 'Infinity' },
      { timestamp: 'abc', desc: 'string' },
    ];
    for (const { timestamp } of cases) {
      const result = validateSnapshot({
        id: 'x',
        timestamp,
        models: [{ id: 'a', provider: 'p' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'snapshot.timestamp must be a finite positive number',
      );
    }
  });

  test('rejects missing or empty models array', () => {
    const noModels = validateSnapshot({ id: 'x', timestamp: 1000 });
    expect(noModels.valid).toBe(false);
    expect(noModels.errors).toContain(
      'snapshot.models must be a non-empty array',
    );

    const emptyModels = validateSnapshot({
      id: 'x',
      timestamp: 1000,
      models: [],
    });
    expect(emptyModels.valid).toBe(false);
    expect(emptyModels.errors).toContain(
      'snapshot.models must be a non-empty array',
    );
  });

  test('validates individual model entries', () => {
    const result = validateSnapshot({
      id: 'x',
      timestamp: 1000,
      models: [
        null,
        { provider: 'p' },
        { id: 'ok', provider: 42 },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('snapshot.models[0] must be an object');
    expect(result.errors).toContain('snapshot.models[1] must have id or name');
    expect(result.errors).toContain(
      'snapshot.models[2].provider must be a string',
    );
  });
});

describe('normalizeSnapshot', () => {
  test('fills defaults for missing or invalid fields', () => {
    const before = Date.now();
    const normalized = normalizeSnapshot({
      models: [{ id: 'gpt-5' }],
    });
    const after = Date.now();

    expect(normalized).not.toBeNull();
    expect(normalized.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(normalized.timestamp).toBeGreaterThanOrEqual(before);
    expect(normalized.timestamp).toBeLessThanOrEqual(after);
    expect(normalized.provider).toBe('');
    expect(normalized.models).toEqual([{ id: 'gpt-5' }]);
    expect(normalized.rawPayloadHash).toBeUndefined();
    expect(normalized.metadata).toBeUndefined();
  });

  test('returns null for non-object input', () => {
    expect(normalizeSnapshot(null)).toBeNull();
    expect(normalizeSnapshot('invalid')).toBeNull();
    expect(normalizeSnapshot(undefined)).toBeNull();
    expect(normalizeSnapshot(42)).toBeNull();
  });
});
