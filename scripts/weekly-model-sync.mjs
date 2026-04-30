#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();
const schemaPath = path.join(root, 'opencode-config', 'models', 'schema.json');
const maxSchemaAgeDays = 14;
const require = createRequire(import.meta.url);
const { runModelManagementCycle } = require('../packages/opencode-model-manager/src/automation/model-management-runner.js');

function runStep(label, command, args) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\n[FAIL] ${label}`);
    process.exit(result.status || 1);
  }
  console.log(`[PASS] ${label}`);
}

function checkSchemaAge() {
  console.log('\n== Check model schema recency ==');
  if (!existsSync(schemaPath)) {
    console.error('[FAIL] schema.json missing');
    console.error('  Expected: opencode-config/models/schema.json');
    process.exit(1);
  }

  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const lastUpdated = schema.lastUpdated ? new Date(schema.lastUpdated) : null;
  if (!lastUpdated || Number.isNaN(lastUpdated.getTime())) {
    console.error('[FAIL] schema.lastUpdated missing or invalid');
    process.exit(1);
  }

  const ageMs = Date.now() - lastUpdated.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays > maxSchemaAgeDays) {
    console.error(`[FAIL] schema is stale (${ageDays.toFixed(1)} days old)`);
    console.error(`  Update opencode-config/models/schema.json (max ${maxSchemaAgeDays} days)`);
    process.exit(1);
  }

  console.log(`[PASS] schema recency (${ageDays.toFixed(1)} days old)`);
}

function main() {
  return runWeeklyModelSync();
}

async function runWeeklyModelSync(options = {}) {
  console.log('============================================');
  console.log('Weekly Model Catalog Sync Check');
  console.log('============================================');

  const runStepFn = options.runStep || runStep;
  const checkSchemaAgeFn = options.checkSchemaAge || checkSchemaAge;
  const runCycle = options.runCycle || createCycleRunner();

  runStepFn('Validate model catalogs', 'bun', ['scripts/validate-models.mjs']);
  checkSchemaAgeFn();
  runStepFn('Run health checks', 'bun', ['scripts/health-check.mjs']);

  console.log('\n== Run model management automation ==');
  const result = await runCycle();

  const summary = {
    providerCoverage: result.providers || ['openai', 'google', 'groq', 'cerebras', 'nvidia'],
    discoveredCount: result.discovery?.models?.length || 0,
    addedCount: result.diff?.added?.length || 0,
    modifiedCount: result.diff?.modified?.length || 0,
    removedCount: result.diff?.removed?.length || 0,
    assessedCount: result.approvalSummary?.assessedCount || result.assessments?.length || 0,
    autoApprovedCount: result.approvalSummary?.autoApproved || 0,
    manualReviewCount: result.approvalSummary?.manualReview || 0,
    blockedCount: result.approvalSummary?.blocked || 0,
    catalogUpdatePrepared: Boolean(result.catalogUpdatePrepared)
  };

  console.log(JSON.stringify(summary, null, 2));

  console.log('\n============================================');
  console.log('[PASS] Weekly model sync checks complete');
  console.log('============================================');

  return { result, summary };
}

function createCycleRunner() {
  if (process.env.WEEKLY_MODEL_SYNC_TEST_MODE === '1') {
    return async () => ({
      providers: ['openai', 'google', 'groq', 'cerebras', 'nvidia'],
      discovery: { models: [{ id: 'openai/gpt-5' }, { id: 'google/gemini-3-pro' }] },
      diff: {
        added: [{ model: { id: 'google/gemini-3-pro' } }],
        modified: [{ model: { id: 'openai/gpt-5' } }],
        removed: []
      },
      assessments: [{ modelId: 'openai/gpt-5' }, { modelId: 'google/gemini-3-pro' }],
      approvalSummary: {
        assessedCount: 2,
        autoApproved: 1,
        manualReview: 1,
        blocked: 0
      },
      catalogUpdatePrepared: true
    });
  }

  return () => runModelManagementCycle({
    providers: ['openai', 'google', 'groq', 'cerebras', 'nvidia'],
    catalogPath: path.join(root, 'opencode-config', 'models', 'catalog-2026.json'),
    repoPath: root,
    dryRun: true,
    generatePrMetadata: true
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  runWeeklyModelSync,
  runStep,
  checkSchemaAge
};
