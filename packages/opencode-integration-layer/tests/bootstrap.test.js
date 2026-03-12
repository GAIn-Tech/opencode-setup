const { describe, it, expect, beforeEach } = require('bun:test');

describe('bootstrap', () => {
  beforeEach(() => {
    // Reset singleton between tests
    const { resetBootstrap } = require('../src/bootstrap.js');
    resetBootstrap();
  });

  it('exports a bootstrap factory function', () => {
    const { bootstrap } = require('../src/bootstrap.js');
    expect(typeof bootstrap).toBe('function');
  });

  it('bootstrap() returns an IntegrationLayer instance', () => {
    const { bootstrap } = require('../src/bootstrap.js');
    const instance = bootstrap();
    expect(instance).toBeDefined();
    expect(typeof instance.resolveRuntimeContext).toBe('function');
    expect(typeof instance.selectToolsForTask).toBe('function');
    expect(typeof instance.checkContextBudget).toBe('function');
  });

  it('bootstrap() initializes crash-guard', () => {
    const { bootstrap, getBootstrapStatus } = require('../src/bootstrap.js');
    bootstrap();
    const status = getBootstrapStatus();
    expect(status).toHaveProperty('crashGuardInitialized');
    expect(typeof status.crashGuardInitialized).toBe('boolean');
  });

  it('bootstrap() loads available packages fail-open', () => {
    const { bootstrap, getBootstrapStatus } = require('../src/bootstrap.js');
    bootstrap();
    const status = getBootstrapStatus();
    expect(status).toHaveProperty('packagesAttempted');
    expect(status).toHaveProperty('packagesLoaded');
    expect(status.packagesAttempted).toBeGreaterThan(0);
  });

  it('subsequent bootstrap() calls return same singleton', () => {
    const { bootstrap } = require('../src/bootstrap.js');
    const a = bootstrap();
    const b = bootstrap();
    expect(a).toBe(b);
  });
});
