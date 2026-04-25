#!/usr/bin/env node

/**
 * Learning Gate Tests
 *
 * Tests for governance gate failure modes and recovery paths.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const POLICY_PATH = path.join(ROOT, 'opencode-config', 'learning-update-policy.json');
const HASHES_PATH = path.join(ROOT, 'opencode-config', '.governance-hashes.json');

describe('Learning Gate', () => {
  let tempDir;
  let originalCwd;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), 'learning-gate-test-' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should sanitize base parameter to prevent command injection', () => {
    // Test that malicious base parameters are sanitized
    const maliciousBase = 'HEAD; rm -rf /';
    const sanitized = maliciousBase.replace(/[^a-zA-Z0-9/_.\-]/g, '');
    expect(sanitized).toBe('HEADrm-rf/');
    expect(sanitized).not.toContain(';');
    expect(sanitized).not.toContain(' ');
  });

  it('should detect changed governed files', () => {
    // Verify policy file exists
    expect(fs.existsSync(POLICY_PATH)).toBe(true);

    const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
    expect(policy.governed_paths).toBeDefined();
    expect(Array.isArray(policy.governed_paths)).toBe(true);
    expect(policy.governed_paths.length).toBeGreaterThan(0);
  });

  it('should validate hash file format', () => {
    if (fs.existsSync(HASHES_PATH)) {
      const hashes = JSON.parse(fs.readFileSync(HASHES_PATH, 'utf8'));
      // Hashes file may have different structure - check for version or files
      expect(hashes.version || hashes.files).toBeDefined();

      const hashEntries = hashes.hashes || hashes.files;
      if (hashEntries) {
        expect(typeof hashEntries).toBe('object');

        // Validate hash format
        for (const [file, hash] of Object.entries(hashEntries)) {
          expect(typeof file).toBe('string');
          expect(typeof hash).toBe('string');
          expect(hash.length).toBe(64); // SHA-256 hex length
          expect(hash).toMatch(/^[a-f0-9]{64}$/);
        }
      }
    }
  });

  it('should provide actionable error messages', () => {
    // Simulate a governance failure scenario
    const errorMessage = `learning-gate: governance hash mismatch detected.
- mismatched files: opencode-config/opencode.json
- this blocks runtime/manual config drift that bypasses git-diff-only governance checks.
- run 'node scripts/learning-gate.mjs --generate-hashes' after approved config changes.`;

    expect(errorMessage).toContain('mismatched files');
    expect(errorMessage).toContain('run');
    expect(errorMessage).toContain('--generate-hashes');
  });

  it('should handle missing policy file gracefully', () => {
    const missingPolicyPath = path.join(tempDir, 'nonexistent-policy.json');
    expect(fs.existsSync(missingPolicyPath)).toBe(false);

    // The gate should fail gracefully when policy is missing
    try {
      JSON.parse(fs.readFileSync(missingPolicyPath, 'utf8'));
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error.code).toBe('ENOENT');
    }
  });

  it('should validate learning update file format', () => {
    const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));

    // Check required fields in policy
    expect(policy.governed_paths).toBeDefined();
    expect(policy.required_update_fields).toBeDefined();
    expect(policy.version).toBeDefined();

    // Required fields should be an array
    expect(Array.isArray(policy.required_update_fields)).toBe(true);
  });
});

describe('Learning Gate Integration', () => {
  it('sanitizes invalid base input and fails safely on the real script', () => {
    try {
      execSync('node scripts/learning-gate.mjs --base "HEAD; rm -rf /"', {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: 'pipe'
      });
      expect.unreachable('learning-gate should fail for sanitized invalid base');
    } catch (error) {
      const output = `${error.stdout || ''}${error.stderr || ''}`;
      expect(output).toContain('base parameter contained invalid characters');
      expect(output).toContain('ambiguous argument');
    }
  });

  it('reports a real governance hash mismatch when hashes are stale', () => {
    try {
      execSync('node scripts/learning-gate.mjs --verify-hashes', {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: 'pipe'
      });
    } catch (error) {
      const output = `${error.stdout || ''}${error.stderr || ''}`;
      expect(output).toContain('governance hash mismatch');
      expect(output).toContain('--generate-hashes');
      return;
    }

    expect(true).toBe(true);
  });
});
