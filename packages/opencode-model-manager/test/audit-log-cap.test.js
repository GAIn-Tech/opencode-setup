// @ts-nocheck
const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const { ChangeEventSystem } = require('../src/events/change-event-system');

function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'audit-cap-'));
}

function makeEvent(type, timestamp, provider = 'test-provider') {
  return {
    type,
    classification: 'major',
    provider,
    model: { id: `model-${timestamp}`, provider },
    changes: type === 'changed' ? { field: { before: 'a', after: 'b' } } : null,
    timestamp,
    snapshotId: `snap-${timestamp}`
  };
}

describe('Audit log cap and rotation', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  test('caps audit log at MAX_AUDIT_EVENTS (10000) on persist', async () => {
    const logPath = path.join(tmpDir, 'audit.json');
    const sys = new ChangeEventSystem({ auditLogPath: logPath });
    await sys.ready;

    // Inject 12000 events directly (bypassing publishChanges for speed)
    const now = Date.now();
    for (let i = 0; i < 12000; i++) {
      sys.auditLog.push(makeEvent('added', now - (12000 - i) * 1000, `provider-${i}`));
    }

    expect(sys.auditLog.length).toBe(12000);

    // Persist should rotate before writing
    await sys._persistAuditLog();

    // After persist, in-memory log should be capped
    expect(sys.auditLog.length).toBeLessThanOrEqual(10000);

    // Verify persisted file is also capped
    const raw = await fs.readFile(logPath, 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.events.length).toBeLessThanOrEqual(10000);
  });

  test('keeps newest events when capping (oldest are discarded)', async () => {
    const logPath = path.join(tmpDir, 'audit.json');
    const sys = new ChangeEventSystem({ auditLogPath: logPath });
    await sys.ready;

    const now = Date.now();
    // Add 10005 events: oldest at index 0, newest at index 10004
    for (let i = 0; i < 10005; i++) {
      sys.auditLog.push(makeEvent('added', now - (10005 - i) * 1000, `provider-${i}`));
    }

    await sys._persistAuditLog();

    // Should have discarded the 5 oldest events
    expect(sys.auditLog.length).toBe(10000);
    // First event should be the 6th original (index 5), not index 0
    expect(sys.auditLog[0].provider).toBe('provider-5');
    // Last event should be the newest
    expect(sys.auditLog[sys.auditLog.length - 1].provider).toBe('provider-10004');
  });

  test('removes events older than 7 days', async () => {
    const logPath = path.join(tmpDir, 'audit.json');
    const sys = new ChangeEventSystem({ auditLogPath: logPath });
    await sys.ready;

    const now = Date.now();
    const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;
    const sixDaysAgo = now - 6 * 24 * 60 * 60 * 1000;

    // 3 old events (8 days ago) + 2 recent events (6 days ago)
    sys.auditLog.push(makeEvent('added', eightDaysAgo, 'old-1'));
    sys.auditLog.push(makeEvent('added', eightDaysAgo + 1000, 'old-2'));
    sys.auditLog.push(makeEvent('added', eightDaysAgo + 2000, 'old-3'));
    sys.auditLog.push(makeEvent('added', sixDaysAgo, 'recent-1'));
    sys.auditLog.push(makeEvent('added', sixDaysAgo + 1000, 'recent-2'));

    await sys._persistAuditLog();

    // Only the 2 recent events should survive
    expect(sys.auditLog.length).toBe(2);
    expect(sys.auditLog[0].provider).toBe('recent-1');
    expect(sys.auditLog[1].provider).toBe('recent-2');
  });

  test('both caps apply: age filter runs after size cap', async () => {
    const logPath = path.join(tmpDir, 'audit.json');
    const sys = new ChangeEventSystem({ auditLogPath: logPath });
    await sys.ready;

    const now = Date.now();
    const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;

    // 10500 events: first 500 are 8 days old, rest are recent
    for (let i = 0; i < 500; i++) {
      sys.auditLog.push(makeEvent('added', eightDaysAgo + i * 1000, `old-${i}`));
    }
    for (let i = 0; i < 10000; i++) {
      sys.auditLog.push(makeEvent('added', now - (10000 - i) * 1000, `recent-${i}`));
    }

    expect(sys.auditLog.length).toBe(10500);

    await sys._persistAuditLog();

    // Size cap first: keeps newest 10000 (all recent-*)
    // Then age filter: all recent-* are within 7 days, so 10000 remain
    expect(sys.auditLog.length).toBe(10000);
    expect(sys.auditLog[0].provider).toBe('recent-0');
  });

  test('no-op when audit log is within bounds', async () => {
    const logPath = path.join(tmpDir, 'audit.json');
    const sys = new ChangeEventSystem({ auditLogPath: logPath });
    await sys.ready;

    const now = Date.now();
    for (let i = 0; i < 50; i++) {
      sys.auditLog.push(makeEvent('added', now - (50 - i) * 1000, `p-${i}`));
    }

    await sys._persistAuditLog();

    expect(sys.auditLog.length).toBe(50);
  });
});
