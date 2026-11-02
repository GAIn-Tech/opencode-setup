#!/usr/bin/env node
/**
 * scripts/perf-baseline.mjs
 * 
 * Wave 12.4: Performance regression baselines
 * Captures baselines, compares current metrics, identifies insufficiencies.
 * 
 * Usage:
 *   bun run perf-baseline.mjs --capture          # Capture current perf as baseline
 *   bun run perf-baseline.mjs --check            # Compare against stored baseline
 *   bun run perf-baseline.mjs --capture --force  # Overwrite existing baseline
 *   bun run perf-baseline.mjs --check --verbose  # Show detailed comparison
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_DIR = join(__dirname, 'perf', 'baselines');
const BASELINE_FILE = join(BASELINE_DIR, 'current.json');

// Colors
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';

// Symbols
const CHECK = '✓';
const CROSS = '✗';
const WARN = '!';
const ARROW = '→';

const log = {
  pass: (msg) => console.log(`${GREEN}${BOLD}${CHECK}${RESET} ${GREEN}${msg}${RESET}`),
  fail: (msg) => console.log(`${RED}${BOLD}${CROSS}${RESET} ${RED}${msg}${RESET}`),
  warn: (msg) => console.log(`${YELLOW}${BOLD}${WARN}${RESET} ${YELLOW}${msg}${RESET}`),
  info: (msg) => console.log(`${CYAN}${ARROW}${RESET} ${msg}`),
  header: (msg) => console.log(`\n${BLUE}${BOLD}${msg}${RESET}`),
  section: (msg) => console.log(`\n${CYAN}${msg}${RESET}`),
};

// Parse args
const args = process.argv.slice(2);
const mode = args.includes('--capture') ? 'capture' : args.includes('--check') ? 'check' : 'help';
const force = args.includes('--force');
const verbose = args.includes('--verbose');

// Ensure baseline dir exists
if (!existsSync(BASELINE_DIR)) {
  mkdirSync(BASELINE_DIR, { recursive: true });
}

/**
 * Run a perf test script and return its JSON output
 */
async function runPerfTest(scriptPath) {
  const { spawn } = await import('node:child_process');
  
  return new Promise((resolve) => {
    const proc = spawn('bun', [scriptPath], { 
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    
    proc.on('close', (code) => {
      // Extract JSON from output (scripts may log before JSON)
      const jsonMatch = stdout.match(/\{[\s\S]*"status"\s*:\s*"pass"[\s\S]*\}/);
      
      if (jsonMatch) {
        try {
          resolve(JSON.parse(jsonMatch[0]));
        } catch {
          resolve({ status: 'pass', raw: stdout, parsed: false });
        }
      } else if (code !== 0 || stderr) {
        resolve({ 
          status: 'fail', 
          exitCode: code, 
          error: stderr || `Exit code ${code}`,
          raw: stdout 
        });
      } else {
        resolve({ status: 'unknown', raw: stdout });
      }
    });
    
    proc.on('error', (err) => {
      resolve({ status: 'error', error: err.message });
    });
    
    // Timeout after 30s
    setTimeout(() => {
      proc.kill();
      resolve({ status: 'timeout', error: 'Script timed out after 30s' });
    }, 30000);
  });
}

/**
 * Get current system metrics via health-check patterns
 */
async function getCurrentMetrics() {
  const scripts = [
    'perf/fg01-stats-durability.mjs',
    'perf/fg02-hotpath-io.mjs',
    'perf/fg03-feedback-lag.mjs',
    'perf/fg06-tail-latency-slo.mjs',
    'perf/fg08-poll-coordination.mjs',
  ];
  
  const results = {};
  const timestamp = new Date().toISOString();
  
  log.info('Running perf tests...');
  
  for (const script of scripts) {
    const fullPath = join(__dirname, script);
    const testName = script.replace('perf/fg', 'fg').replace('.mjs', '');
    
    try {
      if (existsSync(fullPath)) {
        const result = await runPerfTest(fullPath);
        results[testName] = {
          status: 'success',
          data: result,
          capturedAt: timestamp
        };
      } else {
        results[testName] = {
          status: 'skipped',
          reason: 'Script not found',
          capturedAt: timestamp
        };
      }
    } catch (err) {
      results[testName] = {
        status: 'error',
        error: err.message,
        capturedAt: timestamp
      };
    }
  }
  
  // Add system info
  results._system = {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    pid: process.pid,
    capturedAt: timestamp
  };
  
  return results;
}

/**
 * Capture baseline
 */
async function captureBaseline() {
  log.header('Performance Baseline Capture');
  
  if (existsSync(BASELINE_FILE) && !force) {
    log.fail(`Baseline already exists at ${BASELINE_FILE}`);
    log.info('Use --force to overwrite');
    process.exit(1);
  }
  
  log.section('Capturing current performance metrics...');
  
  const metrics = await getCurrentMetrics();
  
  // Add metadata
  const baseline = {
    version: '1.0.0',
    capturedAt: new Date().toISOString(),
    captureHostname: process.env.COMPUTERNAME || process.env.HOSTNAME || 'unknown',
    nodeVersion: process.version,
    platform: process.platform,
    metrics
  };
  
  writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));
  
  log.pass(`Baseline captured and saved to ${BASELINE_FILE}`);
  
  // Summary
  let successCount = 0;
  let errorCount = 0;
  
  for (const [key, value] of Object.entries(metrics)) {
    if (key.startsWith('_')) continue;
    if (value.status === 'success') successCount++;
    else if (value.status === 'error') errorCount++;
  }
  
  log.section(`Summary: ${successCount} tests captured, ${errorCount} errors`);
  
  return baseline;
}

/**
 * Check current metrics against baseline
 */
async function checkBaseline() {
  log.header('Performance Regression Check');
  
  if (!existsSync(BASELINE_FILE)) {
    log.fail(`No baseline found at ${BASELINE_FILE}`);
    log.info('Run with --capture first to create a baseline');
    process.exit(1);
  }
  
  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'));
  const current = await getCurrentMetrics();
  
  log.section(`Comparing against baseline from ${baseline.capturedAt}`);
  console.log('');
  
  const results = {
    timestamp: new Date().toISOString(),
    baselineVersion: baseline.version,
    checks: []
  };
  
  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;
  let insufficientCount = 0;
  
  // Compare each metric
  for (const [key, baselineValue] of Object.entries(baseline.metrics)) {
    if (key.startsWith('_')) continue;
    
    const currentValue = current[key];
    const check = compareMetrics(key, baselineValue, currentValue);
    
    results.checks.push(check);
    
    if (check.status === 'pass') passCount++;
    else if (check.status === 'fail') {
      failCount++;
      insufficientCount++;
    }
    else if (check.status === 'warn') warnCount++;
  }
  
  results.summary = {
    pass: passCount,
    fail: failCount,
    warn: warnCount,
    insufficient: insufficientCount
  };
  
  // Output detailed results if verbose
  if (verbose) {
    outputVerboseResults(results.checks);
  }
  
  // Summary output
  log.section('Summary');
  
  if (insufficientCount > 0) {
    log.fail(`${insufficientCount} metric(s) below baseline (regressions detected)`);
    console.log('');
    outputInsufficientMetrics(results.checks);
  } else {
    log.pass('All metrics within acceptable thresholds');
  }
  
  console.log('');
  console.log(`  ${GREEN}PASS${RESET}: ${passCount}`);
  console.log(`  ${YELLOW}WARN${RESET}: ${warnCount}`);
  console.log(`  ${RED}FAIL${RESET}: ${failCount}`);
  console.log('');
  
  // Return exit code based on results
  if (failCount > 0) {
    process.exit(1);
  } else if (warnCount > 0) {
    process.exit(2);
  }
  
  return results;
}

/**
 * Compare a single metric against baseline
 */
function compareMetrics(key, baselineValue, currentValue) {
  const check = {
    metric: key,
    baseline: baselineValue,
    current: currentValue,
    status: 'pass',
    regressions: [],
    warnings: []
  };

  // Handle missing scripts
  if (baselineValue.status === 'skipped') {
    check.status = 'skip';
    check.note = 'Skipped in baseline';
    return check;
  }

  if (currentValue.status === 'skipped') {
    check.status = 'skip';
    check.note = 'Script not found';
    return check;
  }

  // Extract actual test result status from wrapper
  // The wrapper runs the script and returns { status: 'success', data: { status: 'pass'|'fail', ... } }
  // Scripts exit with code 1 on internal failures, but wrapper may still report 'success'.
  // A non-zero baseline exit code means the baseline itself is invalid and must be refreshed.
  const baselineExitCode = baselineValue.data?.exitCode ?? 0;
  const currentExitCode = currentValue.data?.exitCode ?? 0;

  if (baselineExitCode !== 0) {
    check.status = 'fail';
    check.regressions.push({
      type: 'invalid_baseline',
      message: `Baseline for ${key} is invalid (exit code ${baselineExitCode}). Refresh the baseline before trusting this gate.`,
      exitCode: baselineExitCode,
      raw: baselineValue.data?.raw,
    });
    return check;
  }

  // Check if test itself passed/failed
  if (currentValue.status === 'error' || currentExitCode !== 0) {
    check.status = 'fail';
    check.regressions.push({
      type: 'error',
      message: currentValue.data?.error || currentValue.error || `exit code ${currentExitCode}`,
      exitCode: currentValue.data?.exitCode,
      raw: currentValue.data?.raw
    });
    return check;
  }

  // Compare actual metrics
  const baselineData = baselineValue.data || {};
  const currentData = currentValue.data || {};
  
  // Compare numeric values
  const numericKeys = new Set([
    ...Object.keys(baselineData).filter(k => typeof baselineData[k] === 'number'),
    ...Object.keys(currentData).filter(k => typeof currentData[k] === 'number')
  ]);
  
  for (const metricKey of numericKeys) {
    const baselineNum = baselineData[metricKey];
    const currentNum = currentData[metricKey];

    if (
      metricKey === 'iterations'
      || metricKey === 'tickCount'
      || metricKey === 'overlapRate'
      || metricKey === 'maxConcurrentChecks'
      || metricKey === 'overhead_ratio'
      || metricKey === 'absolute_overhead_ms'
      || metricKey.startsWith('threshold_')
      || metricKey.startsWith('variance_')
      || metricKey.endsWith('_elapsed_ms')
    ) {
      continue;
    }
    
    if (typeof baselineNum !== 'number' || typeof currentNum !== 'number') continue;
    
    // Determine direction: higher is better (rates) vs lower is better (latency)
    const higherIsBetter = metricKey.includes('rate') || 
                          metricKey.includes('hit') ||
                          metricKey.includes('success') ||
                          metricKey.includes('pass');
    
    const diff = currentNum - baselineNum;
    const pctChange = baselineNum !== 0 ? ((diff / baselineNum) * 100).toFixed(2) : 'N/A';
    
    let regressionThreshold = 0.05; // 5% default
    
    // Adjust threshold based on metric type
    if (metricKey.includes('latency') || metricKey.includes('p99') || metricKey.includes('max')) {
      regressionThreshold = 0.10; // 10% for latency metrics
    }
    
    let status = 'pass';
    let regression = null;
    
    if (higherIsBetter) {
      // Higher is better: current should be >= baseline
      if (currentNum < baselineNum * (1 - regressionThreshold)) {
        status = 'fail';
        regression = {
          metric: metricKey,
          type: 'regression',
          baseline: baselineNum,
          current: currentNum,
          change: `${pctChange}%`,
          direction: 'degraded'
        };
      } else if (currentNum < baselineNum * (1 - regressionThreshold / 2)) {
        status = 'warn';
        check.warnings.push({
          metric: metricKey,
          type: 'warning',
          baseline: baselineNum,
          current: currentNum,
          change: `${pctChange}%`,
          direction: 'slightly degraded'
        });
      }
    } else {
      // Lower is better: current should be <= baseline
      if (currentNum > baselineNum * (1 + regressionThreshold)) {
        status = 'fail';
        regression = {
          metric: metricKey,
          type: 'regression',
          baseline: baselineNum,
          current: currentNum,
          change: `+${pctChange}%`,
          direction: 'degraded'
        };
      } else if (currentNum > baselineNum * (1 + regressionThreshold / 2)) {
        status = 'warn';
        check.warnings.push({
          metric: metricKey,
          type: 'warning',
          baseline: baselineNum,
          current: currentNum,
          change: `+${pctChange}%`,
          direction: 'slightly degraded'
        });
      }
    }
    
    if (regression) {
      check.regressions.push(regression);
      check.status = 'fail';
    }
  }
  
  return check;
}

/**
 * Output verbose comparison results
 */
function outputVerboseResults(checks) {
  for (const check of checks) {
    if (check.status === 'skip') {
      console.log(`${YELLOW}${WARN}${RESET} ${CYAN}${check.metric}${RESET} ${YELLOW}[SKIP]${RESET} ${check.note || ''}`);
      continue;
    }
    
    const icon = check.status === 'pass' ? `${GREEN}${CHECK}${RESET}` : 
                 check.status === 'fail' ? `${RED}${CROSS}${RESET}` : 
                 `${YELLOW}${WARN}${RESET}`;
    
    console.log(`${icon} ${BOLD}${check.metric}${RESET}`);
    
    if (verbose && check.regressions.length > 0) {
      for (const reg of check.regressions) {
        console.log(`   ${RED}${ARROW}${RESET} ${reg.metric}: ${reg.baseline} → ${reg.current} (${reg.change}) ${RED}${reg.direction}${RESET}`);
      }
    }
    
    if (verbose && check.warnings.length > 0) {
      for (const warn of check.warnings) {
        console.log(`   ${YELLOW}${ARROW}${RESET} ${warn.metric}: ${warn.baseline} → ${warn.current} (${warn.change}) ${YELLOW}${warn.direction}${RESET}`);
      }
    }
  }
}

/**
 * Output insufficient metrics (regressions)
 */
function outputInsufficientMetrics(checks) {
  log.header('Insufficient Metrics (Regressions)');
  
  let hasInsufficient = false;
  
  for (const check of checks) {
    if (check.regressions.length > 0) {
      hasInsufficient = true;
      console.log(`\n${RED}${BOLD}${check.metric}${RESET}:`);
      
      for (const reg of check.regressions) {
        console.log(`  ${RED}${CROSS}${RESET} ${CYAN}${reg.metric}${RESET}`);
        console.log(`     Baseline: ${GREEN}${reg.baseline}${RESET}`);
        console.log(`     Current:  ${RED}${reg.current}${RESET}`);
        console.log(`     Change:   ${RED}${reg.change}${RESET} ${RED}${reg.direction}${RESET}`);
      }
    }
  }
  
  if (!hasInsufficient) {
    log.pass('No insufficient metrics found');
  }
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
${BOLD}Wave 12.4: Performance Regression Baselines${RESET}

${CYAN}Usage:${RESET}
  bun run perf-baseline.mjs --capture     Capture current metrics as baseline
  bun run perf-baseline.mjs --check       Compare current metrics against baseline
  bun run perf-baseline.mjs --force       Overwrite existing baseline (with --capture)
  bun run perf-baseline.mjs --verbose     Show detailed comparison (with --check)
  bun run perf-baseline.mjs --help        Show this help

${CYAN}Workflow:${RESET}
  1. Run ${GREEN}--capture${RESET} to establish a baseline
  2. Run ${YELLOW}--check${RESET} after changes to detect regressions
  3. Review output for insufficient metrics

${CYAN}Exit Codes:${RESET}
  0 - All metrics within thresholds
  1 - Regressions detected
  2 - Warnings (minor degradation)

${CYAN}Baseline Location:${RESET}
  ${BASELINE_FILE}
`);
}

// Main
switch (mode) {
  case 'capture':
    await captureBaseline();
    break;
  case 'check':
    await checkBaseline();
    break;
  default:
    showHelp();
}
