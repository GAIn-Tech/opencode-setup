import { describe, expect, test } from 'bun:test';

import { UnifiedConfigSchema, createDefaultConfig } from '../../src/config/schema';
import { ConfigValidationError, validateConfig } from '../../src/config/validation';

describe('config schema and validation', () => {
  test('creates defaults for missing fields', () => {
    const config = createDefaultConfig();

    expect(config.version).toBe('2.0');
    expect(config.context.budget.warning).toBe(0.75);
    expect(config.context.compression.threshold).toBe(0.65);
    expect(config.plugins).toEqual([]);
  });

  test('validates known fields while preserving unknown keys', () => {
    const parsed = UnifiedConfigSchema.parse({
      version: '2.0',
      custom: {
        keep: true
      }
    });

    expect(parsed.custom).toEqual({ keep: true });
  });

  test('throws ConfigValidationError for invalid thresholds', () => {
    expect(() =>
      validateConfig({
        context: {
          budget: {
            warning: 1.25
          }
        }
      })
    ).toThrow(ConfigValidationError);
  });
});
