'use strict';

const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SkillRLManager } = require('../src/index');

describe('SkillRL lock recovery', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-rl-lock-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('breaks stale lock and persists state', async () => {
    const statePath = path.join(tempDir, 'skill-rl.json');
    const lockPath = `${statePath}.lock`;

    // Simulate stale lock from dead process
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999, createdAtMs: Date.now() - 60000 }), 'utf8');

    const manager = new SkillRLManager({ stateFile: statePath });
    await manager._save();

    expect(fs.existsSync(statePath)).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  test('learnFromOutcome remains fail-open when async save rejects', () => {
    const manager = new SkillRLManager({ stateFile: null });

    manager._save = async () => {
      throw new Error('simulated-save-failure');
    };

    expect(() => {
      manager.learnFromOutcome({
        success: true,
        skill_used: 'systematic-debugging',
        task_type: 'debug',
      });
    }).not.toThrow();
  });
});
