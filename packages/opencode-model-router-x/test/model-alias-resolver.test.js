const { describe, test, expect } = require('bun:test');
const { resolveModelAlias, hasAlias, getAliasesFor, MODEL_ALIASES } = require('../src/model-alias-resolver');

describe('Model Alias Resolver', () => {
  describe('resolveModelAlias', () => {
    test('redirects raw Gemini to antigravity', () => {
      expect(resolveModelAlias('google/gemini-3-pro')).toBe('antigravity/antigravity-gemini-3-pro');
      expect(resolveModelAlias('google/gemini-3-flash')).toBe('antigravity/antigravity-gemini-3-flash');
      expect(resolveModelAlias('google/gemini-3-flash-8b')).toBe('antigravity/antigravity-gemini-3-flash-8b');
    });

    test('redirects shorthand Gemini to antigravity', () => {
      expect(resolveModelAlias('gemini-3-pro')).toBe('antigravity/antigravity-gemini-3-pro');
      expect(resolveModelAlias('gemini-3-flash')).toBe('antigravity/antigravity-gemini-3-flash');
    });

    test('redirects legacy Gemini versions', () => {
      expect(resolveModelAlias('gemini-2.5-pro')).toBe('antigravity/antigravity-gemini-3-pro');
      expect(resolveModelAlias('gemini-2.5-flash')).toBe('antigravity/antigravity-gemini-3-flash');
    });

    test('passes through non-aliased models', () => {
      expect(resolveModelAlias('anthropic/claude-opus-4-6')).toBe('anthropic/claude-opus-4-6');
      expect(resolveModelAlias('anthropic/claude-sonnet-4-5')).toBe('anthropic/claude-sonnet-4-5');
      expect(resolveModelAlias('openai/gpt-5.2')).toBe('openai/gpt-5.2');
    });

    test('passes through antigravity models unchanged', () => {
      expect(resolveModelAlias('antigravity/antigravity-gemini-3-pro')).toBe('antigravity/antigravity-gemini-3-pro');
      expect(resolveModelAlias('antigravity/antigravity-gemini-3-flash')).toBe('antigravity/antigravity-gemini-3-flash');
    });

    test('handles undefined/null gracefully', () => {
      expect(resolveModelAlias(undefined)).toBe(undefined);
      expect(resolveModelAlias(null)).toBe(null);
    });

    test('handles empty string', () => {
      expect(resolveModelAlias('')).toBe('');
    });
  });

  describe('hasAlias', () => {
    test('returns true for aliased models', () => {
      expect(hasAlias('google/gemini-3-pro')).toBe(true);
      expect(hasAlias('gemini-3-flash')).toBe(true);
    });

    test('returns false for non-aliased models', () => {
      expect(hasAlias('anthropic/claude-opus-4-6')).toBe(false);
      expect(hasAlias('antigravity/antigravity-gemini-3-pro')).toBe(false);
    });
  });

  describe('getAliasesFor', () => {
    test('returns all aliases pointing to a target', () => {
      const aliases = getAliasesFor('antigravity/antigravity-gemini-3-pro');
      expect(aliases).toContain('google/gemini-3-pro');
      expect(aliases).toContain('gemini-3-pro');
      expect(aliases).toContain('gemini-2.5-pro');
    });

    test('returns empty array for non-target models', () => {
      const aliases = getAliasesFor('anthropic/claude-opus-4-6');
      expect(aliases).toEqual([]);
    });
  });

  describe('MODEL_ALIASES', () => {
    test('contains expected alias mappings', () => {
      expect(MODEL_ALIASES['google/gemini-3-pro']).toBe('antigravity/antigravity-gemini-3-pro');
      expect(MODEL_ALIASES['google/gemini-3-flash']).toBe('antigravity/antigravity-gemini-3-flash');
    });
  });
});
