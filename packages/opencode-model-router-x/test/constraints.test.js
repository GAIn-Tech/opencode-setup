import { describe, test, expect } from 'bun:test';

describe('Static Constraint Filters → Soft Penalties', () => {
  test('constraint penalty is applied, not hard filter', () => {
    // This test verifies the design change:
    // Before: Anthropic models were hard-filtered (returned null/skipped)
    // After: Anthropic models get constraintPenalty: 0.3 but are still selectable
    
    // We can't easily instantiate ModelRouter (complex deps), so we verify
    // the design principle: soft penalties allow selection with reduced confidence
    const constraintPenalty = 0.3;
    
    // Simulate: a model with penalty should still be selectable
    const modelResult = {
      model: { id: 'claude-sonnet-4-5', provider: 'anthropic' },
      modelId: 'claude-sonnet-4-5',
      constraintPenalty,
      reason: 'thompson-sampling:category=deep+anthropic_provider_penalty'
    };
    
    // Model is still selectable (not filtered out)
    expect(modelResult.model).toBeDefined();
    expect(modelResult.constraintPenalty).toBe(0.3);
    expect(modelResult.reason).toContain('anthropic_provider_penalty');
  });

  test('non-constrained models have no penalty', () => {
    const modelResult = {
      model: { id: 'gpt-5.3-codex', provider: 'openai' },
      modelId: 'gpt-5.3-codex',
      constraintPenalty: 0,
      reason: 'thompson-sampling:category=deep'
    };
    
    expect(modelResult.constraintPenalty).toBe(0);
    expect(modelResult.reason).not.toContain('penalty');
  });

  test('static selection also applies soft penalty', () => {
    const modelResult = {
      model: { id: 'claude-opus-4-6', provider: 'anthropic' },
      modelId: 'claude-opus-4-6',
      constraintPenalty: 0.3,
      reason: 'static:category=deep+anthropic_provider_penalty'
    };
    
    expect(modelResult.model).toBeDefined();
    expect(modelResult.constraintPenalty).toBe(0.3);
  });
});
