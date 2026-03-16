'use strict';
const crypto = require('crypto');

function validateSnapshot(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== 'object') {
    return { valid: false, errors: ['snapshot must be a non-null object'] };
  }
  if (typeof snapshot.id !== 'string' || !snapshot.id) {
    errors.push('snapshot.id must be a non-empty string');
  }
  if (typeof snapshot.timestamp !== 'number' || !Number.isFinite(snapshot.timestamp) || snapshot.timestamp <= 0) {
    errors.push('snapshot.timestamp must be a finite positive number');
  }
  if (!Array.isArray(snapshot.models) || snapshot.models.length === 0) {
    errors.push('snapshot.models must be a non-empty array');
  } else {
    for (let i = 0; i < snapshot.models.length; i++) {
      const model = snapshot.models[i];
      if (!model || typeof model !== 'object') {
        errors.push(`snapshot.models[${i}] must be an object`);
        continue;
      }
      if (!model.id && !model.name) {
        errors.push(`snapshot.models[${i}] must have id or name`);
      }
      if (typeof model.provider !== 'string') {
        errors.push(`snapshot.models[${i}].provider must be a string`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

function normalizeSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    timestamp: typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp)
      ? raw.timestamp : Date.now(),
    provider: typeof raw.provider === 'string' ? raw.provider : '',
    models: Array.isArray(raw.models) ? raw.models : [],
    rawPayloadHash: raw.rawPayloadHash || undefined,
    metadata: raw.metadata && typeof raw.metadata === 'object'
      ? {
          discoveryDuration: raw.metadata.discoveryDuration,
          modelCount: raw.metadata.modelCount ?? (Array.isArray(raw.models) ? raw.models.length : 0),
        }
      : undefined,
  };
}

module.exports = { validateSnapshot, normalizeSnapshot };
