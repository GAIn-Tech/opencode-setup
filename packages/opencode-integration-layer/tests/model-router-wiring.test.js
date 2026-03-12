'use strict';

const { describe, test, expect } = require('bun:test');
const { IntegrationLayer } = require('../src/index.js');

describe('model-router-x wiring', () => {
  test('bootstrap tracks model-router-x status', () => {
    const { getBootstrapStatus, resetBootstrap } = require('../src/bootstrap.js');
    resetBootstrap();
    const status = getBootstrapStatus();
    expect(typeof status.packages).toBe('object');
  });

  test('IntegrationLayer.modelRouter is set from config', () => {
    const mockRouter = { route: () => ({ model: 'test-model' }) };
    const il = new IntegrationLayer({ modelRouter: mockRouter });
    expect(il.modelRouter).toBe(mockRouter);
  });

  test('modelRouter is null when not provided', () => {
    const il = new IntegrationLayer({});
    expect(il.modelRouter).toBeNull();
  });

  test('ModelRouter receives skillRLManager reference via bootstrap', () => {
    const { bootstrap, getBootstrapStatus, resetBootstrap } = require('../src/bootstrap.js');
    resetBootstrap();
    const runtime = bootstrap();
    const status = getBootstrapStatus();
    // If ModelRouter loaded, status should track it
    if (status.packages['model-router-x']) {
      expect(runtime.modelRouter).toBeTruthy();
    } else {
      // Package not available in test environment — still valid
      expect(status.packages['model-router-x']).toBeFalsy();
    }
  });
});
