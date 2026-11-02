import { describe, expect, test } from 'bun:test';
import { PreloadSkillsPlugin } from '../src/index.js';

function select(prompt) {
  const plugin = new PreloadSkillsPlugin({ logLevel: 'error' });
  return plugin.selectTools({ prompt }).tools.map((tool) => tool.name);
}

describe('PreloadSkillsPlugin routing seeds', () => {
  test('library/API prompt implicitly surfaces context7', () => {
    const names = select('What is the correct syntax for using the React useEffect API?');
    expect(names).toContain('context7_query_docs');
  });

  test('compression prompt implicitly surfaces distill', () => {
    const names = select('Compress context because the conversation is too long and we need more budget');
    expect(names).toContain('distill_run_tool');
  });

  test('budget-management prompt implicitly surfaces context-governor and distill', () => {
    const names = select('Check the context budget and compress if we are near the token limit');
    expect(names).toContain('context-governor');
    expect(names).toContain('distill_run_tool');
  });

  test('memory prompt implicitly surfaces supermemory', () => {
    const names = select('Remember this design choice and recall it the next time we revisit this project');
    expect(names).toContain('supermemory_search');
    expect(names).toContain('supermemory_add');
  });

  test('codebase audit prompt implicitly surfaces codebase-auditor', () => {
    const names = select('Do a codebase audit and tell me what is disconnected or incomplete');
    expect(names).toContain('codebase-auditor');
  });

  test('incident prompt implicitly surfaces incident-commander', () => {
    const names = select('We have an incident with a critical failure and need a triage commander');
    expect(names).toContain('incident-commander');
  });

  test('evaluation prompt implicitly surfaces evaluation-harness-builder', () => {
    const names = select('Build a regression test harness and evaluation framework for this feature');
    expect(names).toContain('evaluation-harness-builder');
  });

  test('innovation prompt implicitly surfaces innovation-migration-planner', () => {
    const names = select('Identify high-upside migration ideas and plan the innovation rollout');
    expect(names).toContain('innovation-migration-planner');
  });

  test('research prompt surfaces search skills alongside external lookup MCPs', () => {
    const names = select('Search the web for code examples and library reference docs for this package');
    expect(names).toContain('context7_query_docs');
    expect(names).toContain('websearch_search');
    expect(names).toContain('grep_grep_query');
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
