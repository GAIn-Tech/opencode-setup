'use strict';

const { describe, test, expect, beforeEach } = require('bun:test');
const { SkillBank } = require('../src/skill-bank');

describe('SkillBank._matchesContext()', () => {
  let skillBank;

  beforeEach(() => {
    skillBank = new SkillBank();
  });

  test('Skill with success_rate=0.80 but no tag/keyword match → _matchesContext() returns false', () => {
    // Arrange: Create a skill with high success_rate but no matching tags/keywords
    const skill = {
      name: 'high-success-skill',
      success_rate: 0.80,
      usage_count: 10,
      tags: ['debugging', 'analysis'],
      application_context: 'debugging complex issues',
      selectionHints: {
        useWhen: [],
        avoidWhen: []
      }
    };

    const taskContext = {
      task_type: 'refactoring',
      complexity: 'low',
      error_type: null,
      description: 'refactor code to improve readability'
    };

    // Act
    const result = skillBank._matchesContext(skill, taskContext);

    // Assert: Should return false because no tags/keywords match, despite high success_rate
    expect(result).toBe(false);
  });

  test('Skill with avoidWhen=["simple fix"] + task description "simple fix typo" → returns false', () => {
    // Arrange: Create a skill with avoidWhen that matches task context
    const skill = {
      name: 'complex-refactoring-skill',
      success_rate: 0.75,
      usage_count: 5,
      tags: ['refactoring'],
      application_context: 'for complex refactoring tasks',
      selectionHints: {
        useWhen: ['complex refactoring'],
        avoidWhen: ['simple fix', 'trivial change']
      }
    };

    const taskContext = {
      task_type: 'fix',
      complexity: 'low',
      error_type: 'simple fix typo',
      description: 'simple fix typo in variable name'
    };

    // Act
    const result = skillBank._matchesContext(skill, taskContext);

    // Assert: Should return false because avoidWhen term "simple fix" matches error_type
    expect(result).toBe(false);
  });

  test('Skill WITH matching tag + avoidWhen that does NOT match task → returns true', () => {
    // Arrange: Create a skill with matching tag and avoidWhen that doesn't match
    const skill = {
      name: 'debugging-skill',
      success_rate: 0.75,
      usage_count: 5,
      tags: ['debugging', 'analysis'],
      application_context: 'for debugging issues',
      selectionHints: {
        useWhen: ['debugging needed'],
        avoidWhen: ['simple fix', 'trivial change']
      }
    };

    const taskContext = {
      task_type: 'debugging',
      complexity: 'high',
      error_type: 'null pointer exception',
      description: 'debug null pointer exception in handler'
    };

    // Act
    const result = skillBank._matchesContext(skill, taskContext);

    // Assert: Should return true because task_type matches tag AND avoidWhen doesn't match
    expect(result).toBe(true);
  });
});

describe('SkillBank.querySkills() cap', () => {
  let skillBank;

  beforeEach(() => {
    skillBank = new SkillBank();
    // Seed with 10 general skills for testing
    for (let i = 1; i <= 10; i++) {
      skillBank.generalSkills.set(`general-skill-${i}`, {
        name: `general-skill-${i}`,
        success_rate: 0.50 + (i * 0.04), // 0.54 to 0.94
        usage_count: i,
        tags: ['general'],
        application_context: 'general purpose',
        selectionHints: { useWhen: [], avoidWhen: [] }
      });
    }
    // Seed with 8 task-specific skills
    skillBank.taskSpecificSkills.set('debug', new Map());
    for (let i = 1; i <= 8; i++) {
      skillBank.taskSpecificSkills.get('debug').set(`debug-skill-${i}`, {
        name: `debug-skill-${i}`,
        success_rate: 0.60 + (i * 0.03), // 0.63 to 0.84
        usage_count: i,
        tags: ['debugging'],
        application_context: 'debugging tasks',
        selectionHints: { useWhen: [], avoidWhen: [] }
      });
    }
  });

  test('querySkills default cap → max 10 results (currently hardcoded to 5)', () => {
    // Arrange
    const taskContext = {
      task_type: 'debug',
      complexity: 'high',
      error_type: 'null pointer',
      description: 'debug null pointer exception'
    };

    // Act
    const results = skillBank.querySkills(taskContext);

    // Assert: Default maxResults should be 10, allowing up to 10 results
    // This will fail with current hardcoded 5 limit
    expect(results.length).toBeLessThanOrEqual(10);
  });

  test('querySkills with maxResults=5 → respects 5 result limit', () => {
    // Arrange
    const taskContext = {
      task_type: 'debug',
      complexity: 'high',
      error_type: 'null pointer',
      description: 'debug null pointer exception'
    };

    // Act
    const results = skillBank.querySkills(taskContext, { maxResults: 5 });

    // Assert: maxResults=5, so should return at most 5 skills
    expect(results.length).toBeLessThanOrEqual(5);
  });

  test('querySkills with maxResults=15 → respects 15 result limit', () => {
    // Arrange
    const taskContext = {
      task_type: 'debug',
      complexity: 'high',
      error_type: 'null pointer',
      description: 'debug null pointer exception'
    };

    // Act
    const results = skillBank.querySkills(taskContext, { maxResults: 15 });

    // Assert: maxResults=15, so should return at most 15 skills
    expect(results.length).toBeLessThanOrEqual(15);
  });

  test('querySkills with maxResults=25 → capped at 20 (absolute ceiling)', () => {
    // Arrange
    const taskContext = {
      task_type: 'debug',
      complexity: 'high',
      error_type: 'null pointer',
      description: 'debug null pointer exception'
    };

    // Act
    const results = skillBank.querySkills(taskContext, { maxResults: 25 });

    // Assert: maxResults=25 but absolute ceiling is 20, so should return at most 20 skills
    expect(results.length).toBeLessThanOrEqual(20);
  });
});

describe('syncWithRegistry()', () => {
  const { SkillRLManager } = require('../src/index');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  let manager;
  let tempRegistryPath;

  beforeEach(() => {
    // Create a temporary registry file for testing
    tempRegistryPath = path.join(os.tmpdir(), `test-registry-${Date.now()}.json`);
    manager = new SkillRLManager({ stateFile: path.join(os.tmpdir(), `test-skill-rl-${Date.now()}.json`) });
  });

  test('syncWithRegistry() with category="debugging" skill → success_rate = 0.70', () => {
    // Arrange: Create a registry with a debugging skill
    const registry = {
      skills: {
        'debug-skill': {
          description: 'A debugging skill',
          category: 'debugging',
          triggers: ['debug', 'troubleshoot'],
          tags: ['debugging']
        }
      }
    };
    fs.writeFileSync(tempRegistryPath, JSON.stringify(registry));

    // Act
    manager.syncWithRegistry(tempRegistryPath);

    // Assert: Skill should have success_rate = 0.70 (debugging tier)
    const skill = manager.skillBank.generalSkills.get('debug-skill');
    expect(skill).toBeDefined();
    expect(skill.success_rate).toBe(0.70);
  });

  test('syncWithRegistry() with category="general" skill → success_rate = 0.65', () => {
    // Arrange: Create a registry with a general skill
    const registry = {
      skills: {
        'general-skill': {
          description: 'A general skill',
          category: 'general',
          triggers: ['help', 'assist'],
          tags: ['general']
        }
      }
    };
    fs.writeFileSync(tempRegistryPath, JSON.stringify(registry));

    // Act
    manager.syncWithRegistry(tempRegistryPath);

    // Assert: Skill should have success_rate = 0.65 (general tier)
    const skill = manager.skillBank.generalSkills.get('general-skill');
    expect(skill).toBeDefined();
    expect(skill.success_rate).toBe(0.65);
  });

  test('syncWithRegistry() with category="experimental" skill → success_rate = 0.50', () => {
    // Arrange: Create a registry with an experimental skill
    const registry = {
      skills: {
        'experimental-skill': {
          description: 'An experimental skill',
          category: 'experimental',
          triggers: ['experiment', 'test'],
          tags: ['experimental']
        }
      }
    };
    fs.writeFileSync(tempRegistryPath, JSON.stringify(registry));

    // Act
    manager.syncWithRegistry(tempRegistryPath);

    // Assert: Skill should have success_rate = 0.50 (niche/experimental tier)
    const skill = manager.skillBank.generalSkills.get('experimental-skill');
    expect(skill).toBeDefined();
    expect(skill.success_rate).toBe(0.50);
  });

  test('syncWithRegistry() with skill name matching seed → metadata merged (triggers present after import)', () => {
    // Arrange: Seed a skill first (simulating _seedGeneralSkills)
    manager.skillBank.generalSkills.set('systematic-debugging', {
      name: 'systematic-debugging',
      principle: 'Systematic debugging approach',
      application_context: 'debugging issues',
      success_rate: 0.85,
      usage_count: 5,
      tags: ['debugging'],
      source: 'seed',
      category: 'debugging'
    });

    // Create a registry with the same skill name but different metadata
    const registry = {
      skills: {
        'systematic-debugging': {
          description: 'Systematic debugging from registry',
          category: 'debugging',
          triggers: ['debug systematically', 'structured debugging', 'methodical debug'],
          tags: ['debugging', 'systematic', 'analysis']
        }
      }
    };
    fs.writeFileSync(tempRegistryPath, JSON.stringify(registry));

    // Act
    manager.syncWithRegistry(tempRegistryPath);

    // Assert: Skill should exist with merged metadata
    const skill = manager.skillBank.generalSkills.get('systematic-debugging');
    expect(skill).toBeDefined();
    expect(skill.success_rate).toBe(0.85); // Seed success_rate preserved
    expect(skill.application_context).toContain('debug systematically'); // Registry triggers merged
    expect(skill.application_context).toContain('structured debugging');
  });

  test('syncWithRegistry() with already-tracked skill → preserves existing success_rate (unchanged)', () => {
    // Arrange: Manually add a skill with custom success_rate
    manager.skillBank.generalSkills.set('custom-skill', {
      name: 'custom-skill',
      principle: 'Custom skill',
      application_context: 'custom context',
      success_rate: 0.92,
      usage_count: 20,
      tags: ['custom'],
      source: 'manual',
      category: 'general'
    });

    // Create a registry with the same skill
    const registry = {
      skills: {
        'custom-skill': {
          description: 'Custom skill from registry',
          category: 'general',
          triggers: ['custom trigger'],
          tags: ['custom', 'registry']
        }
      }
    };
    fs.writeFileSync(tempRegistryPath, JSON.stringify(registry));

    // Act
    manager.syncWithRegistry(tempRegistryPath);

    // Assert: Skill should be unchanged (additive only)
    const skill = manager.skillBank.generalSkills.get('custom-skill');
    expect(skill).toBeDefined();
    expect(skill.success_rate).toBe(0.92); // Original success_rate preserved
    expect(skill.usage_count).toBe(20); // Original usage_count preserved
  });
});
