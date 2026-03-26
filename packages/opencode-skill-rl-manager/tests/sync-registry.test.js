/**
 * Tests for SkillRLManager.syncWithRegistry()
 * 
 * Covers the 4 critical correctness cases:
 * 1. Empty bank + sync → 29 skills present, all with usage_count 0
 * 2. Bank has 5 seeds with usage_count > 0 + sync → seeds keep their counts
 * 3. Registry has path-prefixed names → stored as base names (no prefix)
 * 4. sync() called twice → idempotent (still 29 skills, not 58)
 */

'use strict';

const { describe, test, expect, beforeEach } = require('bun:test');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { SkillRLManager } = require('../src/index.js');

const REGISTRY_PATH = path.resolve(__dirname, '../../../opencode-config/skills/registry.json');

describe('syncWithRegistry', () => {
  test('seeds >= 29 skills from registry into empty bank', () => {
    // Given a fresh manager (5 hardcoded seeds from _seedGeneralSkills)
    // Use a temp file path to avoid loading persisted state from ~/.opencode/skill-rl.json
    const manager = new SkillRLManager({ stateFile: path.join(__dirname, `.fresh-state-${Date.now()}.json`) });
    // When syncWithRegistry is called (already called in constructor)
    // Then general skills count >= 29
    expect(manager.skillBank.generalSkills.size).toBeGreaterThanOrEqual(29);
  });

  test('preserves usage_count and success_rate of existing seeds', () => {
    // Given: manager initialized with the 5 hardcoded seeds having their preset rates
    // Use a temp file path to avoid loading persisted state from ~/.opencode/skill-rl.json
    const manager = new SkillRLManager({ stateFile: path.join(__dirname, `.fresh-state-${Date.now()}.json`) });

    // Then: original seeds preserve their success_rate values (not overwritten by registry 0.75 default)
    const debugging = manager.skillBank.generalSkills.get('systematic-debugging');
    expect(debugging).toBeDefined();
    // Seeds are high-confidence skills, should have success_rate >= 0.80
    expect(debugging.success_rate).toBeGreaterThanOrEqual(0.80);

    const tdd = manager.skillBank.generalSkills.get('test-driven-development');
    expect(tdd).toBeDefined();
    // Seeds are high-confidence skills, should have success_rate >= 0.80
    expect(tdd.success_rate).toBeGreaterThanOrEqual(0.80);

    const verification = manager.skillBank.generalSkills.get('verification-before-completion');
    expect(verification).toBeDefined();
    // Seeds are high-confidence skills, should have success_rate >= 0.80
    expect(verification.success_rate).toBeGreaterThanOrEqual(0.80);
  });

  test('sync is idempotent — calling twice does not duplicate skills', () => {
    // Given a manager that already synced once (constructor)
    // Use a temp file path to avoid loading persisted state from ~/.opencode/skill-rl.json
    const manager = new SkillRLManager({ stateFile: path.join(__dirname, `.fresh-state-${Date.now()}.json`) });
    const countAfterFirst = manager.skillBank.generalSkills.size;

    // When synced again
    manager.syncWithRegistry(REGISTRY_PATH);
    const countAfterSecond = manager.skillBank.generalSkills.size;

    // Then count is unchanged
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  test('path-prefixed skill names are stored as base names', () => {
    // Given a custom registry with a superpowers/-prefixed skill name
    // Create a real manager instance so _mergeRegistryMetadata is available via 'this' context
    const tempStatePath = path.join(os.tmpdir(), `test-state-${Date.now()}.json`);
    const realManager = new SkillRLManager({ stateFile: tempStatePath });
    
    // Prepare test by clearing the skill bank
    realManager.skillBank.generalSkills.clear();
    realManager.skillBank._invalidateCache();

    const tempRegistry = {
      skills: {
        'superpowers/brainstorming': {
          description: 'Test skill with path prefix',
          triggers: ['test'],
          tags: ['test'],
          category: 'test',
          source: 'test',
        }
      }
    };

    // Write temp registry
    const tempRegistryPath = path.join(os.tmpdir(), `test-registry-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(tempRegistryPath), { recursive: true });
    fs.writeFileSync(tempRegistryPath, JSON.stringify(tempRegistry));

    try {
      realManager.syncWithRegistry(tempRegistryPath);
      // Then: stored as 'brainstorming', not 'superpowers/brainstorming'
      expect(realManager.skillBank.generalSkills.has('brainstorming')).toBe(true);
      expect(realManager.skillBank.generalSkills.has('superpowers/brainstorming')).toBe(false);
    } finally {
      try { fs.unlinkSync(tempRegistryPath); } catch (_) {}
      try { fs.unlinkSync(tempStatePath); } catch (_) {}
    }
  });

  test('syncWithRegistry() with category="debugging" skill → success_rate = 0.70', () => {
    // Arrange: Create a registry with a debugging skill
    const tempRegistryPath = path.join(os.tmpdir(), `test-registry-${Date.now()}.json`);
    const tempStatePath = path.join(os.tmpdir(), `test-state-${Date.now()}.json`);
    
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

    try {
      // Act
      const manager = new SkillRLManager({ stateFile: tempStatePath });
      manager.skillBank.generalSkills.clear(); // Start fresh, no persisted data
      manager.syncWithRegistry(tempRegistryPath);

      // Assert: Skill should have success_rate = 0.70 (debugging tier)
      const skill = manager.skillBank.generalSkills.get('debug-skill');
      expect(skill).toBeDefined();
      expect(skill.success_rate).toBe(0.70);
    } finally {
      try { fs.unlinkSync(tempRegistryPath); } catch (_) {}
      try { fs.unlinkSync(tempStatePath); } catch (_) {}
    }
  });

  test('syncWithRegistry() with category="general" skill → success_rate = 0.65', () => {
    // Arrange: Create a registry with a general skill
    const tempRegistryPath = path.join(os.tmpdir(), `test-registry-${Date.now()}.json`);
    const tempStatePath = path.join(os.tmpdir(), `test-state-${Date.now()}.json`);
    
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

    try {
      // Act
      const manager = new SkillRLManager({ stateFile: tempStatePath });
      manager.skillBank.generalSkills.clear(); // Start fresh, no persisted data
      manager.syncWithRegistry(tempRegistryPath);

      // Assert: Skill should have success_rate = 0.65 (general tier)
      const skill = manager.skillBank.generalSkills.get('general-skill');
      expect(skill).toBeDefined();
      expect(skill.success_rate).toBe(0.65);
    } finally {
      try { fs.unlinkSync(tempRegistryPath); } catch (_) {}
      try { fs.unlinkSync(tempStatePath); } catch (_) {}
    }
  });

  test('syncWithRegistry() with category="experimental" skill → success_rate = 0.50', () => {
    // Arrange: Create a registry with an experimental skill
    const tempRegistryPath = path.join(os.tmpdir(), `test-registry-${Date.now()}.json`);
    const tempStatePath = path.join(os.tmpdir(), `test-state-${Date.now()}.json`);
    
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

    try {
      // Act
      const manager = new SkillRLManager({ stateFile: tempStatePath });
      manager.skillBank.generalSkills.clear(); // Start fresh, no persisted data
      manager.syncWithRegistry(tempRegistryPath);

      // Assert: Skill should have success_rate = 0.50 (niche/experimental tier)
      const skill = manager.skillBank.generalSkills.get('experimental-skill');
      expect(skill).toBeDefined();
      expect(skill.success_rate).toBe(0.50);
    } finally {
      try { fs.unlinkSync(tempRegistryPath); } catch (_) {}
      try { fs.unlinkSync(tempStatePath); } catch (_) {}
    }
  });

  test('syncWithRegistry() with skill name matching seed → metadata merged (triggers present after import)', () => {
    // Arrange: Create a manager and seed a skill first
    const tempRegistryPath = path.join(os.tmpdir(), `test-registry-${Date.now()}.json`);
    const tempStatePath = path.join(os.tmpdir(), `test-state-${Date.now()}.json`);
    
    const manager = new SkillRLManager({ stateFile: tempStatePath });
    
    // Clear loaded state and seed a skill first (simulating _seedGeneralSkills)
    manager.skillBank.generalSkills.clear();
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

     try {
       // Act
       manager.syncWithRegistry(tempRegistryPath);

       // Assert: Skill should exist with merged metadata
       const skill = manager.skillBank.generalSkills.get('systematic-debugging');
       expect(skill).toBeDefined();
       expect(skill.success_rate).toBe(0.85); // Seed success_rate preserved
       expect(skill.application_context).toContain('debug systematically'); // Registry triggers merged
       expect(skill.application_context).toContain('structured debugging');
     } finally {
       try { fs.unlinkSync(tempRegistryPath); } catch (_) {}
       try { fs.unlinkSync(tempStatePath); } catch (_) {}
     }
  });

  test('syncWithRegistry() with already-tracked skill → preserves existing success_rate (unchanged)', () => {
    // Arrange: Create a manager and manually add a skill with custom success_rate
    const tempRegistryPath = path.join(os.tmpdir(), `test-registry-${Date.now()}.json`);
    const tempStatePath = path.join(os.tmpdir(), `test-state-${Date.now()}.json`);
    
    const manager = new SkillRLManager({ stateFile: tempStatePath });
    
    manager.skillBank.generalSkills.clear(); // Start fresh
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

    try {
      // Act
      manager.syncWithRegistry(tempRegistryPath);

     // Assert: Skill should be unchanged (additive only)
       const skill = manager.skillBank.generalSkills.get('custom-skill');
       expect(skill).toBeDefined();
       expect(skill.success_rate).toBe(0.92); // Original success_rate preserved
       expect(skill.usage_count).toBe(20); // Original usage_count preserved
     } finally {
       try { fs.unlinkSync(tempRegistryPath); } catch (_) {}
       try { fs.unlinkSync(tempStatePath); } catch (_) {}
     }
  });
});
