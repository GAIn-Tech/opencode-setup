import { describe, expect, test } from 'bun:test';

import { applyCliOverrides, applyEnvironmentOverrides, mergeConfigs } from '../../src/config/merge';
import { createDefaultConfig } from '../../src/config/schema';

describe('config merge and overrides', () => {
  test('deep merges object values and replaces arrays', () => {
    const merged = mergeConfigs(
      {
        plugins: ['a', 'b'],
        context: {
          budget: {
            warning: 0.7
          }
        }
      },
      {
        plugins: ['override-only'],
        context: {
          budget: {
            critical: 0.9
          }
        }
      }
    );

    expect(merged.plugins).toEqual(['override-only']);
    expect((merged as { context: { budget: { warning: number } } }).context.budget.warning).toBe(0.7);
    expect((merged as { context: { budget: { critical: number } } }).context.budget.critical).toBe(0.9);
  });

  test('applies environment overrides from OPENCODE_ prefix', () => {
    const base = createDefaultConfig();
    const overridden = applyEnvironmentOverrides(base, {
      env: {
        OPENCODE_MODELS_DEFAULT: 'openai/gpt-5.3-codex',
        OPENCODE_CONTEXT_BUDGET_WARNING: '0.9',
        OPENCODE_PLUGINS: 'a,b,c'
      }
    });

    expect(overridden.models.default).toBe('openai/gpt-5.3-codex');
    expect(overridden.context.budget.warning).toBe(0.9);
    expect(overridden.plugins).toEqual(['a', 'b', 'c']);
  });

  test('applies cli overrides at highest precedence', () => {
    const base = createDefaultConfig();
    const merged = applyCliOverrides(base, {
      context: {
        budget: {
          warning: 0.88
        }
      }
    } as unknown as Partial<typeof base>);

    expect(merged.context.budget.warning).toBe(0.88);
  });
});
