'use strict';

const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const { SkillRLManager } = require('../src/index');

/**
 * Exploration Policy Tests
 *
 * Covers greedy (default), epsilon-greedy, and UCB modes
 * controlled via OPENCODE_EXPLORATION_MODE / OPENCODE_EPSILON.
 */

describe('Exploration Policy', () => {
  let savedMode;
  let savedEpsilon;

  beforeEach(() => {
    savedMode = process.env.OPENCODE_EXPLORATION_MODE;
    savedEpsilon = process.env.OPENCODE_EPSILON;
  });

  afterEach(() => {
    // Restore env
    if (savedMode === undefined) delete process.env.OPENCODE_EXPLORATION_MODE;
    else process.env.OPENCODE_EXPLORATION_MODE = savedMode;
    if (savedEpsilon === undefined) delete process.env.OPENCODE_EPSILON;
    else process.env.OPENCODE_EPSILON = savedEpsilon;
  });

  // ── Greedy (default) ────────────────────────────────────────────────

  describe('greedy mode (default)', () => {
    test('returns same skills as querySkills when mode is unset', () => {
      delete process.env.OPENCODE_EXPLORATION_MODE;
      const manager = new SkillRLManager({ stateFile: null });

      const ctx = { task_type: 'debug', description: 'fix a bug' };
      const expected = manager.skillBank.querySkills(ctx).map(s => s.name);
      // Reset usage counts bumped by querySkills (selectSkills records usage too)
      manager.skillBank.generalSkills.forEach(s => { s.usage_count = 0; });

      const result = manager.selectSkills(ctx);
      expect(result.map(s => s.name)).toEqual(expected);
    });

    test('returns same skills as querySkills when mode is "greedy"', () => {
      process.env.OPENCODE_EXPLORATION_MODE = 'greedy';
      const manager = new SkillRLManager({ stateFile: null });

      const ctx = { task_type: 'debug', description: 'fix a bug' };
      const expected = manager.skillBank.querySkills(ctx).map(s => s.name);
      manager.skillBank.generalSkills.forEach(s => { s.usage_count = 0; });

      const result = manager.selectSkills(ctx);
      expect(result.map(s => s.name)).toEqual(expected);
    });
  });

  // ── Epsilon-Greedy ──────────────────────────────────────────────────

  describe('epsilon-greedy mode', () => {
    test('with epsilon=1, always injects a random skill', () => {
      process.env.OPENCODE_EXPLORATION_MODE = 'epsilon-greedy';
      process.env.OPENCODE_EPSILON = '1.0';
      const manager = new SkillRLManager({ stateFile: null });

      // Add an extra skill that won't normally be selected
      manager.skillBank.addGeneralSkill({
        name: 'rare-explorer-skill',
        principle: 'Explore rarely used paths',
        application_context: 'never matches naturally',
        success_rate: 0.1,
        usage_count: 0,
        tags: ['exploration-test'],
      });

      const ctx = { task_type: 'debug', description: 'fix a bug' };
      // Run multiple times — with epsilon=1 we should see the injected skill at least once
      const allResults = [];
      for (let i = 0; i < 20; i++) {
        // Reset usage counts each iteration
        manager.skillBank.generalSkills.forEach(s => { s.usage_count = 0; });
        const result = manager.selectSkills(ctx);
        allResults.push(...result.map(s => s.name));
      }

      // The greedy result would never include rare-explorer-skill (success_rate 0.1)
      // but with epsilon=1 we always explore, so it should appear at least once
      const greedyNames = manager.skillBank.querySkills(ctx).map(s => s.name);
      // Verify at least one result differs from pure greedy
      const nonGreedyNames = allResults.filter(n => !greedyNames.includes(n));
      expect(nonGreedyNames.length).toBeGreaterThan(0);
    });

    test('with epsilon=0, never explores (always exploit)', () => {
      process.env.OPENCODE_EXPLORATION_MODE = 'epsilon-greedy';
      process.env.OPENCODE_EPSILON = '0';
      const manager = new SkillRLManager({ stateFile: null });

      manager.skillBank.addGeneralSkill({
        name: 'never-seen-skill',
        principle: 'Should never appear',
        application_context: 'zzzz',
        success_rate: 0.01,
        usage_count: 0,
        tags: [],
      });

      const ctx = { task_type: 'debug', description: 'fix a bug' };
      const greedyResult = manager.skillBank.querySkills(ctx).map(s => s.name);
      manager.skillBank.generalSkills.forEach(s => { s.usage_count = 0; });

      // Run 50 times — should always match greedy
      for (let i = 0; i < 50; i++) {
        manager.skillBank.generalSkills.forEach(s => { s.usage_count = 0; });
        const result = manager.selectSkills(ctx);
        expect(result.map(s => s.name)).toEqual(greedyResult);
      }
    });

    test('injects a random skill when Math.random < epsilon', () => {
      process.env.OPENCODE_EXPLORATION_MODE = 'epsilon-greedy';
      process.env.OPENCODE_EPSILON = '0.5';
      const manager = new SkillRLManager({ stateFile: null });

      // Force exploration by stubbing Math.random
      const origRandom = Math.random;
      try {
        Math.random = () => 0.1; // always < 0.5
        const ctx = { task_type: 'debug', description: 'fix a bug' };
        const greedyResult = manager.skillBank.querySkills(ctx).map(s => s.name);
        manager.skillBank.generalSkills.forEach(s => { s.usage_count = 0; });

        // Add candidate that won't be in greedy set
        manager.skillBank.addGeneralSkill({
          name: 'stub-injected',
          principle: 'injected by stub',
          application_context: 'xyz',
          success_rate: 0.01,
          usage_count: 0,
          tags: [],
        });

        const result = manager.selectSkills(ctx);
        const resultNames = result.map(s => s.name);

        // The last element should be replaced with a non-greedy skill
        // (could be stub-injected or another skill not in greedy set)
        const lastSkill = resultNames[resultNames.length - 1];
        // If there are candidates outside greedy set, last skill should differ
        // from what greedy would have put there
        const greedyLast = greedyResult[greedyResult.length - 1];
        expect(lastSkill).not.toBe(greedyLast);
      } finally {
        Math.random = origRandom;
      }
    });
  });

  // ── UCB ─────────────────────────────────────────────────────────────

  describe('UCB mode', () => {
    test('reranks skills by UCB score, favouring low-usage skills', () => {
      process.env.OPENCODE_EXPLORATION_MODE = 'ucb';
      const manager = new SkillRLManager({ stateFile: null });

      // Clear and add controlled set so querySkills returns exactly these
      manager.skillBank.generalSkills.clear();
      manager.skillBank._invalidateCache();

      manager.skillBank.addGeneralSkill({
        name: 'high-usage-a',
        principle: 'heavily used',
        application_context: 'debugging errors',
        success_rate: 0.85,
        usage_count: 100,
        tags: ['debug'],
      });
      manager.skillBank.addGeneralSkill({
        name: 'high-usage-b',
        principle: 'heavily used',
        application_context: 'debugging errors',
        success_rate: 0.80,
        usage_count: 100,
        tags: ['debug'],
      });
      manager.skillBank.addGeneralSkill({
        name: 'low-usage-explorer',
        principle: 'rarely used',
        application_context: 'debugging errors',
        success_rate: 0.70,
        usage_count: 0,
        tags: ['debug'],
      });

      const ctx = { task_type: 'debug', description: 'fix a bug' };
      const result = manager.selectSkills(ctx);

      // UCB bonus for low-usage skill should be much higher
      // totalUsage = 100 + 100 + 0 = 200
      const totalUsage = 200;
      const ucbLow = 0.70 + Math.sqrt(2 * Math.log(totalUsage + 1) / (0 + 1));
      const ucbHigh = 0.85 + Math.sqrt(2 * Math.log(totalUsage + 1) / (100 + 1));

      // Verify UCB formula makes low-usage skill competitive
      expect(ucbLow).toBeGreaterThan(ucbHigh);

      // low-usage-explorer should be ranked first by UCB
      expect(result[0].name).toBe('low-usage-explorer');
    });

    test('UCB score matches expected formula', () => {
      process.env.OPENCODE_EXPLORATION_MODE = 'ucb';
      const manager = new SkillRLManager({ stateFile: null });

      // Clear and add exactly 2 skills for precise control
      manager.skillBank.generalSkills.clear();
      manager.skillBank._invalidateCache();

      manager.skillBank.addGeneralSkill({
        name: 'skill-a',
        principle: 'test',
        application_context: 'always',
        success_rate: 0.9,
        usage_count: 50,
        tags: ['debug'],
      });
      manager.skillBank.addGeneralSkill({
        name: 'skill-b',
        principle: 'test',
        application_context: 'always',
        success_rate: 0.5,
        usage_count: 1,
        tags: ['debug'],
      });

      const ctx = { task_type: 'debug', description: 'fix a bug' };
      const result = manager.selectSkills(ctx);

      // totalUsage = 50 + 1 = 51
      const totalUsage = 51;
      const ucbA = 0.9 + Math.sqrt(2 * Math.log(totalUsage + 1) / (50 + 1));
      const ucbB = 0.5 + Math.sqrt(2 * Math.log(totalUsage + 1) / (1 + 1));

      // skill-b should rank higher due to UCB exploration bonus
      expect(ucbB).toBeGreaterThan(ucbA);
      expect(result[0].name).toBe('skill-b');
      expect(result[1].name).toBe('skill-a');
    });
  });

  // ── Constructor env parsing ─────────────────────────────────────────

  describe('constructor env parsing', () => {
    test('defaults to greedy mode when env unset', () => {
      delete process.env.OPENCODE_EXPLORATION_MODE;
      const manager = new SkillRLManager({ stateFile: null });
      expect(manager.explorationMode).toBe('greedy');
    });

    test('reads OPENCODE_EXPLORATION_MODE from env', () => {
      process.env.OPENCODE_EXPLORATION_MODE = 'ucb';
      const manager = new SkillRLManager({ stateFile: null });
      expect(manager.explorationMode).toBe('ucb');
    });

    test('defaults epsilon to 0.1', () => {
      delete process.env.OPENCODE_EPSILON;
      const manager = new SkillRLManager({ stateFile: null });
      expect(manager.epsilon).toBeCloseTo(0.1);
    });

    test('clamps epsilon to [0, 1]', () => {
      process.env.OPENCODE_EPSILON = '5.0';
      let manager = new SkillRLManager({ stateFile: null });
      expect(manager.epsilon).toBe(1);

      process.env.OPENCODE_EPSILON = '-2.0';
      manager = new SkillRLManager({ stateFile: null });
      expect(manager.epsilon).toBe(0);
    });

    test('parses epsilon from string', () => {
      process.env.OPENCODE_EPSILON = '0.42';
      const manager = new SkillRLManager({ stateFile: null });
      expect(manager.epsilon).toBeCloseTo(0.42);
    });
  });
});
