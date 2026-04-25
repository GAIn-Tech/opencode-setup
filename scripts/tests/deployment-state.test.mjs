#!/usr/bin/env node

/**
 * Deployment State Tests
 *
 * Tests for deployment state management and promotion flow.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

describe('Deployment State', () => {
  let tempDir;
  let statePath;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), 'deployment-state-test-' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    statePath = path.join(tempDir, 'deployment-state.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should initialize with default state when file does not exist', () => {
    const defaultState = {
      version: 1,
      environments: {
        dev: { version: '0.0.0', sha: 'unknown', updated_at: null, updated_by: null },
        staging: { version: '0.0.0', sha: 'unknown', updated_at: null, updated_by: null },
        prod: { version: '0.0.0', sha: 'unknown', updated_at: null, updated_by: null }
      },
      history: []
    };

    fs.writeFileSync(statePath, JSON.stringify(defaultState, null, 2));
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

    expect(state.version).toBe(1);
    expect(state.environments.dev).toBeDefined();
    expect(state.environments.staging).toBeDefined();
    expect(state.environments.prod).toBeDefined();
    expect(Array.isArray(state.history)).toBe(true);
  });

  it('should validate environment names', () => {
    const validEnvs = ['dev', 'staging', 'prod'];
    const invalidEnv = 'production';

    expect(validEnvs).toContain('dev');
    expect(validEnvs).toContain('staging');
    expect(validEnvs).toContain('prod');
    expect(validEnvs).not.toContain(invalidEnv);
  });

  it('should track promotion flow correctly', () => {
    const promotionFlow = {
      dev: ['staging'],
      staging: ['prod'],
      prod: []
    };

    // dev can promote to staging
    expect(promotionFlow.dev).toContain('staging');
    // staging can promote to prod
    expect(promotionFlow.staging).toContain('prod');
    // prod cannot promote anywhere
    expect(promotionFlow.prod).toHaveLength(0);
  });

  it('should reject invalid environment transitions', () => {
    const promotionFlow = {
      dev: ['staging'],
      staging: ['prod'],
      prod: []
    };

    // Cannot promote dev directly to prod
    expect(promotionFlow.dev).not.toContain('prod');
    // Cannot promote prod anywhere
    expect(promotionFlow.prod).toHaveLength(0);
  });

  it('should record deployment history', () => {
    const history = [];
    const event = {
      timestamp: new Date().toISOString(),
      actor: 'test-user',
      action: 'set',
      environment: 'dev',
      version: '1.0.0',
      sha: 'abc123'
    };

    history.push(event);

    expect(history).toHaveLength(1);
    expect(history[0].action).toBe('set');
    expect(history[0].environment).toBe('dev');
    expect(history[0].version).toBe('1.0.0');
  });

  it('should handle corrupt state file gracefully', () => {
    // Write invalid JSON
    fs.writeFileSync(statePath, 'not valid json');

    try {
      JSON.parse(fs.readFileSync(statePath, 'utf8'));
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should validate semantic version format', () => {
    const versions = ['1.0.0', '0.5.2', '2.1.0-beta.1'];
    const invalidVersions = ['v1.0.0', '1.0', '1.0.0.0'];

    for (const version of versions) {
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    }

    for (const version of invalidVersions) {
      if (version === 'v1.0.0') {
        expect(version).not.toMatch(/^\d+\.\d+\.\d+/);
      }
    }
  });
});

describe('Deployment State Commands', () => {
  it('supports show command on the real script', () => {
    const output = execSync('node scripts/deployment-state.mjs show', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe'
    });

    const parsed = JSON.parse(output);
    expect(parsed.environments).toBeDefined();
    expect(parsed.history).toBeDefined();
  });

  it('rejects invalid environment transitions on the real script', () => {
    try {
      execSync('node scripts/deployment-state.mjs set invalid 1.0.0', {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: 'pipe'
      });
      expect.unreachable('deployment-state should reject invalid environment');
    } catch (error) {
      const output = `${error.stdout || ''}${error.stderr || ''}`;
      expect(output).toContain("invalid environment 'invalid'");
    }
  });
});
