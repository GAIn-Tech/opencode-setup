import { describe, test, expect } from 'bun:test';
import snapshotSchema from '../../src/snapshot/snapshot-schema.js';

const { validateSnapshot, normalizeSnapshot } = snapshotSchema;

describe('snapshot-schema', () => {
  test('validateSnapshot passes valid snapshots', () => {
    const result = validateSnapshot({
      id: 'snap-1',
      timestamp: Date.now(),
      provider: 'openai',
      models: [
        { id: 'gpt-5', provider: 'openai' },
        { name: 'gpt-5-mini', provider: 'openai' }
      ]
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  test('validateSnapshot fails invalid snapshots', () => {
    const result = validateSnapshot({
      id: '',
      timestamp: 0,
      provider: '',
      models: [{ id: '', provider: '' }, null]
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('snapshot.id is required');
    expect(result.errors).toContain('snapshot.timestamp must be a valid epoch ms value');
    expect(result.errors).toContain('snapshot.models[0] missing id/name');
    expect(result.errors).toContain('snapshot.models[0] missing provider');
    expect(result.errors).toContain('snapshot.models[1] must be an object');
  });

  test('normalizeSnapshot fills defaults and normalizes metadata', () => {
    const before = Date.now();
    const normalized = normalizeSnapshot({
      timestamp: 'invalid',
      models: [{ id: 'gpt-5' }],
      metadata: {
        discoveryDuration: -1,
        modelCount: 3.9
      }
    });
    const after = Date.now();

    expect(normalized).not.toBeNull();
    expect(normalized.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(normalized.timestamp).toBeGreaterThanOrEqual(before);
    expect(normalized.timestamp).toBeLessThanOrEqual(after);
    expect(normalized.provider).toBe('');
    expect(normalized.models).toEqual([{ id: 'gpt-5' }]);
    expect(normalized.rawPayloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(normalized.metadata).toEqual({
      discoveryDuration: 0,
      modelCount: 3
    });
  });

  test('normalizeSnapshot returns null for non-object input', () => {
    expect(normalizeSnapshot(null)).toBeNull();
    expect(normalizeSnapshot('invalid')).toBeNull();
  });
});
