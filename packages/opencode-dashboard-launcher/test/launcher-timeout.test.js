// @ts-nocheck
'use strict';

const { describe, test, expect } = require('bun:test');
const fs = require('fs');
const path = require('path');

/**
 * Tests that dashboard-launcher spawn calls have explicit timeouts.
 * 
 * Strategy: Verify source code contains timeout kill mechanisms for spawn calls.
 * We cannot easily mock spawn in Bun, so we verify the code patterns.
 */
describe('Dashboard launcher spawn timeouts', () => {
  const srcPath = path.join(__dirname, '..', 'src', 'index.js');
  const src = fs.readFileSync(srcPath, 'utf-8');

  test('exports BROWSER_OPEN_TIMEOUT_MS constant', () => {
    const mod = require('../src/index');
    expect(mod.BROWSER_OPEN_TIMEOUT_MS).toBeDefined();
    expect(typeof mod.BROWSER_OPEN_TIMEOUT_MS).toBe('number');
    expect(mod.BROWSER_OPEN_TIMEOUT_MS).toBeGreaterThan(0);
  });

  test('exports DASHBOARD_LAUNCH_TIMEOUT_MS constant', () => {
    const mod = require('../src/index');
    expect(mod.DASHBOARD_LAUNCH_TIMEOUT_MS).toBeDefined();
    expect(typeof mod.DASHBOARD_LAUNCH_TIMEOUT_MS).toBe('number');
    expect(mod.DASHBOARD_LAUNCH_TIMEOUT_MS).toBeGreaterThan(0);
  });

  test('openBrowser spawn has kill timeout', () => {
    // The openBrowser function should set up a kill timer on the spawned process
    expect(src).toContain('BROWSER_OPEN_TIMEOUT_MS');
    // Should kill the spawned process after timeout
    expect(src).toMatch(/kill|destroy/);
  });

  test('launchDashboard spawn has startup timeout', () => {
    // The launchDashboard function should detect early crash
    expect(src).toContain('DASHBOARD_LAUNCH_TIMEOUT_MS');
  });
});
