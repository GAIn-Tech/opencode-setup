const { IntegrationLayer } = require('../src/index.js');
const { SkillRLManager } = require('../../opencode-skill-rl-manager/src/index.js');
const { ShowboatWrapper } = require('../../opencode-showboat-wrapper/src/index.js');

// Mock OrchestrationAdvisor and Proofcheck
class MockOrchestrationAdvisor {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.adviceLog = [];
  }

  advise(taskContext) {
    let advice = {
      advice_id: `advice_${Date.now()}`,
      warnings: [],
      suggestions: [],
      routing: { agent: 'explore', skills: [], confidence: 0.7 },
      risk_score: 5,
      should_pause: false
    };

    if (this.hooks?.onBeforeAdviceReturn) {
      advice = this.hooks.onBeforeAdviceReturn(taskContext, advice);
    }

    this.adviceLog.push({ taskContext, advice });
    return advice;
  }

  learnFromOutcome(adviceId, outcome) {
    if (this.hooks?.onFailureDistilled && outcome.status === 'failed') {
      const antiPattern = {
        type: 'test_failure',
        description: outcome.error || 'Unknown error',
        occurrences: 1
      };
      this.hooks.onFailureDistilled(outcome, antiPattern, outcome.task_context);
    }
  }
}

class MockProofcheck {
  constructor(hooks = {}) {
    this.hooks = hooks;
  }

  async verify() {
    const result = {
      allPassed: true,
      results: [{ check: 'test', passed: true }],
      timestamp: new Date().toISOString()
    };

    if (this.hooks?.onVerificationComplete) {
      await this.hooks.onVerificationComplete(result);
    }

    return result;
  }
}

// Test suite
async function runTests() {
  console.log('🧪 Integration Layer Tests\n');

  let passed = 0;
  let failed = 0;

  // Test 1: IntegrationLayer integrates SkillRL + Showboat with existing packages
  try {
    console.log('Test 1: IntegrationLayer integrates all components');
    
    const skillRL = new SkillRLManager();
    const showboat = new ShowboatWrapper({ outputDir: './test-evidence' });
    
    const integration = new IntegrationLayer({
      skillRLManager: skillRL,
      showboatWrapper: showboat
    });

    if (!integration.skillRL || !integration.showboat) {
      throw new Error('Integration layer missing components');
    }

    console.log('✅ PASS: IntegrationLayer initialized with components\n');
    passed++;
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failed++;
  }

  // Test 2: OrchestrationAdvisor hooks correctly augment advice with SkillRL
  try {
    console.log('Test 2: OrchestrationAdvisor hooks augment advice with SkillRL');
    
    const skillRL = new SkillRLManager();
    const integration = new IntegrationLayer({ skillRLManager: skillRL });
    const hooks = integration.createOrchestrationAdvisorHooks();

    const mockAdvisor = new MockOrchestrationAdvisor(hooks);

    const taskContext = {
      task: 'implement authentication system',
      complexity: 'high',
      files_involved: ['src/auth.js', 'src/middleware/auth.js']
    };

    const advice = mockAdvisor.advise(taskContext);

    if (!advice.skillrl_skills || advice.skillrl_skills.length === 0) {
      throw new Error('SkillRL did not augment advice');
    }

    console.log(`  - Original routing: ${advice.routing.agent}`);
    console.log(`  - SkillRL skills: ${advice.skillrl_skills.join(', ')}`);
    console.log('✅ PASS: SkillRL correctly augmented advice\n');
    passed++;
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failed++;
  }

  // Test 3: Failure distillation hook updates SkillRL bank
  try {
    console.log('Test 3: Failure distillation updates SkillRL bank');
    
    const skillRL = new SkillRLManager();
    const integration = new IntegrationLayer({ skillRLManager: skillRL });
    const hooks = integration.createOrchestrationAdvisorHooks();

    const mockAdvisor = new MockOrchestrationAdvisor(hooks);

    const taskContext = {
      task: 'implement authentication',
      complexity: 'high'
    };

    const advice = mockAdvisor.advise(taskContext);

    const failureOutcome = {
      advice_id: advice.advice_id,
      status: 'failed',
      error: 'Authentication logic had race condition',
      task_context: taskContext
    };

    const beforeStats = skillRL.evolutionEngine.getFailureStats();
    const beforeFailures = beforeStats.total_failures;
    mockAdvisor.learnFromOutcome(advice.advice_id, failureOutcome);
    const afterStats = skillRL.evolutionEngine.getFailureStats();
    const afterFailures = afterStats.total_failures;

    if (afterFailures <= beforeFailures) {
      throw new Error('Failure was not recorded in SkillRL');
    }

    console.log(`  - Failures before: ${beforeFailures}`);
    console.log(`  - Failures after: ${afterFailures}`);
    console.log('✅ PASS: Failure distillation updated SkillRL\n');
    passed++;
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failed++;
  }

  // Test 4: Proofcheck hooks trigger showboat evidence capture for high-impact tasks
  try {
    console.log('Test 4: Proofcheck hooks trigger showboat for high-impact tasks');
    
    const fs = require('fs');
    const path = require('path');
    
    const showboat = new ShowboatWrapper({ outputDir: './test-evidence' });
    const integration = new IntegrationLayer({ showboatWrapper: showboat });
    const hooks = integration.createProofcheckHooks();

    const mockProofcheck = new MockProofcheck(hooks);

    // Set high-impact context
    integration.setTaskContext({
      task: 'Deploy authentication system',
      filesModified: 15,
      complexity: 'high'
    });

    await mockProofcheck.verify();

    const evidenceFiles = showboat.getEvidenceFiles();

    if (evidenceFiles.length === 0) {
      throw new Error('No evidence file generated for high-impact task');
    }

    console.log(`  - Evidence files: ${evidenceFiles.length}`);
    console.log(`  - Latest file: ${path.basename(evidenceFiles[evidenceFiles.length - 1])}`);
    console.log('✅ PASS: Showboat captured evidence for high-impact task\n');
    passed++;

    // Cleanup
    evidenceFiles.forEach(file => fs.unlinkSync(file));
    if (fs.existsSync('./test-evidence')) {
      fs.rmdirSync('./test-evidence');
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failed++;
  }

  // Test 5: Low-impact tasks skip evidence capture
  try {
    console.log('Test 5: Low-impact tasks skip evidence capture');
    
    const showboat = new ShowboatWrapper({ outputDir: './test-evidence-2' });
    const integration = new IntegrationLayer({ showboatWrapper: showboat });
    const hooks = integration.createProofcheckHooks();

    const mockProofcheck = new MockProofcheck(hooks);

    // Set low-impact context
    integration.setTaskContext({
      task: 'Fix typo in comment',
      filesModified: 1,
      complexity: 'low'
    });

    await mockProofcheck.verify();

    const evidenceFiles = showboat.getEvidenceFiles();

    if (evidenceFiles.length > 0) {
      throw new Error('Evidence file generated for low-impact task (should skip)');
    }

    console.log('  - Evidence files: 0 (correctly skipped)');
    console.log('✅ PASS: Showboat skipped low-impact task\n');
    passed++;

    // Cleanup
    const fs = require('fs');
    if (fs.existsSync('./test-evidence-2')) {
      fs.rmdirSync('./test-evidence-2');
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failed++;
  }

  // Summary
  console.log('═'.repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${passed + failed}`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
