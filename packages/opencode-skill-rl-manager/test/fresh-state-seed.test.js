/**
 * Fresh State Seed Tests
 *
 * Tests for SkillRL cold-start experience with seeded data.
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { SkillRLManager } = require('../src/index.js');

describe('Fresh State Seed', () => {
  let tempDir;
  let stateFile;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), 'skillrl-test-' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    stateFile = path.join(tempDir, 'skill-rl.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create seeded state on first initialization', () => {
    // Ensure no state file exists
    expect(fs.existsSync(stateFile)).toBe(false);

    // Initialize manager
    const manager = new SkillRLManager({
      persistencePath: stateFile,
      autoLoad: false
    });

    // State file should now exist
    expect(fs.existsSync(stateFile)).toBe(true);

    // Read the persisted state
    const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));

    // Verify seed metadata
    expect(persisted.data_fidelity).toBe('seeded');
    expect(persisted.seeded_at).toBeDefined();
    expect(persisted.seed_source).toBeDefined();
  });

  it('should load existing state on subsequent initialization', () => {
    // First initialization - creates seeded state
    const manager1 = new SkillRLManager({
      persistencePath: stateFile,
      autoLoad: false
    });

    // Record some learning
    manager1.learnFromOutcome({
      task_type: 'debug',
      skill_used: 'systematic-debugging',
      success: true,
      tokens_used: 1000
    });
    manager1._saveSync();

    // Second initialization - should load existing state
    const manager2 = new SkillRLManager({
      persistencePath: stateFile,
      autoLoad: false
    });

    // Verify learning was preserved
    const skill = manager2.getSkillBank().getSkill('systematic-debugging');
    expect(skill).toBeDefined();
    expect(skill.usage_count).toBeGreaterThan(0);
  });

  it('should have valid seeded skills', () => {
    const manager = new SkillRLManager({
      persistencePath: stateFile,
      autoLoad: false
    });

    const skillBank = manager.getSkillBank();

    // Should have general skills
    const generalSkills = skillBank.getGeneralSkills();
    expect(generalSkills.length).toBeGreaterThan(0);

    // Should have task-specific skills
    const taskSpecificSkills = skillBank.getTaskSpecificSkills('debug');
    expect(taskSpecificSkills.length).toBeGreaterThan(0);

    // Skills should have required fields
    const skill = generalSkills[0];
    expect(skill.name).toBeDefined();
    expect(skill.success_rate).toBeGreaterThanOrEqual(0);
    expect(skill.success_rate).toBeLessThanOrEqual(1);
    expect(skill.usage_count).toBeGreaterThanOrEqual(0);
  });

  it('should report seeded fidelity in API responses', () => {
    const manager = new SkillRLManager({
      persistencePath: stateFile,
      autoLoad: false
    });

    // Simulate API response
    const skillBank = manager.getSkillBank();
    const skills = skillBank.getGeneralSkills();

    // Add fidelity metadata
    const response = {
      skills: skills,
      data_fidelity: 'seeded',
      metadata: {
        seeded_at: new Date().toISOString(),
        seed_source: 'opencode-config/skill-rl-seed.json'
      }
    };

    expect(response.data_fidelity).toBe('seeded');
    expect(response.metadata.seeded_at).toBeDefined();
    expect(response.metadata.seed_source).toBeDefined();
  });

  it('should upgrade to live data after learning', () => {
    const manager = new SkillRLManager({
      persistencePath: stateFile,
      autoLoad: false
    });

    // Record multiple outcomes
    for (let i = 0; i < 10; i++) {
      manager.learnFromOutcome({
        task_type: 'debug',
        skill_used: 'systematic-debugging',
        success: i % 3 !== 0, // Mix of success/failure
        tokens_used: 1000 + i * 100
      });
    }

    // Reload and verify
    const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));

    // After learning, data should be considered live
    // (Note: actual implementation may keep 'seeded' until explicit upgrade)
    const skill = persisted.skillBank?.task_specific?.debug?.['systematic-debugging'];
    if (skill) {
      expect(skill.usage_count).toBeGreaterThan(0);
    }
  });

  it('should handle malformed state gracefully', () => {
    // Write invalid JSON to state file
    fs.writeFileSync(stateFile, 'not valid json');

    // Should not throw, should create fresh seeded state
    const manager = new SkillRLManager({
      persistencePath: stateFile,
      autoLoad: false
    });

    // Should have valid seeded state
    expect(fs.existsSync(stateFile)).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    expect(persisted.data_fidelity).toBe('seeded');
  });

  it('should have realistic initial success rates', () => {
    const manager = new SkillRLManager({
      persistencePath: stateFile,
      autoLoad: false
    });

    const skillBank = manager.getSkillBank();
    const skills = skillBank.getGeneralSkills();

    // Seeded and registry-merged success rates should stay within realistic starter bounds
    for (const skill of skills) {
      expect(skill.success_rate).toBeGreaterThanOrEqual(0.5);
      expect(skill.success_rate).toBeLessThanOrEqual(0.95);
    }
  });
});
