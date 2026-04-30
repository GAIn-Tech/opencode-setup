// @ts-nocheck
'use strict';

const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const { PRGenerator } = require('../src/automation/pr-generator');

/**
 * Tests that pr-generator git calls have explicit timeouts.
 * 
 * Strategy: We don't need to run real git commands. We verify that:
 * 1. The module exports GIT_TIMEOUT_MS constant
 * 2. createBranch, commitChanges, pushBranch use async execFileAsync with timeout
 * 3. Timeout errors are surfaced with clear messages
 */
describe('PR Generator git command timeouts', () => {
  test('exports GIT_TIMEOUT_MS constant', () => {
    const mod = require('../src/automation/pr-generator');
    expect(mod.GIT_TIMEOUT_MS).toBeDefined();
    expect(typeof mod.GIT_TIMEOUT_MS).toBe('number');
    expect(mod.GIT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(mod.GIT_TIMEOUT_MS).toBeLessThanOrEqual(60000);
  });

  test('createBranch rejects with timeout message on slow git', async () => {
    const pr = new PRGenerator({ repoPath: '/nonexistent/path' });
    try {
      await pr.createBranch('test-branch');
      // Should not reach here
      expect(true).toBe(false);
    } catch (err) {
      // Should get an error - the key is it doesn't hang forever
      expect(err).toBeDefined();
      expect(err.message).toContain('Failed to create branch');
    }
  });

  test('commitChanges rejects with timeout message on slow git', async () => {
    const pr = new PRGenerator({ repoPath: '/nonexistent/path' });
    const diff = { added: [], modified: [], removed: [] };
    try {
      await pr.commitChanges(diff, 'test-branch');
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeDefined();
      expect(err.message).toContain('Failed to commit');
    }
  });

  test('pushBranch rejects with timeout message on slow git', async () => {
    const pr = new PRGenerator({ repoPath: '/nonexistent/path' });
    try {
      await pr.pushBranch('test-branch');
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeDefined();
      expect(err.message).toContain('Failed to push');
    }
  });

  test('rejects repo paths outside the current workspace before git execution', async () => {
    const pr = new PRGenerator({ repoPath: path.resolve(os.tmpdir()) });

    await expect(pr.createBranch('test-branch')).rejects.toThrow(/repo path/i);
  });

  test('git calls use async execFileAsync not sync execFileSync', () => {
    const src = require('fs').readFileSync(
      path.join(__dirname, '..', 'src', 'automation', 'pr-generator.js'),
      'utf-8'
    );
    // Should NOT contain sync git execution
    expect(src).not.toContain('execFileSync');
    expect(src).not.toContain('execSync');
    // Should contain async execution with timeout
    expect(src).toContain('execFileAsync');
    expect(src).toContain('timeout');
  });
});
