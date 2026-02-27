#!/usr/bin/env bun
/**
 * verify-plugin-parity.mjs
 *
 * Verification task: Compare expected hook signatures and key telemetry behavior
 * between repo assumptions and active local plugin code.
 *
 * Purpose:
 * - Detect if MCP hook telemetry is absent in active runtime copy
 * - Emit machine-readable pass/fail output with exact missing symbol/path details
 * - Enable CI/governance to catch repo/runtime drift for plugin hooks
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = one or more checks fail
 *   2 = fatal error (file not found, parse error, etc.)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/**
 * Check result object
 */
class CheckResult {
  constructor(name, passed, details = {}) {
    this.name = name;
    this.passed = passed;
    this.details = details;
  }

  toJSON() {
    return {
      check: this.name,
      status: this.passed ? 'PASS' : 'FAIL',
      details: this.details,
    };
  }
}

/**
 * Read file safely
 */
function readFileSync(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read ${filePath}: ${err.message}`);
  }
}

/**
 * Check 1: File exists
 */
function checkFileExists() {
  const filePath = path.join(ROOT, 'local/oh-my-opencode/src/plugin/tool-execute-after.ts');
  const exists = fs.existsSync(filePath);
  return new CheckResult('file-exists', exists, {
    path: filePath,
    found: exists,
  });
}

/**
 * Check 2: MCP_PREFIXES definition present
 */
function checkMcpPrefixesDefinition() {
  const filePath = path.join(ROOT, 'local/oh-my-opencode/src/plugin/tool-execute-after.ts');
  const content = readFileSync(filePath);

  const hasMcpPrefixes = /const\s+MCP_PREFIXES\s*=\s*\[/.test(content);
  const prefixPatterns = [
    'mcp_context7_',
    'mcp_distill_',
    'mcp_supermemory_',
    'mcp_websearch_',
  ];

  const foundPrefixes = prefixPatterns.filter(p => content.includes(`'${p}'`) || content.includes(`"${p}"`));

  return new CheckResult('mcp-prefixes-defined', hasMcpPrefixes && foundPrefixes.length >= 2, {
    path: filePath,
    hasMcpPrefixesArray: hasMcpPrefixes,
    foundPrefixes: foundPrefixes,
    expectedMinimum: 2,
    actualCount: foundPrefixes.length,
  });
}

/**
 * Check 3: logInvocation import present
 */
function checkLogInvocationImport() {
  const filePath = path.join(ROOT, 'local/oh-my-opencode/src/plugin/tool-execute-after.ts');
  const content = readFileSync(filePath);

  const hasImport = /logInvocation/.test(content);
  const hasRequire = /require\(.*tool-usage-tracker/.test(content);

  return new CheckResult('logInvocation-import', hasImport && hasRequire, {
    path: filePath,
    hasLogInvocationReference: hasImport,
    hasToolUsageTrackerRequire: hasRequire,
  });
}

/**
 * Check 4: logInvocation call present (fire-and-forget pattern)
 */
function checkLogInvocationCall() {
  const filePath = path.join(ROOT, 'local/oh-my-opencode/src/plugin/tool-execute-after.ts');
  const content = readFileSync(filePath);

  // Look for fire-and-forget pattern: setImmediate(() => { logInvocation(...).catch(...) })
  const hasSetImmediate = /setImmediate\s*\(\s*\(\s*\)\s*=>\s*\{/.test(content);
  const hasLogInvocationCall = /logInvocation\s*\(/.test(content);
  const hasCatchHandler = /\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(content);

  const passed = hasSetImmediate && hasLogInvocationCall && hasCatchHandler;

  return new CheckResult('logInvocation-call', passed, {
    path: filePath,
    hasSetImmediate: hasSetImmediate,
    hasLogInvocationCall: hasLogInvocationCall,
    hasCatchHandler: hasCatchHandler,
    pattern: 'fire-and-forget (setImmediate + .catch)',
  });
}

/**
 * Check 5: MCP tool name detection logic
 */
function checkMcpToolDetection() {
  const filePath = path.join(ROOT, 'local/oh-my-opencode/src/plugin/tool-execute-after.ts');
  const content = readFileSync(filePath);

  // Look for pattern that checks if tool name starts with MCP prefix
  const hasStartsWithCheck = /\.some\s*\(\s*p\s*=>\s*toolName\?\.startsWith\(p\)/.test(content);
  const hasIsMcpTool = /isMCPTool|isMcp|is_mcp_tool/.test(content);

  return new CheckResult('mcp-tool-detection', hasStartsWithCheck || hasIsMcpTool, {
    path: filePath,
    hasStartsWithCheck: hasStartsWithCheck,
    hasMcpToolVariable: hasIsMcpTool,
  });
}

/**
 * Check 6: tool-usage-tracker module exports logInvocation
 */
function checkToolUsageTrackerExport() {
  const filePath = path.join(ROOT, 'packages/opencode-learning-engine/src/tool-usage-tracker.js');
  const content = readFileSync(filePath);

  // Check if logInvocation is in module.exports
  const hasExport = /module\.exports\s*=\s*\{[\s\S]*logInvocation[\s\S]*\}/.test(content);
  const hasFunction = /function\s+logInvocation|const\s+logInvocation\s*=/.test(content);

  return new CheckResult('tool-usage-tracker-export', hasExport && hasFunction, {
    path: filePath,
    hasLogInvocationFunction: hasFunction,
    hasLogInvocationExport: hasExport,
  });
}

/**
 * Main verification runner
 */
async function runVerification() {
  console.log('🔍 Plugin Parity Verification\n');
  console.log(`Root: ${ROOT}\n`);

  const results = [];

  // Synchronous checks
  try {
    results.push(checkFileExists());
    results.push(checkMcpPrefixesDefinition());
    results.push(checkLogInvocationImport());
    results.push(checkLogInvocationCall());
    results.push(checkMcpToolDetection());
    results.push(checkToolUsageTrackerExport());
  } catch (err) {
    console.error(`❌ Fatal error during checks: ${err.message}`);
    process.exit(2);
  }

  // Print results
  console.log('Results:\n');
  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    if (!result.passed || process.env.VERBOSE) {
      console.log(`   ${JSON.stringify(result.details, null, 2)}`);
    }
  });

  // Summary
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\n📊 Summary: ${passed}/${total} checks passed\n`);

  // Machine-readable output (JSON)
  const summary = {
    timestamp: new Date().toISOString(),
    root: ROOT,
    checks: results.map(r => r.toJSON()),
    summary: {
      passed: passed,
      failed: total - passed,
      total: total,
    },
    status: passed === total ? 'PASS' : 'FAIL',
  };

  console.log('Machine-readable output (JSON):');
  console.log(JSON.stringify(summary, null, 2));

  // Exit code
  process.exit(passed === total ? 0 : 1);
}

// Run verification
runVerification().catch(err => {
  console.error(`❌ Verification failed: ${err.message}`);
  process.exit(2);
});
