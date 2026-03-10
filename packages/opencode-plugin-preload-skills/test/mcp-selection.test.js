import { describe, expect, test } from 'bun:test';
import { PreloadSkillsPlugin } from '../src/index.js';

describe('PreloadSkillsPlugin MCP selection', () => {
  test('includes tier-1 MCP matches in selected tools for browser tasks', () => {
    const plugin = new PreloadSkillsPlugin({ logLevel: 'error' });
    const result = plugin.selectTools({ prompt: 'take a screenshot of this page with browser automation' });
    const names = result.tools.map((tool) => tool.name);

    expect(names).toContain('playwright');
    expect(names).toContain('websearch');
  });

  test('includes tier-0 MCPs in selected tools', () => {
    const plugin = new PreloadSkillsPlugin({ logLevel: 'error' });
    const result = plugin.selectTools({ prompt: 'hello' });
    const names = result.tools.map((tool) => tool.name);

    expect(names).toContain('distill');
  });
});
