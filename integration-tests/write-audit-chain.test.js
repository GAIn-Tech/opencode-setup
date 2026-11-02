import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  appendWriteAuditEntry,
  verifyWriteAuditChain
} from '../packages/opencode-dashboard/src/app/api/_lib/write-audit';

function createAuditPath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'write-audit-chain-'));
  return path.join(directory, 'dashboard-write-audit.ndjson');
}

function readAuditEntries(auditPath) {
  if (!fs.existsSync(auditPath)) {
    return [];
  }

  const file = fs.readFileSync(auditPath, 'utf8').trim();
  if (!file) {
    return [];
  }

  return file.split('\n').map((line) => JSON.parse(line));
}

describe('write audit tamper-evident hash chain', () => {
  test('appending entries creates a valid hash chain', async () => {
    const auditPath = createAuditPath();

    await appendWriteAuditEntry(
      { route: '/api/models', actor: 'alice', action: 'write', metadata: { id: 1 } },
      { auditPath }
    );
    await appendWriteAuditEntry(
      { route: '/api/models', actor: 'bob', action: 'write', metadata: { id: 2 } },
      { auditPath }
    );
    await appendWriteAuditEntry(
      { route: '/api/config', actor: 'carol', action: 'write', metadata: { id: 3 } },
      { auditPath }
    );

    const entries = readAuditEntries(auditPath);
    expect(entries).toHaveLength(3);

    expect(entries[0].prevHash).toBe('0');
    expect(typeof entries[0].hash).toBe('string');
    expect(entries[0].hash.length).toBe(64);

    expect(entries[1].prevHash).toBe(entries[0].hash);
    expect(entries[2].prevHash).toBe(entries[1].hash);

    expect(verifyWriteAuditChain(auditPath)).toEqual({ valid: true, brokenAt: null });
  });

  test('corrupting a middle entry is detected', async () => {
    const auditPath = createAuditPath();

    await appendWriteAuditEntry({ route: '/api/models', actor: 'alice', action: 'write' }, { auditPath });
    await appendWriteAuditEntry({ route: '/api/models', actor: 'bob', action: 'write' }, { auditPath });
    await appendWriteAuditEntry({ route: '/api/models', actor: 'carol', action: 'write' }, { auditPath });

    const entries = readAuditEntries(auditPath);
    entries[1].actor = 'mallory';
    fs.writeFileSync(auditPath, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');

    const result = verifyWriteAuditChain(auditPath);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  test('verifyWriteAuditChain reports the first broken index', async () => {
    const auditPath = createAuditPath();

    await appendWriteAuditEntry({ route: '/api/models', actor: 'alice', action: 'write' }, { auditPath });
    await appendWriteAuditEntry({ route: '/api/models', actor: 'bob', action: 'write' }, { auditPath });

    const entries = readAuditEntries(auditPath);
    entries[0].hash = 'f'.repeat(64);
    fs.writeFileSync(auditPath, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');

    const result = verifyWriteAuditChain(auditPath);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
  });
});
