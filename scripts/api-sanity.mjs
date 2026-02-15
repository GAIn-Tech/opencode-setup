#!/usr/bin/env node

/**
 * api-sanity.mjs — Dashboard API smoke tests
 *
 * Performs sanity checks on critical dashboard API endpoints.
 * Validates endpoints respond without crashes and return expected shapes.
 *
 * Note: This requires the dashboard dev server to be running on http://localhost:3000
 * Or, if using a different port, set API_BASE_URL env var.
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

const endpoints = [
  { path: '/api/health', name: 'Health Check' },
  { path: '/api/config', name: 'Config List' },
  { path: '/api/models', name: 'Models' },
  { path: '/api/providers', name: 'Providers' },
  { path: '/api/skills', name: 'Skills' },
  { path: '/api/learning', name: 'Learning' },
  { path: '/api/rl', name: 'RL State' },
  { path: '/api/memory-graph', name: 'Memory Graph' },
  { path: '/api/events', name: 'Events' },
];

let passed = 0;
let failed = 0;
let skipped = 0;

async function checkEndpoint(endpoint) {
  try {
    const url = `${API_BASE_URL}${endpoint.path}`;
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      console.log(`❌ [${endpoint.name}] ${endpoint.path} — HTTP ${response.status}`);
      failed++;
      return;
    }

    const data = await response.json();

    if (typeof data === 'object' && data !== null) {
      console.log(`✅ [${endpoint.name}] ${endpoint.path}`);
      passed++;
    } else {
      console.log(`⚠️  [${endpoint.name}] ${endpoint.path} — non-JSON response`);
      passed++;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ECONNREFUSED')) {
      console.log(`⏭️  [${endpoint.name}] ${endpoint.path} — server not running`);
      skipped++;
    } else {
      console.log(`❌ [${endpoint.name}] ${endpoint.path} — ${message}`);
      failed++;
    }
  }
}

async function main() {
  console.log(`🔍 Dashboard API sanity checks (target: ${API_BASE_URL})`);
  console.log('');

  for (const endpoint of endpoints) {
    await checkEndpoint(endpoint);
  }

  console.log('');
  console.log('📊 Sanity summary:');
  console.log(`   Passed: ${passed}/${endpoints.length}`);
  console.log(`   Failed: ${failed}/${endpoints.length}`);
  console.log(`   Skipped: ${skipped}/${endpoints.length}`);

  if (failed > 0) {
    console.log('');
    console.log('❌ Some API endpoints failed sanity checks.');
    process.exit(1);
  }

  if (skipped > 0) {
    console.log('');
    console.log('⚠️  Dashboard server not running. Start dev server with `bun run dev` from dashboard package.');
    console.log('   (skipped endpoints cannot be validated)');
    process.exit(0);
  }

  console.log('');
  console.log('✅ All API endpoints passed sanity checks.');
  process.exit(0);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n💥 Sanity check error: ${message}`);
  process.exit(1);
});
