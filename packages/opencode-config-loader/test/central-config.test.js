const { describe, test, expect } = require('bun:test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  loadCentralConfig,
  mergeCentralConfig,
  getEffectiveValue,
  clampToHardBounds,
} = require('../src/central-config');
const {
  loadRlState,
  saveRlState,
  updateRlStateEntry,
  appendAuditEntry,
  readAuditLog,
  ConcurrencyError,
  getRlStatePath,
  getAuditLogPath,
  invalidateRlStateCache,
} = require('../src/central-config-state');

describe('central-config', () => {
  // Test 1: Hard bounds clamp RL and dashboard values
  test('hard bounds clamp RL and dashboard values', () => {
    const param = {
      value: 100,
      soft: { min: 50, max: 150 },
      hard: { min: 10, max: 80 },
      locked: false,
      rl_allowed: true,
    };

    // Dashboard value exceeds hard max - clamped to soft max first (150), then hard max (80)
    const result1 = getEffectiveValue(100, param, undefined, 0, 0.85);
    expect(result1.effective).toBe(80); // Clamped to hard max
    expect(result1.metadata.hardClamped).toBe(true);

    // RL value exceeds soft max (150) - clamped to soft max (150), then hard max (80)
    const result2 = getEffectiveValue(50, param, 200, 0.9, 0.85);
    expect(result2.effective).toBe(80); // Clamped to hard max
    expect(result2.metadata.hardClamped).toBe(true);

    // RL value below soft min (50) - clamped to soft min (50), then hard bounds (10-80)
    const result3 = getEffectiveValue(50, param, 5, 0.9, 0.85);
    expect(result3.effective).toBe(50); // Clamped to soft min
    expect(result3.metadata.hardClamped).toBe(false);
  });

  // Test 2: RL overrides soft bounds only when confidence >= threshold
  test('RL overrides soft bounds only when confidence >= threshold', () => {
    const param = {
      value: 50,
      soft: { min: 40, max: 60 },
      hard: { min: 10, max: 100 },
      locked: false,
      rl_allowed: true,
    };

    // RL confidence below threshold - should use dashboard (clamped to soft bounds)
    const result1 = getEffectiveValue(50, param, 75, 0.8, 0.85);
    expect(result1.effective).toBe(50);
    expect(result1.metadata.source).toBe('dashboard');
    expect(result1.metadata.applied).toBe(false);

    // RL confidence at threshold - should apply RL (clamped to soft max 60)
    const result2 = getEffectiveValue(50, param, 75, 0.85, 0.85);
    expect(result2.effective).toBe(60); // RL value 75 clamped to soft max 60
    expect(result2.metadata.source).toBe('rl');
    expect(result2.metadata.applied).toBe(true);

    // RL confidence above threshold - should apply RL (clamped to soft max 60)
    const result3 = getEffectiveValue(50, param, 75, 0.95, 0.85);
    expect(result3.effective).toBe(60); // RL value 75 clamped to soft max 60
    expect(result3.metadata.source).toBe('rl');
    expect(result3.metadata.applied).toBe(true);
  });

  // Test 3: Locked values ignore RL overrides
  test('locked values ignore RL overrides', () => {
    const param = {
      value: 50,
      soft: { min: 40, max: 60 },
      hard: { min: 10, max: 100 },
      locked: true, // LOCKED
      rl_allowed: true,
    };

    // Even with high confidence, locked values should not be overridden
    const result = getEffectiveValue(50, param, 75, 0.95, 0.85);
    expect(result.effective).toBe(50);
    expect(result.metadata.source).toBe('dashboard');
    expect(result.metadata.applied).toBe(false);
  });

  // Test 4: rl_allowed=false ignores RL
  test('rl_allowed=false ignores RL', () => {
    const param = {
      value: 50,
      soft: { min: 40, max: 60 },
      hard: { min: 10, max: 100 },
      locked: false,
      rl_allowed: false, // NOT ALLOWED
    };

    // Even with high confidence, rl_allowed=false should ignore RL
    const result = getEffectiveValue(50, param, 75, 0.95, 0.85);
    expect(result.effective).toBe(50);
    expect(result.metadata.source).toBe('dashboard');
    expect(result.metadata.applied).toBe(false);
  });

  // Test 5: Missing RL state uses dashboard value
  test('missing RL state uses dashboard value', () => {
    const param = {
      value: 50,
      soft: { min: 40, max: 60 },
      hard: { min: 10, max: 100 },
      locked: false,
      rl_allowed: true,
    };

    // No RL value provided
    const result = getEffectiveValue(50, param, undefined, 0, 0.85);
    expect(result.effective).toBe(50);
    expect(result.metadata.source).toBe('dashboard');
    expect(result.metadata.rlValue).toBe(null);
  });

  // Test 6: Schema validation rejects invalid config
  test('schema validation rejects invalid config', () => {
    // Missing required fields
    expect(() => {
      mergeCentralConfig({
        central: {
          // Missing schema_version, config_version, rl, sections
        },
      });
    }).toThrow();

    // Invalid central config
    expect(() => {
      mergeCentralConfig({
        central: null,
      });
    }).toThrow();

    // Missing sections
    expect(() => {
      mergeCentralConfig({
        central: {
          schema_version: '1.0.0',
          config_version: 1,
          rl: { override_min_confidence: 0.85 },
          // Missing sections
        },
      });
    }).toThrow();
  });

  // Additional test: Full merge workflow
  test('full merge workflow with multiple parameters', () => {
    const central = {
      schema_version: '1.0.0',
      config_version: 1,
      rl: { override_min_confidence: 0.85 },
      sections: {
        routing: {
          timeout_ms: {
            value: 60000,
            soft: { min: 5000, max: 60000 },
            hard: { min: 1000, max: 120000 },
            locked: false,
            rl_allowed: true,
          },
          retry_attempts: {
            value: 3,
            soft: { min: 1, max: 5 },
            hard: { min: 0, max: 10 },
            locked: true, // LOCKED
            rl_allowed: true,
          },
        },
      },
    };

    const rlState = {
      'routing.timeout_ms': { value: 45000, confidence: 0.9 },
      'routing.retry_attempts': { value: 5, confidence: 0.95 }, // Should be ignored (locked)
    };

    const result = mergeCentralConfig({
      central,
      rlState,
      globalConfidence: 0.85,
    });

    // timeout_ms should use RL value (confidence 0.9 >= 0.85)
    expect(result.sections.routing.timeout_ms.value).toBe(45000);
    expect(result.sections.routing.timeout_ms.metadata.source).toBe('rl');

    // retry_attempts should use dashboard value (locked)
    expect(result.sections.routing.retry_attempts.value).toBe(3);
    expect(result.sections.routing.retry_attempts.metadata.source).toBe('dashboard');
  });

  // Test: RL value clamped to soft bounds
  test('RL value clamped to soft bounds before hard clamp', () => {
    const param = {
      value: 50,
      soft: { min: 40, max: 60 },
      hard: { min: 10, max: 100 },
      locked: false,
      rl_allowed: true,
    };

    // RL value outside soft bounds but within hard bounds
    const result = getEffectiveValue(50, param, 70, 0.9, 0.85);
    expect(result.effective).toBe(60); // Clamped to soft max
    expect(result.metadata.source).toBe('rl');
  });

  // Test: clampToHardBounds utility
  test('clampToHardBounds utility function', () => {
    expect(clampToHardBounds(50, { min: 10, max: 100 })).toBe(50);
    expect(clampToHardBounds(5, { min: 10, max: 100 })).toBe(10);
    expect(clampToHardBounds(150, { min: 10, max: 100 })).toBe(100);
    expect(clampToHardBounds('string', { min: 10, max: 100 })).toBe('string');
    expect(clampToHardBounds(50, null)).toBe(50);
    expect(clampToHardBounds(50, {})).toBe(50);
  });
});

describe('RL State', () => {
  // Helper to clean up test files and invalidate cache
  async function cleanupTestFiles() {
    invalidateRlStateCache();
    const rlPath = getRlStatePath();
    const auditPath = getAuditLogPath();
    
    try { await fs.promises.unlink(rlPath); } catch { /* ignore */ }
    try { await fs.promises.unlink(auditPath); } catch { /* ignore */ }
    
    // Clean up empty directories
    const auditDir = path.dirname(auditPath);
    try {
      const entries = await fs.promises.readdir(auditDir);
      if (entries.length === 0) await fs.promises.rmdir(auditDir);
    } catch { /* ignore */ }
  }

  test('loadRlState returns empty object when file missing', async () => {
    await cleanupTestFiles();
    const state = await loadRlState();
    expect(state).toEqual({});
  });

  test('saveRlState writes and increments version', async () => {
    await cleanupTestFiles();
    
    const state1 = await saveRlState({
      'routing.timeout': { value: 5000, confidence: 0.9 },
    });
    
    expect(state1.config_version).toBe(1);
    expect(state1['routing.timeout'].value).toBe(5000);
    
    // Save again - version should increment
    const state2 = await saveRlState({
      'routing.timeout': { value: 6000, confidence: 0.95 },
    });
    
    expect(state2.config_version).toBe(2);
    expect(state2['routing.timeout'].value).toBe(6000);
    
    await cleanupTestFiles();
  });

  test('saveRlState rejects stale config_version', async () => {
    await cleanupTestFiles();
    
    // First save
    await saveRlState({ 'routing.timeout': { value: 5000, confidence: 0.9 } });
    
    // Try to save with stale version
    expect(
      saveRlState(
        { 'routing.timeout': { value: 6000, confidence: 0.95 } },
        { expectedVersion: 0 } // Stale version
      )
    ).rejects.toThrow(ConcurrencyError);
    
    await cleanupTestFiles();
  });

  test('updateRlStateEntry updates single entry', async () => {
    await cleanupTestFiles();
    
    // First update
    const state1 = await updateRlStateEntry('routing.timeout', 5000, 0.9);
    expect(state1['routing.timeout'].value).toBe(5000);
    expect(state1['routing.timeout'].confidence).toBe(0.9);
    expect(state1.config_version).toBe(1);
    
    // Second update
    const state2 = await updateRlStateEntry('routing.retry', 3, 0.85);
    expect(state2['routing.timeout'].value).toBe(5000);
    expect(state2['routing.retry'].value).toBe(3);
    expect(state2.config_version).toBe(2);
    
    await cleanupTestFiles();
  });

  test('updateRlStateEntry includes timestamp', async () => {
    await cleanupTestFiles();
    
    const before = new Date();
    const state = await updateRlStateEntry('routing.timeout', 5000, 0.9);
    const after = new Date();
    
    const timestamp = new Date(state['routing.timeout'].timestamp);
    expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    
    await cleanupTestFiles();
  });
});

describe('Audit Log', () => {
  // Helper to clean up test files
  async function cleanupTestFiles() {
    const auditPath = getAuditLogPath();
    
    try { await fs.promises.unlink(auditPath); } catch { /* ignore */ }
    
    // Clean up empty directories
    const auditDir = path.dirname(auditPath);
    try {
      const entries = await fs.promises.readdir(auditDir);
      if (entries.length === 0) await fs.promises.rmdir(auditDir);
    } catch { /* ignore */ }
  }

  test('appendAuditEntry writes JSONL line', async () => {
    await cleanupTestFiles();
    
    await appendAuditEntry({
      action: 'update',
      section: 'routing',
      param: 'timeout',
      oldValue: 5000,
      newValue: 6000,
      source: 'rl',
      user: 'test-user',
    });
    
    const entries = await readAuditLog();
    expect(entries.length).toBe(1);
    expect(entries[0].action).toBe('update');
    expect(entries[0].section).toBe('routing');
    expect(entries[0].param).toBe('timeout');
    expect(entries[0].oldValue).toBe(5000);
    expect(entries[0].newValue).toBe(6000);
    
    await cleanupTestFiles();
  });

  test('readAuditLog filters by timestamp', async () => {
    await cleanupTestFiles();
    
    const now = new Date();
    const past = new Date(now.getTime() - 60000); // 1 minute ago
    const future = new Date(now.getTime() + 60000); // 1 minute from now
    
    await appendAuditEntry({
      timestamp: past.toISOString(),
      action: 'update',
      section: 'routing',
      param: 'timeout',
      oldValue: 5000,
      newValue: 6000,
      source: 'rl',
    });
    
    await appendAuditEntry({
      timestamp: now.toISOString(),
      action: 'update',
      section: 'routing',
      param: 'retry',
      oldValue: 3,
      newValue: 5,
      source: 'rl',
    });
    
    // Filter since now - should only get second entry
    const entries = await readAuditLog({ since: now.toISOString() });
    expect(entries.length).toBe(1);
    expect(entries[0].param).toBe('retry');
    
    // Filter until past - should only get first entry
    const pastEntries = await readAuditLog({ until: past.toISOString() });
    expect(pastEntries.length).toBe(1);
    expect(pastEntries[0].param).toBe('timeout');
    
    await cleanupTestFiles();
  });

  test('readAuditLog applies limit', async () => {
    await cleanupTestFiles();
    
    // Add 5 entries
    for (let i = 0; i < 5; i++) {
      await appendAuditEntry({
        action: 'update',
        section: 'routing',
        param: `param${i}`,
        oldValue: i,
        newValue: i + 1,
        source: 'rl',
      });
    }
    
    // Get all entries
    const allEntries = await readAuditLog();
    expect(allEntries.length).toBe(5);
    
    // Get last 2 entries
    const limited = await readAuditLog({ limit: 2 });
    expect(limited.length).toBe(2);
    expect(limited[0].param).toBe('param3');
    expect(limited[1].param).toBe('param4');
    
    await cleanupTestFiles();
  });

  test('readAuditLog returns empty array when file missing', async () => {
    await cleanupTestFiles();
    
    const entries = await readAuditLog();
    expect(entries).toEqual([]);
    
    await cleanupTestFiles();
  });
});

describe('Snapshot and Recovery', () => {
  const {
    createSnapshot,
    listSnapshots,
    restoreSnapshot,
    loadWithRecovery,
    cleanupSnapshots,
    getSnapshotsDir,
    invalidateRlStateCache,
  } = require('../src/central-config-state');
  
  const testConfigPath = path.join(__dirname, 'test-central-config.json');
  const testConfig = {
    schema_version: '1.0.0',
    config_version: 1,
    rl: { override_min_confidence: 0.85 },
    sections: {
      routing: {
        timeout: { value: 5000, soft: { min: 1000, max: 10000 }, hard: { min: 500, max: 30000 }, locked: false, rl_allowed: true },
      },
    },
  };
  
  async function cleanupTestFiles() {
    invalidateRlStateCache();
    // Clean test config
    try { await fs.promises.unlink(testConfigPath); } catch { /* ignore */ }
    
    // Clean snapshots dir
    const snapshotsDir = getSnapshotsDir();
    try { await fs.promises.rm(snapshotsDir, { recursive: true, force: true }); } catch { /* ignore */ }
    
    // Clean RL state
    const rlPath = getRlStatePath();
    try { await fs.promises.unlink(rlPath); } catch { /* ignore */ }
  }
  
  test('createSnapshot creates snapshot with config and RL state', async () => {
    await cleanupTestFiles();
    
    // Create test files
    await fs.promises.writeFile(testConfigPath, JSON.stringify(testConfig, null, 2));
    await updateRlStateEntry('routing.timeout', 6000, 0.9);
    
    // Create snapshot
    const metadata = await createSnapshot('test-snapshot', testConfigPath);
    
    expect(metadata.name).toBe('test-snapshot');
    expect(metadata.id).toContain('test-snapshot');
    
    // Verify snapshot files exist
    const snapshotDir = path.join(getSnapshotsDir(), metadata.id);
    expect(fs.existsSync(path.join(snapshotDir, 'central-config.json'))).toBe(true);
    expect(fs.existsSync(path.join(snapshotDir, 'rl-state.json'))).toBe(true);
    expect(fs.existsSync(path.join(snapshotDir, 'metadata.json'))).toBe(true);
    
    await cleanupTestFiles();
  });
  
  test('listSnapshots returns snapshots sorted by timestamp', async () => {
    await cleanupTestFiles();
    
    await fs.promises.writeFile(testConfigPath, JSON.stringify(testConfig, null, 2));
    
    // Create multiple snapshots
    await createSnapshot('first', testConfigPath);
    await createSnapshot('second', testConfigPath);
    await createSnapshot('third', testConfigPath);
    
    const snapshots = await listSnapshots();
    
    expect(snapshots.length).toBe(3);
    expect(snapshots[0].name).toBe('third'); // Most recent first
    expect(snapshots[2].name).toBe('first');
    
    await cleanupTestFiles();
  });
  
  test('restoreSnapshot restores config and RL state', async () => {
    await cleanupTestFiles();
    
    // Create initial state
    await fs.promises.writeFile(testConfigPath, JSON.stringify(testConfig, null, 2));
    await updateRlStateEntry('routing.timeout', 6000, 0.9);
    
    // Create snapshot
    const metadata = await createSnapshot('backup', testConfigPath);
    
    // Modify the config
    const modifiedConfig = { ...testConfig, config_version: 99 };
    await fs.promises.writeFile(testConfigPath, JSON.stringify(modifiedConfig, null, 2));
    await updateRlStateEntry('routing.timeout', 9999, 0.99);
    
    // Verify modification
    const modContent = await fs.promises.readFile(testConfigPath, 'utf8');
    expect(JSON.parse(modContent).config_version).toBe(99);
    const modState = await loadRlState();
    expect(modState['routing.timeout'].value).toBe(9999);
    
    // Restore from snapshot
    await restoreSnapshot(metadata.id, testConfigPath);
    
    // Verify restoration
    const restoredContent = await fs.promises.readFile(testConfigPath, 'utf8');
    expect(JSON.parse(restoredContent).config_version).toBe(1);
    const restoredState = await loadRlState();
    expect(restoredState['routing.timeout'].value).toBe(6000);
    
    await cleanupTestFiles();
  });
  
  test('loadWithRecovery recovers from corrupted config', async () => {
    await cleanupTestFiles();
    
    // Create valid config and snapshot
    await fs.promises.writeFile(testConfigPath, JSON.stringify(testConfig, null, 2));
    await createSnapshot('backup-for-recovery', testConfigPath);
    
    // Corrupt the config
    await fs.promises.writeFile(testConfigPath, 'not valid json {{{', 'utf8');
    
    // loadWithRecovery should recover
    const recovered = await loadWithRecovery(testConfigPath);
    
    expect(recovered.schema_version).toBe('1.0.0');
    expect(recovered.config_version).toBe(1);
    
    await cleanupTestFiles();
  });
  
  test('cleanupSnapshots keeps only most recent N', async () => {
    await cleanupTestFiles();
    
    await fs.promises.writeFile(testConfigPath, JSON.stringify(testConfig, null, 2));
    
    // Create 5 snapshots
    for (let i = 0; i < 5; i++) {
      await createSnapshot(`snapshot-${i}`, testConfigPath);
    }
    
    const allSnapshots = await listSnapshots();
    expect(allSnapshots.length).toBe(5);
    
    // Clean up, keeping only 2
    const deleted = await cleanupSnapshots(2);
    
    expect(deleted).toBe(3);
    const remaining = await listSnapshots();
    expect(remaining.length).toBe(2);
    
    await cleanupTestFiles();
  });
});
