#!/usr/bin/env node
/**
 * Central Config Migration Script
 * 
 * Migrates existing configuration values from:
 * - opencode-config/rate-limit-fallback.json
 * - opencode-config/oh-my-opencode.json  
 * - .opencode.config.json
 * 
 * Into the centralized central-config.json structure.
 * 
 * Usage:
 *   node scripts/migrate-central-config.mjs [--dry-run] [--shadow]
 * 
 * Options:
 *   --dry-run  Show what would be changed without writing
 *   --shadow   Run in shadow mode - compare central-config to runtime values
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SHADOW_MODE = args.includes('--shadow');

function readJsonSafe(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    console.warn(`[WARN] Failed to read ${filePath}: ${err.message}`);
  }
  return null;
}

function writeJsonSafe(filePath, data) {
  if (DRY_RUN) {
    console.log(`[DRY-RUN] Would write to ${filePath}`);
    return true;
  }
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    return true;
  } catch (err) {
    console.error(`[ERROR] Failed to write ${filePath}: ${err.message}`);
    return false;
  }
}

function diffValues(source, target, path = '') {
  const diffs = [];
  
  if (typeof source !== typeof target) {
    diffs.push({ path, source, target, type: 'type_mismatch' });
    return diffs;
  }
  
  if (typeof source !== 'object' || source === null) {
    if (source !== target) {
      diffs.push({ path, source, target, type: 'value_changed' });
    }
    return diffs;
  }
  
  const allKeys = new Set([...Object.keys(source), ...Object.keys(target)]);
  for (const key of allKeys) {
    const newPath = path ? `${path}.${key}` : key;
    if (!(key in source)) {
      diffs.push({ path: newPath, source: undefined, target: target[key], type: 'added' });
    } else if (!(key in target)) {
      diffs.push({ path: newPath, source: source[key], target: undefined, type: 'removed' });
    } else {
      diffs.push(...diffValues(source[key], target[key], newPath));
    }
  }
  
  return diffs;
}

function extractRoutingParams(rateLimitConfig) {
  const params = {};
  
  if (rateLimitConfig?.retryPolicy) {
    const rp = rateLimitConfig.retryPolicy;
    if (rp.timeoutMs !== undefined) {
      params.request_timeout_ms = {
        value: rp.timeoutMs,
        soft: { min: 5000, max: 60000 },
        hard: { min: 1000, max: 120000 },
        locked: false,
        rl_allowed: true,
      };
    }
    if (rp.maxRetries !== undefined) {
      params.retry_max_attempts = {
        value: rp.maxRetries,
        soft: { min: 1, max: 5 },
        hard: { min: 0, max: 10 },
        locked: false,
        rl_allowed: true,
      };
    }
    if (rp.baseDelayMs !== undefined) {
      params.retry_base_delay_ms = {
        value: rp.baseDelayMs,
        soft: { min: 500, max: 5000 },
        hard: { min: 100, max: 10000 },
        locked: false,
        rl_allowed: true,
      };
    }
    if (rp.maxDelayMs !== undefined) {
      params.retry_max_delay_ms = {
        value: rp.maxDelayMs,
        soft: { min: 5000, max: 60000 },
        hard: { min: 1000, max: 120000 },
        locked: false,
        rl_allowed: true,
      };
    }
    if (rp.strategy !== undefined) {
      params.retry_strategy = {
        value: rp.strategy,
        soft: null,
        hard: null,
        locked: false,
        rl_allowed: false,
      };
    }
    if (rp.jitterEnabled !== undefined) {
      params.jitter_enabled = {
        value: rp.jitterEnabled,
        soft: null,
        hard: null,
        locked: false,
        rl_allowed: false,
      };
    }
    if (rp.jitterFactor !== undefined) {
      params.jitter_factor = {
        value: rp.jitterFactor,
        soft: { min: 0.0, max: 0.5 },
        hard: { min: 0.0, max: 1.0 },
        locked: false,
        rl_allowed: true,
      };
    }
  }
  
  return params;
}

function extractFallbackParams(rateLimitConfig) {
  const params = {};
  
  if (rateLimitConfig?.enabled !== undefined) {
    params.enabled = {
      value: rateLimitConfig.enabled,
      soft: null,
      hard: null,
      locked: false,
      rl_allowed: false,
    };
  }
  
  if (rateLimitConfig?.fallbackMode !== undefined) {
    params.fallback_mode = {
      value: rateLimitConfig.fallbackMode,
      soft: null,
      hard: null,
      locked: false,
      rl_allowed: false,
    };
  }
  
  if (rateLimitConfig?.cooldownMs !== undefined) {
    params.cooldown_ms = {
      value: rateLimitConfig.cooldownMs,
      soft: { min: 10000, max: 120000 },
      hard: { min: 5000, max: 300000 },
      locked: false,
      rl_allowed: true,
    };
  }
  
  if (rateLimitConfig?.circuitBreaker) {
    const cb = rateLimitConfig.circuitBreaker;
    if (cb.enabled !== undefined) {
      params.circuit_breaker_enabled = {
        value: cb.enabled,
        soft: null,
        hard: null,
        locked: false,
        rl_allowed: false,
      };
    }
    if (cb.failureThreshold !== undefined) {
      params.circuit_breaker_failure_threshold = {
        value: cb.failureThreshold,
        soft: { min: 2, max: 10 },
        hard: { min: 1, max: 20 },
        locked: false,
        rl_allowed: true,
      };
    }
    if (cb.recoveryTimeoutMs !== undefined) {
      params.circuit_breaker_recovery_timeout_ms = {
        value: cb.recoveryTimeoutMs,
        soft: { min: 10000, max: 120000 },
        hard: { min: 5000, max: 300000 },
        locked: false,
        rl_allowed: true,
      };
    }
  }
  
  if (rateLimitConfig?.enableSubagentFallback !== undefined) {
    params.enable_subagent_fallback = {
      value: rateLimitConfig.enableSubagentFallback,
      soft: null,
      hard: null,
      locked: false,
      rl_allowed: false,
    };
  }
  
  if (rateLimitConfig?.maxSubagentDepth !== undefined) {
    params.max_subagent_depth = {
      value: rateLimitConfig.maxSubagentDepth,
      soft: { min: 3, max: 15 },
      hard: { min: 1, max: 20 },
      locked: false,
      rl_allowed: true,
    };
  }
  
  return params;
}

async function runMigration() {
  console.log('='.repeat(60));
  console.log('Central Config Migration');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : SHADOW_MODE ? 'SHADOW' : 'LIVE'}`);
  console.log();

  // Read source configs
  const rateLimitPath = path.join(PROJECT_ROOT, 'opencode-config', 'rate-limit-fallback.json');
  const centralConfigPath = path.join(PROJECT_ROOT, 'opencode-config', 'central-config.json');
  
  const rateLimitConfig = readJsonSafe(rateLimitPath);
  const centralConfig = readJsonSafe(centralConfigPath);
  
  if (!centralConfig) {
    console.error('[ERROR] central-config.json not found. Run setup first.');
    process.exit(1);
  }
  
  console.log('Source configs:');
  console.log(`  rate-limit-fallback.json: ${rateLimitConfig ? 'Found' : 'Not found'}`);
  console.log(`  central-config.json: Found (v${centralConfig.config_version})`);
  console.log();

  if (SHADOW_MODE) {
    // Shadow mode: compare central-config to runtime values
    console.log('Shadow Mode: Comparing central-config to source configs...');
    console.log();
    
    if (rateLimitConfig) {
      const routingFromSource = extractRoutingParams(rateLimitConfig);
      const fallbackFromSource = extractFallbackParams(rateLimitConfig);
      
      // Compare routing
      console.log('--- Routing Section ---');
      for (const [key, sourceParam] of Object.entries(routingFromSource)) {
        const centralParam = centralConfig.sections?.routing?.[key];
        if (!centralParam) {
          console.log(`  [MISSING] ${key}: not in central-config`);
        } else if (centralParam.value !== sourceParam.value) {
          console.log(`  [DIFF] ${key}: central=${centralParam.value}, source=${sourceParam.value}`);
        } else {
          console.log(`  [OK] ${key}: ${centralParam.value}`);
        }
      }
      
      console.log();
      console.log('--- Fallback Section ---');
      for (const [key, sourceParam] of Object.entries(fallbackFromSource)) {
        const centralParam = centralConfig.sections?.fallback?.[key];
        if (!centralParam) {
          console.log(`  [MISSING] ${key}: not in central-config`);
        } else if (centralParam.value !== sourceParam.value) {
          console.log(`  [DIFF] ${key}: central=${centralParam.value}, source=${sourceParam.value}`);
        } else {
          console.log(`  [OK] ${key}: ${centralParam.value}`);
        }
      }
    }
    
    console.log();
    console.log('Shadow mode complete. No changes made.');
    return;
  }

  // Live migration: update central-config from sources
  let updated = false;
  const newConfig = JSON.parse(JSON.stringify(centralConfig));
  
  if (rateLimitConfig) {
    console.log('Extracting values from rate-limit-fallback.json...');
    
    const routingParams = extractRoutingParams(rateLimitConfig);
    const fallbackParams = extractFallbackParams(rateLimitConfig);
    
    // Update routing section
    if (!newConfig.sections.routing) newConfig.sections.routing = {};
    for (const [key, param] of Object.entries(routingParams)) {
      if (!newConfig.sections.routing[key]) {
        console.log(`  [ADD] routing.${key} = ${param.value}`);
        newConfig.sections.routing[key] = param;
        updated = true;
      }
    }
    
    // Update fallback section
    if (!newConfig.sections.fallback) newConfig.sections.fallback = {};
    for (const [key, param] of Object.entries(fallbackParams)) {
      if (!newConfig.sections.fallback[key]) {
        console.log(`  [ADD] fallback.${key} = ${param.value}`);
        newConfig.sections.fallback[key] = param;
        updated = true;
      }
    }
  }

  if (updated) {
    newConfig.config_version = (newConfig.config_version || 0) + 1;
    console.log();
    console.log(`Updating config_version to ${newConfig.config_version}`);
    
    if (writeJsonSafe(centralConfigPath, newConfig)) {
      console.log();
      console.log('[SUCCESS] Migration complete.');
    } else {
      console.error('[ERROR] Failed to write central-config.json');
      process.exit(1);
    }
  } else {
    console.log();
    console.log('[INFO] No changes needed. Central config is up to date.');
  }
}

runMigration().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
