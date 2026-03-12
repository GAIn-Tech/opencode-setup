#!/usr/bin/env node
/**
 * bootstrap-runtime.mjs — Canonical runtime entry point.
 *
 * Usage:
 *   import { getRuntime } from './bootstrap-runtime.mjs';
 *   const runtime = getRuntime();
 *   const ctx = runtime.resolveRuntimeContext({ sessionId, model, taskType });
 *
 * Or run directly:
 *   node scripts/bootstrap-runtime.mjs --status
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { bootstrap, getBootstrapStatus } = require(
  '../packages/opencode-integration-layer/src/bootstrap.js'
);

let runtime = null;

export function getRuntime(options = {}) {
  if (!runtime) {
    runtime = bootstrap(options);
  }
  return runtime;
}

export function getRuntimeStatus() {
  return getBootstrapStatus();
}

// CLI mode: node scripts/bootstrap-runtime.mjs --status
if (import.meta.url === `file://${process.argv[1]}` || process.argv.includes('--status')) {
  const rt = getRuntime();
  const status = getRuntimeStatus();
  console.log('Bootstrap Status:');
  console.log(JSON.stringify(status, null, 2));
  console.log(`\nIntegrationLayer ready: ${!!rt}`);
  console.log(`Runtime context methods: resolveRuntimeContext, selectToolsForTask, checkContextBudget`);
}
