import { describe, expect, test } from 'bun:test';
import { PreloadSkillsPlugin } from '../src/index.js';

describe('PreloadSkillsPlugin MCP selection', () => {
  test('includes tier-1 MCP matches in selected tools for browser tasks', () => {
    const plugin = new PreloadSkillsPlugin({ logLevel: 'error' });
    const result = plugin.selectTools({ prompt: 'take a screenshot of this page with browser automation' });
    const names = result.tools.map((tool) => tool.name);

    expect(names).toContain('playwright');
    expect(names).toContain('websearch_search');
  });

  test('includes tier-0 MCPs in selected tools', () => {
    const plugin = new PreloadSkillsPlugin({ logLevel: 'error' });
    const result = plugin.selectTools({ prompt: 'hello' });
    const names = result.tools.map((tool) => tool.name);

    expect(names).toContain('distill_browse_tools');
    expect(names).toContain('distill_run_tool');
  });

  test('expands memory and context budget surfaces into callable runtime entrypoints', () => {
    const plugin = new PreloadSkillsPlugin({ logLevel: 'error' });
    const result = plugin.selectTools({
      prompt: 'Remember this decision, recall it later, and check the context budget before the next long step',
    });
    const names = result.tools.map((tool) => tool.name);

    expect(names).toContain('supermemory_search');
    expect(names).toContain('supermemory_add');
    expect(names).toContain('checkContextBudget');
    expect(names).toContain('getContextBudgetStatus');
    expect(names).toContain('recordTokenUsage');
  });
});
