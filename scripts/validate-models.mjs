#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();
const CUTOFF_DATE = '2025-06-01';
const require = createRequire(import.meta.url);
const { validateOpencodeConfigFile } = require(path.join(root, 'opencode-config', 'validate-schema.js'));

const SCAN_FILES = [
  'opencode-config/opencode.json',
  'opencode-config/oh-my-opencode.json',
  'opencode-config/config.yaml',
  'opencode-config/rate-limit-fallback.json',
  'rate-limit-fallback.json',
  'packages/opencode-model-router-x/src/policies.json',
  'packages/opencode-model-router-x/src/strategies/fallback-layer-strategy.js',
  'packages/opencode-model-router-x/src/strategies/perspective-switch-strategy.js',
  'packages/opencode-model-router-x/src/strategies/project-start-strategy.js',
  'packages/opencode-model-router-x/src/thompson-sampling-router.js',
  'packages/opencode-model-router-x/src/model-discovery.js',
  'scripts/health-check.mjs',
];

const FORBIDDEN_PATTERNS = [
  { name: 'OpenAI pre-GPT-5 family', regex: /\bgpt-4(?:\.|o|\b)|\bgpt-3(?:\.|\b)|\bo1\b/i },
  { name: 'Gemini pre-3 family', regex: /\bgemini-(?:1\.|2\.(?!5))/i },
  { name: 'Claude 3 family', regex: /\bclaude-3(?:\.|-|\b)/i },
  { name: 'Llama 3 family', regex: /\bllama-3(?:\.|-|\b)/i },
  { name: 'DeepSeek legacy ids', regex: /\bdeepseek-(?:chat|coder)\b/i },
  { name: 'Generic codex alias', regex: /\bgpt-5-codex\b/i },
];

function print(level, message, details = null) {
  console.log(`[${level}] ${message}`);
  if (details) console.log(`  ${details}`);
}

function readJson(relPath) {
  const fullPath = path.join(root, relPath);
  return JSON.parse(readFileSync(fullPath, 'utf8'));
}

function collectValidModels() {
  const opencode = readJson('opencode-config/opencode.json');
  const providerToIds = new Map();
  const plainIds = new Set();
  const qualifiedIds = new Set();

  for (const [provider, providerConfig] of Object.entries(opencode.provider || opencode.models || {})) {
    const ids = Object.keys(providerConfig.models || {});
    providerToIds.set(provider, new Set(ids));
    for (const id of ids) {
      plainIds.add(id);
      qualifiedIds.add(`${provider}/${id}`);
    }
  }

  return { providerToIds, plainIds, qualifiedIds };
}

function validateCatalogReleaseWindow() {
  const catalog = readJson('opencode-config/models/catalog-2026.json');
  const violations = [];

  for (const [key, config] of Object.entries(catalog.models || {})) {
    const releaseDate = String(config.releaseDate || '').trim();
    if (!releaseDate) {
      violations.push(`${key} missing releaseDate`);
      continue;
    }
    if (releaseDate < CUTOFF_DATE) {
      violations.push(`${key} releaseDate ${releaseDate} is before ${CUTOFF_DATE}`);
    }
  }

  if (violations.length === 0) {
    print('PASS', 'Catalog release window', `All catalog entries are >= ${CUTOFF_DATE}`);
    return 0;
  }

  print('FAIL', 'Catalog release window', `${violations.length} pre-mid-2025 entry(s)`);
  for (const violation of violations) {
    console.log(`  - ${violation}`);
  }
  return violations.length;
}

function validateFallbackFile(relPath, validPlainIds) {
  const file = readJson(relPath);
  const issues = [];
  const list = Array.isArray(file.fallbackModels) ? file.fallbackModels : [];

  for (const entry of list) {
    const id = String(entry.modelID || '').trim();
    if (!id) {
      issues.push('empty modelID');
      continue;
    }
    if (!validPlainIds.has(id)) {
      issues.push(`unknown modelID: ${id}`);
    }
  }

  if (issues.length === 0) {
    print('PASS', relPath, `${list.length} fallback model IDs validated`);
    return 0;
  }

  print('FAIL', relPath, `${issues.length} issue(s)`);
  for (const issue of issues) {
    console.log(`  - ${issue}`);
  }
  return issues.length;
}

function validateOhMyOmo(validQualifiedIds) {
  const relPath = 'opencode-config/oh-my-opencode.json';
  const file = readJson(relPath);
  const enabled = Array.isArray(file?.agents?.enabled) ? file.agents.enabled : [];
  const issues = [];

  for (const agent of enabled) {
    const model = String(file?.agents?.[agent]?.model || '').trim();
    if (!model) {
      issues.push(`agent '${agent}' missing model`);
      continue;
    }
    if (!validQualifiedIds.has(model)) {
      issues.push(`agent '${agent}' uses unknown model '${model}'`);
    }
  }

  if (issues.length === 0) {
    print('PASS', relPath, `${enabled.length} enabled agent model references validated`);
    return 0;
  }

  print('FAIL', relPath, `${issues.length} issue(s)`);
  for (const issue of issues) {
    console.log(`  - ${issue}`);
  }
  return issues.length;
}

function validateConfigYaml(validPlainIds) {
  const relPath = 'opencode-config/config.yaml';
  const fullPath = path.join(root, relPath);
  const text = readFileSync(fullPath, 'utf8');
  const issues = [];

  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^models:\s*\[([^\]]+)\]/);
    if (!match) continue;
    const ids = match[1]
      .split(',')
      .map((x) => x.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    for (const id of ids) {
      if (!validPlainIds.has(id)) {
        issues.push(`unknown delegation model '${id}'`);
      }
    }
  }

  if (issues.length === 0) {
    print('PASS', relPath, 'Delegation model IDs validated');
    return 0;
  }

  print('FAIL', relPath, `${issues.length} issue(s)`);
  for (const issue of issues) {
    console.log(`  - ${issue}`);
  }
  return issues.length;
}

function scanForbiddenPatterns() {
  let issueCount = 0;

  for (const relPath of SCAN_FILES) {
    const fullPath = path.join(root, relPath);
    if (!existsSync(fullPath)) {
      print('WARN', relPath, 'missing file (skipped)');
      continue;
    }

    const text = readFileSync(fullPath, 'utf8');
    const hits = [];
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.regex.test(text)) {
        hits.push(pattern.name);
      }
      pattern.regex.lastIndex = 0;
    }

    if (hits.length === 0) {
      print('PASS', relPath, 'No forbidden stale model patterns');
      continue;
    }

    issueCount += hits.length;
    print('FAIL', relPath, `${hits.length} forbidden pattern hit(s)`);
    for (const hit of hits) {
      console.log(`  - ${hit}`);
    }
  }

  return issueCount;
}

function main() {
  console.log('='.repeat(64));
  console.log('MODEL VALIDATION (POST-MID-2025 POLICY)');
  console.log('='.repeat(64));
  console.log('');

  const schemaResult = validateOpencodeConfigFile(path.join(root, 'opencode-config', 'opencode.json'));
  if (!schemaResult.ok) {
    print('FAIL', 'opencode-config/opencode.json schema', `${schemaResult.errors.length} schema issue(s)`);
    for (const issue of schemaResult.errors) {
      console.log(`  - ${issue}`);
    }
    process.exit(1);
  }
  print('PASS', 'opencode-config/opencode.json schema', 'Schema validation passed');
  for (const warning of schemaResult.warnings) {
    console.log(`  WARN: ${warning}`);
  }
  console.log('');

  const { plainIds, qualifiedIds } = collectValidModels();

  let issues = 0;
  issues += validateCatalogReleaseWindow();
  console.log('');
  issues += validateFallbackFile('opencode-config/rate-limit-fallback.json', plainIds);
  issues += validateFallbackFile('rate-limit-fallback.json', plainIds);
  issues += validateOhMyOmo(qualifiedIds);
  issues += validateConfigYaml(plainIds);
  console.log('');
  issues += scanForbiddenPatterns();

  console.log('');
  console.log('='.repeat(64));
  if (issues === 0) {
    print('PASS', 'MODEL VALIDATION', 'All active references are current and policy-compliant');
    process.exit(0);
  }

  print('FAIL', 'MODEL VALIDATION', `Found ${issues} issue(s)`);
  process.exit(1);
}

main();
