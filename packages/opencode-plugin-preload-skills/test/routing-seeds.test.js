import { describe, expect, test } from 'bun:test';
import { PreloadSkillsPlugin } from '../src/index.js';

function select(prompt) {
  const plugin = new PreloadSkillsPlugin({ logLevel: 'error' });
  return plugin.selectTools({ prompt }).tools.map((tool) => tool.name);
}

describe('PreloadSkillsPlugin routing seeds', () => {
  test('library/API prompt implicitly surfaces context7', () => {
    const names = select('What is the correct syntax for using the React useEffect API?');
    expect(names).toContain('context7');
  });

  test('compression prompt implicitly surfaces distill', () => {
    const names = select('Compress context because the conversation is too long and we need more budget');
    expect(names).toContain('distill');
  });

  test('codebase audit prompt implicitly surfaces codebase-auditor', () => {
    const names = select('Do a codebase audit and tell me what is disconnected or incomplete');
    expect(names).toContain('codebase-auditor');
  });

  test('git workflow prompt implicitly surfaces git-master', () => {
    const names = select('Help me rebase this branch and clean up the commit history');
    expect(names).toContain('git-master');
  });

  test('browser verification prompt surfaces direct playwright path', () => {
    const names = select('Open the page, click through the UI, and take a screenshot');
    expect(names).toContain('playwright');
  });
});
