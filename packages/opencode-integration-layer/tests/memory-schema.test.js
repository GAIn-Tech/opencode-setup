'use strict';

const { describe, test, expect } = require('bun:test');
const { createHash } = require('crypto');

const {
  MEMORY_RECORD_SCHEMA,
  MEMORY_TYPES,
  RETENTION_POLICIES,
  validateMemoryRecord,
  normalizeMemoryRecord,
  computeIdempotencyKey,
} = require('../src/memory-schema.js');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_8601_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function sha256Hex(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

describe('memory-schema exports and schema contract', () => {
  test('exports canonical enums and schema metadata', () => {
    expect(Object.values(MEMORY_TYPES)).toEqual([
      'fact',
      'preference',
      'pattern',
      'decision',
      'error',
      'session_context',
    ]);

    expect(Object.values(RETENTION_POLICIES)).toEqual([
      'core',
      'perishable',
      'ephemeral',
    ]);

    expect(MEMORY_RECORD_SCHEMA.fields.importance.default).toBe(0.5);
    expect(MEMORY_RECORD_SCHEMA.fields.id.immutable).toBe(true);
    expect(MEMORY_RECORD_SCHEMA.fields.timestamp.autoSetOnCreate).toBe(true);
    expect(MEMORY_RECORD_SCHEMA.invariants).toContain('id is immutable after creation');
    expect(MEMORY_RECORD_SCHEMA.invariants).toContain('content_hash must equal SHA-256(content) hex digest');
  });
});

describe('normalizeMemoryRecord', () => {
  test('fills defaults, preserves explicit id, and computes content hash', () => {
    const normalized = normalizeMemoryRecord({
      id: '11111111-1111-4111-8111-111111111111',
      type: MEMORY_TYPES.DECISION,
      project: 'wave-1',
      agent: 'sisyphus-junior',
      timestamp: '2026-04-21T12:34:56.000Z',
      entities: ['memory', 'schema'],
      content: 'Canonical memory payload',
      content_hash: 'intentionally-ignored',
      source_session_id: 'ses_123',
      retention: RETENTION_POLICIES.CORE,
      metadata: { wave: 1 },
    });

    expect(normalized.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(normalized.type).toBe(MEMORY_TYPES.DECISION);
    expect(normalized.project).toBe('wave-1');
    expect(normalized.agent).toBe('sisyphus-junior');
    expect(normalized.timestamp).toBe('2026-04-21T12:34:56.000Z');
    expect(normalized.importance).toBe(0.5);
    expect(normalized.entities).toEqual(['memory', 'schema']);
    expect(normalized.content).toBe('Canonical memory payload');
    expect(normalized.content_hash).toBe(sha256Hex('Canonical memory payload'));
    expect(normalized.source_session_id).toBe('ses_123');
    expect(normalized.retention).toBe(RETENTION_POLICIES.CORE);
    expect(normalized.metadata).toEqual({ wave: 1 });
  });

  test('auto-generates id/timestamp and clamps importance into [0, 1]', () => {
    const highImportance = normalizeMemoryRecord({
      project: 'wave-1',
      content: 'high',
      importance: 1.7,
      entities: ['  alpha  ', 123, '', 'beta'],
    });

    expect(highImportance.id).toMatch(UUID_REGEX);
    expect(highImportance.timestamp).toMatch(ISO_8601_UTC_REGEX);
    expect(highImportance.type).toBe(MEMORY_TYPES.FACT);
    expect(highImportance.retention).toBe(RETENTION_POLICIES.PERISHABLE);
    expect(highImportance.importance).toBe(1);
    expect(highImportance.entities).toEqual(['alpha', 'beta']);

    const lowImportance = normalizeMemoryRecord({
      project: 'wave-1',
      content: 'low',
      importance: -2,
    });

    expect(lowImportance.importance).toBe(0);
  });
});

describe('validateMemoryRecord', () => {
  test('accepts a normalized valid record', () => {
    const record = normalizeMemoryRecord({
      id: '22222222-2222-4222-8222-222222222222',
      type: MEMORY_TYPES.FACT,
      project: 'memory-overhaul',
      agent: 'integration-layer',
      timestamp: '2026-04-21T08:00:00.000Z',
      importance: 0.75,
      entities: ['memory', 'record'],
      content: 'A factual memory',
      source_session_id: 'ses_abc',
      retention: RETENTION_POLICIES.PERISHABLE,
      metadata: { source: 'unit-test' },
    });

    const validation = validateMemoryRecord(record);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  test('returns validation errors for contract violations', () => {
    const badHash = sha256Hex('different-content');
    const validation = validateMemoryRecord({
      id: 'not-a-uuid',
      type: 'invalid-type',
      project: '   ',
      agent: 42,
      timestamp: 'not-a-timestamp',
      importance: 1.5,
      entities: ['ok', 2],
      content: 'actual-content',
      content_hash: badHash,
      source_session_id: 999,
      retention: 'unknown',
      metadata: [],
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('id must be a valid UUID');
    expect(validation.errors).toContain('project is required and must be a non-empty string');
    expect(validation.errors).toContain('agent must be a string');
    expect(validation.errors).toContain('timestamp must be a valid ISO 8601 UTC string');
    expect(validation.errors).toContain('importance must be a finite number between 0 and 1');
    expect(validation.errors).toContain('entities must be an array of strings');
    expect(validation.errors).toContain('content_hash must match SHA-256(content)');
    expect(validation.errors).toContain('source_session_id must be a string');
    expect(validation.errors).toContain('metadata must be an object');
  });
});

describe('computeIdempotencyKey', () => {
  test('computes SHA-256(content_hash + project + type)', () => {
    const record = normalizeMemoryRecord({
      id: '33333333-3333-4333-8333-333333333333',
      type: MEMORY_TYPES.PATTERN,
      project: 'memory-overhaul',
      agent: 'integration-layer',
      timestamp: '2026-04-21T09:00:00.000Z',
      content: 'pattern content',
      source_session_id: 'ses_pattern',
      retention: RETENTION_POLICIES.CORE,
    });

    const expected = sha256Hex(`${record.content_hash}${record.project}${record.type}`);
    const actual = computeIdempotencyKey(record);

    expect(actual).toBe(expected);
    expect(actual).toMatch(/^[a-f0-9]{64}$/);
  });
});
