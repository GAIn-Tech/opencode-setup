'use strict';

const crypto = require('crypto');

function validateSnapshot(snapshot) {
  const errors = [];

  if (!snapshot || typeof snapshot !== 'object') {
    return { valid: false, errors: ['snapshot must be an object'] };
  }

  if (typeof snapshot.id !== 'string' || snapshot.id.trim().length === 0) {
    errors.push('snapshot.id is required');
  }

  const timestamp = Number(snapshot.timestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
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

function normalizeSnapshot(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const timestamp = Number(raw.timestamp);
  const normalizedTimestamp = Number.isFinite(timestamp) && timestamp > 0
    ? Math.floor(timestamp)
    : Date.now();
  const models = Array.isArray(raw.models) ? raw.models : [];
  const metadata = raw.metadata && typeof raw.metadata === 'object'
    ? raw.metadata
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
    id: typeof raw.id === 'string' && raw.id.length > 0
      ? raw.id
      : crypto.randomUUID(),
    timestamp: normalizedTimestamp,
    provider: String(raw.provider || ''),
    models,
    rawPayloadHash: typeof raw.rawPayloadHash === 'string' && raw.rawPayloadHash.length > 0
      ? raw.rawPayloadHash
      : hashRawPayload(null),
    metadata: {
      discoveryDuration: normalizedDiscoveryDuration,
      modelCount: normalizedModelCount
    }
  };
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

module.exports = {
  validateSnapshot,
  normalizeSnapshot
};
