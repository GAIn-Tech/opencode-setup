import { test, expect } from 'bun:test';
import { PreloadSkillsPlugin } from '../src/index.js';

test('selectTools reports concrete tier0Count metadata', () => {
  const plugin = new PreloadSkillsPlugin();

  plugin._initialized = true;
  plugin.tierResolver = {
    getTier0: () => ({
      tools: ['bash'],
      skills: ['context7'],
      mcps: ['websearch'],
    }),
    matchTier1: () => ({ tools: [], skills: [], mcps: [], categories: [] }),
    getTier2Brief: () => [],
  };

  const result = plugin.selectTools({ prompt: 'run a quick check' });

  expect(result.metadata.tier0Count).toBeGreaterThan(0);
  expect(Number.isFinite(result.metadata.tier0Count)).toBe(true);
});
