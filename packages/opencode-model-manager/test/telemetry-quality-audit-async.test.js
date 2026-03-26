// @ts-nocheck
'use strict';

const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const { TelemetryQualityGate } = require('../src/monitoring/telemetry-quality');

function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'telemetry-quality-'));
}

describe('TelemetryQualityGate async audit logging', () => {
  let tmpDir;
  let auditPath;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    auditPath = path.join(tmpDir, 'telemetry-quality-audit.log');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  test('uses async audit writer and avoids sync appendFileSync', async () => {
    const sourcePath = path.join(__dirname, '..', 'src', 'monitoring', 'telemetry-quality.js');
    const source = await fs.readFile(sourcePath, 'utf8');

    expect(source).not.toContain('appendFileSync(');
    expect(source).toContain('appendFile(');
  });

  test('batches queued audit writes into a single append operation', async () => {
    const gate = new TelemetryQualityGate({
      auditLogPath: auditPath,
      nowFn: () => 1700000000000,
    });

    gate._auditValidation(
      'discovery',
      { provider: 'openai', success: true, timestamp: 1700000000000 },
      0.99,
      { completeness: 1, timeliness: 1, consistency: 1, validity: 1 },
      null,
      { sessionId: 's1', source: 'test' }
    );

    gate._auditOverride({ telemetryType: 'discovery', reason: 'test', authorizedBy: 'qa' });

    await gate._flushAuditQueueForTest();

    const raw = await fs.readFile(auditPath, 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines.length).toBe(2);
  });

  test('keeps audit logging failures non-fatal and recovers for later writes', async () => {
    const badPath = tmpDir;
    const gate = new TelemetryQualityGate({
      auditLogPath: badPath,
      nowFn: () => 1700000000000,
    });

    expect(() => {
      gate.validate('discovery', { provider: 'openai', success: true, timestamp: 1700000000000 }, {
        telemetryType: 'discovery',
        sessionId: 's1',
        source: 'test',
      });
    }).not.toThrow();

    await gate._flushAuditQueueForTest();

    gate.auditLogPath = auditPath;

    expect(() => {
      gate.validate('discovery', { provider: 'openai', success: true, timestamp: 1700000001000 }, {
        telemetryType: 'discovery',
        sessionId: 's2',
        source: 'test',
      });
    }).not.toThrow();

    await gate._flushAuditQueueForTest();

    const raw = await fs.readFile(auditPath, 'utf8');
    expect(raw.length).toBeGreaterThan(0);
  });

  test('rotates oversized audit logs before appending new entries', async () => {
    const gate = new TelemetryQualityGate({
      auditLogPath: auditPath,
      nowFn: () => 1700000002000,
      auditRotation: {
        maxBytes: 512,
        intervalMs: 0,
        maxArchivedFiles: 5,
      },
    });

    const oversized = `${'x'.repeat(700)}\n`;
    await fs.writeFile(auditPath, oversized, 'utf8');

    gate.validate('discovery', { provider: 'openai', success: true, timestamp: 1700000002000 }, {
      telemetryType: 'discovery',
      sessionId: 's3',
      source: 'test',
    });

    await gate._flushAuditQueueForTest();

    const files = await fs.readdir(tmpDir);
    const rotated = files.filter((name) => name.startsWith('telemetry-quality-audit.log.') && !name.endsWith('.log'));
    expect(rotated.length).toBeGreaterThan(0);

    const freshAudit = await fs.readFile(auditPath, 'utf8');
    expect(freshAudit).toContain('"telemetryType":"discovery"');

    const archiveContent = await fs.readFile(path.join(tmpDir, rotated[0]), 'utf8');
    expect(archiveContent.length).toBeGreaterThan(oversized.length - 5);
  });
});
