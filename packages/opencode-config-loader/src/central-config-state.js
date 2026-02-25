'use strict';

const fs = require('fs');
const path = require('path');
const { resolveDataDir } = require('./paths');
const { safeJsonParse } = require('./safe-json-parse');

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
 * Ensure audit directory exists
 */
function ensureAuditDir() {
  const auditDir = path.dirname(getAuditLogPath());
  if (!fs.existsSync(auditDir)) {
    fs.mkdirSync(auditDir, { recursive: true });
  }
}

/**
 * Load RL state from disk
 * Returns empty object if file doesn't exist
 * 
 * @returns {object} RL state {section.param: {value, confidence, timestamp}}
 */
function loadRlState() {
  const filePath = getRlStatePath();
  
  if (!fs.existsSync(filePath)) {
    return {};
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return safeJsonParse(content, {}, filePath);
  } catch (err) {
    console.warn(`[RlState] Failed to load RL state: ${err.message}`);
    return {};
  }
}

/**
 * Save RL state with optimistic concurrency control
 * 
 * @param {object} nextState - New RL state to save
 * @param {object} options - Options {expectedVersion}
 * @returns {object} Updated state with new config_version
 * @throws {ConcurrencyError} If expectedVersion doesn't match current config_version
 */
function saveRlState(nextState, { expectedVersion } = {}) {
  const filePath = getRlStatePath();
  
  // Read current state to check version
  let currentState = {};
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      currentState = safeJsonParse(raw, {}, filePath);
    } catch (err) {
      // If file read fails, treat as empty
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
  
  // Write to disk
  try {
    const dataDir = resolveDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(mergedState, null, 2), 'utf8');
  } catch (err) {
    throw new Error(`Failed to save RL state: ${err.message}`);
  }
  
  return mergedState;
}

/**
 * Update a single entry in RL state
 * 
 * @param {string} key - Parameter key (e.g., 'section.param')
 * @param {*} value - New value
 * @param {number} confidence - Confidence level (0-1)
 * @returns {object} Updated RL state
 */
function updateRlStateEntry(key, value, confidence) {
  const state = loadRlState();
  
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
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
  
  return state;
}

/**
 * Append entry to audit log (JSONL format)
 * 
 * @param {object} entry - Audit entry {timestamp, action, section, param, oldValue, newValue, source, user}
 */
function appendAuditEntry(entry) {
  ensureAuditDir();
  
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
    fs.appendFileSync(logPath, line, 'utf8');
  } catch (err) {
    console.warn(`[AuditLog] Failed to append audit entry: ${err.message}`);
  }
}

/**
 * Read audit log with optional filtering
 * 
 * @param {object} options - Filter options {since, until, limit}
 * @returns {array} Array of audit entries
 */
function readAuditLog({ since, until, limit } = {}) {
  const logPath = getAuditLogPath();
  
  if (!fs.existsSync(logPath)) {
    return [];
  }
  
  try {
    const content = fs.readFileSync(logPath, 'utf8');
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
 * Ensure snapshots directory exists
 */
function ensureSnapshotsDir() {
  const dir = getSnapshotsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Create a snapshot of current config and RL state
 * Atomic rollback requires both to be restored together
 * 
 * @param {string} name - Snapshot name (alphanumeric + hyphens)
 * @param {string} centralConfigPath - Path to central-config.json
 * @returns {object} Snapshot metadata
 */
function createSnapshot(name, centralConfigPath) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error('Snapshot name must be alphanumeric with hyphens/underscores only');
  }
  
  ensureSnapshotsDir();
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotId = `${timestamp}_${name}`;
  const snapshotDir = path.join(getSnapshotsDir(), snapshotId);
  
  fs.mkdirSync(snapshotDir, { recursive: true });
  
  // Copy central-config.json
  if (centralConfigPath && fs.existsSync(centralConfigPath)) {
    fs.copyFileSync(centralConfigPath, path.join(snapshotDir, 'central-config.json'));
  }
  
  // Copy RL state
  const rlStatePath = getRlStatePath();
  if (fs.existsSync(rlStatePath)) {
    fs.copyFileSync(rlStatePath, path.join(snapshotDir, 'rl-state.json'));
  }
  
  // Write metadata
  const metadata = {
    id: snapshotId,
    name,
    timestamp: new Date().toISOString(),
    centralConfigPath,
    rlStatePath,
  };
  
  fs.writeFileSync(
    path.join(snapshotDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf8'
  );
  
  // Append to audit log
  appendAuditEntry({
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
 * List available snapshots
 * 
 * @param {number} limit - Maximum snapshots to return (default: 10)
 * @returns {array} Array of snapshot metadata
 */
function listSnapshots(limit = 10) {
  const dir = getSnapshotsDir();
  
  if (!fs.existsSync(dir)) {
    return [];
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const snapshots = entries
    .filter(e => e.isDirectory())
    .map(e => {
      const metaPath = path.join(dir, e.name, 'metadata.json');
      if (fs.existsSync(metaPath)) {
        try {
          return safeJsonParse(fs.readFileSync(metaPath, 'utf8'), null, metaPath);
        } catch {
          return null;
        }
      }
      return null;
    })
    .filter(s => s !== null)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  return snapshots.slice(0, limit);
}

/**
 * Restore config and RL state from snapshot
 * 
 * @param {string} snapshotId - Snapshot ID to restore
 * @param {string} centralConfigPath - Path to central-config.json
 * @returns {object} Restored metadata
 */
function restoreSnapshot(snapshotId, centralConfigPath) {
  const snapshotDir = path.join(getSnapshotsDir(), snapshotId);
  
  if (!fs.existsSync(snapshotDir)) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }
  
  const metaPath = path.join(snapshotDir, 'metadata.json');
  if (!fs.existsSync(metaPath)) {
    throw new Error(`Invalid snapshot: missing metadata`);
  }
  
  const raw = fs.readFileSync(metaPath, 'utf8');
  const metadata = safeJsonParse(raw, null, metaPath);
  if (!metadata) {
    throw new Error(`Invalid snapshot: corrupted metadata in ${snapshotId}`);
  }
  
  // Restore central-config.json
  const snapshotConfigPath = path.join(snapshotDir, 'central-config.json');
  if (fs.existsSync(snapshotConfigPath) && centralConfigPath) {
    fs.copyFileSync(snapshotConfigPath, centralConfigPath);
  }
  
  // Restore RL state
  const snapshotRlPath = path.join(snapshotDir, 'rl-state.json');
  const rlStatePath = getRlStatePath();
  if (fs.existsSync(snapshotRlPath)) {
    const rlDir = path.dirname(rlStatePath);
    if (!fs.existsSync(rlDir)) {
      fs.mkdirSync(rlDir, { recursive: true });
    }
    fs.copyFileSync(snapshotRlPath, rlStatePath);
  }
  
  // Append to audit log
  appendAuditEntry({
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
 * Load config with corruption recovery
 * Falls back to last known good snapshot if JSON parse fails
 * 
 * @param {string} configPath - Path to config file
 * @returns {object} Loaded config or recovered config
 */
function loadWithRecovery(configPath) {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const parsed = safeJsonParse(content, null, configPath);
    if (parsed !== null) return parsed;
    throw new Error(`Invalid JSON in ${configPath}`);
  } catch (err) {
    console.warn(`[Recovery] Config corrupted at ${configPath}: ${err.message}`);
    
    // Try to find most recent snapshot
    const snapshots = listSnapshots(1);
    if (snapshots.length > 0) {
      console.warn(`[Recovery] Attempting recovery from snapshot: ${snapshots[0].id}`);
      
      try {
        const snapshotDir = path.join(getSnapshotsDir(), snapshots[0].id);
        const snapshotConfigPath = path.join(snapshotDir, 'central-config.json');
        
        if (fs.existsSync(snapshotConfigPath)) {
          const recoveredRaw = fs.readFileSync(snapshotConfigPath, 'utf8');
          const recovered = safeJsonParse(recoveredRaw, null, snapshotConfigPath);
          if (!recovered) {
            throw new Error(`Invalid JSON in snapshot config at ${snapshotConfigPath}`);
          }
          
          // Restore the file
          fs.copyFileSync(snapshotConfigPath, configPath);
          
          appendAuditEntry({
            action: 'auto_recovery',
            section: 'system',
            param: 'central-config',
            oldValue: 'corrupted',
            newValue: snapshots[0].id,
            source: 'system',
          });
          
          console.warn(`[Recovery] Successfully recovered from ${snapshots[0].id}`);
          return recovered;
        }
      } catch (recoveryErr) {
        console.error(`[Recovery] Failed to recover: ${recoveryErr.message}`);
      }
    }
    
    throw new Error(`Config corrupted and no recovery available: ${err.message}`);
  }
}

/**
 * Clean up old snapshots, keeping only the most recent N
 * 
 * @param {number} keep - Number of snapshots to keep (default: 5)
 * @returns {number} Number of snapshots deleted
 */
function cleanupSnapshots(keep = 5) {
  const snapshots = listSnapshots(100); // Get all
  
  if (snapshots.length <= keep) {
    return 0;
  }
  
  const toDelete = snapshots.slice(keep);
  let deleted = 0;
  
  for (const snapshot of toDelete) {
    const snapshotDir = path.join(getSnapshotsDir(), snapshot.id);
    try {
      fs.rmSync(snapshotDir, { recursive: true, force: true });
      deleted++;
    } catch (err) {
      console.warn(`[Cleanup] Failed to delete snapshot ${snapshot.id}: ${err.message}`);
    }
  }
  
  return deleted;
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
  // Snapshot and recovery
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  loadWithRecovery,
  cleanupSnapshots,
  getSnapshotsDir,
};
