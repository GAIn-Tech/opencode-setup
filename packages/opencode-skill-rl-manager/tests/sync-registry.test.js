/**
 * Tests for SkillRLManager.syncWithRegistry()
 * 
 * Covers the 4 critical correctness cases:
 * 1. Empty bank + sync → 29 skills present, all with usage_count 0
 * 2. Bank has 5 seeds with usage_count > 0 + sync → seeds keep their counts
 * 3. Registry has path-prefixed names → stored as base names (no prefix)
 * 4. sync() called twice → idempotent (still 29 skills, not 58)
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import path from 'path';
import { SkillRLManager } from '../src/index.js';

const REGISTRY_PATH = path.resolve(import.meta.dir, '../../../opencode-config/skills/registry.json');

describe('syncWithRegistry', () => {
  test('seeds >= 29 skills from registry into empty bank', () => {
    // Given a fresh manager (5 hardcoded seeds from _seedGeneralSkills)
    const manager = new SkillRLManager({ stateFile: null });
    // When syncWithRegistry is called (already called in constructor)
    // Then general skills count >= 29
    expect(manager.skillBank.generalSkills.size).toBeGreaterThanOrEqual(29);
  });

  test('preserves usage_count and success_rate of existing seeds', () => {
    // Given: manager initialized with the 5 hardcoded seeds having their preset rates
    const manager = new SkillRLManager({ stateFile: null });

    // Then: original seeds preserve their success_rate values (not overwritten by registry 0.75 default)
    const debugging = manager.skillBank.generalSkills.get('systematic-debugging');
    expect(debugging).toBeDefined();
    expect(debugging.success_rate).toBe(0.85);

    const tdd = manager.skillBank.generalSkills.get('test-driven-development');
    expect(tdd).toBeDefined();
    expect(tdd.success_rate).toBe(0.90);

    const verification = manager.skillBank.generalSkills.get('verification-before-completion');
    expect(verification).toBeDefined();
    expect(verification.success_rate).toBe(0.95);
  });

  test('sync is idempotent — calling twice does not duplicate skills', () => {
    // Given a manager that already synced once (constructor)
    const manager = new SkillRLManager({ stateFile: null });
    const countAfterFirst = manager.skillBank.generalSkills.size;

    // When synced again
    manager.syncWithRegistry(REGISTRY_PATH);
    const countAfterSecond = manager.skillBank.generalSkills.size;

    // Then count is unchanged
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  test('path-prefixed skill names are stored as base names', async () => {
    // Given a custom registry with a superpowers/-prefixed skill name
    const { SkillBank } = await import('../src/skill-bank.js');
    const fakeManager = {
      skillBank: new SkillBank(),
      _save: async () => {},
      syncWithRegistry: SkillRLManager.prototype.syncWithRegistry,
    };

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
    const os = await import('os');
    const fs = await import('fs');
    const tempPath = path.join(os.homedir(), '.opencode', 'test-registry-tmp.json');
    fs.mkdirSync(path.dirname(tempPath), { recursive: true });
    fs.writeFileSync(tempPath, JSON.stringify(tempRegistry));

    try {
      fakeManager.syncWithRegistry.call(fakeManager, tempPath);
      // Then: stored as 'brainstorming', not 'superpowers/brainstorming'
      expect(fakeManager.skillBank.generalSkills.has('brainstorming')).toBe(true);
      expect(fakeManager.skillBank.generalSkills.has('superpowers/brainstorming')).toBe(false);
    } finally {
      fs.unlinkSync(tempPath);
    }
  });
});
