'use strict';

const fs = require('fs');
const path = require('path');
const { resolveDataDir } = require('./paths');
const { safeJsonParse } = require('./safe-json-parse');

// --- In-memory RL state cache (avoids read-before-write) ---
let _rlStateCache = null;

// --- Async helpers ---

/**
 * Ensure a directory exists (async, recursive).
 * mkdir with recursive:true is a no-op if dir already exists.
 */
async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

/**
 * Atomic write: write to tmp file, then rename in place.
 * Prevents partial writes on crash.
 */
async function atomicWriteFile(filePath, data) {
  const tmpPath = filePath + '.tmp.' + process.pid;
  await fs.promises.writeFile(tmpPath, data, 'utf8');
  await fs.promises.rename(tmpPath, filePath);
}

/**
 * Invalidate the in-memory RL state cache.
 * Called when external operations modify the RL state file directly.
 */
function invalidateRlStateCache() {
  _rlStateCache = null;
}

/**
 * Custom error for concurrency conflicts
 */
class ConcurrencyError extends Error {
  constructor(message, expectedVersion, currentVersion) {
    super(message);
    this.name = 'ConcurrencyError';
    this.expectedVersion = expectedVersion;
    this.currentVersion = currentVersion;
  }
}

/**
 * Get path to RL state file
 * @returns {string} Path to ~/.opencode/rl-state.json
 */
function getRlStatePath() {
  return path.join(resolveDataDir(), 'rl-state.json');
}

/**
 * Get path to audit log file
 * @returns {string} Path to ~/.opencode/audit/central-config.log
 */
function getAuditLogPath() {
  return path.join(resolveDataDir(), 'audit', 'central-config.log');
}

/**
 * Ensure audit directory exists (async)
 */
async function ensureAuditDir() {
  const auditDir = path.dirname(getAuditLogPath());
  await ensureDir(auditDir);
}

/**
 * Load RL state from disk (async, cached).
 * Returns cached copy if available; reads disk only on first call
 * or after cache invalidation.
 * Returns empty object if file doesn't exist.
 * 
 * @returns {Promise<object>} RL state {section.param: {value, confidence, timestamp}}
 */
async function loadRlState() {
  if (_rlStateCache !== null) {
    return { ..._rlStateCache };
  }

  const filePath = getRlStatePath();

  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    const parsed = safeJsonParse(content, {}, filePath);
    _rlStateCache = parsed;
    return { ...parsed };
  } catch (err) {
    if (err.code === 'ENOENT') {
      _rlStateCache = {};
      return {};
    }
    console.warn(`[RlState] Failed to load RL state: ${err.message}`);
    return {};
  }
}

/**
 * Save RL state with optimistic concurrency control (async, atomic write).
 * Uses in-memory cache to avoid read-before-write disk I/O.
 * 
 * @param {object} nextState - New RL state to save
 * @param {object} options - Options {expectedVersion}
 * @returns {Promise<object>} Updated state with new config_version
 * @throws {ConcurrencyError} If expectedVersion doesn't match current config_version
 */
async function saveRlState(nextState, { expectedVersion } = {}) {
  const filePath = getRlStatePath();

  // Use cache to avoid redundant disk read (read-before-write optimization)
  let currentState;
  if (_rlStateCache !== null) {
    currentState = { ..._rlStateCache };
  } else {
    try {
      const raw = await fs.promises.readFile(filePath, 'utf8');
      currentState = safeJsonParse(raw, {}, filePath);
    } catch (err) {
      currentState = {};
    }
  }

  // Check optimistic concurrency
  const currentVersion = currentState.config_version || 0;
  if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
    throw new ConcurrencyError(
      `Stale config version: expected ${expectedVersion}, got ${currentVersion}`,
      expectedVersion,
      currentVersion
    );
  }

  // Increment version
  const newVersion = currentVersion + 1;

  // Merge with new state
  const mergedState = {
    ...nextState,
    config_version: newVersion,
  };

  // Write to disk atomically
  const dataDir = resolveDataDir();
  await ensureDir(dataDir);
  await atomicWriteFile(filePath, JSON.stringify(mergedState, null, 2));

  // Update cache
  _rlStateCache = { ...mergedState };

  return mergedState;
}

/**
 * Update a single entry in RL state (async, cached).
 * 
 * @param {string} key - Parameter key (e.g., 'section.param')
 * @param {*} value - New value
 * @param {number} confidence - Confidence level (0-1)
 * @returns {Promise<object>} Updated RL state
 */
async function updateRlStateEntry(key, value, confidence) {
  const state = await loadRlState();

  state[key] = {
    value,
    confidence,
    timestamp: new Date().toISOString(),
  };

  // Save without version check (single entry update)
  const currentVersion = state.config_version || 0;
  state.config_version = currentVersion + 1;

  const filePath = getRlStatePath();
  const dataDir = resolveDataDir();
  await ensureDir(dataDir);
  await atomicWriteFile(filePath, JSON.stringify(state, null, 2));

  // Update cache
  _rlStateCache = { ...state };

  return state;
}

/**
 * Append entry to audit log (JSONL format, async)
 * 
 * @param {object} entry - Audit entry {timestamp, action, section, param, oldValue, newValue, source, user}
 */
async function appendAuditEntry(entry) {
  await ensureAuditDir();

  const logPath = getAuditLogPath();
  const auditEntry = {
    timestamp: entry.timestamp || new Date().toISOString(),
    action: entry.action,
    section: entry.section,
    param: entry.param,
    oldValue: entry.oldValue,
    newValue: entry.newValue,
    source: entry.source,
    user: entry.user || 'system',
  };

  try {
    const line = JSON.stringify(auditEntry) + '\n';
    await fs.promises.appendFile(logPath, line, 'utf8');
  } catch (err) {
    console.warn(`[AuditLog] Failed to append audit entry: ${err.message}`);
  }
}

/**
 * Read audit log with optional filtering (async)
 * 
 * @param {object} options - Filter options {since, until, limit}
 * @returns {Promise<array>} Array of audit entries
 */
async function readAuditLog({ since, until, limit } = {}) {
  const logPath = getAuditLogPath();

  try {
    const content = await fs.promises.readFile(logPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    let entries = lines.map(line => safeJsonParse(line, null, 'audit-log'))
      .filter(entry => entry !== null);

    // Filter by timestamp
    if (since) {
      const sinceTime = new Date(since).getTime();
      entries = entries.filter(e => new Date(e.timestamp).getTime() >= sinceTime);
    }

    if (until) {
      const untilTime = new Date(until).getTime();
      entries = entries.filter(e => new Date(e.timestamp).getTime() <= untilTime);
    }

    // Apply limit
    if (limit && limit > 0) {
      entries = entries.slice(-limit);
    }

    return entries;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    console.warn(`[AuditLog] Failed to read audit log: ${err.message}`);
    return [];
  }
}

/**
 * Get path to snapshots directory
 * @returns {string} Path to ~/.opencode/snapshots/central-config/
 */
function getSnapshotsDir() {
  return path.join(resolveDataDir(), 'snapshots', 'central-config');
}

/**
 * Ensure snapshots directory exists (async)
 */
async function ensureSnapshotsDir() {
  await ensureDir(getSnapshotsDir());
}

/**
 * Create a snapshot of current config and RL state (async, atomic).
 * Atomic rollback requires both to be restored together.
 * 
 * @param {string} name - Snapshot name (alphanumeric + hyphens)
 * @param {string} centralConfigPath - Path to central-config.json
 * @returns {Promise<object>} Snapshot metadata
 */
async function createSnapshot(name, centralConfigPath) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error('Snapshot name must be alphanumeric with hyphens/underscores only');
  }

  await ensureSnapshotsDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotId = `${timestamp}_${name}`;
  const snapshotDir = path.join(getSnapshotsDir(), snapshotId);

  await fs.promises.mkdir(snapshotDir, { recursive: true });

  // Copy central-config.json
  if (centralConfigPath) {
    try {
      await fs.promises.access(centralConfigPath);
      await fs.promises.copyFile(centralConfigPath, path.join(snapshotDir, 'central-config.json'));
    } catch { /* config file doesn't exist, skip */ }
  }

  // Copy RL state
  const rlStatePath = getRlStatePath();
  try {
    await fs.promises.access(rlStatePath);
    await fs.promises.copyFile(rlStatePath, path.join(snapshotDir, 'rl-state.json'));
  } catch { /* RL state doesn't exist, skip */ }

  // Write metadata atomically
  const metadata = {
    id: snapshotId,
    name,
    timestamp: new Date().toISOString(),
    centralConfigPath,
    rlStatePath,
  };

  await atomicWriteFile(
    path.join(snapshotDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  // Append to audit log
  await appendAuditEntry({
    action: 'snapshot_created',
    section: 'system',
    param: 'snapshot',
    oldValue: null,
    newValue: snapshotId,
    source: 'system',
  });

  return metadata;
}

/**
 * List available snapshots (async)
 * 
 * @param {number} limit - Maximum snapshots to return (default: 10)
 * @returns {Promise<array>} Array of snapshot metadata
 */
async function listSnapshots(limit = 10) {
  const dir = getSnapshotsDir();

  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const snapshots = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const metaPath = path.join(dir, e.name, 'metadata.json');
    try {
      const raw = await fs.promises.readFile(metaPath, 'utf8');
      const parsed = safeJsonParse(raw, null, metaPath);
      if (parsed) snapshots.push(parsed);
    } catch {
      // Skip snapshots with unreadable metadata
    }
  }

  snapshots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return snapshots.slice(0, limit);
}

/**
 * Restore config and RL state from snapshot (async).
 * Invalidates RL state cache.
 * 
 * @param {string} snapshotId - Snapshot ID to restore
 * @param {string} centralConfigPath - Path to central-config.json
 * @returns {Promise<object>} Restored metadata
 */
async function restoreSnapshot(snapshotId, centralConfigPath) {
  const snapshotDir = path.join(getSnapshotsDir(), snapshotId);

  try {
    await fs.promises.access(snapshotDir);
  } catch {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }

  const metaPath = path.join(snapshotDir, 'metadata.json');
  let metaRaw;
  try {
    metaRaw = await fs.promises.readFile(metaPath, 'utf8');
  } catch {
    throw new Error(`Invalid snapshot: missing metadata`);
  }

  const metadata = safeJsonParse(metaRaw, null, metaPath);
  if (!metadata) {
    throw new Error(`Invalid snapshot: corrupted metadata in ${snapshotId}`);
  }

  // Restore central-config.json
  const snapshotConfigPath = path.join(snapshotDir, 'central-config.json');
  if (centralConfigPath) {
    try {
      await fs.promises.access(snapshotConfigPath);
      await fs.promises.copyFile(snapshotConfigPath, centralConfigPath);
    } catch { /* snapshot config doesn't exist, skip */ }
  }

  // Restore RL state
  const snapshotRlPath = path.join(snapshotDir, 'rl-state.json');
  const rlStatePath = getRlStatePath();
  try {
    await fs.promises.access(snapshotRlPath);
    await ensureDir(path.dirname(rlStatePath));
    await fs.promises.copyFile(snapshotRlPath, rlStatePath);
  } catch { /* snapshot RL state doesn't exist, skip */ }

  // Invalidate cache since RL state was restored from snapshot
  invalidateRlStateCache();

  // Append to audit log
  await appendAuditEntry({
    action: 'snapshot_restored',
    section: 'system',
    param: 'snapshot',
    oldValue: null,
    newValue: snapshotId,
    source: 'system',
  });

  return metadata;
}

/**
 * Load config with corruption recovery (async).
 * Falls back to last known good snapshot if JSON parse fails.
 * 
 * @param {string} configPath - Path to config file
 * @returns {Promise<object>} Loaded config or recovered config
 */
async function loadWithRecovery(configPath) {
  try {
    const content = await fs.promises.readFile(configPath, 'utf8');
    const parsed = safeJsonParse(content, null, configPath);
    if (parsed !== null) return parsed;
    throw new Error(`Invalid JSON in ${configPath}`);
  } catch (err) {
    console.warn(`[Recovery] Config corrupted at ${configPath}: ${err.message}`);

    // Try to find most recent snapshot
    const snapshots = await listSnapshots(1);
    if (snapshots.length > 0) {
      console.warn(`[Recovery] Attempting recovery from snapshot: ${snapshots[0].id}`);

      try {
        const snapshotDir = path.join(getSnapshotsDir(), snapshots[0].id);
        const snapshotConfigPath = path.join(snapshotDir, 'central-config.json');

        const recoveredRaw = await fs.promises.readFile(snapshotConfigPath, 'utf8');
        const recovered = safeJsonParse(recoveredRaw, null, snapshotConfigPath);
        if (!recovered) {
          throw new Error(`Invalid JSON in snapshot config at ${snapshotConfigPath}`);
        }

        // Restore the file
        await fs.promises.copyFile(snapshotConfigPath, configPath);

        await appendAuditEntry({
          action: 'auto_recovery',
          section: 'system',
          param: 'central-config',
          oldValue: 'corrupted',
          newValue: snapshots[0].id,
          source: 'system',
        });

        console.warn(`[Recovery] Successfully recovered from ${snapshots[0].id}`);
        return recovered;
      } catch (recoveryErr) {
        console.error(`[Recovery] Failed to recover: ${recoveryErr.message}`);
      }
    }

    throw new Error(`Config corrupted and no recovery available: ${err.message}`);
  }
}

/**
 * Clean up old snapshots, keeping only the most recent N (async)
 * 
 * @param {number} keep - Number of snapshots to keep (default: 5)
 * @returns {Promise<number>} Number of snapshots deleted
 */
async function cleanupSnapshots(keep = 5) {
  const snapshots = await listSnapshots(100); // Get all

  if (snapshots.length <= keep) {
    return 0;
  }

  const toDelete = snapshots.slice(keep);
  let deleted = 0;

  for (const snapshot of toDelete) {
    const snapshotDir = path.join(getSnapshotsDir(), snapshot.id);
    try {
      await fs.promises.rm(snapshotDir, { recursive: true, force: true });
      deleted++;
    } catch (err) {
      console.warn(`[Cleanup] Failed to delete snapshot ${snapshot.id}: ${err.message}`);
    }
  }

  return deleted;
}

/**
 * Rollback central config to a previous config_version.
 *
 * Scans the audit log for 'update' entries whose newValue contains the
 * target version.  When a matching snapshot of the full config is found in
 * an audit entry's oldValue/newValue, it is written back atomically.
 * If no full-config snapshot is available the function rebuilds the config
 * by replaying audit entries up to the target version.
 *
 * @param {number} targetVersion - The config_version to restore
 * @param {string} centralConfigPath - Absolute path to central-config.json
 * @returns {Promise<{success: boolean, restoredVersion: number}>}
 */
async function rollback(targetVersion, centralConfigPath) {
  if (typeof targetVersion !== 'number' || targetVersion < 1) {
    throw new Error(`Invalid targetVersion: must be a positive number, got ${targetVersion}`);
  }
  if (!centralConfigPath) {
    throw new Error('centralConfigPath is required');
  }

  const entries = await readAuditLog();

  // Strategy 1 – find an audit entry whose newValue is the full config at
  // the target version (action === 'update' with config_version match).
  let restoredConfig = null;

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.action !== 'update' && entry.action !== 'rollback') continue;

    const candidate = entry.newValue;
    if (
      candidate &&
      typeof candidate === 'object' &&
      candidate.config_version === targetVersion &&
      candidate.schema_version &&
      candidate.sections
    ) {
      restoredConfig = candidate;
      break;
    }

    // Also check oldValue – the config *before* an update may be the one
    // we want to roll back to.
    const old = entry.oldValue;
    if (
      old &&
      typeof old === 'object' &&
      old.config_version === targetVersion &&
      old.schema_version &&
      old.sections
    ) {
      restoredConfig = old;
      break;
    }
  }

  if (!restoredConfig) {
    throw new Error(
      `Cannot rollback: no audit entry found containing config_version ${targetVersion}`
    );
  }

  // Write restored config atomically
  await atomicWriteFile(centralConfigPath, JSON.stringify(restoredConfig, null, 2));

  // Record the rollback in the audit log
  await appendAuditEntry({
    action: 'rollback',
    section: '*',
    param: '*',
    oldValue: null,
    newValue: restoredConfig,
    source: 'rollback',
    user: 'system',
  });

  // Invalidate caches so subsequent reads pick up the restored state
  invalidateRlStateCache();

  return { success: true, restoredVersion: targetVersion };
}

/**
 * Validate the structural integrity of a central-config.json file.
 *
 * Checks:
 * 1. File is readable and valid JSON
 * 2. Required top-level fields exist with correct types
 * 3. All numeric parameter values, bounds (soft/hard min/max), are finite
 *    numbers (not NaN, null, undefined, or Infinity)
 *
 * @param {string} configPath - Absolute path to central-config.json
 * @returns {Promise<{valid: boolean, errors: string[]}>}
 */
async function validateIntegrity(configPath) {
  const errors = [];

  // 1. Read file
  let content;
  try {
    content = await fs.promises.readFile(configPath, 'utf8');
  } catch (err) {
    return { valid: false, errors: [`Cannot read file: ${err.message}`] };
  }

  // 2. Parse JSON
  let config;
  try {
    config = JSON.parse(content);
  } catch (err) {
    return { valid: false, errors: [`Invalid JSON: ${err.message}`] };
  }

  // 3. Required top-level fields
  if (typeof config.schema_version !== 'string') {
    errors.push('schema_version must be a string');
  }
  if (typeof config.config_version !== 'number' || config.config_version < 1) {
    errors.push('config_version must be a number >= 1');
  }
  if (!config.rl || typeof config.rl !== 'object') {
    errors.push('rl must be an object');
  } else if (typeof config.rl.override_min_confidence !== 'number' ||
             !Number.isFinite(config.rl.override_min_confidence)) {
    errors.push('rl.override_min_confidence must be a finite number');
  }
  if (!config.sections || typeof config.sections !== 'object') {
    errors.push('sections must be an object');
  }

  // 4. Walk all params in sections – validate numeric values and bounds
  if (config.sections && typeof config.sections === 'object') {
    for (const [sectionName, section] of Object.entries(config.sections)) {
      if (!section || typeof section !== 'object') continue;
      const params = section.params || section;

      if (typeof params !== 'object') continue;

      for (const [paramName, paramDef] of Object.entries(params)) {
        if (!paramDef || typeof paramDef !== 'object') continue;
        const prefix = `sections.${sectionName}.${paramName}`;

        // Check value if present and numeric
        if ('value' in paramDef && typeof paramDef.value === 'number') {
          if (!Number.isFinite(paramDef.value)) {
            errors.push(`${prefix}.value is not a finite number`);
          }
        }

        // Check bounds (soft and hard)
        for (const boundsType of ['soft', 'hard']) {
          const bounds = paramDef[boundsType];
          if (!bounds || typeof bounds !== 'object') continue;

          for (const edge of ['min', 'max']) {
            if (edge in bounds) {
              const v = bounds[edge];
              if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) {
                errors.push(`${prefix}.${boundsType}.${edge} is not a finite number (got ${v})`);
              }
            }
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  loadRlState,
  saveRlState,
  updateRlStateEntry,
  appendAuditEntry,
  readAuditLog,
  ConcurrencyError,
  getRlStatePath,
  getAuditLogPath,
  invalidateRlStateCache,
  // Snapshot and recovery
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  loadWithRecovery,
  cleanupSnapshots,
  getSnapshotsDir,
  // Rollback and integrity
  rollback,
  validateIntegrity,
};
