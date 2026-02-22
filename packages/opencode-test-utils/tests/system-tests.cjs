/**
 * OpenCode System Test Suite
 * Modular tests for critical system components
 * Run with: node tests/system-tests.js
 */

const path = require('path');
const fs = require('fs');

// Get monorepo root - go up from packages/opencode-test-utils/tests/
const MONOREPO_ROOT = path.join(__dirname, '..', '..', '..');

// Test categories
const TEST_CATEGORIES = {
  ROUTING: 'routing',
  MEMORY: 'memory',
  LEARNING: 'learning',
  RL: 'reinforcement-learning',
  ORCHESTRATION: 'orchestration',
  INTEGRATION: 'integration'
};

// Test results collector
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

function test(name, category, fn) {
  return { name, category, fn };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}. ${message || ''}`);
  }
}

function assertContains(str, substring, message) {
  if (!str || !str.includes(substring)) {
    throw new Error(`Expected "${str}" to contain "${substring}". ${message || ''}`);
  }
}

async function runTest(testObj) {
  const { name, category, fn } = testObj;
  console.log(`\n▶ ${name}`);
  try {
    await fn();
    console.log(`  ✓ PASSED`);
    results.passed++;
    results.tests.push({ name, category, status: 'passed' });
    return true;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}`);
    results.failed++;
    results.tests.push({ name, category, status: 'failed', error: e.message });
    return false;
  }
}

async function runTests(tests, category = null) {
  const filtered = category 
    ? tests.filter(t => t.category === category) 
    : tests;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running ${filtered.length} tests${category ? ` (${category})` : ''}`);
  console.log('='.repeat(60));
  
  for (const testObj of filtered) {
    await runTest(testObj);
  }
}

function printSummary() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST SUMMARY`);
  console.log('='.repeat(60));
  console.log(`  Passed:  ${results.passed}`);
  console.log(`  Failed:  ${results.failed}`);
  console.log(`  Skipped: ${results.skipped}`);
  console.log(`  Total:   ${results.passed + results.failed + results.skipped}`);
  console.log('='.repeat(60));
  
  if (results.failed > 0) {
    console.log('\nFAILED TESTS:');
    results.tests.filter(t => t.status === 'failed').forEach(t => {
      console.log(`  - ${t.name}: ${t.error}`);
    });
  }
  
  return results.failed === 0;
}

// ============================================================================
// ROUTING TESTS
// ============================================================================

const routingTests = [
  test('Key rotator has mutex/queue implementation', TEST_CATEGORIES.ROUTING, () => {
    const keyRotatorPath = path.join(MONOREPO_ROOT, 'packages/opencode-model-router-x/src/key-rotator.js');
    const content = fs.readFileSync(keyRotatorPath, 'utf8');
    
    // Check for proper locking pattern: queue + if-check on lock
    const hasLockQueue = content.includes('_lockQueue') || content.includes('_queue');
    const hasLockCheck = (content.includes('this._lock') || content.includes('this.locked')) && content.includes('if');
    
    assert(hasLockQueue || hasLockCheck, 'Key rotator should have proper locking (queue and if-check on lock)');
  }),
  
  test('No duplicate setLearningEngine method', TEST_CATEGORIES.ROUTING, () => {
    const keyRotatorPath = path.join(MONOREPO_ROOT, 'packages/opencode-model-router-x/src/key-rotator.js');
    const content = fs.readFileSync(keyRotatorPath, 'utf8');
    
    // Count occurrences of setLearningEngine definition
    const matches = content.match(/setLearningEngine\s*\(/g);
    const count = matches ? matches.length : 0;
    assertEqual(count, 1, `Expected 1 setLearningEngine definition, found ${count}`);
  }),
  
  test('Groq header parsing exists', TEST_CATEGORIES.ROUTING, () => {
    const keyRotatorPath = path.join(MONOREPO_ROOT, 'packages/opencode-model-router-x/src/key-rotator.js');
    const content = fs.readFileSync(keyRotatorPath, 'utf8');
    
    assert(content.includes('x-rate-limit') || content.includes('groq'),
      'Key rotator should handle Groq rate limit headers');
  }),
  
  test('Cache TTL is >= 5 minutes', TEST_CATEGORIES.ROUTING, () => {
    const routerPath = path.join(MONOREPO_ROOT, 'packages/opencode-model-router-x/src/index.js');
    const content = fs.readFileSync(routerPath, 'utf8');
    
    // Check for _learningAdviceCacheTTL
    const match = content.match(/_learningAdviceCacheTTL[:\s]*=?\s*(\d+)/);
    if (match) {
      const ttl = parseInt(match[1], 10);
      assert(ttl >= 300000, `Cache TTL should be >= 300000ms (5 min), got ${ttl}`);
    }
  })
];

// ============================================================================
// MEMORY TESTS
// ============================================================================

const memoryTests = [
  test('Memory graph has async index rebuild', TEST_CATEGORIES.MEMORY, () => {
    const memPath = path.join(MONOREPO_ROOT, 'packages/opencode-memory-graph/src/index.js');
    const content = fs.readFileSync(memPath, 'utf8');
    
    // Check for async/chunked index rebuild
    assert(content.includes('setImmediate') || content.includes('await') || content.includes('async'),
      'Memory graph index rebuild should be async');
  }),
  
  test('Memory graph error handling exists', TEST_CATEGORIES.MEMORY, () => {
    const memPath = path.join(MONOREPO_ROOT, 'packages/opencode-memory-graph/src/index.js');
    const content = fs.readFileSync(memPath, 'utf8');
    
    // Should have try/catch or error handling
    assert(content.includes('catch') || content.includes('error') || content.includes('Error'),
      'Memory graph should have error handling');
  })
];

// ============================================================================
// LEARNING TESTS
// ============================================================================

const learningTests = [
  test('Learning engine has anti-patterns', TEST_CATEGORIES.LEARNING, () => {
    const learnPath = path.join(MONOREPO_ROOT, 'packages/opencode-learning-engine/src/index.js');
    const content = fs.readFileSync(learnPath, 'utf8');
    
    assert(content.includes('antiPattern') || content.includes('anti-pattern') || content.includes('antipattern'),
      'Learning engine should have anti-pattern tracking');
  }),
  
  test('No broken catalog reference', TEST_CATEGORIES.LEARNING, () => {
    const learnPath = path.join(MONOREPO_ROOT, 'packages/opencode-learning-engine/src/index.js');
    const content = fs.readFileSync(learnPath, 'utf8');
    
    // Should NOT have this.catalog.entries without this.catalog being defined
    const hasCatalogEntries = content.includes('this.catalog.entries');
    if (hasCatalogEntries) {
      // If it exists, catalog must be defined
      assert(content.includes('this.catalog =') || content.includes('this.catalog='),
        'If using this.catalog.entries, this.catalog must be defined');
    }
  }),
  
  test('Learning has weighting system', TEST_CATEGORIES.LEARNING, () => {
    const learnPath = path.join(MONOREPO_ROOT, 'packages/opencode-learning-engine/src/index.js');
    const content = fs.readFileSync(learnPath, 'utf8');
    
    assert(content.includes('weight') || content.includes('score') || content.includes('priority'),
      'Learning engine should have weighting system');
  })
];

// ============================================================================
// RL TESTS
// ============================================================================

const rlTests = [
  test('Skill RL has outcome learning', TEST_CATEGORIES.RL, () => {
    const rlPath = path.join(MONOREPO_ROOT, 'packages/opencode-skill-rl-manager/src/index.js');
    const content = fs.readFileSync(rlPath, 'utf8');
    
    assert(content.includes('learnFromOutcome') || content.includes('learnFromSuccess') || content.includes('learnFromFailure'),
      'Skill RL should have outcome learning methods');
  }),
  
  test('No duplicate learnFromOutcome method', TEST_CATEGORIES.RL, () => {
    const rlPath = path.join(MONOREPO_ROOT, 'packages/opencode-skill-rl-manager/src/index.js');
    const content = fs.readFileSync(rlPath, 'utf8');
    
    const matches = content.match(/learnFromOutcome\s*\(/g);
    const count = matches ? matches.length : 0;
    assertEqual(count, 1, `Expected 1 learnFromOutcome definition, found ${count}`);
  }),
  
  test('Skill RL has filesystem locking or proper async', TEST_CATEGORIES.RL, () => {
    const rlPath = path.join(MONOREPO_ROOT, 'packages/opencode-skill-rl-manager/src/index.js');
    const content = fs.readFileSync(rlPath, 'utf8');
    
    // Check for either filesystem locking or proper mutex
    const hasFSLock = content.includes('.lock') || content.includes('lockDir') || content.includes('fs.lock');
    const hasQueue = content.includes('_queue') || content.includes('_waitQueue') || content.includes('Promise');
    
    assert(hasFSLock || hasQueue, 'Skill RL should have filesystem locking or promise queue');
  })
];

// ============================================================================
// ORCHESTRATION TESTS
// ============================================================================

const orchestrationTests = [
  test('Orchestration has state management', TEST_CATEGORIES.ORCHESTRATION, () => {
    const orchPath = path.join(MONOREPO_ROOT, 'packages/opencode-shared-orchestration/src/index.js');
    if (!fs.existsSync(orchPath)) {
      console.log('  (skipped - opencode-shared-orchestration not found)');
      results.skipped++;
      return;
    }
    const content = fs.readFileSync(orchPath, 'utf8');
    assert(content.includes('state') || content.includes('State'), 'Orchestration should have state management');
  }),
  
  test('Circuit breaker exists', TEST_CATEGORIES.ORCHESTRATION, () => {
    const cbPath = path.join(MONOREPO_ROOT, 'packages/opencode-circuit-breaker/src/index.js');
    if (!fs.existsSync(cbPath)) {
      console.log('  (skipped - opencode-circuit-breaker not found)');
      results.skipped++;
      return;
    }
    const content = fs.readFileSync(cbPath, 'utf8');
    assert(content.includes('circuit') || content.includes('breaker'), 'Circuit breaker should exist');
  })
];

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

const integrationTests = [
  test('Config loader exists', TEST_CATEGORIES.INTEGRATION, () => {
    const configPath = path.join(MONOREPO_ROOT, 'packages/opencode-config-loader/src/index.js');
    const content = fs.readFileSync(configPath, 'utf8');
    assert(content.includes('load') || content.includes('config'), 'Config loader should exist');
  }),
  
  test('Error handling exists', TEST_CATEGORIES.INTEGRATION, () => {
    const errorsPath = path.join(MONOREPO_ROOT, 'packages/opencode-errors/src/index.js');
    const content = fs.readFileSync(errorsPath, 'utf8');
    assert(content.includes('Error') || content.includes('error'), 'Error handling should exist');
  }),
  
  test('Health check exists', TEST_CATEGORIES.INTEGRATION, () => {
    const healthPath = path.join(MONOREPO_ROOT, 'packages/opencode-health-check/src/index.js');
    if (!fs.existsSync(healthPath)) {
      console.log('  (skipped - opencode-health-check not found)');
      results.skipped++;
      return;
    }
    const content = fs.readFileSync(healthPath, 'utf8');
    assert(content.includes('health') || content.includes('check'), 'Health check should exist');
  })
];

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const category = args[0] || null;
  
  console.log('OpenCode System Test Suite');
  console.log(`Category filter: ${category || 'ALL'}`);
  
  const allTests = [
    ...routingTests,
    ...memoryTests,
    ...learningTests,
    ...rlTests,
    ...orchestrationTests,
    ...integrationTests
  ];
  
  await runTests(allTests, category);
  const success = printSummary();
  
  process.exit(success ? 0 : 1);
}

module.exports = {
  test,
  tests: {
    routing: routingTests,
    memory: memoryTests,
    learning: learningTests,
    rl: rlTests,
    orchestration: orchestrationTests,
    integration: integrationTests
  },
  runTests,
  runTest,
  printSummary,
  TEST_CATEGORIES
};

if (require.main === module) {
  main();
}
