'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const DEFAULT_L1_TTL_MS = 5 * 60 * 1000;
const DEFAULT_L2_TTL_MS = 60 * 60 * 1000;
const DEFAULT_L2_PATH = './cache.json';

class CacheLayer {
  constructor(options = {}) {
    this.l1Ttl = Math.max(0, Number(options.l1Ttl) || DEFAULT_L1_TTL_MS);
    this.l2Ttl = Math.max(this.l1Ttl, Number(options.l2Ttl) || DEFAULT_L2_TTL_MS);
    this.l2Path = path.resolve(options.l2Path || DEFAULT_L2_PATH);

    this.l1Cache = new Map();
    this.l2Cache = Object.create(null);
    this.refreshInFlight = new Map();
    this.writeQueue = Promise.resolve();
    this.ready = this._loadL2Cache();
  }

  static buildKey(provider, endpoint, params = {}) {
    return createCacheKey(provider, endpoint, params);
  }

  async get(key, fetchFn) {
    await this.ready;
    const now = Date.now();

    const l1Entry = this.l1Cache.get(key);
    const l1State = this._getEntryState(l1Entry, now);

    if (l1State === 'fresh') {
      return l1Entry.value;
    }

    if (l1State === 'stale') {
      this._scheduleRefresh(key, fetchFn);
      return l1Entry.value;
    }

    if (l1State === 'expired') {
      this.l1Cache.delete(key);
      delete this.l2Cache[key];
      void this._persistL2Cache();
    }

    const l2Entry = this.l2Cache[key];
    const l2State = this._getEntryState(l2Entry, now);

    if (l2State === 'fresh') {
      this.l1Cache.set(key, l2Entry);
      return l2Entry.value;
    }

    if (l2State === 'stale') {
      this.l1Cache.set(key, l2Entry);
      this._scheduleRefresh(key, fetchFn);
      return l2Entry.value;
    }

    if (l2State === 'expired') {
      delete this.l2Cache[key];
      void this._persistL2Cache();
    }

    return this._fetchAndPopulate(key, fetchFn);
  }

  async set(key, value) {
    await this.ready;
    const entry = {
      value,
      fetchedAt: Date.now()
    };

    this.l1Cache.set(key, entry);
    this.l2Cache[key] = entry;
    await this._persistL2Cache();
    return value;
  }

  async clear() {
    await this.ready;
    this.l1Cache.clear();
    this.l2Cache = Object.create(null);
    await this._persistL2Cache();
  }

  async clearL1() {
    this.l1Cache.clear();
  }

  _getEntryState(entry, now) {
    if (!entry || typeof entry !== 'object') {
      return 'missing';
    }

    const fetchedAt = Number(entry.fetchedAt);
    if (!Number.isFinite(fetchedAt)) {
      return 'missing';
    }

    const ageMs = Math.max(0, now - fetchedAt);

    if (ageMs <= this.l1Ttl) {
      return 'fresh';
    }

    if (ageMs <= this.l2Ttl) {
      return 'stale';
    }

    return 'expired';
  }

  _scheduleRefresh(key, fetchFn) {
    if (typeof fetchFn !== 'function') {
      return;
    }

    if (this.refreshInFlight.has(key)) {
      return;
    }

    const refreshPromise = (async () => {
      try {
        const freshValue = await fetchFn();
        await this.set(key, freshValue);
      } catch (_) {
        // stale value stays available when background refresh fails
      } finally {
        this.refreshInFlight.delete(key);
      }
    })();

    this.refreshInFlight.set(key, refreshPromise);
  }

  async _fetchAndPopulate(key, fetchFn) {
    if (typeof fetchFn !== 'function') {
      throw new TypeError(`Cache miss for key "${key}" requires fetchFn`);
    }

    const value = await fetchFn();
    await this.set(key, value);
    return value;
  }

  async _loadL2Cache() {
    try {
      const raw = await fs.readFile(this.l2Path, 'utf8');
      const parsed = JSON.parse(raw);
      const entries = parsed && typeof parsed === 'object' && parsed.entries
        ? parsed.entries
        : parsed;
      this.l2Cache = this._normalizeEntries(entries);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        this.l2Cache = Object.create(null);
        return;
      }

      this.l2Cache = Object.create(null);
    }
  }

  _normalizeEntries(entries) {
    const normalized = Object.create(null);

    if (!entries || typeof entries !== 'object') {
      return normalized;
    }

    for (const [key, entry] of Object.entries(entries)) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const fetchedAt = Number(entry.fetchedAt);
      if (!Number.isFinite(fetchedAt)) {
        continue;
      }

      normalized[key] = {
        value: entry.value,
        fetchedAt
      };
    }

    return normalized;
  }

  async _persistL2Cache() {
    const snapshot = JSON.stringify({ entries: this.l2Cache }, null, 2);

    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(path.dirname(this.l2Path), { recursive: true });
        await fs.writeFile(this.l2Path, snapshot, 'utf8');
      });

    return this.writeQueue;
  }
}

function createCacheKey(provider, endpoint, params = {}) {
  const providerPart = String(provider || '');
  const endpointPart = String(endpoint || '');
  const paramsHash = hashParams(params);
  return `${providerPart}:${endpointPart}:${paramsHash}`;
}

function hashParams(params) {
  const serialized = stableStringify(params);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function stableStringify(value) {
  return JSON.stringify(normalizeForHash(value));
}

function normalizeForHash(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForHash(item));
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

module.exports = {
  CacheLayer,
  createCacheKey,
  hashParams
};
