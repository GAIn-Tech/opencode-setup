import { describe, expect, test } from 'bun:test';
import { normalizeIndexForComparison, prepareOutputIndex } from '../synthesize-meta-kb.mjs';

describe('synthesize-meta-kb stability', () => {
  test('normalizes away generated_at for semantic comparison', () => {
    const normalized = normalizeIndexForComparison({
      generated_at: '2026-03-12T14:20:01.640Z',
      schema_version: 1,
      total_records: 2,
      by_category: { uncategorized: [] },
    });

    expect(normalized).toEqual({
      schema_version: 1,
      total_records: 2,
      by_category: { uncategorized: [] },
    });
  });

  test('preserves previous generated_at when content is unchanged', () => {
    const existingIndex = {
      generated_at: '2026-03-12T14:19:30.965Z',
      schema_version: 1,
      total_records: 284,
      by_category: {
        uncategorized: [{ id: 'alpha' }],
      },
    };
    const nextIndex = {
      generated_at: '2026-03-12T14:20:01.640Z',
      schema_version: 1,
      total_records: 284,
      by_category: {
        uncategorized: [{ id: 'alpha' }],
      },
    };

  const result = prepareOutputIndex(nextIndex, existingIndex);
  // Changed is always true so mtime reflects latest run (avoids false staleness warnings)
  expect(result.changed).toBe(true);
  // generated_at should be freshened to the new timestamp
  expect(result.index.generated_at).toBe(nextIndex.generated_at);
});

  test('uses new generated_at when semantic content changed', () => {
    const existingIndex = {
      generated_at: '2026-03-12T14:19:30.965Z',
      schema_version: 1,
      total_records: 284,
      by_category: {
        uncategorized: [{ id: 'alpha' }],
      },
    };
    const nextIndex = {
      generated_at: '2026-03-12T14:20:01.640Z',
      schema_version: 1,
      total_records: 285,
      by_category: {
        uncategorized: [{ id: 'alpha' }, { id: 'beta' }],
      },
    };

    const result = prepareOutputIndex(nextIndex, existingIndex);
    expect(result.changed).toBe(true);
    expect(result.index.generated_at).toBe(nextIndex.generated_at);
  });
});
