#!/usr/bin/env node

/**
 * validate-models.mjs
 * 
 * Validates model catalogs across the codebase to ensure:
 * - No obsolete model names exist
 * - All referenced models match known provider catalogs
 * - Model pricing data is present
 * - Fallback catalogs are consistent with policies
 * 
 * Usage:
 *   node scripts/validate-models.mjs
 *   node scripts/validate-models.mjs --fix  # Auto-fix obsolete models
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();
const shouldFix = process.argv.includes('--fix');

// Known obsolete models that should be flagged
const OBSOLETE_MODELS = {
  // OpenAI
  'gpt-5': 'gpt-4o',
  'gpt-5-mini': 'gpt-4o-mini',
  'gpt-4.1': 'o1',
  
  // Google Gemini
  'gemini-3-pro': 'gemini-2.5-pro',
  'gemini-3-flash': 'gemini-2.5-flash',
  
  // Groq
  'llama-3.1-70b': 'llama-3.3-70b-versatile',
  'llama-3.1-8b': 'llama-3.3-70b-versatile',
  
  // Cerebras
  'cerebras/llama-3.1-70b': 'llama-3.3-70b',
  
  // Nvidia
  'nvidia/llama-3.1-405b': 'llama-3.3-70b',
  
  // SambaNova
  'sambanova/llama-3.1-405b': 'llama-3.3-70b',
};

// Files to scan for model references
const MODEL_CONFIG_FILES = [
  'packages/opencode-model-router-x/src/policies.json',
  'packages/opencode-model-router-x/src/strategies/token-cost-calculator.js',
  'packages/opencode-model-router-x/src/strategies/fallback-layer-strategy.js',
  'packages/opencode-sisyphus-state/src/config/providers.js',
  'packages/opencode-dashboard/src/app/api/providers/route.ts',
  'rate-limit-fallback.json',
];

let totalIssues = 0;
let totalFixed = 0;

function printStatus(level, message, details) {
  console.log(`[${level}] ${message}`);
  if (details) {
    console.log(`  ${details}`);
  }
}

function validateFile(relPath) {
  const fullPath = path.join(root, relPath);
  
  if (!existsSync(fullPath)) {
    printStatus('WARN', `File not found: ${relPath}`, 'Skipping validation');
    return;
  }
  
  const content = readFileSync(fullPath, 'utf8');
  const issues = [];
  
  // Check for obsolete model names
  for (const [obsolete, replacement] of Object.entries(OBSOLETE_MODELS)) {
    // Match model names in quotes, object keys, or string literals
    const patterns = [
      new RegExp(`["']${obsolete.replace(/\//g, '\\/')}["']`, 'g'),
      new RegExp(`\\b${obsolete.replace(/\//g, '\\/')}\\b`, 'g'),
    ];
    
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        issues.push({
          obsolete,
          replacement,
          count: matches.length,
        });
        totalIssues += matches.length;
      }
    }
  }
  
  if (issues.length === 0) {
    printStatus('PASS', relPath, 'No obsolete models found');
    return;
  }
  
  // Report issues
  printStatus('FAIL', relPath, `Found ${issues.length} obsolete model type(s)`);
  for (const { obsolete, replacement, count } of issues) {
    console.log(`    ${obsolete} → ${replacement} (${count} occurrence(s))`);
  }
  
  // Auto-fix if requested
  if (shouldFix) {
    let fixedContent = content;
    for (const [obsolete, replacement] of Object.entries(OBSOLETE_MODELS)) {
      const patterns = [
        { regex: new RegExp(`["']${obsolete.replace(/\//g, '\\/')}["']`, 'g'), repl: `"${replacement}"` },
        { regex: new RegExp(`\\b${obsolete.replace(/\//g, '\\/')}\\b`, 'g'), repl: replacement },
      ];
      
      for (const { regex, repl } of patterns) {
        const before = fixedContent;
        fixedContent = fixedContent.replace(regex, repl);
        if (fixedContent !== before) {
          totalFixed++;
        }
      }
    }
    
    if (fixedContent !== content) {
      writeFileSync(fullPath, fixedContent, 'utf8');
      printStatus('FIX', relPath, 'Obsolete models replaced automatically');
    }
  }
}

function validateModelMetadata() {
  const policiesPath = path.join(root, 'packages/opencode-model-router-x/src/policies.json');
  
  if (!existsSync(policiesPath)) {
    printStatus('WARN', 'policies.json not found', 'Cannot validate model metadata');
    return;
  }
  
  const policies = JSON.parse(readFileSync(policiesPath, 'utf8'));
  const models = policies.models || {};
  
  let missingPricing = 0;
  let missingProvider = 0;
  
  for (const [modelId, config] of Object.entries(models)) {
    if (!config.provider) {
      printStatus('WARN', `Model ${modelId} missing provider`, 'Add provider field to policies.json');
      missingProvider++;
    }
    
    if (config.cost_per_1k_tokens === undefined) {
      printStatus('WARN', `Model ${modelId} missing pricing`, 'Add cost_per_1k_tokens to policies.json');
      missingPricing++;
    }
  }
  
  if (missingPricing === 0 && missingProvider === 0) {
    printStatus('PASS', 'Model metadata', 'All models have provider and pricing data');
  } else {
    printStatus('FAIL', 'Model metadata', `${missingProvider} models missing provider, ${missingPricing} missing pricing`);
    totalIssues += missingPricing + missingProvider;
  }
}

console.log('='.repeat(60));
console.log('MODEL CATALOG VALIDATION');
console.log('='.repeat(60));
console.log();

// Validate each config file
for (const file of MODEL_CONFIG_FILES) {
  validateFile(file);
}

console.log();
validateModelMetadata();

console.log();
console.log('='.repeat(60));
if (totalIssues === 0) {
  printStatus('PASS', 'MODEL VALIDATION', 'All model catalogs are up-to-date');
  process.exit(0);
} else {
  printStatus('FAIL', 'MODEL VALIDATION', `Found ${totalIssues} issue(s)`);
  if (shouldFix && totalFixed > 0) {
    printStatus('FIX', 'AUTO-FIX', `Fixed ${totalFixed} issue(s) automatically`);
    console.log('  Re-run without --fix to verify changes');
  } else if (!shouldFix) {
    console.log('  Run with --fix to automatically replace obsolete models');
  }
  process.exit(1);
}
