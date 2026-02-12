/**
 * SkillRL Manager - Selection Tests
 * 
 * Tests hierarchical skill selection as per plan acceptance criteria
 */

'use strict';

const { SkillRLManager } = require('../src/index');

// Simple test runner
function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
    process.exit(1);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test Suite
describe('SkillRL Manager - Hierarchical Selection', () => {
  test('selects general + task-specific skills for auth task', () => {
    const manager = new SkillRLManager();
    
    // Add task-specific auth skill
    manager.addSkill({
      name: 'auth-patterns',
      principle: 'Follow secure authentication patterns',
      application_context: 'When implementing authentication',
      success_rate: 0.85,
      tags: ['auth', 'security', 'feature']
    }, 'feature');
    
    // Query for auth implementation task
    const skills = manager.selectSkills({
      task_type: 'feature',
      description: 'implement authentication with JWT',
      complexity: 'medium'
    });
    
    // Should return both general and task-specific skills
    assert(skills.length > 0, 'Should return skills');
    
    const sources = skills.map(s => s.source);
    assert(sources.includes('general'), 'Should include general skills');
    assert(sources.includes('task-specific'), 'Should include task-specific skills');
    
    // Should include auth-patterns skill
    const authSkill = skills.find(s => s.name === 'auth-patterns');
    assert(authSkill !== undefined, 'Should include auth-patterns skill');
    assert(authSkill.source === 'task-specific', 'auth-patterns should be task-specific');
  });

  test('learns from failure and creates new skill', () => {
    const manager = new SkillRLManager();
    
    const initialSkills = manager.skillBank.getAllSkills();
    const initialCount = initialSkills.total;
    
    // Simulate failure
    const result = manager.learnFromOutcome({
      success: false,
      task_id: 'task-123',
      task_type: 'debug',
      skills_used: ['systematic-debugging'],
      error_message: 'Failed to identify root cause',
      anti_pattern: {
        type: 'shotgun_debug',
        context: 'Made changes without hypothesis'
      },
      outcome_description: 'Debug attempt failed'
    });
    
    // Should create or update skills
    assert(result.root_cause !== undefined, 'Should distill root cause');
    assert(
      result.skills_updated.length > 0 || result.skills_created.length > 0,
      'Should update or create skills'
    );
    
    // Skill bank should have evolved
    const updatedSkills = manager.skillBank.getAllSkills();
    assert(
      updatedSkills.total >= initialCount,
      'Skill bank should maintain or grow skills'
    );
  });

  test('reinforces skills on success', () => {
    const manager = new SkillRLManager();
    
    // Get initial success rate
    const initialSkill = manager.skillBank.generalSkills.get('systematic-debugging');
    const initialRate = initialSkill.success_rate;
    
    // Simulate success
    const result = manager.learnFromOutcome({
      success: true,
      task_id: 'task-456',
      task_type: 'debug',
      skills_used: ['systematic-debugging'],
      positive_pattern: {
        type: 'efficient_debug',
        context: 'Identified root cause quickly'
      }
    });
    
    // Should reinforce skills
    assert(result.reinforced_skills.length > 0, 'Should reinforce skills');
    assert(
      result.reinforced_skills.includes('systematic-debugging'),
      'Should reinforce systematic-debugging'
    );
    
    // Success rate should increase
    const updatedSkill = manager.skillBank.generalSkills.get('systematic-debugging');
    assert(
      updatedSkill.success_rate >= initialRate,
      'Success rate should increase or stay same'
    );
  });

  test('ranks skills by success rate', () => {
    const manager = new SkillRLManager();
    
    const skills = manager.selectSkills({
      task_type: 'feature',
      description: 'implement new feature',
      complexity: 'high'
    });
    
    // Should return skills ranked by success rate
    for (let i = 0; i < skills.length - 1; i++) {
      assert(
        skills[i].success_rate >= skills[i + 1].success_rate,
        `Skills should be ranked by success rate (${skills[i].name}: ${skills[i].success_rate} >= ${skills[i + 1].name}: ${skills[i + 1].success_rate})`
      );
    }
  });

  test('limits selection to top 5 skills', () => {
    const manager = new SkillRLManager();
    
    // Add many task-specific skills
    for (let i = 0; i < 10; i++) {
      manager.addSkill({
        name: `skill-${i}`,
        principle: `Principle ${i}`,
        application_context: 'Test skill',
        success_rate: 0.5 + (i * 0.01),
        tags: ['test']
      }, 'test');
    }
    
    const skills = manager.selectSkills({
      task_type: 'test',
      description: 'test task'
    });
    
    assert(skills.length <= 5, 'Should limit to top 5 skills');
  });

  test('persists and loads state', () => {
    const fs = require('fs');
    const path = require('path');
    const tmpPath = path.join(__dirname, 'test-skillrl-state.json');
    
    // Create manager with persistence
    const manager1 = new SkillRLManager({ persistencePath: tmpPath });
    
    // Add custom skill
    manager1.addSkill({
      name: 'custom-skill',
      principle: 'Custom principle',
      application_context: 'Custom context',
      success_rate: 0.99,
      tags: ['custom']
    }, 'general');
    
    // Create new manager from same path
    const manager2 = new SkillRLManager({ persistencePath: tmpPath });
    
    // Should load custom skill
    const allSkills = manager2.skillBank.getAllSkills();
    const customSkill = allSkills.general.find(s => s.name === 'custom-skill');
    
    assert(customSkill !== undefined, 'Should load persisted skill');
    assert(customSkill.success_rate === 0.99, 'Should preserve success rate');
    
    // Cleanup
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  });

  test('exports comprehensive report', () => {
    const manager = new SkillRLManager();
    
    const report = manager.getReport();
    
    assert(report.skills !== undefined, 'Report should include skills');
    assert(report.learning !== undefined, 'Report should include learning stats');
    assert(report.skills.general_count > 0, 'Should have general skills');
    assert(report.skills.top_general.length > 0, 'Should list top general skills');
  });
});

console.log('\n✓ All tests passed!');
