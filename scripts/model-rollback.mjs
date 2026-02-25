#!/usr/bin/env node

/**
 * Model Rollback CLI Script (Wave 8.2)
 *
 * Restores the model catalog to a previous state using snapshots and audit log data.
 * Integrates with:
 *   - AuditLogger  (packages/opencode-model-manager/src/lifecycle/audit-logger.js)
 *   - SnapshotStore (packages/opencode-model-manager/src/snapshot/snapshot-store.js)
 *   - Validation    (scripts/validate-models.mjs)
 *
 * Usage:
 *   node scripts/model-rollback.mjs --to-last-good [--dry-run]
 *   node scripts/model-rollback.mjs --to-timestamp <ISO-8601> [--dry-run]
 *   node scripts/model-rollback.mjs --dry-run
 *   node scripts/model-rollback.mjs --help
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
} from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolveRoot } from './resolve-root.mjs';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolveRoot();

const CATALOG_PATH = join(ROOT_DIR, 'opencode-config', 'models', 'catalog-2026.json');
const SNAPSHOT_MODULE = join(
  ROOT_DIR, 'packages', 'opencode-model-manager', 'src', 'snapshot', 'snapshot-store.js',
);
const AUDIT_MODULE = join(
  ROOT_DIR, 'packages', 'opencode-model-manager', 'src', 'lifecycle', 'audit-logger.js',
);
const VALIDATE_SCRIPT = join(ROOT_DIR, 'scripts', 'validate-models.mjs');
const BACKUP_DIR = join(ROOT_DIR, '.rollback-backups');

// Default paths matching module defaults (relative to model-manager package)
const MODEL_MANAGER_DIR = join(ROOT_DIR, 'packages', 'opencode-model-manager');

// ---------------------------------------------------------------------------
// CLI Argument Parser
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    toLastGood: false,
    toTimestamp: null,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--to-last-good':
        options.toLastGood = true;
        break;
      case '--to-timestamp': {
        if (i + 1 >= args.length) {
          fatal('--to-timestamp requires an ISO-8601 timestamp argument');
        }
        const ts = args[++i];
        if (!isValidISO(ts)) {
          fatal(`Invalid ISO-8601 timestamp: "${ts}"`);
        }
        options.toTimestamp = ts;
        break;
      }
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        fatal(`Unknown option: ${args[i]}. Use --help for usage.`);
    }
  }

  return options;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function showHelp() {
  const text = `
Model Rollback CLI (Wave 8.2)
==============================
Restores the model catalog to a previous state using snapshots & audit log.

Usage:
  node scripts/model-rollback.mjs --to-last-good [--dry-run]
  node scripts/model-rollback.mjs --to-timestamp <ISO-8601> [--dry-run]
  node scripts/model-rollback.mjs --help

Options:
  --to-last-good          Rollback to the last known good state
                          (last snapshot where a model reached approved/selectable/default)
  --to-timestamp <ISO>    Rollback to a specific point in time
                          Uses the closest snapshot at or before the timestamp
  --dry-run               Preview changes without applying them
  --help, -h              Show this help message

Examples:
  # Preview what a rollback to the last good state would do
  node scripts/model-rollback.mjs --to-last-good --dry-run

  # Rollback to a specific point in time
  node scripts/model-rollback.mjs --to-timestamp 2026-02-24T10:00:00Z

  # Just preview current state, don't apply
  node scripts/model-rollback.mjs --dry-run

Safety:
  - A backup of the current catalog is always created before rollback
  - Validation is automatically run after restoring (unless --dry-run)
  - The rollback action is recorded in the audit log
  - Backups are stored in .rollback-backups/
`.trim();
  console.log(text);
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function fatal(msg) {
  console.error(`\u2718 Error: ${msg}`);
  process.exit(1);
}

function info(msg) {
  console.log(`\u2139  ${msg}`);
}

function success(msg) {
  console.log(`\u2714 ${msg}`);
}

function warn(msg) {
  console.warn(`\u26A0  ${msg}`);
}

function isValidISO(str) {
  const d = new Date(str);
  return !isNaN(d.getTime());
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function nowISO() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Module loaders - use createRequire for CJS modules
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);

/**
 * Try to load the SnapshotStore module. Returns an instance or null.
 * SnapshotStore constructor takes { storagePath, retentionDays }.
 * Default storagePath is './snapshots' relative to cwd.
 */
function loadSnapshotStore() {
  try {
    if (!existsSync(SNAPSHOT_MODULE)) return null;
    const { SnapshotStore } = require(SNAPSHOT_MODULE);
    // Use model-manager package dir as cwd context for default paths
    return new SnapshotStore({
      storagePath: join(MODEL_MANAGER_DIR, 'snapshots'),
    });
  } catch (err) {
    warn(`Could not load SnapshotStore: ${err.message}`);
    return null;
  }
}

/**
 * Try to load the AuditLogger module. Returns an instance or null.
 * AuditLogger constructor takes { dbPath, retentionDays }.
 * Default dbPath is './audit.db' relative to cwd.
 */
function loadAuditLogger() {
  try {
    if (!existsSync(AUDIT_MODULE)) return null;
    const { AuditLogger } = require(AUDIT_MODULE);
    return new AuditLogger({
      dbPath: join(MODEL_MANAGER_DIR, 'audit.db'),
    });
  } catch (err) {
    warn(`Could not load AuditLogger: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Snapshot discovery helpers
// ---------------------------------------------------------------------------

/**
 * Get all available providers from snapshot store by checking snapshot files.
 */
function discoverProviders(snapshotStore) {
  // The snapshot store is per-provider. We need to check what providers exist.
  // Since SnapshotStore stores all snapshots in one file, we read directly.
  const snapshotFilePath = join(MODEL_MANAGER_DIR, 'snapshots', 'snapshots.json');
  if (!existsSync(snapshotFilePath)) return [];

  try {
    const data = JSON.parse(readFileSync(snapshotFilePath, 'utf-8'));
    const snapshots = data.snapshots || data;
    if (!Array.isArray(snapshots)) return [];

    const providers = new Set();
    for (const s of snapshots) {
      if (s.provider) providers.add(s.provider);
    }
    return [...providers];
  } catch {
    return [];
  }
}

/**
 * Read all snapshots directly from the JSON file.
 * Returns snapshots sorted by timestamp descending (newest first).
 */
function readAllSnapshotsDirect() {
  const snapshotFilePath = join(MODEL_MANAGER_DIR, 'snapshots', 'snapshots.json');
  if (!existsSync(snapshotFilePath)) return [];

  try {
    const data = JSON.parse(readFileSync(snapshotFilePath, 'utf-8'));
    const snapshots = Array.isArray(data.snapshots) ? data.snapshots : (Array.isArray(data) ? data : []);
    snapshots.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return snapshots;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Core rollback logic
// ---------------------------------------------------------------------------

/** GOOD_STATES in the lifecycle that indicate a known-good configuration. */
const GOOD_STATES = ['approved', 'selectable', 'default'];

/**
 * Find the target snapshot for --to-last-good mode.
 * Strategy: Query audit log for the last entry where a model reached a good state,
 * then find the most recent snapshot at or before that timestamp.
 * Falls back to the newest snapshot across all providers.
 */
async function findLastGoodSnapshot(auditLogger, snapshotStore) {
  let targetTimestampMs = null;

  // Try audit log for last known good transition
  if (auditLogger) {
    try {
      const entries = await auditLogger.getByTimeRange(0, Date.now());
      // entries are sorted by sequence ASC, so walk backwards for most recent good
      for (let i = entries.length - 1; i >= 0; i--) {
        if (GOOD_STATES.includes(entries[i].toState)) {
          targetTimestampMs = entries[i].timestamp;
          info(`Found last good audit entry: [${new Date(targetTimestampMs).toISOString()}] ${entries[i].modelId} -> ${entries[i].toState}`);
          break;
        }
      }
    } catch (err) {
      warn(`Audit log query failed: ${err.message}`);
    }
  }

  // Find matching snapshot
  return findSnapshotAtOrBefore(snapshotStore, targetTimestampMs || Date.now());
}

/**
 * Find the target snapshot for --to-timestamp mode.
 * Converts ISO string to epoch ms and finds snapshot at or before that time.
 */
async function findTimestampSnapshot(snapshotStore, isoTimestamp) {
  const targetMs = new Date(isoTimestamp).getTime();
  return findSnapshotAtOrBefore(snapshotStore, targetMs);
}

/**
 * Find the most recent snapshot at or before a given epoch-ms timestamp.
 * Tries all providers via SnapshotStore API, falls back to direct file read.
 */
async function findSnapshotAtOrBefore(snapshotStore, targetMs) {
  let bestSnapshot = null;

  // Try via SnapshotStore module for each provider
  if (snapshotStore) {
    const providers = discoverProviders(snapshotStore);
    for (const provider of providers) {
      try {
        const snapshots = await snapshotStore.getByTimeRange(provider, 0, targetMs);
        // getByTimeRange returns sorted by timestamp ASC, so last = most recent
        if (snapshots.length > 0) {
          const candidate = snapshots[snapshots.length - 1];
          if (!bestSnapshot || candidate.timestamp > bestSnapshot.timestamp) {
            bestSnapshot = candidate;
          }
        }
      } catch {
        // Try next provider
      }
    }
  }

  // Direct file fallback if module didn't yield results
  if (!bestSnapshot) {
    const allSnapshots = readAllSnapshotsDirect();
    // Already sorted newest first
    bestSnapshot = allSnapshots.find((s) => (s.timestamp || 0) <= targetMs) || null;
  }

  return bestSnapshot;
}

/**
 * Create a backup of the current catalog before rollback.
 */
function backupCurrentCatalog() {
  if (!existsSync(CATALOG_PATH)) return null;

  mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = nowISO().replace(/[:.]/g, '-');
  const backupPath = join(BACKUP_DIR, `catalog-backup-${ts}.json`);
  copyFileSync(CATALOG_PATH, backupPath);
  return backupPath;
}

/**
 * Restore catalog from a snapshot.
 *
 * The snapshot has { models: [...], provider, timestamp, ... } where models
 * is an array of normalized model objects. We merge these back into the
 * catalog-2026.json format: { version, models: { "provider/id": { ... } } }.
 */
function restoreCatalogFromSnapshot(snapshot) {
  const snapshotValidation = validateSnapshotForRestore(snapshot);
  if (!snapshotValidation.valid) {
    throw new Error(`Snapshot validation failed: ${snapshotValidation.errors.join('; ')}`);
  }

  const catalogDir = dirname(CATALOG_PATH);
  mkdirSync(catalogDir, { recursive: true });

  // Load existing catalog to get format baseline
  let existingCatalog = {};
  if (existsSync(CATALOG_PATH)) {
    try {
      existingCatalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));
    } catch {
      // Overwrite corrupt catalog
    }
  }

  // Build new catalog in the same keyed-object format as catalog-2026.json
  const catalog = {
    version: existingCatalog.version || new Date().toISOString().slice(0, 10),
    _rollback: {
      restoredFrom: snapshot.id,
      snapshotTimestamp: new Date(snapshot.timestamp).toISOString(),
      rollbackTimestamp: nowISO(),
      provider: snapshot.provider || 'multi',
    },
    models: {},
  };

  const snapshotModels = Array.isArray(snapshot.models) ? snapshot.models : [];

  for (const model of snapshotModels) {
    const provider = model.provider || snapshot.provider || 'unknown';
    const id = model.id || model.name || '';
    const key = `${provider}/${id}`;

    catalog.models[key] = {
      id,
      provider,
      ...model,
    };
  }

  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf-8');
  return catalog;
}

function validateSnapshotForRestore(snapshot) {
  const errors = [];

  if (!snapshot || typeof snapshot !== 'object') {
    return { valid: false, errors: ['snapshot must be an object'] };
  }

  if (!snapshot.id || typeof snapshot.id !== 'string') {
    errors.push('snapshot.id is required');
  }

  if (!Number.isFinite(snapshot.timestamp) || snapshot.timestamp <= 0) {
    errors.push('snapshot.timestamp must be a valid epoch ms value');
  }

  if (!Array.isArray(snapshot.models) || snapshot.models.length === 0) {
    errors.push('snapshot.models must be a non-empty array');
  }

  const models = Array.isArray(snapshot.models) ? snapshot.models : [];
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    if (!model || typeof model !== 'object') {
      errors.push(`snapshot.models[${i}] must be an object`);
      continue;
    }

    const modelId = String(model.id || model.name || '').trim();
    if (!modelId) {
      errors.push(`snapshot.models[${i}] missing id/name`);
    }

    const provider = String(model.provider || snapshot.provider || '').trim();
    if (!provider) {
      errors.push(`snapshot.models[${i}] missing provider`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Run validation script after rollback.
 */
function runValidation() {
  if (!existsSync(VALIDATE_SCRIPT)) {
    warn(`Validation script not found at ${VALIDATE_SCRIPT}`);
    warn('Manual validation recommended.');
    return { passed: null, skipped: true, reason: 'script_not_found' };
  }

  try {
    info('Running post-rollback validation...');
    const output = execSync(`node "${VALIDATE_SCRIPT}"`, {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      timeout: 300_000, // 5 minute timeout (acceptance criteria)
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(output.trim());
    return { passed: true, skipped: false, output: output.trim() };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    const stdout = err.stdout ? err.stdout.toString().trim() : '';
    warn(`Validation failed:\n${stderr || stdout || err.message}`);
    return { passed: false, skipped: false, error: stderr || stdout || err.message };
  }
}

/**
 * Record the rollback action in the audit log.
 *
 * AuditLogger.log() requires: { timestamp, modelId, fromState, toState,
 * actor, reason, diffHash, metadata }  — all strings except timestamp (number)
 * and metadata (object).
 */
async function logRollbackToAudit(auditLogger, details) {
  if (!auditLogger) {
    warn('AuditLogger not available — rollback will not be recorded in audit log');
    return false;
  }

  try {
    const catalogHash = existsSync(CATALOG_PATH)
      ? sha256(readFileSync(CATALOG_PATH, 'utf-8'))
      : 'none';

    await auditLogger.log({
      timestamp: Date.now(),
      modelId: 'catalog-rollback',
      fromState: 'active',
      toState: 'rolled-back',
      actor: 'model-rollback-cli',
      reason: `Rollback ${details.mode}: restored from snapshot ${details.snapshotId} (${new Date(details.snapshotTimestamp).toISOString()})`,
      diffHash: catalogHash,
      metadata: {
        mode: details.mode,
        targetTimestamp: details.targetTimestamp,
        snapshotId: details.snapshotId,
        snapshotProvider: details.snapshotProvider,
        backupPath: details.backupPath,
        validationPassed: details.validationResult?.passed,
        validationSkipped: details.validationResult?.skipped,
        dryRun: details.dryRun || false,
      },
    });
    return true;
  } catch (err) {
    warn(`Could not write audit entry: ${err.message}`);
    return false;
  }
}

/**
 * Compute a summary of differences between current catalog and target snapshot.
 */
function computeDiff(currentCatalog, targetSnapshot) {
  const diff = { modelsAdded: [], modelsRemoved: [], modelsChanged: [], summary: '' };

  // Current catalog uses keyed object: { "provider/id": { ... } }
  const currentKeys = new Set(
    currentCatalog && typeof currentCatalog.models === 'object'
      ? Object.keys(currentCatalog.models)
      : [],
  );

  // Build target keys from snapshot models array
  const targetKeys = new Map();
  const snapshotModels = Array.isArray(targetSnapshot.models) ? targetSnapshot.models : [];
  for (const m of snapshotModels) {
    const provider = m.provider || targetSnapshot.provider || 'unknown';
    const id = m.id || m.name || '';
    const key = `${provider}/${id}`;
    targetKeys.set(key, m);
  }

  // Models in target but not current -> restored
  for (const [key] of targetKeys) {
    if (!currentKeys.has(key)) diff.modelsAdded.push(key);
  }

  // Models in current but not target -> removed
  for (const key of currentKeys) {
    if (!targetKeys.has(key)) diff.modelsRemoved.push(key);
  }

  // Models in both -> check for changes
  for (const [key, targetModel] of targetKeys) {
    if (currentKeys.has(key)) {
      const currentModel = currentCatalog.models[key];
      if (JSON.stringify(currentModel) !== JSON.stringify(targetModel)) {
        diff.modelsChanged.push(key);
      }
    }
  }

  const parts = [];
  if (diff.modelsAdded.length) parts.push(`${diff.modelsAdded.length} model(s) restored`);
  if (diff.modelsRemoved.length) parts.push(`${diff.modelsRemoved.length} model(s) removed`);
  if (diff.modelsChanged.length) parts.push(`${diff.modelsChanged.length} model(s) reverted`);
  diff.summary = parts.length > 0 ? parts.join(', ') : 'No model-level differences detected';

  return diff;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Require at least one mode
  if (!options.toLastGood && !options.toTimestamp && !options.dryRun) {
    fatal('Specify a rollback target: --to-last-good or --to-timestamp <ISO>. Use --help for usage.');
  }

  // Pure --dry-run without a target = preview current state
  const isPreviewOnly = options.dryRun && !options.toLastGood && !options.toTimestamp;

  console.log('');
  console.log('=== Model Rollback CLI (Wave 8.2) ===');
  console.log('');

  if (options.dryRun) {
    info('DRY RUN mode \u2014 no changes will be applied');
    console.log('');
  }

  // ---- Load integrations ----
  const snapshotStore = loadSnapshotStore();
  const auditLogger = loadAuditLogger();

  info(snapshotStore ? 'Loaded SnapshotStore module' : 'SnapshotStore module not available \u2014 using direct file access');
  info(auditLogger ? 'Loaded AuditLogger module' : 'AuditLogger module not available \u2014 using direct file access');
  console.log('');

  // ---- Preview-only mode (--dry-run with no target) ----
  if (isPreviewOnly) {
    info('No rollback target specified. Showing current state overview:');
    console.log('');

    // Catalog status
    if (existsSync(CATALOG_PATH)) {
      try {
        const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));
        const modelCount = catalog.models ? Object.keys(catalog.models).length : 0;
        info(`Current catalog: ${CATALOG_PATH}`);
        info(`  Models: ${modelCount}`);
        info(`  Version: ${catalog.version || 'unknown'}`);
      } catch {
        warn('Could not parse current catalog');
      }
    } else {
      info('No catalog file found at expected path');
      info(`  Expected: ${CATALOG_PATH}`);
    }
    console.log('');

    // Available snapshots
    const allSnapshots = readAllSnapshotsDirect();
    info(`Available snapshots: ${allSnapshots.length}`);
    for (const s of allSnapshots.slice(0, 5)) {
      const modelCount = Array.isArray(s.models) ? s.models.length : 0;
      info(`  [${new Date(s.timestamp).toISOString()}] id=${s.id} provider=${s.provider || '?'} models=${modelCount}`);
    }
    if (allSnapshots.length > 5) info(`  ... and ${allSnapshots.length - 5} more`);
    console.log('');

    // Backups
    if (existsSync(BACKUP_DIR)) {
      const backups = readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json'));
      info(`Existing backups: ${backups.length} (in ${BACKUP_DIR})`);
    } else {
      info('No previous backups found');
    }

    console.log('');
    success('Dry run complete. No changes applied.');
    info(`Completed in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    process.exit(0);
  }

  // ---- Determine rollback mode ----
  const mode = options.toLastGood ? 'to-last-good' : 'to-timestamp';
  info(`Rollback mode: ${mode}`);
  if (options.toTimestamp) info(`Target timestamp: ${options.toTimestamp}`);
  console.log('');

  // ---- Find target snapshot ----
  info('Searching for target snapshot...');
  let targetSnapshot = null;

  if (options.toLastGood) {
    targetSnapshot = await findLastGoodSnapshot(auditLogger, snapshotStore);
  } else {
    targetSnapshot = await findTimestampSnapshot(snapshotStore, options.toTimestamp);
  }

  if (!targetSnapshot) {
    fatal(
      'No matching snapshot found. ' +
      (options.toTimestamp
        ? `No snapshots exist at or before ${options.toTimestamp}.`
        : 'No snapshots available for rollback.') +
      '\nEnsure the snapshot store has data from model discovery runs.',
    );
  }

  const snapshotValidation = validateSnapshotForRestore(targetSnapshot);
  if (!snapshotValidation.valid) {
    fatal(
      'Target snapshot failed schema validation before restore: ' +
      snapshotValidation.errors.join('; '),
    );
  }

  success('Target snapshot found:');
  info(`  ID:        ${targetSnapshot.id}`);
  info(`  Timestamp: ${new Date(targetSnapshot.timestamp).toISOString()}`);
  info(`  Provider:  ${targetSnapshot.provider || 'multi'}`);
  const snapModelCount = Array.isArray(targetSnapshot.models) ? targetSnapshot.models.length : 0;
  info(`  Models:    ${snapModelCount}`);
  console.log('');

  // ---- Load current catalog for diff ----
  let currentCatalog = null;
  if (existsSync(CATALOG_PATH)) {
    try {
      currentCatalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));
    } catch {
      warn('Could not parse current catalog \u2014 will overwrite');
    }
  }

  // ---- Compute diff ----
  const diff = computeDiff(currentCatalog, targetSnapshot);
  info('Change summary:');
  if (diff.modelsAdded.length > 0) {
    info(`  + ${diff.modelsAdded.length} model(s) restored: ${diff.modelsAdded.slice(0, 5).join(', ')}${diff.modelsAdded.length > 5 ? '...' : ''}`);
  }
  if (diff.modelsRemoved.length > 0) {
    info(`  - ${diff.modelsRemoved.length} model(s) removed: ${diff.modelsRemoved.slice(0, 5).join(', ')}${diff.modelsRemoved.length > 5 ? '...' : ''}`);
  }
  if (diff.modelsChanged.length > 0) {
    info(`  ~ ${diff.modelsChanged.length} model(s) reverted: ${diff.modelsChanged.slice(0, 5).join(', ')}${diff.modelsChanged.length > 5 ? '...' : ''}`);
  }
  if (!diff.modelsAdded.length && !diff.modelsRemoved.length && !diff.modelsChanged.length) {
    info('  No model-level differences detected');
  }
  console.log('');

  // ---- Dry run stops here ----
  if (options.dryRun) {
    info('DRY RUN \u2014 the following actions would be performed:');
    info(`  1. Backup current catalog to ${BACKUP_DIR}/`);
    info(`  2. Restore catalog from snapshot ${targetSnapshot.id}`);
    info('  3. Run post-rollback validation');
    info('  4. Log rollback action to audit log');
    console.log('');
    success('Dry run complete. No changes applied.');
    info(`Completed in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    process.exit(0);
  }

  // ---- Backup current catalog ----
  info('Creating backup of current catalog...');
  const backupPath = backupCurrentCatalog();
  if (backupPath) {
    success(`Backup saved: ${backupPath}`);
  } else {
    info('No existing catalog to backup');
  }
  console.log('');

  // ---- Restore catalog from snapshot ----
  info('Restoring catalog from snapshot...');
  const restoredCatalog = restoreCatalogFromSnapshot(targetSnapshot);
  const restoredModelCount = restoredCatalog.models ? Object.keys(restoredCatalog.models).length : 0;
  success(`Catalog restored with ${restoredModelCount} model(s)`);
  info(`  Written to: ${CATALOG_PATH}`);
  console.log('');

  // ---- Run validation ----
  info('Starting post-rollback validation...');
  const validationResult = runValidation();
  console.log('');

  if (validationResult.skipped) {
    warn('Validation was skipped (script not available)');
    warn('Please run manual validation to verify catalog integrity');
  } else if (validationResult.passed) {
    success('Post-rollback validation PASSED');
  } else {
    warn('Post-rollback validation FAILED');
    warn('The restored catalog may have issues. Consider further rollback or manual intervention.');
    if (backupPath) info(`  Previous catalog backup: ${backupPath}`);
  }
  console.log('');

  // ---- Log to audit ----
  info('Recording rollback in audit log...');
  const auditLogged = await logRollbackToAudit(auditLogger, {
    mode,
    reason: `Rollback ${mode}: restored from snapshot ${targetSnapshot.id}`,
    targetTimestamp: options.toTimestamp || new Date(targetSnapshot.timestamp).toISOString(),
    snapshotId: targetSnapshot.id,
    snapshotTimestamp: targetSnapshot.timestamp,
    snapshotProvider: targetSnapshot.provider,
    backupPath,
    validationResult,
    dryRun: false,
  });

  if (auditLogged) {
    success('Rollback recorded in audit log');
  } else {
    warn('Could not record rollback in audit log (non-blocking)');
  }
  console.log('');

  // ---- Final summary ----
  console.log('=== Rollback Summary ===');
  info(`Mode:            ${mode}`);
  info(`Snapshot:        ${targetSnapshot.id} (${new Date(targetSnapshot.timestamp).toISOString()})`);
  info(`Models restored: ${restoredModelCount}`);
  info(`Changes:         ${diff.summary}`);
  info(`Backup:          ${backupPath || 'none (no prior catalog)'}`);
  info(`Validation:      ${validationResult.skipped ? 'skipped' : validationResult.passed ? 'PASSED' : 'FAILED'}`);
  info(`Audit logged:    ${auditLogged ? 'yes' : 'no'}`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  info(`Completed in ${elapsed}s`);
  console.log('');

  // Close audit logger if loaded
  if (auditLogger && typeof auditLogger.close === 'function') {
    try { auditLogger.close(); } catch { /* ignore */ }
  }

  if (validationResult.passed === false) {
    warn('Rollback completed but validation failed \u2014 review recommended');
    process.exit(2);
  }

  success('Rollback completed successfully');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error('');
  fatal(`Unhandled error during rollback: ${err.message}\n${err.stack || ''}`);
});
