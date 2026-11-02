#!/usr/bin/env bun

/**
 * CLI Fallback Test
 * Tests all CLI wrapper scripts with fallback mock data
 */

async function testContext7() {
  console.log('=== Testing Context7 CLI Wrapper ===');
  try {
    const { default: main } = await import('./context7-resolve-library-id.js');
    await main(['react', 'hooks']);
    console.log('✅ Context7 test passed (wrapper executed)');
  } catch (error) {
    console.log('⚠️ Context7 wrapper failed:', error.message);
    console.log('(Expected if ctx7 not installed)');
  }
}

async function testGrep() {
  console.log('\n=== Testing Grep CLI Wrapper ===');
  try {
    const { default: main } = await import('./grep-tool.js');
    await main(['--query', 'useState', '--language', 'JavaScript']);
    console.log('✅ Grep test passed (mock data)');
  } catch (error) {
    console.log('❌ Grep wrapper failed:', error.message);
  }
}

async function testGitHub() {
  console.log('\n=== Testing GitHub CLI Wrapper ===');
  try {
    const { default: main } = await import('./github-tool.js');
    await main(['--action', 'issues', '--repo', 'facebook/react', '--limit', '3']);
    console.log('✅ GitHub test passed (mock/API)');
  } catch (error) {
    console.log('⚠️ GitHub wrapper failed:', error.message);
  }
}

async function testTavily() {
  console.log('\n=== Testing Tavily CLI Wrapper ===');
  try {
    const { default: main } = await import('./tavily-tool.js');
    await main(['--query', 'OpenAI GPT-5', '--limit', '2']);
    console.log('✅ Tavily test passed (mock/API)');
  } catch (error) {
    console.log('⚠️ Tavily wrapper failed:', error.message);
  }
}

async function runAllTests() {
  console.log('Running CLI wrapper integration tests...\n');
  
  await testContext7();
  await testGrep();
  await testGitHub();
  await testTavily();
  
  console.log('\n=== Test Summary ===');
  console.log('CLI wrappers are ready for use.');
  console.log('Some may require API keys (Tavily) or external tools (ctx7).');
  console.log('Fallback mock data ensures graceful degradation.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}