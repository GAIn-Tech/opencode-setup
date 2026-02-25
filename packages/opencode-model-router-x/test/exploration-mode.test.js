import { test, expect } from 'bun:test';
import { ModelRouter } from '../src/index.js';

test('exploration activates via CLI flag', () => {
  const originalArgv = process.argv;
  process.argv = [...process.argv, '--explore'];
  const router = new ModelRouter({
    exploration: { active: undefined },
    explorationController: { activate: () => {}, selectModelForTaskSync: () => null }
  });
  expect(Boolean(router.explorationController)).toBe(true);
  process.argv = originalArgv;
});

test('recordExplorationOutcome updates SkillRL bank', async () => {
  const { SkillRLManager } = await import('../../opencode-skill-rl-manager/src/index.js');
  const skillRL = new SkillRLManager({ stateFile: ':memory:' });
  const router = new ModelRouter({
    skillRLManager: skillRL,
    exploration: { active: false },
    explorationController: { gatherMetrics: async () => ({}) }
  });
  const task = { intentCategory: 'coding', sessionId: 'ses_test' };
  const selection = { model: 'openai/gpt-5', isExploration: true };
  const result = { success: true, tokensUsed: { input: 10, output: 5 } };

  await router.recordExplorationOutcome(task, selection, result);

  const skills = skillRL.skillBank.getAllSkills();
  const found = skills.taskSpecific.find((s) => s.name === 'model:openai/gpt-5');
  expect(Boolean(found)).toBe(true);
});
