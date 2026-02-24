'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_STORAGE_PATH = './snapshots';
const SNAPSHOT_FILE_NAME = 'snapshots.json';

class SnapshotStore {
  constructor(options = {}) {
    this.storagePath = path.resolve(options.storagePath || DEFAULT_STORAGE_PATH);
    this.retentionDays = coerceRetentionDays(options.retentionDays, DEFAULT_RETENTION_DAYS);
    this.storageFilePath = path.join(this.storagePath, SNAPSHOT_FILE_NAME);

    this.snapshots = [];
    this.writeQueue = Promise.resolve();
    this.ready = this._loadSnapshots();
  }

  async save(provider, models, rawPayload) {
    await this.ready;

    const normalizedModels = Array.isArray(models) ? models : [];
    const snapshot = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      provider: String(provider || ''),
      models: normalizedModels,
      rawPayloadHash: hashRawPayload(rawPayload),
      metadata: {
        discoveryDuration: extractDiscoveryDuration(rawPayload),
        modelCount: normalizedModels.length
      }
    };

    this.snapshots.push(snapshot);
    this._sortSnapshots();
    this._cleanupInMemory(this.retentionDays, snapshot.timestamp);

    await this._persistSnapshots();
    return snapshot.id;
  }

  async getLatest(provider) {
    await this.ready;
    const providerId = String(provider || '');

    let latestSnapshot = null;
    for (const snapshot of this.snapshots) {
      if (snapshot.provider !== providerId) {
        continue;
      }

      if (!latestSnapshot || snapshot.timestamp > latestSnapshot.timestamp) {
        latestSnapshot = snapshot;
      }
    }

    return latestSnapshot ? cloneSnapshot(latestSnapshot) : null;
  }

  async getByTimeRange(provider, startTime, endTime) {
    await this.ready;
    const providerId = String(provider || '');
    const start = Number(startTime);
    const end = Number(endTime);

    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      return [];
    }

    return this.snapshots
      .filter((snapshot) => {
        if (snapshot.provider !== providerId) {
          return false;
        }

        return snapshot.timestamp >= start && snapshot.timestamp <= end;
      })
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((snapshot) => cloneSnapshot(snapshot));
  }

  async cleanup(retentionDays = this.retentionDays) {
    await this.ready;
    const removedCount = this._cleanupInMemory(retentionDays, Date.now());

    if (removedCount > 0) {
      await this._persistSnapshots();
    }

    return removedCount;
  }

  async getStorageSize() {
    await this.ready;

    try {
      const stats = await fs.stat(this.storageFilePath);
      return stats.size;
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return 0;
      }

      throw error;
    }
  }

  async clear() {
    await this.ready;
    this.snapshots = [];
    await this._persistSnapshots();
  }

  _cleanupInMemory(retentionDays, now) {
    const normalizedRetentionDays = coerceRetentionDays(retentionDays, this.retentionDays);
    const cutoffTimestamp = now - (normalizedRetentionDays * DAY_MS);
    const initialLength = this.snapshots.length;

    this.snapshots = this.snapshots.filter((snapshot) => snapshot.timestamp >= cutoffTimestamp);

    return initialLength - this.snapshots.length;
  }

  _sortSnapshots() {
    this.snapshots.sort((a, b) => a.timestamp - b.timestamp);
  }

  async _loadSnapshots() {
    try {
      const raw = await fs.readFile(this.storageFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      const entries = parsed && typeof parsed === 'object' && Array.isArray(parsed.snapshots)
        ? parsed.snapshots
        : parsed;

      this.snapshots = this._normalizeSnapshots(entries);
      this._sortSnapshots();
    } catch (error) {
      this.snapshots = [];

      if (error && error.code === 'ENOENT') {
        return;
      }
    }
  }

  _normalizeSnapshots(entries) {
    if (!Array.isArray(entries)) {
      return [];
    }

    const normalized = [];

    for (const entry of entries) {
      const normalizedSnapshot = normalizeSnapshot(entry);
      if (normalizedSnapshot) {
        normalized.push(normalizedSnapshot);
      }
    }

    return normalized;
  }

  async _persistSnapshots() {
    const payload = JSON.stringify({ snapshots: this.snapshots }, null, 2);

    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(this.storagePath, { recursive: true });
        await fs.writeFile(this.storageFilePath, payload, 'utf8');
      });

    return this.writeQueue;
  }
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  const timestamp = Number(snapshot.timestamp);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const models = Array.isArray(snapshot.models) ? snapshot.models : [];
  const metadata = snapshot.metadata && typeof snapshot.metadata === 'object'
    ? snapshot.metadata
    : {};
  const discoveryDuration = Number(metadata.discoveryDuration);
  const normalizedDiscoveryDuration = Number.isFinite(discoveryDuration) && discoveryDuration >= 0
    ? discoveryDuration
    : 0;
  const modelCount = Number(metadata.modelCount);
  const normalizedModelCount = Number.isFinite(modelCount) && modelCount >= 0
    ? Math.floor(modelCount)
    : models.length;

  return {
    id: typeof snapshot.id === 'string' && snapshot.id.length > 0
      ? snapshot.id
      : crypto.randomUUID(),
    timestamp: Math.floor(timestamp),
    provider: String(snapshot.provider || ''),
    models,
    rawPayloadHash: typeof snapshot.rawPayloadHash === 'string' && snapshot.rawPayloadHash.length > 0
      ? snapshot.rawPayloadHash
      : hashRawPayload(null),
    metadata: {
      discoveryDuration: normalizedDiscoveryDuration,
      modelCount: normalizedModelCount
    }
  };
}

function coerceRetentionDays(value, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(0, Math.floor(numericValue));
}

function extractDiscoveryDuration(rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'object') {
    return 0;
  }

  const directValue = Number(rawPayload.discoveryDuration);
  if (Number.isFinite(directValue) && directValue >= 0) {
    return directValue;
  }

  if (!rawPayload.metadata || typeof rawPayload.metadata !== 'object') {
    return 0;
  }

  const metadataValue = Number(rawPayload.metadata.discoveryDuration);
  if (Number.isFinite(metadataValue) && metadataValue >= 0) {
    return metadataValue;
  }

  return 0;
}

function hashRawPayload(rawPayload) {
  const serialized = stableStringify(rawPayload);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function stableStringify(value) {
  return JSON.stringify(normalizeForHash(value));
}

function normalizeForHash(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForHash(entry));
  }

  if (value && typeof value === 'object') {
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

function cloneSnapshot(snapshot) {
  return {
    ...snapshot,
    models: snapshot.models.map((model) => {
      if (!model || typeof model !== 'object') {
        return model;
      }

      return { ...model };
    }),
    metadata: {
      discoveryDuration: snapshot.metadata.discoveryDuration,
      modelCount: snapshot.metadata.modelCount
    }
  };
}

module.exports = {
  SnapshotStore
};
