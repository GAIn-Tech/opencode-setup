'use strict';

const crypto = require('crypto');

const MEMORY_TYPES = Object.freeze({
  FACT: 'fact',
  PREFERENCE: 'preference',
  PATTERN: 'pattern',
  DECISION: 'decision',
  ERROR: 'error',
  SESSION_CONTEXT: 'session_context',
});

const RETENTION_POLICIES = Object.freeze({
  CORE: 'core',
  PERISHABLE: 'perishable',
  EPHEMERAL: 'ephemeral',
});

const MEMORY_TYPE_VALUES = Object.freeze(Object.values(MEMORY_TYPES));
const RETENTION_VALUES = Object.freeze(Object.values(RETENTION_POLICIES));
const DEFAULT_IMPORTANCE = 0.5;
const DEFAULT_TYPE = MEMORY_TYPES.FACT;
const DEFAULT_RETENTION = RETENTION_POLICIES.PERISHABLE;
const ISO_8601_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MEMORY_RECORD_SCHEMA = Object.freeze({
  name: 'memory_record',
  version: '1.0',
  fields: Object.freeze({
    id: Object.freeze({ type: 'uuid', required: true, immutable: true }),
    type: Object.freeze({ type: 'enum', required: true, values: MEMORY_TYPE_VALUES }),
    project: Object.freeze({ type: 'string', required: true }),
    agent: Object.freeze({ type: 'string', required: true }),
    timestamp: Object.freeze({ type: 'iso8601', required: true, autoSetOnCreate: true }),
    importance: Object.freeze({
      type: 'float',
      required: true,
      min: 0,
      max: 1,
      default: DEFAULT_IMPORTANCE,
      clamp: true,
    }),
    entities: Object.freeze({ type: 'string[]', required: true }),
    content: Object.freeze({ type: 'string', required: true }),
    content_hash: Object.freeze({ type: 'sha256_hex', required: true, derivedFrom: 'content' }),
    source_session_id: Object.freeze({ type: 'string', required: true }),
    retention: Object.freeze({ type: 'enum', required: true, values: RETENTION_VALUES }),
    metadata: Object.freeze({ type: 'object', required: true, extensible: true }),
  }),
  invariants: Object.freeze([
    'id is immutable after creation',
    'content_hash must equal SHA-256(content) hex digest',
    `type must be one of: ${MEMORY_TYPE_VALUES.join(', ')}`,
    'project is required and must be a non-empty string',
    'timestamp is auto-set on creation when missing or invalid',
    'importance is clamped to [0, 1] during normalization',
  ]),
});

function validateMemoryRecord(record) {
  const errors = [];

  if (!isObject(record)) {
    return {
      valid: false,
      errors: ['record must be a plain object'],
    };
  }

  if (!isUuid(record.id)) {
    errors.push('id must be a valid UUID');
  }

  if (!isEnumValue(record.type, MEMORY_TYPE_VALUES)) {
    errors.push(`type must be one of: ${MEMORY_TYPE_VALUES.join(', ')}`);
  }

  if (!isNonEmptyString(record.project)) {
    errors.push('project is required and must be a non-empty string');
  }

  if (typeof record.agent !== 'string') {
    errors.push('agent must be a string');
  }

  if (!isIsoTimestamp(record.timestamp)) {
    errors.push('timestamp must be a valid ISO 8601 UTC string');
  }

  if (!isFiniteNumber(record.importance) || record.importance < 0 || record.importance > 1) {
    errors.push('importance must be a finite number between 0 and 1');
  }

  if (!Array.isArray(record.entities) || record.entities.some((value) => typeof value !== 'string')) {
    errors.push('entities must be an array of strings');
  }

  if (typeof record.content !== 'string') {
    errors.push('content must be a string');
  }

  if (typeof record.content_hash !== 'string' || !/^[a-f0-9]{64}$/i.test(record.content_hash)) {
    errors.push('content_hash must be a SHA-256 hex string');
  } else if (typeof record.content === 'string') {
    const expectedHash = sha256Hex(record.content);
    if (expectedHash !== record.content_hash) {
      errors.push('content_hash must match SHA-256(content)');
    }
  }

  if (typeof record.source_session_id !== 'string') {
    errors.push('source_session_id must be a string');
  }

  if (!isEnumValue(record.retention, RETENTION_VALUES)) {
    errors.push(`retention must be one of: ${RETENTION_VALUES.join(', ')}`);
  }

  if (!isObject(record.metadata)) {
    errors.push('metadata must be an object');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function normalizeMemoryRecord(partial = {}) {
  const source = isObject(partial) ? partial : {};
  const content = typeof source.content === 'string' ? source.content : '';
  const normalizedId = normalizeString(source.id);

  return {
    id: normalizedId || crypto.randomUUID(),
    type: normalizeEnum(source.type, MEMORY_TYPE_VALUES, DEFAULT_TYPE),
    project: normalizeString(source.project),
    agent: normalizeString(source.agent),
    timestamp: normalizeTimestamp(source.timestamp),
    importance: clamp01(source.importance, DEFAULT_IMPORTANCE),
    entities: normalizeEntities(source.entities),
    content,
    content_hash: sha256Hex(content),
    source_session_id: normalizeString(source.source_session_id),
    retention: normalizeEnum(source.retention, RETENTION_VALUES, DEFAULT_RETENTION),
    metadata: normalizeMetadata(source.metadata),
  };
}

function computeIdempotencyKey(record = {}) {
  const source = isObject(record) ? record : {};
  const contentHash = normalizeString(source.content_hash)
    || sha256Hex(typeof source.content === 'string' ? source.content : '');
  const project = normalizeString(source.project);
  const type = normalizeString(source.type);

  return sha256Hex(`${contentHash}${project}${type}`);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function clamp01(value, fallback = DEFAULT_IMPORTANCE) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, numeric));
}

function normalizeEntities(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeEnum(value, allowedValues, fallback) {
  const normalized = normalizeString(value);
  return allowedValues.includes(normalized) ? normalized : fallback;
}

function normalizeTimestamp(value) {
  if (isIsoTimestamp(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date().toISOString();
}

function normalizeMetadata(value) {
  if (!isObject(value)) {
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

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function isEnumValue(value, values) {
  return typeof value === 'string' && values.includes(value);
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string') {
    return false;
  }

  if (!ISO_8601_UTC_REGEX.test(value)) {
    return false;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

module.exports = {
  MEMORY_RECORD_SCHEMA,
  MEMORY_TYPES,
  RETENTION_POLICIES,
  validateMemoryRecord,
  normalizeMemoryRecord,
  computeIdempotencyKey,
};
