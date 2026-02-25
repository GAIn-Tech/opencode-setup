'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DB_PATH = './audit.db';
const DEFAULT_RETENTION_DAYS = 365;
const GENESIS_PREVIOUS_HASH = '0';

class AuditLogger {
  constructor(options = {}) {
    this.dbPath = path.resolve(options.dbPath || DEFAULT_DB_PATH);
    this.retentionDays = coerceRetentionDays(options.retentionDays, DEFAULT_RETENTION_DAYS);
    this.maxPendingWrites = Math.max(1, Math.floor(Number(options.maxPendingWrites) || 100));
    this.writeQueue = Promise.resolve();
    this._pendingWrites = 0;

    this._initializeDatabase();
  }

  async log(entry) {
    const normalizedEntry = normalizeInputEntry(entry);

    return this._enqueueWrite(async () => {
      let transactionOpen = false;

      try {
        this.db.exec('BEGIN IMMEDIATE');
        transactionOpen = true;

        const previousRow = this.db.get(
          `
          SELECT entry_hash, timestamp
          FROM model_lifecycle_audit_log
          ORDER BY sequence DESC
          LIMIT 1
          `
        );

        const anchorHash = this._getAnchorHash();
        const previousHash = previousRow
          ? String(previousRow.entry_hash || GENESIS_PREVIOUS_HASH)
          : anchorHash;
        const timestamp = normalizeTimestamp(
          normalizedEntry.timestamp,
          previousRow ? Number(previousRow.timestamp) : Number.NaN
        );

        const persistedEntry = {
          id: normalizedEntry.id || crypto.randomUUID(),
          timestamp,
          modelId: normalizedEntry.modelId,
          fromState: normalizedEntry.fromState,
          toState: normalizedEntry.toState,
          actor: normalizedEntry.actor,
          reason: normalizedEntry.reason,
          diffHash: normalizedEntry.diffHash,
          metadata: cloneValue(normalizedEntry.metadata),
          previousHash
        };

        const entryHash = hashAuditEntry(persistedEntry);

        this.db.run(
          `
          INSERT INTO model_lifecycle_audit_log (
            id,
            timestamp,
            model_id,
            from_state,
            to_state,
            actor,
            reason,
            diff_hash,
            metadata_json,
            previous_hash,
            entry_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            persistedEntry.id,
            persistedEntry.timestamp,
            persistedEntry.modelId,
            persistedEntry.fromState,
            persistedEntry.toState,
            persistedEntry.actor,
            persistedEntry.reason,
            persistedEntry.diffHash,
            JSON.stringify(persistedEntry.metadata),
            persistedEntry.previousHash,
            entryHash
          ]
        );

        this.db.exec('COMMIT');
        transactionOpen = false;

        return cloneValue(persistedEntry);
      } catch (error) {
        if (transactionOpen) {
          try {
            this.db.exec('ROLLBACK');
          } catch (_rollbackError) {
            // ignore rollback errors after original failure
          }
        }

        throw error;
      }
    });
  }

  async getByModel(modelId) {
    const resolvedModelId = resolveRequiredString(modelId, 'modelId');
    const rows = this.db.all(
      `
      SELECT id, timestamp, model_id, from_state, to_state, actor, reason, diff_hash, metadata_json, previous_hash
      FROM model_lifecycle_audit_log
      WHERE model_id = ?
      ORDER BY sequence ASC
      `,
      [resolvedModelId]
    );

    return rows.map((row) => hydrateAuditRow(row));
  }

  async getByTimeRange(startTime, endTime) {
    const start = Number(startTime);
    const end = Number(endTime);

    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      return [];
    }

    const rows = this.db.all(
      `
      SELECT id, timestamp, model_id, from_state, to_state, actor, reason, diff_hash, metadata_json, previous_hash
      FROM model_lifecycle_audit_log
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY sequence ASC
      `,
      [Math.floor(start), Math.floor(end)]
    );

    return rows.map((row) => hydrateAuditRow(row));
  }

  async verify() {
    const rows = this.db.all(
      `
      SELECT id, timestamp, model_id, from_state, to_state, actor, reason, diff_hash, metadata_json, previous_hash, entry_hash
      FROM model_lifecycle_audit_log
      ORDER BY sequence ASC
      `
    );

    let expectedPreviousHash = this._getAnchorHash();

    for (const row of rows) {
      const entry = hydrateAuditRow(row);
      const storedEntryHash = String(row.entry_hash || '');

      if (entry.previousHash !== expectedPreviousHash) {
        return false;
      }

      const computedEntryHash = hashAuditEntry(entry);
      if (storedEntryHash !== computedEntryHash) {
        return false;
      }

      expectedPreviousHash = storedEntryHash;
    }

    return true;
  }

  async cleanup(retentionDays = this.retentionDays) {
    const normalizedRetentionDays = coerceRetentionDays(retentionDays, this.retentionDays);
    const cutoffTimestamp = Date.now() - (normalizedRetentionDays * DAY_MS);

    return this._enqueueWrite(async () => {
      let transactionOpen = false;

      try {
        this.db.exec('BEGIN IMMEDIATE');
        transactionOpen = true;

        const removalStats = this.db.get(
          `
          SELECT COUNT(*) AS count
          FROM model_lifecycle_audit_log
          WHERE timestamp < ?
          `,
          [cutoffTimestamp]
        );

        const removedCount = Number(removalStats && removalStats.count) || 0;
        if (removedCount === 0) {
          this.db.exec('COMMIT');
          transactionOpen = false;
          return 0;
        }

        const lastRemovedRow = this.db.get(
          `
          SELECT entry_hash
          FROM model_lifecycle_audit_log
          WHERE timestamp < ?
          ORDER BY sequence DESC
          LIMIT 1
          `,
          [cutoffTimestamp]
        );

        this.db.run(
          `
          DELETE FROM model_lifecycle_audit_log
          WHERE timestamp < ?
          `,
          [cutoffTimestamp]
        );

        if (lastRemovedRow && typeof lastRemovedRow.entry_hash === 'string' && lastRemovedRow.entry_hash.length > 0) {
          this._setAnchorHash(lastRemovedRow.entry_hash);
        }

        this.db.exec('COMMIT');
        transactionOpen = false;
        return removedCount;
      } catch (error) {
        if (transactionOpen) {
          try {
            this.db.exec('ROLLBACK');
          } catch (_rollbackError) {
            // ignore rollback errors after original failure
          }
        }

        throw error;
      }
    });
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }

  _initializeDatabase() {
    const directory = path.dirname(this.dbPath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    this.db = createSqliteClient(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS model_lifecycle_audit_log (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        timestamp INTEGER NOT NULL,
        model_id TEXT NOT NULL,
        from_state TEXT NOT NULL,
        to_state TEXT NOT NULL,
        actor TEXT NOT NULL,
        reason TEXT NOT NULL,
        diff_hash TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        previous_hash TEXT NOT NULL,
        entry_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_audit_log_model_timestamp
        ON model_lifecycle_audit_log(model_id, timestamp DESC);

      CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp
        ON model_lifecycle_audit_log(timestamp DESC);

      CREATE TABLE IF NOT EXISTS audit_log_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    this.db.run(
      `
      INSERT INTO audit_log_meta (key, value)
      VALUES ('anchor_hash', ?)
      ON CONFLICT(key) DO NOTHING
      `,
      [GENESIS_PREVIOUS_HASH]
    );
  }

  _getAnchorHash() {
    const row = this.db.get(
      `
      SELECT value
      FROM audit_log_meta
      WHERE key = 'anchor_hash'
      LIMIT 1
      `
    );

    if (!row || typeof row.value !== 'string' || row.value.length === 0) {
      return GENESIS_PREVIOUS_HASH;
    }

    return row.value;
  }

  _setAnchorHash(anchorHash) {
    this.db.run(
      `
      INSERT INTO audit_log_meta (key, value)
      VALUES ('anchor_hash', ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value
      `,
      [String(anchorHash || GENESIS_PREVIOUS_HASH)]
    );
  }

  _enqueueWrite(task) {
    if (this._pendingWrites >= this.maxPendingWrites) {
      return Promise.reject(new Error(
        `Write queue full: ${this._pendingWrites} pending writes (max ${this.maxPendingWrites})`
      ));
    }

    this._pendingWrites += 1;
    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(async () => task())
      .finally(() => {
        this._pendingWrites -= 1;
      });

    return this.writeQueue;
  }
}

function hydrateAuditRow(row) {
  return {
    id: String(row.id || ''),
    timestamp: Number.isFinite(Number(row.timestamp))
      ? Number(row.timestamp)
      : 0,
    modelId: String(row.model_id || ''),
    fromState: String(row.from_state || ''),
    toState: String(row.to_state || ''),
    actor: String(row.actor || ''),
    reason: String(row.reason || ''),
    diffHash: String(row.diff_hash || ''),
    metadata: parseJsonSafely(row.metadata_json, {}),
    previousHash: String(row.previous_hash || GENESIS_PREVIOUS_HASH)
  };
}

function normalizeInputEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error('Audit entry must be an object');
  }

  return {
    id: resolveOptionalString(entry.id),
    timestamp: Number(entry.timestamp),
    modelId: resolveRequiredString(entry.modelId, 'modelId'),
    fromState: resolveRequiredString(entry.fromState, 'fromState'),
    toState: resolveRequiredString(entry.toState, 'toState'),
    actor: resolveRequiredString(entry.actor, 'actor'),
    reason: resolveRequiredString(entry.reason, 'reason'),
    diffHash: resolveRequiredString(entry.diffHash, 'diffHash'),
    metadata: isObject(entry.metadata) ? cloneValue(entry.metadata) : {}
  };
}

function resolveRequiredString(value, fieldName) {
  const normalized = resolveOptionalString(value);
  if (!normalized) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  return normalized;
}

function resolveOptionalString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.trim();
  return normalized;
}

function normalizeTimestamp(timestamp, previousTimestamp) {
  const numericTimestamp = Number(timestamp);
  const normalizedTimestamp = Number.isFinite(numericTimestamp)
    ? Math.floor(numericTimestamp)
    : Date.now();

  if (!Number.isFinite(previousTimestamp)) {
    return normalizedTimestamp;
  }

  return Math.max(normalizedTimestamp, Math.floor(previousTimestamp));
}

function coerceRetentionDays(value, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(0, Math.floor(numericValue));
}

function hashAuditEntry(entry) {
  const serialized = stableStringify({
    id: entry.id,
    timestamp: entry.timestamp,
    modelId: entry.modelId,
    fromState: entry.fromState,
    toState: entry.toState,
    actor: entry.actor,
    reason: entry.reason,
    diffHash: entry.diffHash,
    metadata: entry.metadata,
    previousHash: entry.previousHash
  });

  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function stableStringify(value) {
  return JSON.stringify(normalizeForHash(value));
}

function normalizeForHash(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForHash(entry));
  }

  if (isObject(value)) {
    const sorted = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      sorted[key] = normalizeForHash(value[key]);
    }
    return sorted;
  }

  if (value === undefined) {
    return '__undefined__';
  }

  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }

  return value;
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }

  if (isObject(value)) {
    const clone = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      clone[key] = cloneValue(nestedValue);
    }
    return clone;
  }

  return value;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonSafely(raw, fallback) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch (_error) {
    return fallback;
  }
}

function createSqliteClient(dbPath) {
  const bunDatabase = tryLoadBunDatabase();
  if (bunDatabase) {
    return new BunSqliteClient(new bunDatabase(dbPath, { create: true }));
  }

  const BetterSqliteDatabase = require('better-sqlite3');
  return new BetterSqliteClient(new BetterSqliteDatabase(dbPath));
}

function tryLoadBunDatabase() {
  try {
    const { createRequire } = require('node:module');
    const localRequire = createRequire(__filename);
    const bunSqlite = localRequire('bun:sqlite');
    if (bunSqlite && typeof bunSqlite.Database === 'function') {
      return bunSqlite.Database;
    }

    return null;
  } catch (_error) {
    return null;
  }
}

class BunSqliteClient {
  constructor(database) {
    this.database = database;
  }

  pragma(statement) {
    this.database.exec(`PRAGMA ${statement}`);
  }

  exec(sql) {
    this.database.exec(sql);
  }

  run(sql, params) {
    this.database.query(sql).run(...normalizeSqlParams(params));
  }

  get(sql, params) {
    return this.database.query(sql).get(...normalizeSqlParams(params)) || null;
  }

  all(sql, params) {
    return this.database.query(sql).all(...normalizeSqlParams(params));
  }

  close() {
    this.database.close();
  }
}

class BetterSqliteClient {
  constructor(database) {
    this.database = database;
  }

  pragma(statement) {
    this.database.pragma(statement);
  }

  exec(sql) {
    this.database.exec(sql);
  }

  run(sql, params) {
    this.database.prepare(sql).run(...normalizeSqlParams(params));
  }

  get(sql, params) {
    return this.database.prepare(sql).get(...normalizeSqlParams(params)) || null;
  }

  all(sql, params) {
    return this.database.prepare(sql).all(...normalizeSqlParams(params));
  }

  close() {
    this.database.close();
  }
}

function normalizeSqlParams(params) {
  if (!Array.isArray(params)) {
    return [];
  }

  return params;
}

module.exports = {
  AuditLogger
};
