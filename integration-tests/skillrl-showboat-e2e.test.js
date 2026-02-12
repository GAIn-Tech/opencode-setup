/**
 * End-to-End Integration Test: SkillRL + Showboat Full Workflow
 * 
 * Verifies complete task workflow:
 * 1. Task arrives → OrchestrationAdvisor augmented by SkillRL
 * 2. Task executes with selected skills
 * 3. Outcome recorded → Failures distilled into SkillRL evolution
 * 4. High-impact tasks → Showboat captures evidence
 * 5. Evidence documents → Primary handoff artifact
 */

const { IntegrationLayer } = require('../packages/opencode-integration-layer/src/index.js');
const { SkillRLManager } = require('../packages/opencode-skill-rl-manager/src/index.js');
const { ShowboatWrapper } = require('../packages/opencode-showboat-wrapper/src/index.js');
const fs = require('fs');
const path = require('path');

// Simulated OrchestrationAdvisor
class MockOrchestrationAdvisor {
  constructor(hooks = {}) {
    this.hooks = hooks;
  }

  advise(taskContext) {
    let advice = {
      advice_id: `advice_${Date.now()}`,
      warnings: [],
      suggestions: ['Consider using systematic-debugging skill'],
      routing: { agent: 'explore', skills: ['grep', 'read'], confidence: 0.7 },
      risk_score: 5,
      should_pause: false
    };

    if (this.hooks?.onBeforeAdviceReturn) {
      advice = this.hooks.onBeforeAdviceReturn(taskContext, advice);
    }

    return advice;
  }

  learnFromOutcome(adviceId, outcome) {
    if (this.hooks?.onFailureDistilled && outcome.status === 'failed') {
      const antiPattern = {
        type: outcome.anti_pattern_type || 'failed_debug',
        description: outcome.error || 'Task failed',
        occurrences: 1
      };
      this.hooks.onFailureDistilled(outcome, antiPattern, outcome.task_context);
    }
  }
}

// Simulated Proofcheck
class MockProofcheck {
  constructor(hooks = {}) {
    this.hooks = hooks;
  }

  async verify() {
    const result = {
      allPassed: true,
      results: [
        { check: 'lint', passed: true },
        { check: 'tests', passed: true }
      ],
      timestamp: new Date().toISOString()
    };

    if (this.hooks?.onVerificationComplete) {
      await this.hooks.onVerificationComplete(result);
    }

    return result;
  }
}

async function runE2ETest() {
  console.log('🚀 E2E Test: SkillRL + Showboat Full Workflow\n');
  console.log('═'.repeat(60));

  const testEvidenceDir = './e2e-evidence';
  
  try {
    // Setup
    console.log('\n📦 Setting up components...');
    const skillRL = new SkillRLManager();
    const showboat = new ShowboatWrapper({ outputDir: testEvidenceDir });
    const integration = new IntegrationLayer({
      skillRLManager: skillRL,
      showboatWrapper: showboat
    });

    console.log('✅ SkillRLManager initialized');
    console.log('✅ ShowboatWrapper initialized');
    console.log('✅ IntegrationLayer initialized');

    // === SCENARIO 1: High-Impact Task with Success ===
    console.log('\n' + '═'.repeat(60));
    console.log('📋 SCENARIO 1: High-Impact Authentication Feature');
    console.log('═'.repeat(60));

    const authTask = {
      task: 'Implement OAuth 2.0 authentication system',
      complexity: 'high',
      filesModified: 12,
      files_involved: ['src/auth/', 'src/middleware/auth.js', 'src/routes/auth.js'],
      assertions: [
        { type: 'text', selector: '#login-button', expected: 'Sign in with OAuth' },
        { type: 'element', selector: '#oauth-callback', exists: true },
        { type: 'accessibility', role: 'button', label: 'Sign in' }
      ]
    };

    integration.setTaskContext(authTask);

    // Create integrated advisor
    const hooks = integration.createOrchestrationAdvisorHooks();
    const advisor = new MockOrchestrationAdvisor(hooks);

    console.log('\n1️⃣  OrchestrationAdvisor provides guidance...');
    const advice = advisor.advise(authTask);
    
    console.log(`   - Base routing: ${advice.routing.agent}`);
    console.log(`   - Base skills: ${advice.routing.skills.join(', ')}`);
    console.log(`   - SkillRL augmentation: ${advice.skillrl_skills ? advice.skillrl_skills.join(', ') : 'none'}`);
    
    if (!advice.skillrl_skills || advice.skillrl_skills.length === 0) {
      throw new Error('SkillRL did not augment advice');
    }
    console.log('✅ SkillRL augmented advice with hierarchical skills');

    // Simulate task execution with Proofcheck
    console.log('\n2️⃣  Task executed... Running verification...');
    const proofcheckHooks = integration.createProofcheckHooks();
    const proofcheck = new MockProofcheck(proofcheckHooks);
    
    const verification = await proofcheck.verify();
    console.log(`   - Verification status: ${verification.allPassed ? 'PASS ✅' : 'FAIL ❌'}`);
    
    // Check evidence capture
    console.log('\n3️⃣  Checking evidence capture...');
    const evidenceFiles = showboat.getEvidenceFiles();
    
    if (evidenceFiles.length === 0) {
      throw new Error('No evidence captured for high-impact task');
    }
    
    const latestEvidence = evidenceFiles[evidenceFiles.length - 1];
    const evidenceContent = fs.readFileSync(latestEvidence, 'utf8');
    
    console.log(`   - Evidence file: ${path.basename(latestEvidence)}`);
    console.log(`   - Contains Playwright assertions: ${evidenceContent.includes('Playwright Assertions') ? 'YES ✅' : 'NO ❌'}`);
    console.log(`   - Contains verification status: ${evidenceContent.includes('PASS') ? 'YES ✅' : 'NO ❌'}`);
    
    if (!evidenceContent.includes('Playwright Assertions')) {
      throw new Error('Evidence document missing Playwright assertions');
    }
    
    console.log('✅ High-impact task generated showboat evidence document');

    // === SCENARIO 2: Low-Impact Task (Should Skip Evidence) ===
    console.log('\n' + '═'.repeat(60));
    console.log('📋 SCENARIO 2: Low-Impact Documentation Fix');
    console.log('═'.repeat(60));

    const docTask = {
      task: 'Fix typo in README.md',
      complexity: 'low',
      filesModified: 1
    };

    integration.setTaskContext(docTask);
    
    console.log('\n1️⃣  Task context set (low impact)...');
    const beforeCount = showboat.getEvidenceFiles().length;
    
    await proofcheck.verify();
    
    const afterCount = showboat.getEvidenceFiles().length;
    
    if (afterCount > beforeCount) {
      throw new Error('Evidence captured for low-impact task (should skip)');
    }
    
    console.log('✅ Low-impact task correctly skipped evidence capture');

    // === SCENARIO 3: Failure Distillation ===
    console.log('\n' + '═'.repeat(60));
    console.log('📋 SCENARIO 3: Failed Task → SkillRL Evolution');
    console.log('═'.repeat(60));

    const failedTask = {
      task: 'Implement WebSocket real-time sync',
      complexity: 'high',
      filesModified: 8
    };

    integration.setTaskContext(failedTask);
    
    const failedAdvice = advisor.advise(failedTask);
    
    console.log('\n1️⃣  Task attempted and failed...');
    const beforeFailures = skillRL.evolutionEngine.getFailureStats().total_failures;
    
    const failureOutcome = {
      advice_id: failedAdvice.advice_id,
      status: 'failed',
      error: 'Race condition in WebSocket message queue',
      anti_pattern_type: 'inefficient_solution',
      task_context: failedTask
    };
    
    advisor.learnFromOutcome(failedAdvice.advice_id, failureOutcome);
    
    const afterFailures = skillRL.evolutionEngine.getFailureStats().total_failures;
    
    console.log(`   - Failures before: ${beforeFailures}`);
    console.log(`   - Failures after: ${afterFailures}`);
    
    if (afterFailures <= beforeFailures) {
      throw new Error('Failure was not distilled into SkillRL');
    }
    
    console.log('✅ Failure distilled and recorded in SkillRL evolution engine');

    // === SCENARIO 4: Full Workflow with executeTaskWithEvidence ===
    console.log('\n' + '═'.repeat(60));
    console.log('📋 SCENARIO 4: Full Workflow End-to-End');
    console.log('═'.repeat(60));

    const deployTask = {
      task: 'Deploy production database migration',
      complexity: 'high',
      filesModified: 20,
      assertions: [
        { type: 'text', selector: '#migration-status', expected: 'Success' }
      ]
    };

    console.log('\n1️⃣  Executing full workflow...');
    const beforeEvidence = showboat.getEvidenceFiles().length;
    
    const result = await integration.executeTaskWithEvidence(deployTask, async (ctx, skillSelection) => {
      console.log(`   - Task: ${ctx.task}`);
      console.log(`   - Skills selected: ${skillSelection ? skillSelection.map(s => s.name).join(', ') : 'none'}`);
      
      // Simulate successful execution
      return {
        success: true,
        exitCode: 0
      };
    });
    
    const afterEvidence = showboat.getEvidenceFiles().length;
    
    if (afterEvidence <= beforeEvidence) {
      throw new Error('Full workflow did not generate evidence');
    }
    
    console.log(`✅ Full workflow executed: skill selection → execution → evidence capture`);

    // Final Summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 E2E TEST SUMMARY');
    console.log('═'.repeat(60));
    console.log('✅ Scenario 1: High-impact task generated evidence');
    console.log('✅ Scenario 2: Low-impact task skipped evidence');
    console.log('✅ Scenario 3: Failure distilled into SkillRL');
    console.log('✅ Scenario 4: Full workflow end-to-end');
    console.log('\n🎉 ALL E2E TESTS PASSED!\n');

    // Cleanup
    if (fs.existsSync(testEvidenceDir)) {
      fs.rmSync(testEvidenceDir, { recursive: true, force: true });
    }

    return 0;
  } catch (error) {
    console.error('\n❌ E2E TEST FAILED:', error.message);
    console.error(error.stack);
    
    // Cleanup
    if (fs.existsSync(testEvidenceDir)) {
      fs.rmSync(testEvidenceDir, { recursive: true, force: true });
    }
    
    return 1;
  }
}

runE2ETest().then(exitCode => process.exit(exitCode));
