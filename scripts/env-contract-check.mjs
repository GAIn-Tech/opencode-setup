#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const requiredKeys = [
  'OPENCODE_BUN_PATH',
  'OPENCODE_REQUIRED_BUN_VERSION',
  'OPENCODE_ROOT',
  'OPENCODE_CONFIG_HOME',
  'OPENCODE_DATA_HOME',
  'PLUGIN_SCOPE',
  'BUN_INSTALL',
  'ANTHROPIC_API_KEYS',
  'OPENAI_API_KEYS',
  'GOOGLE_API_KEYS',
  'GITHUB_TOKEN',
  'TAVILY_API_KEY',
  'SUPERMEMORY_API_KEY',
];

function parseEnvExample(content) {
  const keys = new Set();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    keys.add(line.slice(0, idx).trim());
  }
  return keys;
}

function main() {
  const envExample = readFileSync('.env.example', 'utf8');
  const keys = parseEnvExample(envExample);

  const missing = requiredKeys.filter((key) => !keys.has(key));
  if (missing.length > 0) {
    console.error(`env-contract-check: FAIL (${missing.length} missing key${missing.length === 1 ? '' : 's'})`);
    for (const key of missing) {
      console.error(`- Missing in .env.example: ${key}`);
    }
    process.exit(1);
  }

  console.log(`env-contract-check: PASS (${requiredKeys.length} required keys present)`);
}

main();
