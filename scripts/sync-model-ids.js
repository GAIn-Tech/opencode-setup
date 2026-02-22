#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const opencodePath = path.join(__dirname, '../opencode-config/opencode.json');

try {
  const opencode = JSON.parse(fs.readFileSync(opencodePath, 'utf8'));

  if (opencode.provider && !opencode.models) {
    console.error('sync-model-ids.js is deprecated for provider-keyed schema and intentionally does not mutate config.');
    console.error('Use: node scripts/validate-models.mjs');
    process.exit(1);
  }

  console.error('Unsupported config shape for sync-model-ids.js.');
  console.error('Use: node scripts/validate-models.mjs');
  process.exit(1);
} catch (err) {
  console.error(`sync-model-ids.js failed: ${err.message}`);
  process.exit(1);
}
