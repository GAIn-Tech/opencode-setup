#!/usr/bin/env node

import path from 'node:path';
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
  const entries = new Map();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    entries.set(key, value);
  }
  return entries;
}

function isAbsolutePath(value) {
  if (!value) return false;
  if (path.isAbsolute(value)) return true;
  if (/^[A-Za-z]:[\\/]/.test(value)) return true;
  if (/^\\\\[^\\]+\\[^\\]+/.test(value)) return true;
  return false;
}

function isSemver(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

function parseInteger(value) {
  if (!/^-?\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function main() {
  const envExample = readFileSync('.env.example', 'utf8');
  const entries = parseEnvExample(envExample);

  const missing = requiredKeys.filter((key) => !entries.has(key));
  if (missing.length > 0) {
    console.error(`env-contract-check: FAIL (${missing.length} missing key${missing.length === 1 ? '' : 's'})`);
    for (const key of missing) {
      console.error(`- Missing in .env.example: ${key}`);
    }
    process.exit(1);
  }

  const issues = [];

  const expectedBunVersion = String(entries.get('OPENCODE_REQUIRED_BUN_VERSION') || '').trim();
  if (!expectedBunVersion) {
    issues.push('OPENCODE_REQUIRED_BUN_VERSION must be non-empty.');
  } else if (!isSemver(expectedBunVersion)) {
    issues.push(`OPENCODE_REQUIRED_BUN_VERSION must be semver (found: ${expectedBunVersion}).`);
  }

  const optionalPathKeys = [
    'OPENCODE_BUN_PATH',
    'OPENCODE_ROOT',
    'OPENCODE_CONFIG_HOME',
    'OPENCODE_DATA_HOME',
    'BUN_INSTALL',
  ];
  for (const key of optionalPathKeys) {
    const rawValue = String(entries.get(key) || '').trim();
    if (!rawValue) continue;
    if (!isAbsolutePath(rawValue)) {
      issues.push(`${key} must be an absolute path when set (found: ${rawValue}).`);
    }
  }

  const numericRules = [
    { key: 'RATE_LIMIT_COOLDOWN_MS', min: 1, max: Number.MAX_SAFE_INTEGER },
    { key: 'RATE_LIMIT_MAX_FAILURES', min: 1, max: Number.MAX_SAFE_INTEGER },
    { key: 'QUOTA_WARNING_THRESHOLD', min: 0, max: 100 },
    { key: 'QUOTA_CRITICAL_THRESHOLD', min: 0, max: 100 },
  ];

  const numericValues = new Map();
  for (const rule of numericRules) {
    const rawValue = String(entries.get(rule.key) || '').trim();
    if (!rawValue) {
      issues.push(`${rule.key} must be non-empty.`);
      continue;
    }

    const numericValue = parseInteger(rawValue);
    if (numericValue === null) {
      issues.push(`${rule.key} must be an integer (found: ${rawValue}).`);
      continue;
    }

    if (numericValue < rule.min || numericValue > rule.max) {
      issues.push(`${rule.key} must be between ${rule.min} and ${rule.max} (found: ${numericValue}).`);
      continue;
    }

    numericValues.set(rule.key, numericValue);
  }

  const warning = numericValues.get('QUOTA_WARNING_THRESHOLD');
  const critical = numericValues.get('QUOTA_CRITICAL_THRESHOLD');
  if (typeof warning === 'number' && typeof critical === 'number' && warning >= critical) {
    issues.push(`QUOTA_WARNING_THRESHOLD (${warning}) must be lower than QUOTA_CRITICAL_THRESHOLD (${critical}).`);
  }

  if (issues.length > 0) {
    console.error(`env-contract-check: FAIL (${issues.length} semantic issue${issues.length === 1 ? '' : 's'})`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`env-contract-check: PASS (${requiredKeys.length} required keys present)`);
}

main();
