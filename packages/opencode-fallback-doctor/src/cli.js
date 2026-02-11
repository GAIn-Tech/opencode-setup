#!/usr/bin/env node
'use strict';

const { FallbackDoctor } = require('./index');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
fallback-doctor - Validate OpenCode fallback model chains

Usage:
  fallback-doctor                     Validate from stdin (JSON)
  fallback-doctor <config.json>       Validate from file
  fallback-doctor --models m1,m2,...   Validate inline model list
  fallback-doctor --list [provider]   List known models

Options:
  --models <csv>   Comma-separated model list
  --list [prov]    List known models (optionally by provider)
  --help, -h       Show this help
`);
  process.exit(0);
}

const doctor = new FallbackDoctor();

// --list mode
if (args.includes('--list')) {
  const idx = args.indexOf('--list');
  const provider = args[idx + 1] || undefined;
  const { listKnownModels } = require('./validators');
  const models = listKnownModels(provider);
  console.log(`Known models${provider ? ` (${provider})` : ''}:`);
  for (const m of models) {
    console.log(`  ${m}`);
  }
  process.exit(0);
}

// --models inline mode
if (args.includes('--models')) {
  const idx = args.indexOf('--models');
  const csv = args[idx + 1];
  if (!csv) {
    console.error('Error: --models requires a comma-separated list');
    process.exit(1);
  }
  const models = csv.split(',').map((m) => m.trim()).filter(Boolean);
  const result = doctor.diagnose({ models });
  console.log(doctor.report());
  process.exit(result.healthy ? 0 : 1);
}

// File mode
if (args.length > 0 && !args[0].startsWith('-')) {
  const filePath = path.resolve(args[0]);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const config = JSON.parse(raw);
    const models = config.models || config.fallback || config.fallbackChain;
    if (!models) {
      console.error('Error: Config file must have "models", "fallback", or "fallbackChain" array.');
      process.exit(1);
    }
    const result = doctor.diagnose({ models: Array.isArray(models) ? models : [models] });
    console.log(doctor.report());
    process.exit(result.healthy ? 0 : 1);
  } catch (err) {
    console.error(`Error reading ${filePath}: ${err.message}`);
    process.exit(1);
  }
}

// Stdin mode (pipe JSON)
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('readable', () => {
  let chunk;
  while ((chunk = process.stdin.read()) !== null) {
    input += chunk;
  }
});
process.stdin.on('end', () => {
  if (!input.trim()) {
    console.log(doctor.report({ models: [] }));
    process.exit(1);
  }
  try {
    const config = JSON.parse(input);
    const models = config.models || config.fallback || config.fallbackChain || [];
    doctor.diagnose({ models: Array.isArray(models) ? models : [models] });
    console.log(doctor.report());
    process.exit(doctor._lastDiagnosis.healthy ? 0 : 1);
  } catch (err) {
    console.error(`Error parsing stdin JSON: ${err.message}`);
    process.exit(1);
  }
});
