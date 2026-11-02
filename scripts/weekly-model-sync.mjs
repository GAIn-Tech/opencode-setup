#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();
const schemaPath = path.join(root, 'opencode-config', 'models', 'schema.json');
const maxSchemaAgeDays = 14;

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
  console.log('============================================');
  console.log('Weekly Model Catalog Sync Check');
  console.log('============================================');

  runStep('Validate model catalogs', 'node', ['scripts/validate-models.mjs']);
  checkSchemaAge();
  runStep('Run health checks', 'node', ['scripts/health-check.mjs']);

  console.log('\n============================================');
  console.log('[PASS] Weekly model sync checks complete');
  console.log('============================================');
}

main();
