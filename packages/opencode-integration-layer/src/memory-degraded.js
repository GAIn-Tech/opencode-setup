'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_MAX_QUEUE_SIZE = 1000;
const DEFAULT_RETRY_INTERVAL_MS = 60 * 1000;
const DEFAULT_AVAILABILITY_TIMEOUT_MS = 5000;
const MAX_BACKOFF_MS = 16 * 60 * 1000;
const DEFAULT_QUEUE_DB_PATH = path.join(os.homedir(), '.opencode', 'memory', 'degraded-queue.db');

class DegradedModeHandler {
  constructor(options = {}) {
    this.localStoragePath = normalizeStoragePath(options.localStoragePath);
    this.maxQueueSize = normalizePositiveInteger(options.maxQueueSize, DEFAULT_MAX_QUEUE_SIZE);
    this.retryIntervalMs = normalizePositiveInteger(options.retryIntervalMs, DEFAULT_RETRY_INTERVAL_MS);

    this._availabilityTimeoutMs = normalizePositiveInteger(
      options.availabilityTimeoutMs,
      DEFAULT_AVAILABILITY_TIMEOUT_MS,
    );
    this._containerTag = typeof options.containerTag === 'string' && options.containerTag.length > 0
      ? options.containerTag
      : 'sm_project_default';
    this._supermemoryWhoAmI = resolveOptionalFunction(options.supermemoryWhoAmI, 'supermemory_whoAmI');
    this._supermemoryMemory = resolveOptionalFunction(options.supermemoryMemory, 'supermemory_memory');
    this._now = typeof options.now === 'function' ? options.now : () => Date.now();

    this.available = false;
    this.lastCheckTime = null;

    this._consecutiveFlushFailures = 0;
    this._nextFlushAllowedAt = 0;

    this._initializeDatabase();
  }

  async write(record) {
    const normalizedRecord = normalizeRecord(record);

    if (await this.checkAvailability()) {
      try {
        await this._writeToSupermemory(normalizedRecord);
        return {
          id: normalizedRecord.id,
          queued: false,
          written: true,
        };
      } catch (_error) {
        this.available = false;
      }
    }

    this._enqueueRecord(normalizedRecord);

    return {
      id: normalizedRecord.id,
      queued: true,
      written: false,
    };
  }

  async flush() {
    const queuedBefore = this._getQueuedCount();
    if (queuedBefore === 0) {
      this._resetBackoff();
      return { flushed: 0, failed: 0, remaining: 0 };
    }

    const now = this._now();
    if (this._nextFlushAllowedAt > now) {
      return { flushed: 0, failed: 0, remaining: queuedBefore };
    }

    if (!(await this.checkAvailability())) {
      this._scheduleRetry();
      return { flushed: 0, failed: 0, remaining: queuedBefore };
    }

    const rows = this._db.all(
      `
      SELECT id, record_json, queued_at, attempts
      FROM pending_writes
      ORDER BY queued_at ASC, rowid ASC
      `,
      [],
    ) || [];

    let flushed = 0;
    let failed = 0;

    for (const row of rows) {
      const parsed = safeParseJson(row.record_json);
      if (!parsed) {
        this._incrementAttempts(row.id);
        failed += 1;
        continue;
      }

      try {
        await this._writeToSupermemory(parsed);
        this._deleteQueuedRecord(row.id);
        flushed += 1;
      } catch (_error) {
        this.available = false;
        this._incrementAttempts(row.id);
        failed += 1;
        break;
      }
    }

    if (failed > 0) {
      this._scheduleRetry();
    } else {
      this._resetBackoff();
    }

    return {
      flushed,
      failed,
      remaining: this._getQueuedCount(),
    };
  }

  async checkAvailability() {
    this.lastCheckTime = new Date(this._now()).toISOString();

    if (typeof this._supermemoryWhoAmI !== 'function' || typeof this._supermemoryMemory !== 'function') {
      this.available = false;
      return this.available;
    }

    try {
      await withTimeout(
        Promise.resolve().then(() => this._supermemoryWhoAmI()),
        this._availabilityTimeoutMs,
        'supermemory availability check timed out',
      );
      this.available = true;
    } catch (_error) {
      this.available = false;
    }

    return this.available;
  }

  getStatus() {
    return {
      available: this.available,
      queuedCount: this._getQueuedCount(),
      lastCheckTime: this.lastCheckTime,
    };
  }

  disableConsolidation() {
    return !this.available;
  }

  close() {
    if (this._db) {
      this._db.close();
    }
  }

  _initializeDatabase() {
    const directory = path.dirname(this.localStoragePath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    this._db = createSqliteClient(this.localStoragePath);
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('synchronous = NORMAL');
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS pending_writes (
        id TEXT PRIMARY KEY,
        record_json TEXT NOT NULL,
        queued_at TEXT NOT NULL,
        attempts INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_pending_writes_queued_at
        ON pending_writes(queued_at ASC, id ASC);
    `);
  }

  _enqueueRecord(record) {
    this._db.run(
      `
      INSERT INTO pending_writes (id, record_json, queued_at, attempts)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
      `,
      [
        record.id,
        safeStringify(record),
        new Date(this._now()).toISOString(),
        0,
      ],
    );

    this._evictOverflow();
  }

  _evictOverflow() {
    const overflow = this._getQueuedCount() - this.maxQueueSize;
    if (overflow <= 0) {
      return;
    }

    const staleRows = this._db.all(
      `
      SELECT id
      FROM pending_writes
      ORDER BY queued_at ASC, rowid ASC
      LIMIT ?
      `,
      [overflow],
    ) || [];

    for (const row of staleRows) {
      this._deleteQueuedRecord(row.id);
    }
  }

  _deleteQueuedRecord(id) {
    this._db.run(
      `
      DELETE FROM pending_writes
      WHERE id = ?
      `,
      [id],
    );
  }

  _incrementAttempts(id) {
    this._db.run(
      `
      UPDATE pending_writes
      SET attempts = attempts + 1
      WHERE id = ?
      `,
      [id],
    );
  }

  _getQueuedCount() {
    const row = this._db.get(
      `
      SELECT COUNT(*) AS queued_count
      FROM pending_writes
      `,
      [],
    );

    const queuedCount = row ? Number(row.queued_count) : 0;
    return Number.isFinite(queuedCount) ? queuedCount : 0;
  }

  _scheduleRetry() {
    this._consecutiveFlushFailures += 1;
    const exponent = Math.max(0, this._consecutiveFlushFailures - 1);
    const backoffMs = Math.min(this.retryIntervalMs * (2 ** exponent), MAX_BACKOFF_MS);
    this._nextFlushAllowedAt = this._now() + backoffMs;
  }

  _resetBackoff() {
    this._consecutiveFlushFailures = 0;
    this._nextFlushAllowedAt = 0;
  }

  async _writeToSupermemory(record) {
    if (typeof this._supermemoryMemory !== 'function') {
      throw new Error('supermemory_memory is unavailable');
    }

    const payload = safeStringify(record);
    if (this._supermemoryMemory.length >= 2) {
      await Promise.resolve(this._supermemoryMemory(payload, this._containerTag));
      return;
    }

    await Promise.resolve(this._supermemoryMemory({
      content: payload,
      action: 'save',
      containerTag: this._containerTag,
    }));
  }
}

function normalizeStoragePath(localStoragePath) {
  if (typeof localStoragePath === 'string' && localStoragePath.length > 0) {
    return path.resolve(localStoragePath);
  }

  return DEFAULT_QUEUE_DB_PATH;
}

function normalizePositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }

  return Math.floor(numeric);
}

function resolveOptionalFunction(candidate, globalName) {
  if (typeof candidate === 'function') {
    return candidate;
  }

  if (globalThis && typeof globalThis[globalName] === 'function') {
    return globalThis[globalName];
  }

  return null;
}

function normalizeRecord(record) {
  const normalized = record && typeof record === 'object' && !Array.isArray(record)
    ? { ...record }
    : { value: record };

  if (typeof normalized.id !== 'string' || normalized.id.length === 0) {
    normalized.id = createRecordId();
  }

  return normalized;
}

function createRecordId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return JSON.stringify({ id: createRecordId(), serialization_error: true });
  }
}

function safeParseJson(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

async function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutId = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function createSqliteClient(dbPath) {
  const bunDatabase = tryLoadBunDatabase();
  if (bunDatabase) {
    return new BunSqliteClient(new bunDatabase(dbPath, { create: true }));
  }

  let BetterSqliteDatabase = null;
  try {
    BetterSqliteDatabase = require('better-sqlite3');
  } catch (_error) {
    throw new Error('No SQLite driver available. Install better-sqlite3 or run with Bun.');
  }

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
  DegradedModeHandler,
};
