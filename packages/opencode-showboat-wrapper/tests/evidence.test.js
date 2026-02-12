const fs = require('fs');
const path = require('path');
const { ShowboatWrapper } = require('../src/index.js');

// Simple test framework
function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exit(1);
  }
}

function expect(value) {
  return {
    toBe(expected) {
      if (value !== expected) {
        throw new Error(`Expected ${expected}, got ${value}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(value) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
    },
    toBeTruthy() {
      if (!value) {
        throw new Error(`Expected truthy value, got ${value}`);
      }
    },
    toContain(substring) {
      if (!value.includes(substring)) {
        throw new Error(`Expected "${value}" to contain "${substring}"`);
      }
    }
  };
}

// Test Suite
describe('ShowboatWrapper', () => {
  const testOutputDir = path.join(__dirname, '../test-output');

  // Clean up test output directory before tests
  if (fs.existsSync(testOutputDir)) {
    fs.rmSync(testOutputDir, { recursive: true });
  }
  fs.mkdirSync(testOutputDir, { recursive: true });

  test('isHighImpact correctly identifies high-impact tasks', () => {
    const wrapper = new ShowboatWrapper({ outputDir: testOutputDir });

    // High impact scenarios
    expect(wrapper.isHighImpact({
      task: 'deploy to production',
      filesModified: 3
    })).toBeTruthy();

    expect(wrapper.isHighImpact({
      task: 'implement new feature',
      filesModified: 15
    })).toBeTruthy();

    expect(wrapper.isHighImpact({
      task: 'complex refactoring',
      complexity: 'high'
    })).toBeTruthy();

    expect(wrapper.isHighImpact({
      task: 'migration',
      filesModified: 5
    })).toBeTruthy();

    // Low impact (should be false)
    expect(wrapper.isHighImpact({
      task: 'fix typo',
      filesModified: 1
    }) === false).toBeTruthy();
  });

  test('generateEvidence creates markdown with assertions', () => {
    const wrapper = new ShowboatWrapper({ outputDir: testOutputDir });

    const evidence = wrapper.generateEvidence({
      task: 'deploy authentication system',
      filesModified: 12,
      assertions: [
        { type: 'text', selector: '.login-button', expected: 'Sign In' },
        { type: 'element', selector: '#auth-form', exists: true }
      ],
      outcome: 'success',
      verification: {
        timestamp: new Date().toISOString(),
        exitCode: 0
      }
    });

    expect(evidence).toContain('# Evidence: deploy authentication system');
    expect(evidence).toContain('## Playwright Assertions');
    expect(evidence).toContain('Text Match');
    expect(evidence).toContain('Element Exists');
    expect(evidence).toContain('## Verification');
    expect(evidence).toContain('**Status**: success');
  });

  test('generateEvidence skips assertion section if no assertions', () => {
    const wrapper = new ShowboatWrapper({ outputDir: testOutputDir });

    const evidence = wrapper.generateEvidence({
      task: 'simple fix',
      filesModified: 1,
      outcome: 'success',
      verification: {
        timestamp: new Date().toISOString(),
        exitCode: 0
      }
    });

    expect(!evidence.includes('## Playwright Assertions')).toBeTruthy();
  });

  test('captureEvidence only captures high-impact tasks', () => {
    const wrapper = new ShowboatWrapper({ outputDir: testOutputDir });

    // High impact - should capture
    const highImpactResult = wrapper.captureEvidence({
      task: 'deploy to production',
      filesModified: 5,
      assertions: [
        { type: 'text', selector: '.status', expected: 'Running' }
      ],
      outcome: 'success',
      verification: { exitCode: 0 }
    });

    expect(highImpactResult).toBeTruthy();
    expect(highImpactResult.path).toContain(testOutputDir);
    expect(fs.existsSync(highImpactResult.path)).toBeTruthy();

    // Low impact - should skip
    const lowImpactResult = wrapper.captureEvidence({
      task: 'fix typo in comment',
      filesModified: 1,
      outcome: 'success'
    });

    expect(lowImpactResult === null).toBeTruthy();
  });

  test('evidence file contains machine-readable structure', () => {
    const wrapper = new ShowboatWrapper({ outputDir: testOutputDir });

    const result = wrapper.captureEvidence({
      task: 'integration test scenario',
      filesModified: 20,
      assertions: [
        { type: 'text', selector: '#result', expected: 'PASS' }
      ],
      outcome: 'success',
      verification: { exitCode: 0, timestamp: new Date().toISOString() }
    });

    const content = fs.readFileSync(result.path, 'utf8');
    
    expect(content).toContain('# Evidence: integration test scenario');
    expect(content).toContain('**Files Modified**: 20');
    expect(content).toContain('**Status**: success');
    expect(content).toContain('PASS');
  });

  test('getEvidenceFiles returns all evidence files', () => {
    const wrapper = new ShowboatWrapper({ outputDir: testOutputDir });

    // Capture a few evidence files
    wrapper.captureEvidence({
      task: 'task 1',
      filesModified: 15,
      outcome: 'success',
      verification: { exitCode: 0 }
    });

    wrapper.captureEvidence({
      task: 'task 2', 
      filesModified: 20,
      outcome: 'success',
      verification: { exitCode: 0 }
    });

    const files = wrapper.getEvidenceFiles();
    expect(files.length >= 2).toBeTruthy();
  });

  console.log('\n✅ All tests passed!');
});
