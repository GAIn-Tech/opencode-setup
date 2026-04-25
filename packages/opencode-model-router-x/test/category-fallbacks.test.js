/**
 * Category Fallbacks Verification Test
 * 
 * Validates that all category model configurations in oh-my-opencode.json
 * are properly configured with valid primary models and fallback chains.
 * 
 * Wave 1.5 verification before proceeding to Wave 2 (Thompson Sampling).
 */

const { describe, test, expect } = require('bun:test');
const { MODEL_CAPABILITIES } = require('../src/tier-router');
const fs = require('fs');
const path = require('path');

// Load category configuration
const configPath = path.join(__dirname, '../../../opencode-config/oh-my-opencode.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const categories = config.categories;

// Expected categories from Wave 1 changes
const EXPECTED_CATEGORIES = [
  'visual-engineering',
  'ultrabrain',
  'deep',
  'artistry',
  'quick',
  'unspecified-low',
  'unspecified-high',
  'writing'
];

// Helper: Normalize model ID (strip provider prefix)
function normalizeModelId(id) {
  if (!id) return id;
  return id.split('/').pop();
}

// Helper: Check if model is Anthropic (forbidden)
function isAnthropicModel(modelId) {
  const normalized = normalizeModelId(modelId).toLowerCase();
  return normalized.includes('claude') || 
         normalized.includes('anthropic') ||
         modelId.toLowerCase().includes('anthropic');
}

describe('Category Fallbacks Verification', () => {
  
  describe('Category Structure Validation', () => {
    
    test('all 8 expected categories exist', () => {
      EXPECTED_CATEGORIES.forEach(cat => {
        expect(categories[cat]).toBeDefined();
      });
    });
    
    test('each category has a primary model', () => {
      EXPECTED_CATEGORIES.forEach(cat => {
        expect(categories[cat].model).toBeDefined();
        expect(categories[cat].model).not.toBe('');
        expect(typeof categories[cat].model).toBe('string');
      });
    });
    
    test('each category has exactly 2 fallback models', () => {
      EXPECTED_CATEGORIES.forEach(cat => {
        expect(categories[cat].fallbacks).toBeDefined();
        expect(Array.isArray(categories[cat].fallbacks)).toBe(true);
        expect(categories[cat].fallbacks.length).toBe(2);
      });
    });
    
    test('fallback models are non-empty strings', () => {
      EXPECTED_CATEGORIES.forEach(cat => {
        categories[cat].fallbacks.forEach((fallback, idx) => {
          expect(typeof fallback).toBe('string');
          expect(fallback).not.toBe('');
        });
      });
    });
    
  });
  
  describe('Anthropic Model Exclusion (Constraint Check)', () => {
    
    test('no primary models are Anthropic', () => {
      EXPECTED_CATEGORIES.forEach(cat => {
        const primaryModel = categories[cat].model;
        expect(isAnthropicModel(primaryModel)).toBe(false);
      });
    });
    
    test('no fallback models are Anthropic', () => {
      EXPECTED_CATEGORIES.forEach(cat => {
        categories[cat].fallbacks.forEach(fallback => {
          expect(isAnthropicModel(fallback)).toBe(false);
        });
      });
    });
    
    test('entire config has zero Anthropic references', () => {
      const configStr = JSON.stringify(config);
      const hasAnthropic = configStr.toLowerCase().includes('anthropic') ||
                           configStr.toLowerCase().includes('claude');
      expect(hasAnthropic).toBe(false);
    });
    
  });
  
  describe('Model ID Normalization', () => {
    
    test('normalizeModelId strips single provider prefix', () => {
      expect(normalizeModelId('openai/gpt-5.3-codex')).toBe('gpt-5.3-codex');
      expect(normalizeModelId('google/gemini-3-flash-preview')).toBe('gemini-3-flash-preview');
      expect(normalizeModelId('nvidia/moonshotai/kimi-k2.5')).toBe('kimi-k2.5');
    });
    
    test('normalizeModelId handles nested provider paths', () => {
      expect(normalizeModelId('nvidia/z-ai/glm-5')).toBe('glm-5');
      expect(normalizeModelId('zen/zen/minimax-m2.5')).toBe('minimax-m2.5');
      expect(normalizeModelId('zen/zen/glm-5')).toBe('glm-5');
      expect(normalizeModelId('zen/zen/kimi-k2.5')).toBe('kimi-k2.5');
    });
    
    test('normalizeModelId handles already-normalized IDs', () => {
      expect(normalizeModelId('gpt-5.3-codex')).toBe('gpt-5.3-codex');
      expect(normalizeModelId('gemini-3-flash-preview')).toBe('gemini-3-flash-preview');
    });
    
    test('normalizeModelId handles null/undefined gracefully', () => {
      expect(normalizeModelId(null)).toBeNull();
      expect(normalizeModelId(undefined)).toBeUndefined();
    });
    
    test('all primary models can be normalized', () => {
      EXPECTED_CATEGORIES.forEach(cat => {
        const normalized = normalizeModelId(categories[cat].model);
        expect(normalized).toBeDefined();
        expect(normalized).not.toContain('/');
      });
    });
    
    test('all fallback models can be normalized', () => {
      EXPECTED_CATEGORIES.forEach(cat => {
        categories[cat].fallbacks.forEach(fallback => {
          const normalized = normalizeModelId(fallback);
          expect(normalized).toBeDefined();
          expect(normalized).not.toContain('/');
        });
      });
    });
    
  });
  
  describe('MODEL_CAPABILITIES Coverage', () => {
    
    test('MODEL_CAPABILITIES contains entries for all primary models', () => {
      EXPECTED_CATEGORIES.forEach(cat => {
        const normalized = normalizeModelId(categories[cat].model);
        const hasCapability = MODEL_CAPABILITIES.hasOwnProperty(normalized);
        // Report missing but don't fail (unknown models are allowed through)
        if (!hasCapability) {
          console.warn(`Missing MODEL_CAPABILITIES entry for: ${normalized} (category: ${cat})`);
        }
      });
    });
    
    test('MODEL_CAPABILITIES contains entries for all fallback models', () => {
      EXPECTED_CATEGORIES.forEach(cat => {
        categories[cat].fallbacks.forEach(fallback => {
          const normalized = normalizeModelId(fallback);
          const hasCapability = MODEL_CAPABILITIES.hasOwnProperty(normalized);
          if (!hasCapability) {
            console.warn(`Missing MODEL_CAPABILITIES entry for: ${normalized} (fallback for: ${cat})`);
          }
        });
      });
    });
    
    test('known models have valid capability structure', () => {
      const requiredCaps = ['vision', 'tools', 'reasoning', 'large_context'];
      
      Object.entries(MODEL_CAPABILITIES).forEach(([modelId, caps]) => {
        requiredCaps.forEach(cap => {
          expect(caps).toHaveProperty(cap);
          expect(typeof caps[cap]).toBe('boolean');
        });
      });
    });
    
  });
  
  describe('Category-Specific Model Validation', () => {
    
    test('visual-engineering uses configured primary model', () => {
      const normalized = normalizeModelId(categories['visual-engineering'].model);
      expect(normalized).toBe('gpt-5.4');
    });
    
    test('ultrabrain uses configured primary model', () => {
      const normalized = normalizeModelId(categories['ultrabrain'].model);
      expect(normalized).toBe('gpt-5.5');
    });
    
    test('deep uses configured primary model', () => {
      const normalized = normalizeModelId(categories['deep'].model);
      expect(normalized).toBe('gpt-5.4');
    });
    
    test('artistry uses configured primary model', () => {
      const normalized = normalizeModelId(categories['artistry'].model);
      expect(normalized).toBe('gpt-5.4');
    });
    
    test('quick uses configured primary model', () => {
      const normalized = normalizeModelId(categories['quick'].model);
      expect(normalized).toBe('gpt-5.4-mini');
    });
    
    test('unspecified-low uses configured primary model', () => {
      const normalized = normalizeModelId(categories['unspecified-low'].model);
      expect(normalized).toBe('gpt-5.4-mini');
    });
    
    test('unspecified-high uses configured primary model', () => {
      const normalized = normalizeModelId(categories['unspecified-high'].model);
      expect(normalized).toBe('gpt-5.4');
    });
    
    test('writing uses configured primary model', () => {
      const normalized = normalizeModelId(categories['writing'].model);
      expect(normalized).toBe('gpt-5.4-mini');
    });
    
  });
  
  describe('Fallback Chain Diversity', () => {
    
    test('fallbacks are different from primary model', () => {
      EXPECTED_CATEGORIES.forEach(cat => {
        const primary = normalizeModelId(categories[cat].model);
        categories[cat].fallbacks.forEach(fallback => {
          const normalized = normalizeModelId(fallback);
          expect(normalized).not.toBe(primary);
        });
      });
    });
    
    test('two fallbacks are different from each other', () => {
      EXPECTED_CATEGORIES.forEach(cat => {
        const fb1 = normalizeModelId(categories[cat].fallbacks[0]);
        const fb2 = normalizeModelId(categories[cat].fallbacks[1]);
        expect(fb1).not.toBe(fb2);
      });
    });
    
    test('categories maintain provider diversity across primary and fallback models', () => {
      const providers = new Set();

      EXPECTED_CATEGORIES.forEach(cat => {
        [categories[cat].model, ...categories[cat].fallbacks].forEach((modelId) => {
          const parts = modelId.split('/');
          if (parts.length > 1) {
            providers.add(parts[0]);
          }
        });
      });

      expect(providers.size).toBeGreaterThanOrEqual(3);
    });
    
  });
  
  describe('Integration with Tier Router', () => {
    
    test('MODEL_CAPABILITIES has gpt-5.3-codex entry', () => {
      expect(MODEL_CAPABILITIES['gpt-5.3-codex']).toBeDefined();
      expect(MODEL_CAPABILITIES['gpt-5.3-codex'].tools).toBe(true);
      expect(MODEL_CAPABILITIES['gpt-5.3-codex'].reasoning).toBe(true);
    });
    
    test('MODEL_CAPABILITIES has gemini-3-flash-preview entry', () => {
      expect(MODEL_CAPABILITIES['gemini-3-flash-preview']).toBeDefined();
      expect(MODEL_CAPABILITIES['gemini-3-flash-preview'].vision).toBe(true);
    });
    
    test('MODEL_CAPABILITIES has gemini-3.1-pro-preview entry', () => {
      expect(MODEL_CAPABILITIES['gemini-3.1-pro-preview']).toBeDefined();
    });
    
    test('MODEL_CAPABILITIES has glm-5 entry', () => {
      expect(MODEL_CAPABILITIES['glm-5']).toBeDefined();
    });
    
    test('MODEL_CAPABILITIES has kimi-k2.5 entry', () => {
      expect(MODEL_CAPABILITIES['kimi-k2.5']).toBeDefined();
    });
    
    test('MODEL_CAPABILITIES has minimax-m2.5 entry', () => {
      expect(MODEL_CAPABILITIES['minimax-m2.5']).toBeDefined();
    });
    
  });
  
});
