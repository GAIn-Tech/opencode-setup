/**
 * Tests for tool_affinities tracking in SkillRLManager.learnFromOutcome()
 *
 * Verifies that calling learnFromOutcome({ mcpToolsUsed: [...] }) increments
 * tool_affinities counts on the relevant skill in the skill bank.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { SkillRLManager } from '../src/index.js';

describe('tool_affinities tracking', () => {
  let manager;

  beforeEach(() => {
    // stateFile: null avoids disk reads/writes during tests
    manager = new SkillRLManager({ stateFile: null });
  });

  test('learnFromOutcome with mcpToolsUsed sets tool_affinities on skill', () => {
    const skillName = [...manager.skillBank.generalSkills.keys()][0];

    manager.learnFromOutcome({
      success: true,
      skill_used: skillName,
      mcpToolsUsed: ['context7_resolve_library_id'],
      task_type: 'research',
    });

    const skill = manager.skillBank.generalSkills.get(skillName);
    expect(skill.tool_affinities).toBeDefined();
    expect(skill.tool_affinities['context7_resolve_library_id']).toBe(1);
  });

  test('repeated calls accumulate tool_affinities counts', () => {
    const skillName = [...manager.skillBank.generalSkills.keys()][0];

    for (let i = 0; i < 3; i++) {
      manager.learnFromOutcome({
        success: true,
        skill_used: skillName,
        mcpToolsUsed: ['supermemory_search'],
        task_type: 'research',
      });
    }

    const skill = manager.skillBank.generalSkills.get(skillName);
    expect(skill.tool_affinities['supermemory_search']).toBe(3);
  });

  test('multiple tools in one call each get affinity incremented', () => {
    const skillName = [...manager.skillBank.generalSkills.keys()][0];

    manager.learnFromOutcome({
      success: false,
      skill_used: skillName,
      mcpToolsUsed: ['context7_resolve_library_id', 'supermemory_search'],
      task_type: 'debug',
    });

    const skill = manager.skillBank.generalSkills.get(skillName);
    expect(skill.tool_affinities['context7_resolve_library_id']).toBe(1);
    expect(skill.tool_affinities['supermemory_search']).toBe(1);
  });

  test('empty mcpToolsUsed array does not create tool_affinities', () => {
    const skillName = [...manager.skillBank.generalSkills.keys()][0];
    const skill = manager.skillBank.generalSkills.get(skillName);
    const hadAffinities = skill.tool_affinities !== undefined;

    manager.learnFromOutcome({
      success: true,
      skill_used: skillName,
      mcpToolsUsed: [],
      task_type: 'research',
    });

    // Empty array triggers length > 0 guard — no change to skill
    if (!hadAffinities) {
      expect(skill.tool_affinities).toBeUndefined();
    }
  });

  test('undefined mcpToolsUsed does not throw', () => {
    const skillName = [...manager.skillBank.generalSkills.keys()][0];

    expect(() => {
      manager.learnFromOutcome({
        success: true,
        skill_used: skillName,
        task_type: 'research',
      });
    }).not.toThrow();
  });

  test('non-array mcpToolsUsed does not throw', () => {
    const skillName = [...manager.skillBank.generalSkills.keys()][0];

    expect(() => {
      manager.learnFromOutcome({
        success: true,
        skill_used: skillName,
        mcpToolsUsed: 'context7_resolve_library_id',
        task_type: 'research',
      });
    }).not.toThrow();
  });

  test('unknown skill_used does not throw', () => {
    expect(() => {
      manager.learnFromOutcome({
        success: true,
        skill_used: 'nonexistent-skill-xyz',
        mcpToolsUsed: ['context7_resolve_library_id'],
        task_type: 'research',
      });
    }).not.toThrow();
  });

  test('learnFromOutcome without skill_used ignores mcpToolsUsed gracefully', () => {
    expect(() => {
      manager.learnFromOutcome({
        success: true,
        mcpToolsUsed: ['context7_resolve_library_id'],
        task_type: 'research',
      });
    }).not.toThrow();
  });
});
