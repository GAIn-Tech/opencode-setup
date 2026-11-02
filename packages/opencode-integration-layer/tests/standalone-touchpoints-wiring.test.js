'use strict';

const { describe, test, expect } = require('bun:test');
const { IntegrationLayer } = require('../src/index.js');
const { bootstrap, getBootstrapStatus, resetBootstrap } = require('../src/bootstrap.js');

describe('standalone touchpoint wiring', () => {
  test('dashboard methods delegate to dashboard-launcher', () => {
    const mockDashboard = {
      checkDashboard: () => ({ running: true, port: 3000 }),
      ensureDashboard: (openInBrowser) => ({ launched: !openInBrowser, port: 3000 }),
      stopDashboard: () => ({ stopped: true }),
    };
    const il = new IntegrationLayer({ dashboardLauncher: mockDashboard });

    expect(il.getDashboardStatus()).toEqual({ running: true, port: 3000 });
    expect(il.ensureDashboardRunning(false)).toEqual({ launched: true, port: 3000 });
    expect(il.stopDashboard()).toEqual({ stopped: true });
  });

  test('dashboard methods return null when launcher unavailable', () => {
    const il = new IntegrationLayer({});
    expect(il.getDashboardStatus()).toBeNull();
    expect(il.ensureDashboardRunning()).toBeNull();
    expect(il.stopDashboard()).toBeNull();
  });

  test('health methods delegate to healthd', () => {
    const mockResult = { status: 'warn', plugins: { status: 'warn' }, mcps: { status: 'ok' } };
    const mockHealthd = {
      runCheck: () => mockResult,
      status: 'warn',
      lastResult: mockResult,
      checkCount: 3,
    };
    const il = new IntegrationLayer({ healthd: mockHealthd });

    expect(il.runRuntimeHealthCheck()).toEqual(mockResult);
    expect(il.getRuntimeHealthStatus()).toEqual({
      status: 'warn',
      lastResult: mockResult,
      checkCount: 3,
    });
  });

  test('health methods return null when healthd unavailable', () => {
    const il = new IntegrationLayer({});
    expect(il.runRuntimeHealthCheck()).toBeNull();
    expect(il.getRuntimeHealthStatus()).toBeNull();
  });

  test('bootstrap tracks dashboard-launcher and plugin-healthd status', () => {
    resetBootstrap();
    bootstrap();
    const status = getBootstrapStatus();

    expect(typeof status.packages).toBe('object');
    expect(status.packages).toHaveProperty('dashboard-launcher');
    expect(status.packages).toHaveProperty('plugin-healthd');
  });
});
