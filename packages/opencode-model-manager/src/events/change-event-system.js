'use strict';

const { EventEmitter } = require('events');
const fs = require('fs/promises');
const path = require('path');

const DEFAULT_AUDIT_LOG_PATH = './audit-log.json';
const MAX_AUDIT_EVENTS = 10000;  // Cap before rotation
const MAX_AUDIT_AGE_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days

const EVENT_TYPES = Object.freeze({
  ADDED: 'added',
  REMOVED: 'removed',
  CHANGED: 'changed'
});

const EVENT_NAMES = Object.freeze({
  [EVENT_TYPES.ADDED]: 'model:added',
  [EVENT_TYPES.REMOVED]: 'model:removed',
  [EVENT_TYPES.CHANGED]: 'model:changed'
});

const EVENT_NAME_TO_TYPE = Object.freeze({
  'model:added': EVENT_TYPES.ADDED,
  'model:removed': EVENT_TYPES.REMOVED,
  'model:changed': EVENT_TYPES.CHANGED
});

class ChangeEventSystem extends EventEmitter {
  constructor(options = {}) {
    super();

    this.auditLogPath = path.resolve(options.auditLogPath || DEFAULT_AUDIT_LOG_PATH);
    this.auditLog = [];
    this.writeQueue = Promise.resolve();
    this.ready = this._loadAuditLog();
  }

  async publishChanges(diff, snapshotId) {
    await this.ready;

    const events = this._buildEvents(diff, snapshotId);
    if (events.length === 0) {
      return [];
    }

    const initialLength = this.auditLog.length;
    this.auditLog.push(...events);

    try {
      await this._persistAuditLog();
    } catch (error) {
      this.auditLog.length = initialLength;
      throw error;
    }

    for (const event of events) {
      this.emit(EVENT_NAMES[event.type], cloneValue(event));
    }

    return events.map((event) => cloneValue(event));
  }

  subscribe(eventType, handler) {
    return this.on(eventType, handler);
  }

  async getAuditLog(options = {}) {
    await this.ready;

    const startTime = Number(options.startTime);
    const endTime = Number(options.endTime);
    const hasStartTime = Number.isFinite(startTime);
    const hasEndTime = Number.isFinite(endTime);

    if (hasStartTime && hasEndTime && startTime > endTime) {
      return [];
    }

    const typeFilter = normalizeType(options.type) || EVENT_NAME_TO_TYPE[String(options.eventType || '')] || '';
    const providerFilter = String(options.provider || '');
    const snapshotIdFilter = String(options.snapshotId || '');
    const limit = Number(options.limit);
    const hasLimit = Number.isFinite(limit) && limit > 0;

    const entries = this.auditLog
      .filter((entry) => {
        if (hasStartTime && entry.timestamp < startTime) {
          return false;
        }

        if (hasEndTime && entry.timestamp > endTime) {
          return false;
        }

        if (typeFilter && entry.type !== typeFilter) {
          return false;
        }

        if (providerFilter && entry.provider !== providerFilter) {
          return false;
        }

        if (snapshotIdFilter && entry.snapshotId !== snapshotIdFilter) {
          return false;
        }

        return true;
      })
      .sort((left, right) => left.timestamp - right.timestamp);

    const limitedEntries = hasLimit
      ? entries.slice(0, Math.floor(limit))
      : entries;

    return limitedEntries.map((entry) => cloneValue(entry));
  }

  async clearAuditLog() {
    await this.ready;
    this.auditLog = [];
    await this._persistAuditLog();
  }

  _buildEvents(diff, snapshotId) {
    const normalizedDiff = isObject(diff) ? diff : {};
    const normalizedSnapshotId = String(snapshotId || '');
    const events = [];

    const addedEntries = Array.isArray(normalizedDiff.added) ? normalizedDiff.added : [];
    for (const entry of addedEntries) {
      const event = createEventPayload(EVENT_TYPES.ADDED, entry, normalizedSnapshotId);
      if (event) {
        events.push(event);
      }
    }

    const removedEntries = Array.isArray(normalizedDiff.removed) ? normalizedDiff.removed : [];
    for (const entry of removedEntries) {
      const event = createEventPayload(EVENT_TYPES.REMOVED, entry, normalizedSnapshotId);
      if (event) {
        events.push(event);
      }
    }

    const modifiedEntries = Array.isArray(normalizedDiff.modified) ? normalizedDiff.modified : [];
    for (const entry of modifiedEntries) {
      const event = createEventPayload(EVENT_TYPES.CHANGED, entry, normalizedSnapshotId);
      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  async _loadAuditLog() {
    try {
      const raw = await fs.readFile(this.auditLogPath, 'utf8');
      const parsed = JSON.parse(raw);
      const entries = isObject(parsed) && Array.isArray(parsed.events)
        ? parsed.events
        : parsed;

      this.auditLog = this._normalizeEntries(entries);
    } catch (error) {
      this.auditLog = [];

      if (error && error.code === 'ENOENT') {
        return;
      }
    }
  }

  _normalizeEntries(entries) {
    if (!Array.isArray(entries)) {
      return [];
    }

    const normalized = [];

    for (const entry of entries) {
      const normalizedEntry = normalizeAuditEntry(entry);
      if (normalizedEntry) {
        normalized.push(normalizedEntry);
      }
    }

    return normalized.sort((left, right) => left.timestamp - right.timestamp);
  }

  _maybeRotateAuditLog() {
    if (this.auditLog.length > MAX_AUDIT_EVENTS) {
      // Keep newest events
      this.auditLog = this.auditLog.slice(-MAX_AUDIT_EVENTS);
    }

    // Age-based cleanup
    const cutoff = Date.now() - MAX_AUDIT_AGE_MS;
    this.auditLog = this.auditLog.filter(e => e.timestamp > cutoff);
  }

  async _persistAuditLog() {
    this._maybeRotateAuditLog();
    const payload = JSON.stringify({ events: this.auditLog }, null, 2);

    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(path.dirname(this.auditLogPath), { recursive: true });
        await fs.writeFile(this.auditLogPath, payload, 'utf8');
      });

    return this.writeQueue;
  }
}

function createEventPayload(type, entry, snapshotId) {
  if (!isObject(entry)) {
    return null;
  }

  const timestamp = Number(entry.timestamp);
  const normalizedTimestamp = Number.isFinite(timestamp)
    ? Math.floor(timestamp)
    : Date.now();

  return {
    type,
    classification: normalizeClassification(entry.classification),
    provider: resolveProvider(entry),
    model: cloneValue(entry.model),
    changes: type === EVENT_TYPES.CHANGED
      ? normalizeChanges(entry.changes)
      : null,
    timestamp: normalizedTimestamp,
    snapshotId
  };
}

function normalizeAuditEntry(entry) {
  if (!isObject(entry)) {
    return null;
  }

  const type = normalizeType(entry.type);
  if (!type) {
    return null;
  }

  const timestamp = Number(entry.timestamp);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return {
    type,
    classification: normalizeClassification(entry.classification),
    provider: String(entry.provider || ''),
    model: cloneValue(entry.model),
    changes: type === EVENT_TYPES.CHANGED
      ? normalizeChanges(entry.changes)
      : null,
    timestamp: Math.floor(timestamp),
    snapshotId: String(entry.snapshotId || '')
  };
}

function normalizeType(value) {
  const normalized = String(value || '').toLowerCase();

  if (normalized === EVENT_TYPES.ADDED) {
    return EVENT_TYPES.ADDED;
  }

  if (normalized === EVENT_TYPES.REMOVED) {
    return EVENT_TYPES.REMOVED;
  }

  if (normalized === EVENT_TYPES.CHANGED || normalized === 'modified') {
    return EVENT_TYPES.CHANGED;
  }

  return '';
}

function normalizeClassification(value) {
  return value === 'minor' ? 'minor' : 'major';
}

function resolveProvider(entry) {
  if (typeof entry.provider === 'string' && entry.provider.length > 0) {
    return entry.provider;
  }

  if (isObject(entry.model) && typeof entry.model.provider === 'string' && entry.model.provider.length > 0) {
    return entry.model.provider;
  }

  return '';
}

function normalizeChanges(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return cloneValue(value);
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

module.exports = {
  ChangeEventSystem
};
