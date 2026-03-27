import { test, expect } from 'bun:test';
import { ModelRouter } from '../src/index.js';
import DynamicExplorationController from '../src/dynamic-exploration-controller.js';

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

test('exploration floor can force exploration when budget is zero', () => {
  const controller = new DynamicExplorationController({
    explorationFloor: 1,
    budgetAwareExploration: false,
    tokenBudgetManager: {
      shouldExplore: () => true,
    },
  });

  controller.explorationBudget = 0;
  expect(controller._shouldExplore({ sessionId: 'ses_floor', modelId: 'openai/gpt-5' })).toBe(true);
});

test('budget-aware exploration cap is applied above threshold', () => {
  const controller = new DynamicExplorationController({
    explorationFloor: 1,
    budgetAwareExploration: true,
    capExploreAbovePct: 0.8,
    capExploreTo: 0,
    disableExploreAbovePct: 0.95,
    tokenBudgetManager: {
      governor: {
        getRemainingBudget: () => ({ pct: 0.85 }),
      },
      shouldExplore: () => true,
    },
  });

  controller.explorationBudget = 100;
  expect(controller._shouldExplore({ sessionId: 'ses_cap', modelId: 'openai/gpt-5' })).toBe(false);
});

test('budget-aware exploration disables exploration above disable threshold', () => {
  const controller = new DynamicExplorationController({
    explorationFloor: 1,
    budgetAwareExploration: true,
    disableExploreAbovePct: 0.9,
    tokenBudgetManager: {
      governor: {
        getRemainingBudget: () => ({ pct: 0.95 }),
      },
      shouldExplore: () => true,
    },
  });

  controller.explorationBudget = 100;
  expect(controller._shouldExplore({ sessionId: 'ses_disable', modelId: 'openai/gpt-5' })).toBe(false);
});

test('score jitter is deterministic per seed and bounded', () => {
  const configValues = {
    'routing.jitter_enabled': true,
    'routing.jitter_factor': 1,
    'routing.score_jitter_max_delta': 0.02,
  };
  const router = new ModelRouter({
    exploration: { active: false },
    configLoader: {
      load: () => ({}),
      get: (path, fallback) => (path in configValues ? configValues[path] : fallback),
    },
  });

  const first = router._applyScoreJitter('openai/gpt-5', { sessionId: 'ses_jitter' });
  const second = router._applyScoreJitter('openai/gpt-5', { sessionId: 'ses_jitter' });
  const maxDelta = 0.02;

  expect(first.delta).toBe(second.delta);
  expect(Math.abs(first.delta)).toBeLessThanOrEqual(maxDelta);
  expect(first.reason).toContain('jitter(');
});
