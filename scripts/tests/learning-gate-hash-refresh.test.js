import { describe, expect, test } from 'bun:test';
import { normalizeHashesPayload, prepareHashesOutput } from '../learning-gate.mjs';

describe('learning-gate hash refresh stability', () => {
  test('normalizes away generated_at for semantic comparison', () => {
    const normalized = normalizeHashesPayload({
      version: 1,
      generated_at: '2026-03-12T22:36:59.589Z',
      files: {
        'opencode-config/meta-knowledge-index.json': 'abc123',
      },
    });

    expect(normalized).toEqual({
      version: 1,
      files: {
        'opencode-config/meta-knowledge-index.json': 'abc123',
      },
    });
  });

  test('preserves previous generated_at when hashes are unchanged', () => {
    const existing = {
      version: 1,
      generated_at: '2026-03-12T22:36:59.589Z',
      files: {
        'opencode-config/meta-knowledge-index.json': 'abc123',
      },
    };
    const next = {
      version: 1,
      generated_at: '2026-03-12T22:40:00.000Z',
      files: {
        'opencode-config/meta-knowledge-index.json': 'abc123',
      },
    };

    const result = prepareHashesOutput(next, existing);
    expect(result.changed).toBe(false);
    expect(result.payload.generated_at).toBe(existing.generated_at);
  });

  test('uses new generated_at when governed hashes change', () => {
    const existing = {
      version: 1,
      generated_at: '2026-03-12T22:36:59.589Z',
      files: {
        'opencode-config/meta-knowledge-index.json': 'abc123',
      },
    };
    const next = {
      version: 1,
      generated_at: '2026-03-12T22:40:00.000Z',
      files: {
        'opencode-config/meta-knowledge-index.json': 'def456',
      },
    };

    const result = prepareHashesOutput(next, existing);
    expect(result.changed).toBe(true);
    expect(result.payload.generated_at).toBe(next.generated_at);
  });
});
