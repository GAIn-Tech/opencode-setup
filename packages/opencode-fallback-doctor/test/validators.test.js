import { test, expect } from 'bun:test';

const { validateModelName, validateModelExists, VALID_PROVIDERS } = require('../src/validators');

test('accepts extended providers used by fallback templates', () => {
  expect(validateModelName('zen/glm-5').valid).toBe(true);
  expect(validateModelName('nvidia/deepseek-ai-deepseek-v3.2').valid).toBe(true);
  expect(validateModelName('moonshotai/kimi-k2.5').valid).toBe(true);
  expect(validateModelName('z-ai/glm-5').valid).toBe(true);
  expect(VALID_PROVIDERS.has('zen')).toBe(true);
  expect(VALID_PROVIDERS.has('nvidia')).toBe(true);
});

test('recognizes known model ids that caused false-positive warnings', () => {
  expect(validateModelExists('anthropic/claude-sonnet-4-6').valid).toBe(true);
  expect(validateModelExists('google/antigravity-gemini-3-flash-8b').valid).toBe(true);
  expect(validateModelExists('zen/kimi-k2.5-pro').valid).toBe(true);
  expect(validateModelExists('z-ai/glm-5').valid).toBe(true);
});
